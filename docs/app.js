import { mergeWorkflowState, reconcileNewIds } from './state-rules.js';

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
  newIds: new Set(JSON.parse(localStorage.getItem('jobNewIds') || '[]')),
  reviewedIds: new Set(JSON.parse(localStorage.getItem('reviewedJobIds') || '[]')),
  trackedJobs: JSON.parse(localStorage.getItem('trackedJobs') || '{}'),
  selectedIds: new Set(),
  visibleLimit: 60,
  lastHidden: null,
  toastTimer: null,
  currentDetailId: null,
  detailQueue: [],
  loadError: null,
  dynamicFiltersInitialized: false
};

const $ = (id) => document.getElementById(id);
const controls = ['query', 'source', 'category', 'remote', 'eligibility', 'ageFilter', 'listingFilter', 'sourceKindFilter', 'paymentFilter', 'minScore', 'sort', 'statusFilter'];
const savedFilters = JSON.parse(localStorage.getItem('jobFilters') || '{}');
const filterSchemaVersion = Number(localStorage.getItem('jobFilterSchemaVersion') || 0);
if (filterSchemaVersion < 3) {
  if (savedFilters.minScore === undefined || savedFilters.minScore === '0') savedFilters.minScore = '20';
  if (savedFilters.listingFilter === undefined) savedFilters.listingFilter = 'active';
  const oldEligibilityMap = {
    '한국 명시': 'korea',
    '한국에서 지원 가능': 'korea',
    'Worldwide': 'worldwide',
    '지역 제한 가능': 'restricted',
    '특정 국가 제한': 'restricted',
    '확인 필요': 'unknown',
    '현지 근무/확인 필요': 'restricted'
  };
  savedFilters.eligibility = oldEligibilityMap[savedFilters.eligibility] ?? 'likely';
  if (['korea', 'worldwide'].includes(savedFilters.remote)) savedFilters.remote = '';
  localStorage.setItem('jobFilterSchemaVersion', '3');
  localStorage.setItem('jobFilters', JSON.stringify(savedFilters));
}
for (const id of controls) {
  if (!['source', 'category'].includes(id) && savedFilters[id] !== undefined) $(id).value = savedFilters[id];
  $(id).addEventListener('input', () => { state.visibleLimit = 60; state.selectedIds.clear(); persistFilters(); render(); });
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
  localStorage.setItem('reviewedJobIds', JSON.stringify([...state.reviewedIds]));
  localStorage.setItem('jobNewIds', JSON.stringify([...state.newIds]));
  localStorage.setItem('manualJobs', JSON.stringify(state.manualJobs));
  localStorage.setItem('trackedJobs', JSON.stringify(state.trackedJobs));
}

function migrateLegacyState() {
  const known = new Set(JSON.parse(localStorage.getItem('knownJobIds') || '[]'));
  let changed = false;
  for (const job of state.apiJobs) {
    for (const legacyId of job.legacyIds || []) {
      if (!legacyId || legacyId === job.id) continue;
      if (state.favorites.delete(legacyId)) { state.favorites.add(job.id); changed = true; }
      if (state.hiddenIds.delete(legacyId)) { state.hiddenIds.add(job.id); changed = true; }
      if (state.reviewedIds.delete(legacyId)) { state.reviewedIds.add(job.id); changed = true; }
      if (state.newIds.delete(legacyId)) { state.newIds.add(job.id); changed = true; }
      if (state.trackedJobs[legacyId]) {
        if (!state.trackedJobs[job.id]) state.trackedJobs[job.id] = state.trackedJobs[legacyId];
        delete state.trackedJobs[legacyId];
        changed = true;
      }
      if (state.jobStates[legacyId]) {
        state.jobStates[job.id] = mergeWorkflowState(state.jobStates[job.id] || '', state.jobStates[legacyId]);
        delete state.jobStates[legacyId];
        changed = true;
      }
      if (known.delete(legacyId)) { known.add(job.id); changed = true; }
    }
  }
  if (changed) {
    persist();
    localStorage.setItem('knownJobIds', JSON.stringify([...known]));
  }
  return known;
}

function persistFilters() {
  const values = {};
  for (const id of controls) values[id] = $(id).value;
  localStorage.setItem('jobFilters', JSON.stringify(values));
}

function mergeJobs() {
  const byId = new Map(state.apiJobs.map((job) => [job.id, job]));
  for (const job of state.manualJobs) byId.set(job.id, job);
  const activeTrackedIds = new Set([
    ...state.favorites,
    ...Object.entries(state.jobStates).filter(([, value]) => ['planned', 'applied'].includes(value)).map(([id]) => id)
  ]);
  for (const id of activeTrackedIds) {
    if (byId.has(id)) continue;
    const snapshot = state.trackedJobs[id];
    if (!snapshot) continue;
    byId.set(id, {
      ...snapshot,
      id,
      listingStatus: 'archived_missing',
      listingLabel: '현재 피드에서 사라짐',
      stale: true,
      score: 0,
      archivedSnapshot: true
    });
  }
  state.jobs = [...byId.values()];
}

function snapshotJob(id) {
  const job = state.jobs.find((candidate) => candidate.id === id);
  if (!job || job.manual) return;
  const {
    id: _id, description, sourceSummary, sourceEvidence, matchedKeywords, tags,
    alternateUrls, legacyIds, ...rest
  } = job;
  state.trackedJobs[id] = {
    ...rest,
    description: String(description || '').slice(0, 500),
    sourceSummary: String(sourceSummary || '').slice(0, 300),
    sourceEvidence: Array.isArray(sourceEvidence) ? sourceEvidence.slice(0, 4) : [],
    matchedKeywords: Array.isArray(matchedKeywords) ? matchedKeywords.slice(0, 8) : [],
    tags: Array.isArray(tags) ? tags.slice(0, 8) : [],
    alternateUrls: Array.isArray(alternateUrls) ? alternateUrls.slice(0, 4) : [],
    legacyIds: Array.isArray(legacyIds) ? legacyIds.slice(0, 8) : []
  };
}

function filteredJobs() {
  const q = $('query').value.trim().toLowerCase();
  const source = $('source').value;
  const category = $('category').value;
  const remote = $('remote').value;
  const eligibility = $('eligibility').value;
  const ageFilter = Number($('ageFilter').value || 0);
  const listingFilter = $('listingFilter').value;
  const sourceKindFilter = $('sourceKindFilter').value;
  const paymentFilter = $('paymentFilter').value;
  const status = $('statusFilter').value;
  const minScore = Number($('minScore').value);
  const workflowView = ['saved', 'planned', 'applied', 'hidden'].includes(status);
  let jobs = state.jobs.filter((job) => {
    const haystack = [job.title, job.company, job.location, job.description, job.category, ...(job.tags || []), ...(job.matchedKeywords || [])].join(' ').toLowerCase();
    const jobState = state.jobStates[job.id] || '';
    const hidden = state.hiddenIds.has(job.id);
    if (q && !haystack.includes(q)) return false;
    if (source && job.source !== source && !(job.sources || []).includes(source)) return false;
    if (category && job.category !== category) return false;
    if (!workflowView) {
      if (eligibility === 'likely' && !['korea', 'worldwide'].includes(job.eligibilityCode)) return false;
      if (eligibility && eligibility !== 'likely' && job.eligibilityCode !== eligibility) return false;
      if (ageFilter) {
        const posted = Date.parse(job.postedAt);
        if (!posted || ((Date.now() - posted) / 86400000) > ageFilter) return false;
      }
      if (listingFilter === 'active' && ['stale', 'source_error', 'archived_missing', 'talent_pool', 'expired'].includes(job.listingStatus)) return false;
      if (listingFilter && listingFilter !== 'active' && listingFilter !== 'all' && job.listingStatus !== listingFilter) return false;
      if (sourceKindFilter && job.sourceKind !== sourceKindFilter) return false;
      if (paymentFilter === 'exclude_caution' && job.paymentStatus === 'caution') return false;
      if (paymentFilter && !['', 'exclude_caution'].includes(paymentFilter) && job.paymentStatus !== paymentFilter) return false;
      if (job.score < minScore) return false;
    }
    if (status === 'active' && hidden) return false;
    if (status === 'new' && !state.newIds.has(job.id)) return false;
    if (status === 'unreviewed' && state.reviewedIds.has(job.id)) return false;
    if (status === 'saved' && !state.favorites.has(job.id)) return false;
    if (status === 'planned' && jobState !== 'planned') return false;
    if (status === 'applied' && jobState !== 'applied') return false;
    if (status === 'hidden' && !hidden) return false;
    if (remote === 'remote' && !job.remote) return false;
    return true;
  });
  const sort = $('sort').value;
  jobs.sort((a, b) => {
    if (sort === 'newest') return (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0);
    if (sort === 'oldest') return (Date.parse(a.postedAt) || 0) - (Date.parse(b.postedAt) || 0);
    if (sort === 'company') return a.company.localeCompare(b.company, 'ko');
    if (sort === 'title') return a.title.localeCompare(b.title, 'ko');
    const aReviewed = state.reviewedIds.has(a.id) ? 1 : 0;
    const bReviewed = state.reviewedIds.has(b.id) ? 1 : 0;
    if (aReviewed !== bReviewed) return aReviewed - bReviewed;
    return b.score - a.score || (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0);
  });
  return jobs;
}

function renderStats() {
  const recommended = state.jobs.filter((j) => !state.hiddenIds.has(j.id) && j.score >= 20 && ['korea', 'worldwide'].includes(j.eligibilityCode) && !['stale', 'source_error', 'talent_pool', 'expired'].includes(j.listingStatus)).length;
  const saved = state.favorites.size;
  const planned = Object.values(state.jobStates).filter((v) => v === 'planned').length;
  const unreviewed = state.jobs.filter((j) => !state.hiddenIds.has(j.id) && !state.reviewedIds.has(j.id) && j.score >= 20 && ['korea', 'worldwide'].includes(j.eligibilityCode) && !['stale', 'source_error', 'talent_pool', 'expired'].includes(j.listingStatus)).length;
  $('stats').innerHTML = [
    ['추천 공고', `${recommended}개`],
    ['관심 공고', `${saved}개`],
    ['지원 예정', `${planned}개`],
    ['미검토 공고', `${unreviewed}개`]
  ].map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
}

function setJobState(id, value) {
  state.reviewedIds.add(id);
  state.newIds.delete(id);
  if (value) state.jobStates[id] = value;
  else delete state.jobStates[id];
  if (['planned', 'applied'].includes(value) || state.favorites.has(id)) snapshotJob(id);
  persist();
  renderStats();
  render();
}

function setHidden(id, hidden) {
  state.reviewedIds.add(id);
  state.newIds.delete(id);
  hidden ? state.hiddenIds.add(id) : state.hiddenIds.delete(id);
  persist();
  renderStats();
  render();
}

function hideWithUndo(job) {
  state.lastHidden = { ids: [job.id] };
  setHidden(job.id, true);
  $('toastText').textContent = `${job.title} 공고를 숨겼습니다.`;
  $('undoHide').hidden = false;
  $('toast').hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { $('toast').hidden = true; state.lastHidden = null; }, 5000);
}

function salaryLabel(job) {
  return job.salaryInfo?.display || job.salary || '';
}

function qualityClass(type, value) {
  if (type === 'listing') {
    if (value === 'verified_open' || value === 'current_feed') return value === 'verified_open' ? 'verified' : '';
    if (value === 'stale') return 'stale';
    if (value === 'source_error') return 'stale';
    if (value === 'archived_missing') return 'stale';
    if (value === 'expired') return 'expired';
    if (value === 'talent_pool') return 'talent-pool';
  }
  if (type === 'trust' && ['official_ats', 'official_platform'].includes(value)) return 'official';
  if (type === 'payment' && value === 'caution') return 'caution';
  return '';
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function openDetails(job) {
  if (!$('detailsDialog').open || !state.detailQueue.includes(job.id)) state.detailQueue = filteredJobs().map((item) => item.id);
  state.reviewedIds.add(job.id);
  state.newIds.delete(job.id);
  state.currentDetailId = job.id;
  persist();
  renderStats();
  $('detailsTitle').textContent = job.title;
  $('detailsCompany').textContent = job.company;
  $('detailsMeta').innerHTML = [job.location, job.type, job.eligibility, job.category, salaryLabel(job)].filter(Boolean).map((v) => `<span>${escapeHtml(v)}</span>`).join('');
  $('detailsTrust').innerHTML = [
    `<span class="${qualityClass('listing', job.listingStatus)}">${escapeHtml(job.listingLabel || '상태 확인 필요')}</span>`,
    `<span class="${qualityClass('trust', job.sourceKind)}">${escapeHtml(job.sourceTrustLabel || job.source)}</span>`,
    `<span class="${qualityClass('payment', job.paymentStatus)}">${escapeHtml(job.paymentLabel || '지급 조건 확인 필요')}</span>`
  ].join('');
  $('detailsSourceSummary').textContent = job.sourceSummary || '원문에서 모집 상태와 계약·지급 조건을 확인하세요.';
  $('detailsEvidence').replaceChildren();
  for (const evidence of job.sourceEvidence || []) {
    const href = safeExternalUrl(evidence.url);
    if (!href) continue;
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `${evidence.label} ↗`;
    $('detailsEvidence').append(link);
  }
  for (const [index, url] of (job.alternateUrls || []).entries()) {
    const href = safeExternalUrl(url);
    if (!href) continue;
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `다른 출처 ${index + 1} ↗`;
    $('detailsEvidence').append(link);
  }
  const reviewNote = job.sourceReviewAt ? ` · 지급·평판 근거 검토: ${job.sourceReviewAt}` : '';
  $('detailsVerifiedAt').textContent = job.verifiedAt ? `마지막 수집 확인: ${new Date(job.verifiedAt).toLocaleString('ko-KR')}${reviewNote}` : `확인 시각 미상${reviewNote}`;
  $('detailsDescription').textContent = job.description || '상세 설명이 제공되지 않았습니다.';
  $('detailsLink').href = job.url;
  updateDetailNavigation();
  if (!$('detailsDialog').open) $('detailsDialog').showModal();
}

function updateDetailNavigation() {
  const index = state.detailQueue.indexOf(state.currentDetailId);
  $('prevDetails').disabled = index <= 0;
  $('nextDetails').disabled = index < 0 || index >= state.detailQueue.length - 1;
}

function moveDetails(direction) {
  const index = state.detailQueue.indexOf(state.currentDetailId);
  const nextId = state.detailQueue[index + direction];
  const next = state.jobs.find((job) => job.id === nextId);
  if (next) openDetails(next);
}

function render() {
  const jobs = filteredJobs();
  const visibleJobs = jobs.slice(0, state.visibleLimit);
  $('resultCount').textContent = jobs.length > visibleJobs.length ? `${jobs.length}개 중 ${visibleJobs.length}개 표시` : `${jobs.length}개 공고`;
  $('empty').hidden = jobs.length > 0;
  if (!jobs.length && !state.loadError) $('emptyMessage').textContent = '현재 필터에 맞는 공고가 없습니다. 필터를 초기화하거나 조건을 넓혀보세요.';
  $('loadMore').hidden = visibleJobs.length >= jobs.length;
  const container = $('jobs');
  container.replaceChildren();
  const template = $('jobTemplate');
  for (const job of visibleJobs) {
    const node = template.content.cloneNode(true);
    node.querySelector('.source').textContent = job.source;
    if ((job.sources || []).length > 1) node.querySelector('.source').textContent = `${job.source} +${job.sources.length - 1}`;
    node.querySelector('.score').textContent = job.manual ? '직접 추가' : `적합도 ${job.score}`;
    const selection = node.querySelector('.job-select');
    selection.checked = state.selectedIds.has(job.id);
    selection.setAttribute('aria-label', `${job.title} 선택`);
    selection.addEventListener('change', () => {
      selection.checked ? state.selectedIds.add(job.id) : state.selectedIds.delete(job.id);
      updateBatchUI(visibleJobs);
    });
    const listingBadge = node.querySelector('.listing-badge');
    listingBadge.textContent = job.listingLabel || '상태 확인 필요';
    listingBadge.className = `listing-badge ${qualityClass('listing', job.listingStatus)}`;
    const trustBadge = node.querySelector('.trust-badge');
    trustBadge.textContent = job.sourceTrustLabel || job.source;
    trustBadge.className = `trust-badge ${qualityClass('trust', job.sourceKind)}`;
    const paymentBadge = node.querySelector('.payment-badge');
    paymentBadge.textContent = job.paymentLabel || '지급 조건 확인 필요';
    paymentBadge.className = `payment-badge ${qualityClass('payment', job.paymentStatus)}`;
    node.querySelector('.title').textContent = job.title;
    node.querySelector('.company').textContent = job.company;
    const meta = [job.location, job.type, job.eligibility, job.category, salaryLabel(job)].filter(Boolean);
    node.querySelector('.meta').innerHTML = meta.map((v) => `<span>${escapeHtml(v)}</span>`).join('');
    node.querySelector('.description').textContent = job.description || '상세 설명 없음';
    const tagValues = [...new Set([...(state.newIds.has(job.id) ? ['NEW'] : []), ...(job.duplicateCount > 1 ? [`중복 ${job.duplicateCount}개 통합`] : []), ...(job.fitWarning ? [job.fitWarning] : []), ...(job.matchedKeywords || []), ...(job.tags || [])])].slice(0, 6);
    node.querySelector('.tags').innerHTML = tagValues.map((v) => `<span class="tag">${escapeHtml(v)}</span>`).join('');
    node.querySelector('.posted').textContent = formatDate(job.postedAt);
    const apply = node.querySelector('.apply');
    apply.href = job.url;
    apply.addEventListener('click', () => {
      state.reviewedIds.add(job.id);
      state.newIds.delete(job.id);
      persist();
      renderStats();
      if ($('statusFilter').value === 'unreviewed' || $('statusFilter').value === 'new') render();
    });

    const favorite = node.querySelector('.favorite');
    favorite.textContent = state.favorites.has(job.id) ? '★' : '☆';
    favorite.setAttribute('aria-label', state.favorites.has(job.id) ? `${job.title} 관심 해제` : `${job.title} 관심 등록`);
    favorite.classList.toggle('active', state.favorites.has(job.id));
    favorite.addEventListener('click', () => {
      state.reviewedIds.add(job.id);
      state.newIds.delete(job.id);
      state.favorites.has(job.id) ? state.favorites.delete(job.id) : state.favorites.add(job.id);
      if (state.favorites.has(job.id)) snapshotJob(job.id);
      persist(); renderStats(); render();
    });

    const jobState = node.querySelector('.job-state');
    jobState.value = state.jobStates[job.id] || '';
    jobState.addEventListener('change', () => setJobState(job.id, jobState.value));
    const dismiss = node.querySelector('.dismiss');
    if (state.hiddenIds.has(job.id)) {
      dismiss.textContent = '↶';
      dismiss.title = '숨김 해제';
      dismiss.setAttribute('aria-label', `${job.title} 숨김 해제`);
      dismiss.addEventListener('click', () => setHidden(job.id, false));
    } else {
      dismiss.textContent = '×';
      dismiss.title = '숨기기';
      dismiss.setAttribute('aria-label', `${job.title} 숨기기`);
      dismiss.addEventListener('click', () => hideWithUndo(job));
    }
    node.querySelector('.details').addEventListener('click', () => openDetails(job));
    container.appendChild(node);
  }
  updateBatchUI(visibleJobs);
}

function updateBatchUI(visibleJobs = filteredJobs().slice(0, state.visibleLimit)) {
  const selected = [...state.selectedIds].filter((id) => state.jobs.some((job) => job.id === id));
  state.selectedIds = new Set(selected);
  $('batchBar').hidden = visibleJobs.length === 0;
  $('batchBar').classList.toggle('has-selection', selected.length > 0);
  $('selectedCount').textContent = `${selected.length}개 선택`;
  for (const id of ['batchFavorite', 'batchPlanned', 'batchApplied', 'batchReviewed', 'batchHide', 'clearSelection']) $(id).disabled = selected.length === 0;
  const visibleIds = visibleJobs.map((job) => job.id);
  const selectedVisible = visibleIds.filter((id) => state.selectedIds.has(id)).length;
  $('selectVisible').checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
  $('selectVisible').indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
}

function applyBatch(action) {
  const allowed = new Set(filteredJobs().map((job) => job.id));
  state.selectedIds = new Set([...state.selectedIds].filter((id) => allowed.has(id)));
  if (!state.selectedIds.size) { render(); return; }
  const affectedIds = [...state.selectedIds];
  for (const id of affectedIds) {
    state.reviewedIds.add(id);
    state.newIds.delete(id);
    if (action === 'favorite') state.favorites.add(id);
    if (action === 'planned') state.jobStates[id] = 'planned';
    if (action === 'applied') state.jobStates[id] = 'applied';
    if (action === 'hide') state.hiddenIds.add(id);
    if (['favorite', 'planned', 'applied'].includes(action)) snapshotJob(id);
  }
  if (action === 'reviewed') {
    for (const id of state.selectedIds) state.reviewedIds.add(id);
  }
  if (action === 'hide') {
    state.lastHidden = { ids: affectedIds };
    $('toastText').textContent = `${affectedIds.length}개 공고를 숨겼습니다.`;
    $('undoHide').hidden = false;
    $('toast').hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { $('toast').hidden = true; state.lastHidden = null; }, 5000);
    state.selectedIds.clear();
  }
  persist();
  renderStats();
  render();
}

function resetFilters() {
  const defaults = {
    query: '', source: '', category: '', remote: '', eligibility: 'likely', ageFilter: '',
    listingFilter: 'active', sourceKindFilter: '', paymentFilter: '', minScore: '20',
    sort: 'score', statusFilter: 'active'
  };
  for (const [id, value] of Object.entries(defaults)) if ($(id)) $(id).value = value;
  state.visibleLimit = 60;
  persistFilters();
  render();
}

function exportState() {
  const payload = {
    schema: 'job-search-radar-state',
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites: [...state.favorites],
    jobStates: state.jobStates,
    hiddenIds: [...state.hiddenIds],
    reviewedIds: [...state.reviewedIds],
    newIds: [...state.newIds],
    manualJobs: state.manualJobs,
    trackedJobs: state.trackedJobs,
    filters: Object.fromEntries(controls.map((id) => [id, $(id).value])),
    knownJobIds: JSON.parse(localStorage.getItem('knownJobIds') || '[]')
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `job-search-radar-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function mergeArraySet(target, values) {
  if (!Array.isArray(values)) return;
  for (const value of values) if (typeof value === 'string') target.add(value);
}

async function importState(file) {
  const payload = JSON.parse(await file.text());
  if (payload?.schema !== 'job-search-radar-state' || payload?.version !== 1) throw new Error('지원하지 않는 백업 파일입니다.');
  mergeArraySet(state.favorites, payload.favorites);
  mergeArraySet(state.hiddenIds, payload.hiddenIds);
  mergeArraySet(state.reviewedIds, payload.reviewedIds);
  mergeArraySet(state.newIds, payload.newIds);
  if (payload.jobStates && typeof payload.jobStates === 'object' && !Array.isArray(payload.jobStates)) {
    for (const [id, value] of Object.entries(payload.jobStates)) {
      if (!['planned', 'applied'].includes(value)) continue;
      state.jobStates[id] = mergeWorkflowState(state.jobStates[id] || '', value);
    }
  }
  if (Array.isArray(payload.manualJobs)) {
    const current = new Map(state.manualJobs.map((job) => [job.id || job.url, job]));
    for (const job of payload.manualJobs) {
      if (!job || typeof job !== 'object' || !job.url || !job.title) continue;
      current.set(job.id || job.url, job);
    }
    state.manualJobs = [...current.values()];
  }
  if (payload.trackedJobs && typeof payload.trackedJobs === 'object' && !Array.isArray(payload.trackedJobs)) {
    for (const [id, snapshot] of Object.entries(payload.trackedJobs)) {
      if (!snapshot || typeof snapshot !== 'object' || !snapshot.title || !snapshot.url) continue;
      if (!state.trackedJobs[id]) state.trackedJobs[id] = snapshot;
    }
  }
  const known = new Set(JSON.parse(localStorage.getItem('knownJobIds') || '[]'));
  mergeArraySet(known, payload.knownJobIds);
  localStorage.setItem('knownJobIds', JSON.stringify([...known]));
  if (payload.filters && typeof payload.filters === 'object') {
    for (const id of controls) {
      if (payload.filters[id] === undefined || !$(id)) continue;
      const element = $(id);
      const value = String(payload.filters[id]);
      if (element.tagName === 'SELECT' && ![...element.options].some((option) => option.value === value)) continue;
      element.value = value;
    }
    persistFilters();
  }
  mergeJobs();
  migrateLegacyState();
  state.newIds = reconcileNewIds(state.newIds, state.reviewedIds, new Set(state.jobs.map((job) => job.id)));
  persist();
  updateDynamicFilters();
  renderStats();
  render();
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

function updateDynamicFilters() {
  fillSelect('source', state.jobs.flatMap((job) => job.sources?.length ? job.sources : [job.source]));
  fillSelect('category', state.jobs.map((job) => job.category));
  if (!state.dynamicFiltersInitialized) {
    for (const id of ['source', 'category']) {
      const value = savedFilters[id];
      if (value !== undefined && [...$(id).options].some((option) => option.value === value)) $(id).value = value;
    }
    state.dynamicFiltersInitialized = true;
  }
}

function applyFeedData(data, detectNew = true) {
  state.apiJobs = data.jobs || [];
  state.meta = data;
  const known = migrateLegacyState();
  mergeJobs();
  for (const id of new Set([
    ...state.favorites,
    ...Object.entries(state.jobStates).filter(([, value]) => ['planned', 'applied'].includes(value)).map(([id]) => id)
  ])) snapshotJob(id);
  if (detectNew && known.size) {
    for (const job of state.jobs) if (!known.has(job.id) && !state.reviewedIds.has(job.id)) state.newIds.add(job.id);
  }
  const currentIds = new Set(state.jobs.map((job) => job.id));
  state.newIds = reconcileNewIds(state.newIds, state.reviewedIds, currentIds);
  persist();
  localStorage.setItem('knownJobIds', JSON.stringify(state.jobs.map((job) => job.id)));
  updateDynamicFilters();
  $('updatedAt').textContent = data.updatedAt ? `마지막 수집 ${new Date(data.updatedAt).toLocaleString('ko-KR')}` : '수집 시각 미상';
  const failedSources = (data.sourceStatus || []).filter((source) => !source.ok);
  if (failedSources.length) {
    const labels = failedSources.map((source) => `${source.source}${source.preserved ? `(${source.preserved}개 유지)` : ''}`).join(', ');
    $('updatedAt').textContent += ` · 소스 오류: ${labels}`;
  }
  state.loadError = null;
  renderStats();
  render();
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
  applyFeedData(data, true);
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
    applyFeedData(data, true);
  } catch (error) {
    state.loadError = error.message;
    $('emptyMessage').textContent = `공고를 다시 불러오지 못했습니다: ${error.message}`;
    $('empty').hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = '목록 새로고침';
  }
});

const dialog = $('addDialog');
$('addJobBtn').addEventListener('click', () => dialog.showModal());
$('closeDialog').addEventListener('click', () => dialog.close());
$('cancelDialog').addEventListener('click', () => dialog.close());
$('exportStateBtn').addEventListener('click', exportState);
$('importStateBtn').addEventListener('click', () => $('importStateFile').click());
$('importStateFile').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    await importState(file);
    $('toastText').textContent = '백업 상태를 현재 데이터에 병합했습니다.';
    $('undoHide').hidden = true;
    $('toast').hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { $('toast').hidden = true; $('undoHide').hidden = false; }, 3500);
  } catch (error) {
    $('emptyMessage').textContent = `상태 가져오기 실패: ${error.message}`;
    $('empty').hidden = false;
  } finally {
    event.target.value = '';
  }
});
$('closeDetails').addEventListener('click', () => {
  $('detailsDialog').close();
  renderStats();
  render();
});
$('detailsDialog').addEventListener('close', () => {
  renderStats();
  render();
});
$('prevDetails').addEventListener('click', () => moveDetails(-1));
$('nextDetails').addEventListener('click', () => moveDetails(1));
document.addEventListener('keydown', (event) => {
  if (!$('detailsDialog').open || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (event.key === 'ArrowLeft') moveDetails(-1);
  if (event.key === 'ArrowRight') moveDetails(1);
});
$('loadMore').addEventListener('click', () => { state.visibleLimit += 60; render(); });
$('resetFilters').addEventListener('click', resetFilters);
$('retryLoad').addEventListener('click', async () => {
  $('retryLoad').disabled = true;
  try { await load(); } catch (error) { state.loadError = error.message; $('emptyMessage').textContent = `공고를 불러오지 못했습니다: ${error.message}`; $('empty').hidden = false; }
  finally { $('retryLoad').disabled = false; }
});
$('selectVisible').addEventListener('change', () => {
  const visible = filteredJobs().slice(0, state.visibleLimit);
  for (const job of visible) $('selectVisible').checked ? state.selectedIds.add(job.id) : state.selectedIds.delete(job.id);
  render();
});
$('batchFavorite').addEventListener('click', () => applyBatch('favorite'));
$('batchPlanned').addEventListener('click', () => applyBatch('planned'));
$('batchApplied').addEventListener('click', () => applyBatch('applied'));
$('batchReviewed').addEventListener('click', () => applyBatch('reviewed'));
$('batchHide').addEventListener('click', () => applyBatch('hide'));
$('clearSelection').addEventListener('click', () => { state.selectedIds.clear(); render(); });
$('undoHide').addEventListener('click', () => {
  if (!state.lastHidden) return;
  for (const id of state.lastHidden.ids || []) state.hiddenIds.delete(id);
  state.lastHidden = null;
  clearTimeout(state.toastTimer);
  $('toast').hidden = true;
  persist();
  renderStats();
  render();
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
    eligibility: '확인 필요',
    eligibilityCode: 'unknown',
    listingStatus: 'manual',
    listingLabel: '직접 확인 필요',
    sourceKind: 'manual',
    sourceTrustLabel: '사용자 직접 추가',
    paymentStatus: 'unknown',
    paymentLabel: '직접 확인 필요',
    sourceSummary: '사용자가 직접 추가한 공고입니다. 원문에서 현재 모집과 지급 조건을 확인하세요.',
    sourceEvidence: [],
    salaryInfo: { raw: '', display: '', confidence: 'none' },
    verifiedAt: new Date().toISOString(),
    score: 50,
    manual: true
  };
  state.manualJobs.unshift(manual);
  persist();
  mergeJobs();
  updateDynamicFilters();
  event.currentTarget.reset();
  dialog.close();
  renderStats(); render();
});

try {
  await load();
} catch (error) {
  state.loadError = error.message;
  $('empty').hidden = false;
  $('emptyMessage').textContent = `공고를 불러오지 못했습니다: ${error.message}`;
}
