// Independent household state. Never import the person-specific job radar storage module.
const DB_NAME = 'jeonju-household-support-v1';
const DB_STORE = 'household';
const BACKUP_VERSION = 1;
const PROFILE_KEYS = ['selfBirthYear', 'spouseBirthYear', 'selfWork', 'spouseWork', 'housing', 'monthlyIncome', 'deposit', 'rent', 'assets', 'insurance'];
const STATUS_VALUES = ['none', 'interested', 'preparing', 'applied', 'finished'];
const STATUS_LABELS = { none: '아직 기록 없음', interested: '관심', preparing: '신청 준비', applied: '신청 완료 · 결과 대기', finished: '결과 확인 완료' };
const CATEGORY_LABELS = { work: '취업·훈련', housing: '주거', tax: '세금·환급', welfare: '복지', savings: '생활비 절약' };
const $ = (id) => document.getElementById(id);

const blankState = () => ({ version: BACKUP_VERSION, profile: {}, tracking: {} });
let state = blankState();
let programs = [];
let storage = null;
let saveSequence = Promise.resolve();

function kstDate() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type) => parts.find((p) => p.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function formatDate(date) { return date ? date.replaceAll('-', '.') : '상시 안내'; }
function notice(message) { $('notice').textContent = message; }

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('이 브라우저에서 IndexedDB를 사용할 수 없습니다.'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(DB_STORE); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () => reject(new Error('다른 탭에서 저장소를 사용하고 있습니다.'));
  });
}

function dbRead(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const request = tx.objectStore(DB_STORE).get('current');
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

function dbWrite(db, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, 'current');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function cleanState(input) {
  if (!input || input.version !== BACKUP_VERSION || typeof input.profile !== 'object' || !input.profile ||
      typeof input.tracking !== 'object' || !input.tracking || Array.isArray(input.tracking)) {
    throw new Error('이 대시보드의 버전 1 백업 파일이 아닙니다.');
  }
  const result = blankState();
  for (const key of PROFILE_KEYS) {
    const value = input.profile[key];
    if (typeof value === 'string' && value.length <= 80) result.profile[key] = value;
  }
  const known = new Set(programs.map(({ id }) => id));
  for (const [id, value] of Object.entries(input.tracking)) {
    if (!known.has(id) || !value || typeof value !== 'object') continue;
    result.tracking[id] = {
      status: STATUS_VALUES.includes(value.status) ? value.status : 'none',
      note: typeof value.note === 'string' ? value.note.slice(0, 1500) : '',
      checked: Boolean(value.checked),
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt.slice(0, 30) : ''
    };
  }
  return result;
}

function saveState() {
  const snapshot = structuredClone(state);
  if (!storage) { notice('저장소 접근 불가: 이 화면의 변경은 새로고침하면 사라집니다. JSON 백업을 내려받으세요.'); return Promise.resolve(false); }
  saveSequence = saveSequence.catch(() => {}).then(() => dbWrite(storage, snapshot));
  return saveSequence.then(() => true, () => { notice('브라우저에 기록을 저장하지 못했습니다. JSON 백업으로 보관하세요.'); return false; });
}

function updateSummary() {
  const profile = state.profile;
  const year = profile.selfBirthYear || '미입력';
  const spouse = profile.spouseBirthYear || '미입력';
  const housing = { monthly: '민간 월세', jeonse: '민간 전세', public: '공공임대', own: '자가', other: '기타' }[profile.housing] || '미입력';
  $('profileSummary').textContent = `출생연도 ${year} / ${spouse} · 주거 ${housing} · 소득·재산별 공식 자격 심사는 별도 필요`;
}

function readProfileForm() {
  const form = $('profileForm');
  if (!form.reportValidity()) return null;
  const data = Object.fromEntries(new FormData(form));
  const profile = {};
  for (const key of PROFILE_KEYS) profile[key] = String(data[key] ?? '').trim();
  for (const key of ['selfBirthYear', 'spouseBirthYear']) {
    if (profile[key] && (!/^\d{4}$/.test(profile[key]) || Number(profile[key]) > Number(kstDate().slice(0, 4)) || Number(profile[key]) < 1900)) return null;
  }
  return profile;
}

function fillForm() {
  for (const key of PROFILE_KEYS) {
    const input = $('profileForm').elements.namedItem(key);
    if (input) input.value = state.profile[key] || '';
  }
  updateSummary();
}

function periodInfo(program) {
  if (program.periodType === 'ongoing') return { type: 'open', title: '상시 안내 · 접수 재확인', sort: 1 };
  const today = kstDate();
  if (program.end && program.end < today) return { type: 'closed', title: '2026년 신청 종료', sort: 3 };
  if (program.start && program.start > today) return { type: 'soon', title: '모집 예정', sort: 2 };
  return { type: 'open', title: '공고상 기간 내 · 재확인', sort: 0 };
}

function assessment(program, period) {
  if (period.type === 'closed') return { text: '올해 모집 마감 · 다음 공고가 열리는지 공식 사이트에서 확인하세요.', mismatch: true };
  if (program.id === 'jeonju-jeonse-interest-2026' && state.profile.housing && state.profile.housing !== 'jeonse') return { text: '입력한 주거 형태는 전세자금 대출 조건과 다릅니다. 세부 요건 확인 필요.', mismatch: true };
  if (program.id === 'jeonju-newlywed-deposit-2026' && state.profile.housing && state.profile.housing !== 'public') return { text: '현재 거주 유형과 공공임대 보증금 대상주택이 다릅니다.', mismatch: true };
  return { text: '개별 자격 미판정 · 가구 구성, 소득, 재산, 체류자격 및 중복 수급 여부 확인 필요.', mismatch: false };
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function makeList(items) {
  const list = element('ul');
  for (const text of items) list.append(element('li', '', text));
  return list;
}

function addLink(parent, text, url) {
  if (!url) return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return;
    const a = element('a', '', text);
    a.href = parsed.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    parent.append(a);
  } catch { /* Invalid URL is never rendered as a link. */ }
}

function renderCard(program) {
  const period = periodInfo(program);
  const record = state.tracking[program.id] || { status: 'none', note: '' };
  const checked = Boolean(record.checked);
  const card = element('article', 'card');
  card.dataset.programId = program.id;
  if (period.type === 'closed') card.classList.add('is-closed');
  card.classList.toggle('is-checked', checked);
  card.setAttribute('aria-label', `${program.title} · ${period.title}`);
  const top = element('div', 'card-top');
  top.append(element('span', 'chip', CATEGORY_LABELS[program.category] || program.category));
  top.append(element('span', 'chip', program.jurisdiction));
  top.append(element('span', `chip ${period.type}`, period.title));
  card.append(top, element('h3', '', program.title), element('div', 'benefit', program.value), element('p', 'summary', program.summary));
  const meta = element('div', 'meta');
  meta.append(element('span', '', `대상: ${program.audience}`));
  meta.append(element('span', '', program.end ? `공고 기간: ${formatDate(program.start)}~${formatDate(program.end)}` : '안내 기간: 상시 (개별 모집 재확인)'));
  card.append(meta);
  const fit = assessment(program, period);
  card.append(element('div', `assessment${fit.mismatch ? ' mismatch' : ''}`, fit.text));
  const details = element('details');
  details.append(element('summary', '', '자격 요건 · 확인사항 · 필요 서류'));
  const body = element('div', 'detail-body');
  body.append(element('strong', '', '공고에 명시된 주요 요건'), makeList(program.conditions));
  body.append(element('strong', '', '추가 확인할 질문'), makeList(program.questions));
  body.append(element('strong', '', '준비 서류'), element('p', '', program.documents));
  body.append(element('strong', '', '근거 및 주의'), element('p', '', program.sourceNote));
  details.append(body);
  card.append(details);
  const links = element('div', 'links');
  addLink(links, '공식 근거 ↗', program.officialUrl);
  if (program.applyUrl && period.type !== 'closed') addLink(links, '신청·조회 페이지 ↗', program.applyUrl);
  card.append(links);
  const tracking = element('div', 'tracking');
  const statusLabel = element('label', '', '내 신청 상태');
  const status = element('select');
  status.setAttribute('aria-label', `${program.title} 신청 상태`);
  for (const value of STATUS_VALUES) {
    const option = element('option', '', STATUS_LABELS[value]);
    option.value = value;
    status.append(option);
  }
  status.value = record.status || 'none';
  status.addEventListener('change', () => {
    updateTracking(program.id, { status: status.value, note: state.tracking[program.id]?.note ?? '' });
  });
  statusLabel.append(status);
  const noteLabel = element('label', '', '내 메모 (이 브라우저에만 저장)');
  const note = element('textarea');
  note.maxLength = 1500;
  note.rows = 2;
  note.placeholder = '문의 결과, 신청할 일, 제출 서류 등';
  note.value = record.note || '';
  note.setAttribute('aria-label', `${program.title} 개인 메모`);
  note.addEventListener('change', () => updateTracking(program.id, { status: state.tracking[program.id]?.status ?? 'none', note: note.value }));
  noteLabel.append(note);
  const check = element('button', `check-button${checked ? ' active' : ''}`, checked ? '확인 취소' : '확인함');
  check.type = 'button';
  check.setAttribute('aria-label', `${program.title} ${checked ? '확인 취소' : '이미 확인함'}`);
  check.addEventListener('click', () => {
    updateTracking(program.id, { status: state.tracking[program.id]?.status ?? 'none', checked: !checked, note: state.tracking[program.id]?.note ?? '' });
    renderPrograms();
  });
  tracking.append(statusLabel, noteLabel, check);
  card.append(tracking, element('div', 'bottom', `공식 출처 마지막 확인 ${program.verifiedAt} · 현시점 조건·모집 일정은 변경 가능`));
  return card;
}

function updateTracking(id, value) {
  const previous = state.tracking[id] || {};
  state.tracking[id] = {
    status: value.status,
    note: value.note.slice(0, 1500),
    checked: Boolean(value.checked ?? previous.checked),
    updatedAt: new Date().toISOString()
  };
  void saveState();
  renderStats();
}

function renderStats() {
  $('totalCount').textContent = String(programs.length);
  $('openCount').textContent = String(programs.filter((p) => periodInfo(p).type === 'open').length);
  $('closedCount').textContent = String(programs.filter((p) => periodInfo(p).type === 'closed').length);
  $('savedCount').textContent = String(Object.values(state.tracking).filter((p) => p.status && p.status !== 'none').length);
}

function renderPrograms() {
  const query = $('query').value.trim().toLowerCase();
  const category = $('category').value;
  const period = $('period').value;
  const tracking = $('tracking').value;
  const matches = programs.filter((p) => {
    if (category && p.category !== category) return false;
    if (period === 'closed' && periodInfo(p).type !== 'closed') return false;
    if (period === 'active' && periodInfo(p).type !== 'open') return false;
    const status = state.tracking[p.id]?.status || 'none';
    if (tracking === 'saved' && status === 'none') return false;
    if (tracking === 'done' && !['applied', 'finished'].includes(status)) return false;
    if (tracking === 'checked' && !state.tracking[p.id]?.checked) return false;
    if (tracking === 'unchecked' && state.tracking[p.id]?.checked) return false;
    return !query || [p.title, p.summary, p.audience, p.jurisdiction, ...p.conditions, ...p.questions].join(' ').toLowerCase().includes(query);
  }).sort((a, b) => periodInfo(a).sort - periodInfo(b).sort || ((a.end && b.end) ? a.end.localeCompare(b.end) : 0) || a.title.localeCompare(b.title, 'ko'));
  $('programs').replaceChildren(...matches.map(renderCard));
  $('empty').hidden = matches.length !== 0;
  $('resultCount').textContent = `${matches.length}건 표시`;
}

function exportBackup() {
  const data = JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = element('a');
  a.href = url;
  a.download = `jeonju-household-backup-${kstDate()}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 1024 * 1024) { notice('백업 파일 크기는 1MB 이하여야 합니다.'); return; }
  try {
    const incoming = cleanState(JSON.parse(await file.text()));
    if (!window.confirm('현재 가구 기록을 백업의 기록으로 교체합니다. 계속하시겠습니까?')) return;
    state = incoming;
    fillForm();
    renderStats();
    renderPrograms();
    const ok = await saveState();
    if (ok) notice('백업을 이 브라우저에 가져왔습니다.');
  } catch (error) { notice(`백업을 가져오지 못했습니다: ${error.message}`); }
}

async function init() {
  try {
    const response = await fetch('./data/programs.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.programs)) throw new Error('지원사업 목록 형식 오류');
    programs = data.programs;
    $('sourceDate').textContent = data.researchedAt.replaceAll('-', '.');
  } catch (error) { notice(`공식 사업 목록을 읽을 수 없습니다: ${error.message}`); return; }
  try {
    storage = await openDatabase();
    const existing = await dbRead(storage);
    if (existing) state = cleanState(existing);
  } catch (error) { storage = null; notice(`로컬 저장소를 사용할 수 없습니다: ${error.message}. 기록은 JSON으로 따로 백업하세요.`); }
  fillForm();
  renderStats();
  renderPrograms();
  $('profileToggle').addEventListener('click', () => {
    const expanded = $('profileToggle').getAttribute('aria-expanded') !== 'true';
    $('profileToggle').setAttribute('aria-expanded', String(expanded));
    $('profileFields').hidden = !expanded;
  });
  $('profileForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const profile = readProfileForm();
    if (!profile) { notice('출생연도를 확인해 주세요.'); return; }
    state.profile = profile;
    updateSummary();
    renderPrograms();
    const ok = await saveState();
    if (ok) notice('가구 정보가 이 브라우저에 저장되었습니다. 공식 수급 자격 심사는 별도로 필요합니다.');
  });
  for (const id of ['query', 'category', 'period', 'tracking']) $(id).addEventListener('input', renderPrograms);
  $('exportBtn').addEventListener('click', exportBackup);
  $('importFile').addEventListener('change', importBackup);
}

void init();
