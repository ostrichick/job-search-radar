import { mergeStorageChanges, validateJob } from './backup-rules.js';

const arrayKeys = ['jobDismissed', 'jobHidden', 'jobFavorites', 'jobNewIds', 'reviewedJobIds', 'knownJobIds', 'manualJobs'];
const mapKeys = ['jobStates', 'trackedJobs', 'jobFilters', 'jobFiltersByMarket'];
const scalarKeys = ['jobMarketTab', 'jobFilterSchemaVersion', 'jobAdvancedFiltersOpen'];
const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const request = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const finished = (tx) => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('상태 저장이 취소되었습니다.')); tx.onerror = () => {}; });

function legacyState() {
  const values = {}, recovery = [];
  for (const key of [...arrayKeys, ...mapKeys, ...scalarKeys]) {
    let raw;
    try {
      raw = globalThis.localStorage.getItem(key);
      if (raw === null) continue;
      if (key === 'jobMarketTab' && !['domestic', 'overseas_remote'].includes(raw)) throw new Error('시장 설정 불일치');
      if (key === 'jobFilterSchemaVersion' && (!Number.isInteger(Number(raw)) || Number(raw) < 0)) throw new Error('필터 버전 불일치');
      if (key === 'jobAdvancedFiltersOpen' && !['true', 'false'].includes(raw)) throw new Error('필터 열기 설정 불일치');
      if (!scalarKeys.includes(key)) {
        const value = JSON.parse(raw);
        if (arrayKeys.includes(key) ? !Array.isArray(value) : !isObject(value)) throw new Error('자료형 불일치');
        if (arrayKeys.includes(key) && key !== 'manualJobs' && !value.every((id) => typeof id === 'string')) throw new Error('공고 ID 목록 불일치');
        if (key === 'manualJobs') value.forEach((j, i) => validateJob(j, `${key}[${i}]`));
        if (key === 'trackedJobs') Object.entries(value).forEach(([id, j]) => validateJob(j, `${key}.${id}`, true));
        if (key === 'jobStates' && !Object.values(value).every((s) => ['', 'planned', 'applied', 'hidden'].includes(s))) throw new Error('지원 상태 불일치');
        if (key === 'jobFiltersByMarket' && !Object.values(value).every(isObject)) throw new Error('시장 필터 불일치');
      }
      values[key] = raw;
    } catch (error) { recovery.push({ key, raw: raw ?? null, reason: error.message, at: new Date().toISOString() }); }
  }
  return { values, recovery };
}

export async function createStateStorage() {
  const legacy = legacyState();
  let db, values = legacy.values, base, revision = 0, failure = null, pending = Promise.resolve(), queued = 0;
  const listeners = new Set();
  try {
    db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('job-search-radar', 1);
      let abandoned = false;
      const timer = setTimeout(() => { abandoned = true; reject(new Error('상태 저장소 응답 시간 초과')); }, 5000);
      req.onupgradeneeded = () => { req.result.createObjectStore('state'); req.result.createObjectStore('recovery', { autoIncrement: true }); };
      req.onsuccess = () => { clearTimeout(timer); if (abandoned) req.result.close(); else resolve(req.result); };
      req.onerror = () => { clearTimeout(timer); reject(req.error); };
      req.onblocked = () => { abandoned = true; clearTimeout(timer); reject(new Error('다른 탭이 상태 저장소 이전을 막고 있습니다.')); };
    });
    db.onversionchange = () => db.close();
    const tx = db.transaction(['state', 'recovery'], 'readwrite'), done = finished(tx);
    const current = await request(tx.objectStore('state').get('current'));
    if (current) { values = current.values; revision = current.revision; }
    else {
      tx.objectStore('state').put({ values, revision: 1, migrated: true }, 'current'); revision = 1;
      for (const item of legacy.recovery) tx.objectStore('recovery').add(item);
    }
    await done;
  } catch (error) { failure = error; }
  base = structuredClone(values);
  let channel;
  try { channel = new BroadcastChannel('job-search-radar-state'); } catch { /* storage/focus fallback */ }
  const api = {
    get readOnly() { return Boolean(failure); },
    get error() { return failure; },
    get pending() { return queued > 0; },
    get revision() { return revision; },
    getItem: (key) => values[key] ?? null,
    setItem(key, value) { if (!failure) values[key] = String(value); },
    snapshot: () => structuredClone(values),
    discard() { values = structuredClone(base); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    commit(mode = 'edit') {
      if (failure) return Promise.reject(failure);
      const before = base, after = structuredClone(values);
      if (JSON.stringify(before) === JSON.stringify(after)) return pending;
      base = after; queued++;
      const run = pending.then(async () => {
        if (failure) throw failure;
        const tx = db.transaction('state', 'readwrite'), done = finished(tx);
        const store = tx.objectStore('state'), latest = await request(store.get('current'));
        const merged = mergeStorageChanges(latest.values, before, after, mode);
        const next = { ...latest, values: merged, revision: latest.revision + 1 };
        try { store.put(next, 'current'); }
        catch (error) { try { tx.abort(); } catch {} await done.catch(() => {}); throw error; }
        await done; revision = next.revision;
        if (queued === 1) { values = merged; base = structuredClone(merged); }
        channel?.postMessage(revision);
        try { globalThis.localStorage.setItem('jobStateRevision', String(revision)); } catch { /* IndexedDB remains authoritative */ }
      }).catch(async (error) => {
        failure = error;
        try {
          const tx = db.transaction('state', 'readonly');
          const latest = await request(tx.objectStore('state').get('current'));
          values = latest.values; revision = latest.revision;
        } catch { values = before; }
        base = structuredClone(values);
        for (const fn of listeners) fn('error');
        throw error;
      }).finally(() => { queued--; });
      pending = run.catch(() => {});
      return run;
    },
    async flush() { await pending; if (failure) throw failure; },
    async refresh() {
      if (!db || failure || queued) return;
      const latest = await request(db.transaction('state', 'readonly').objectStore('state').get('current'));
      if (latest.revision <= revision) return;
      revision = latest.revision; values = latest.values; base = structuredClone(values);
      for (const fn of listeners) fn('change');
    },
    async recoveries() {
      if (!db) return legacy.recovery;
      return request(db.transaction('recovery', 'readonly').objectStore('recovery').getAll());
    }
  };
  const refresh = () => api.refresh().catch(() => {});
  if (channel) channel.onmessage = refresh;
  globalThis.addEventListener?.('storage', (event) => { if (event.key === 'jobStateRevision') refresh(); });
  globalThis.addEventListener?.('focus', refresh);
  return api;
}
