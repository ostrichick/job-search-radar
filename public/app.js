const legacyDismissed = new Set(JSON.parse(localStorage.getItem('jobDismissed') || '[]'));
const storedStates = JSON.parse(localStorage.getItem('jobStates') || '{}');
const storedHidden = new Set(JSON.parse(localStorage.getItem('jobHidden') || '[]'));
for (const id of legacyDismissed) storedHidden.add(id);
for (const [id, value] of Object.entries(storedStates)) {
  if (value === 'hidden') {
    storedHidden.add(id);
    delete storedStates[id];
  }
}

const state = {
  jobs: [],
  apiJobs: [],
  meta: {},
  favorites: new Set(JSON.parse(localStorage.getItem('jobFavorites') || '[]')),
  jobStates: storedStates,
  hiddenIds: storedHidden,
  manualJobs: JSON.parse(localStorage.getItem('manualJobs') || '[]'),
  newIds: new Set(),
  visibleLimit: 60,
  lastHidden: null,
  toastTimer: null
};

const $ = (id) => document.getElementById(id);
const controls = ['query', 'source', 'category', 'remote', 'eligibility', 'minScore', 'sort', 'statusFilter'];
const savedFilters = JSON.parse(localStorage.getItem('jobFilters') || '{}');
for (const id of controls) {
  if (savedFilters[id] !== undefined) $(id).value = savedFilters[id];
  $(id).addEventListener('input', () => { state.visibleLimit = 60; persistFilters(); render(); });
}

function formatDate(value) {
  if (!value) return '게시일 미상';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '게시일 미상';
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 30) return `${days}일 전`;
  return date.toLocaleDateString('ko-KR');
}

function persist() {
  localStorage.setItem('jobFavorites', JSON.stringify([...state.favorites]));
  localStorage.setItem('jobStates', JSON.stringify(state.jobStates));
  localStorage.setItem('jobHidden', JSON.stringify([...state.hiddenIds]));
  localStorage.setItem('manualJobs', JSON.stringify(state.manualJobs));
}

function persistFilters() {
  const values = {};
  for (const id of controls) values[id] = $(id).value;
  localStorage.setItem('jobFilters', JSON.stringify(values));
}

function mergeJobs() {
  const byId = new Map(state.apiJobs.map((job) => [job.id, job]));
  for (const job of state.manualJobs) byId.set(job.id, job);
  state.jobs = [...byId.values()];
}

function filteredJobs() {
  const q = $('query').value.trim().toLowerCase();
  const source = $('source').value;
  const category = $('category').value;
  const remote = $('remote').value;
  const eligibility = $('eligibility').value;
  const status = $('statusFilter').value;
  const minScore = Number($('minScore').value);
  let jobs = state.jobs.filter((job) => {
    const haystack = [job.title, job.company, job.location, job.description, job.category, ...(job.tags || []), ...(job.matchedKeywords || [])].join(' ').toLowerCase();
    const jobState = state.jobStates[job.id] || '';
    const hidden = state.hiddenIds.has(job.id);
    if (q && !haystack.includes(q)) return false;
    if (source && job.source !== source) return false;
    if (category && job.category !== category) return false;
    if (eligibility && job.eligibility !== eligibility) return false;
    if (job.score < minScore) return false;
    if (status === 'active' && hidden) return false;
    if (status === 'new' && !state.newIds.has(job.id)) return false;
    if (status === 'saved' && !state.favorites.has(job.id)) return false;
    if (status === 'planned' && jobState !== 'planned') return false;
    if (status === 'applied' && jobState !== 'applied') return false;
    if (status === 'hidden' && !hidden) return false;
    if (remote === 'remote' && !job.remote) return false;
    if (remote === 'korea' && !/korea|south korea|한국/i.test(job.location)) return false;
    if (remote === 'worldwide' && !/anywhere|worldwide|global/i.test(job.location)) return false;
    return true;
  });
  const sort = $('sort').value;
  jobs.sort((a, b) => {
    if (sort === 'newest') return (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0);
    if (sort === 'oldest') return (Date.parse(a.postedAt) || 0) - (Date.parse(b.postedAt) || 0);
    if (sort === 'company') return a.company.localeCompare(b.company, 'ko');
    if (sort === 'title') return a.title.localeCompare(b.title, 'ko');
    return b.score - a.score || (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0);
  });
  return jobs;
}

function renderStats() {
  const active = state.jobs.filter((j) => !state.hiddenIds.has(j.id)).length;
  const saved = state.favorites.size;
  const planned = Object.values(state.jobStates).filter((v) => v === 'planned').length;
  const fresh = state.newIds.size;
  $('stats').innerHTML = [
    ['현재 공고', `${active}개`],
    ['관심 공고', `${saved}개`],
    ['지원 예정', `${planned}개`],
    ['새로 들어온 공고', `${fresh}개`]
  ].map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
}

function setJobState(id, value) {
  if (value) state.jobStates[id] = value;
  else delete state.jobStates[id];
  persist();
  renderStats();
  render();
}

function setHidden(id, hidden) {
  hidden ? state.hiddenIds.add(id) : state.hiddenIds.delete(id);
  persist();
  renderStats();
  render();
}

function hideWithUndo(job) {
  state.lastHidden = { id: job.id };
  setHidden(job.id, true);
  $('toastText').textContent = `${job.title} 공고를 숨겼습니다.`;
  $('toast').hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { $('toast').hidden = true; state.lastHidden = null; }, 5000);
}

function openDetails(job) {
  $('detailsTitle').textContent = job.title;
  $('detailsCompany').textContent = job.company;
  $('detailsMeta').innerHTML = [job.location, job.type, job.eligibility, job.category, job.salary].filter(Boolean).map((v) => `<span>${escapeHtml(v)}</span>`).join('');
  $('detailsDescription').textContent = job.description || '상세 설명이 제공되지 않았습니다.';
  $('detailsLink').href = job.url;
  $('detailsDialog').showModal();
}

function render() {
  const jobs = filteredJobs();
  const visibleJobs = jobs.slice(0, state.visibleLimit);
  $('resultCount').textContent = jobs.length > visibleJobs.length ? `${jobs.length}개 중 ${visibleJobs.length}개 표시` : `${jobs.length}개 공고`;
  $('empty').hidden = jobs.length > 0;
  $('loadMore').hidden = visibleJobs.length >= jobs.length;
  const container = $('jobs');
  container.replaceChildren();
  const template = $('jobTemplate');
  for (const job of visibleJobs) {
    const node = template.content.cloneNode(true);
    node.querySelector('.source').textContent = job.source;
    node.querySelector('.score').textContent = job.manual ? '직접 추가' : `적합도 ${job.score}`;
    node.querySelector('.title').textContent = job.title;
    node.querySelector('.company').textContent = job.company;
    const meta = [job.location, job.type, job.eligibility, job.category, job.salary].filter(Boolean);
    node.querySelector('.meta').innerHTML = meta.map((v) => `<span>${escapeHtml(v)}</span>`).join('');
    node.querySelector('.description').textContent = job.description || '상세 설명 없음';
    const tagValues = [...new Set([...(state.newIds.has(job.id) ? ['NEW'] : []), ...(job.matchedKeywords || []), ...(job.tags || [])])].slice(0, 6);
    node.querySelector('.tags').innerHTML = tagValues.map((v) => `<span class="tag">${escapeHtml(v)}</span>`).join('');
    node.querySelector('.posted').textContent = formatDate(job.postedAt);
    const apply = node.querySelector('.apply');
    apply.href = job.url;

    const favorite = node.querySelector('.favorite');
    favorite.textContent = state.favorites.has(job.id) ? '★' : '☆';
    favorite.classList.toggle('active', state.favorites.has(job.id));
    favorite.addEventListener('click', () => {
      state.favorites.has(job.id) ? state.favorites.delete(job.id) : state.favorites.add(job.id);
      persist(); renderStats(); render();
    });

    const jobState = node.querySelector('.job-state');
    jobState.value = state.jobStates[job.id] || '';
    jobState.addEventListener('change', () => setJobState(job.id, jobState.value));
    const dismiss = node.querySelector('.dismiss');
    if (state.hiddenIds.has(job.id)) {
      dismiss.textContent = '↶';
      dismiss.title = '숨김 해제';
      dismiss.addEventListener('click', () => setHidden(job.id, false));
    } else {
      dismiss.textContent = '×';
      dismiss.title = '숨기기';
      dismiss.addEventListener('click', () => hideWithUndo(job));
    }
    node.querySelector('.details').addEventListener('click', () => openDetails(job));
    container.appendChild(node);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function fillSelect(id, values) {
  const select = $(id);
  const current = select.value;
  select.querySelectorAll('option:not(:first-child)').forEach((o) => o.remove());
  for (const value of [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko'))) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
  select.value = current;
}

async function fetchFeed() {
  const candidates = ['/api/jobs', `./jobs.json?ts=${Date.now()}`];
  let lastError;
  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`공고 데이터를 불러오지 못했습니다 (${lastError?.message || 'unknown'})`);
}

async function load() {
  const data = await fetchFeed();
  state.apiJobs = data.jobs || [];
  state.meta = data;
  mergeJobs();
  const known = new Set(JSON.parse(localStorage.getItem('knownJobIds') || '[]'));
  state.newIds = known.size ? new Set(state.jobs.filter((job) => !known.has(job.id)).map((job) => job.id)) : new Set();
  localStorage.setItem('knownJobIds', JSON.stringify(state.jobs.map((job) => job.id)));
  fillSelect('source', state.jobs.map((j) => j.source));
  fillSelect('category', state.jobs.map((j) => j.category));
  fillSelect('eligibility', state.jobs.map((j) => j.eligibility));
  for (const id of ['source', 'category', 'eligibility']) if (savedFilters[id] !== undefined) $(id).value = savedFilters[id];
  $('updatedAt').textContent = data.updatedAt ? `마지막 수집 ${new Date(data.updatedAt).toLocaleString('ko-KR')}` : '수집 시각 미상';
  renderStats();
  render();
}

$('refreshBtn').addEventListener('click', async () => {
  const button = $('refreshBtn');
  button.disabled = true;
  button.textContent = '수집 중…';
  try {
    let data;
    try {
      const response = await fetch('/api/refresh', { method: 'POST', cache: 'no-store' });
      if (!response.ok) throw new Error(`${response.status}`);
      data = await response.json();
    } catch {
      data = await fetchFeed();
    }
    state.apiJobs = data.jobs || [];
    state.meta = data;
    mergeJobs();
    const known = new Set(JSON.parse(localStorage.getItem('knownJobIds') || '[]'));
    state.newIds = new Set(state.jobs.filter((job) => !known.has(job.id)).map((job) => job.id));
    localStorage.setItem('knownJobIds', JSON.stringify(state.jobs.map((job) => job.id)));
    fillSelect('source', state.jobs.map((j) => j.source));
    fillSelect('category', state.jobs.map((j) => j.category));
    fillSelect('eligibility', state.jobs.map((j) => j.eligibility));
    for (const id of ['source', 'category', 'eligibility']) if (savedFilters[id] !== undefined) $(id).value = savedFilters[id];
    $('updatedAt').textContent = `마지막 수집 ${new Date(data.updatedAt).toLocaleString('ko-KR')}`;
    renderStats(); render();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = '목록 새로고침';
  }
});

const dialog = $('addDialog');
$('addJobBtn').addEventListener('click', () => dialog.showModal());
$('closeDialog').addEventListener('click', () => dialog.close());
$('cancelDialog').addEventListener('click', () => dialog.close());
$('closeDetails').addEventListener('click', () => $('detailsDialog').close());
$('loadMore').addEventListener('click', () => { state.visibleLimit += 60; render(); });
$('undoHide').addEventListener('click', () => {
  if (!state.lastHidden) return;
  setHidden(state.lastHidden.id, false);
  state.lastHidden = null;
  clearTimeout(state.toastTimer);
  $('toast').hidden = true;
});

$('addForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const data = Object.fromEntries(form);
  const url = String(data.url || '').trim();
  const title = String(data.title || '').trim();
  if (!title || !url) return;
  try { new URL(url); } catch { alert('올바른 URL을 입력해 주세요.'); return; }
  const manual = {
    id: `manual:${crypto.randomUUID()}`,
    source: String(data.source || '직접 추가').trim() || '직접 추가',
    title,
    company: String(data.company || '').trim() || '회사 미상',
    location: String(data.location || '').trim() || '위치 미상',
    remote: form.has('remote'),
    type: form.has('remote') ? 'Remote' : '미상',
    salary: '',
    url,
    postedAt: new Date().toISOString(),
    description: String(data.description || '').trim(),
    tags: [],
    matchedKeywords: [],
    category: '직접 추가',
    eligibility: form.has('remote') ? '확인 필요' : '현지 근무/확인 필요',
    score: 50,
    manual: true
  };
  state.manualJobs.unshift(manual);
  persist();
  mergeJobs();
  fillSelect('source', state.jobs.map((j) => j.source));
  fillSelect('category', state.jobs.map((j) => j.category));
  fillSelect('eligibility', state.jobs.map((j) => j.eligibility));
  event.currentTarget.reset();
  dialog.close();
  renderStats(); render();
});

try {
  await load();
} catch (error) {
  $('empty').hidden = false;
  $('empty').textContent = `공고를 불러오지 못했습니다: ${error.message}`;
}
