// Each user action reads and updates the latest document in one transaction.
// Legacy keys are read once and remain untouched as a migration backup.
const keys = { saved: 'nicole-job-radar:watchlist:v1', manual: 'nicole-job-radar:manual-jobs:v1', hidden: 'nicole-job-radar:hidden:v1' };
const list = (v) => Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.length <= 500) : [];
function legacyState() {
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const hidden = read(keys.hidden, {}), manual = read(keys.manual, []);
  return { saved: list(read(keys.saved, [])), hidden: Object.fromEntries(['jobs', 'companies', 'sources'].map((key) => [key, list(hidden?.[key])])),
    manual: Array.isArray(manual) ? manual.filter((j) => {
      try { return j?.id?.startsWith('manual:') && typeof j.title === 'string' && j.title && ['online', 'offline'].includes(j.market) && ['http:', 'https:'].includes(new URL(j.url).protocol); } catch { return false; }
    }) : [], revision: 0 };
}
const completed = (tx) => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || Error('State transaction aborted')); tx.onerror = () => {}; });
const result = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
export async function createStateStorage() {
  let current = legacyState(), db, failure = null, channel;
  const listeners = new Set();
  try {
    db = await new Promise((resolve, reject) => {
      let abandoned = false;
      const timer = setTimeout(() => { abandoned = true; reject(Error('State storage timed out')); }, 5000);
      const r = indexedDB.open('dubu-job-radar', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('state');
      r.onsuccess = () => { clearTimeout(timer); if (abandoned) r.result.close(); else resolve(r.result); };
      r.onerror = () => { clearTimeout(timer); reject(r.error); };
      r.onblocked = () => { abandoned = true; clearTimeout(timer); reject(Error('State storage is blocked by another tab')); };
    });
    db.onversionchange = () => { db.close(); failure = Error('Reload to use the updated state storage'); };
    const tx = db.transaction('state', 'readwrite'), done = completed(tx), store = tx.objectStore('state');
    const existing = await result(store.get('current'));
    if (existing) current = existing;
    else { current.revision = 1; store.put(current, 'current'); }
    await done;
  } catch (error) { failure = error; }
  const notify = () => { for (const fn of listeners) fn(structuredClone(current)); };
  async function refresh() {
    if (!db || failure) return;
    const latest = await result(db.transaction('state').objectStore('state').get('current'));
    if (latest.revision > current.revision) { current = latest; notify(); }
  }
  try { channel = new BroadcastChannel('dubu-job-radar-state'); channel.onmessage = () => refresh().catch(() => {}); } catch { /* storage/focus fallback */ }
  addEventListener('storage', (e) => { if (e.key === 'dubu-job-radar:revision') refresh().catch(() => {}); });
  addEventListener('focus', () => refresh().catch(() => {}));
  return {
    get writable() { return !failure; }, get error() { return failure; },
    snapshot: () => structuredClone(current), subscribe: (fn) => listeners.add(fn),
    async update(action) {
      if (failure) throw failure;
      const tx = db.transaction('state', 'readwrite'), done = completed(tx), store = tx.objectStore('state');
      try {
        const latest = await result(store.get('current'));
        action(latest);
        latest.revision++;
        store.put(latest, 'current');
        await done;
        if (latest.revision >= current.revision) current = latest;
        channel?.postMessage(current.revision);
        try { localStorage.setItem('dubu-job-radar:revision', String(current.revision)); } catch { /* committed in IndexedDB */ }
        notify();
        return structuredClone(current);
      } catch (error) {
        try { tx.abort(); } catch { /* already aborted */ }
        await done.catch(() => {});
        throw error;
      }
    }
  };
}
