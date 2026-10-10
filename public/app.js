import { createCardRenderer } from './render-cards.js';
import { createRenderCache } from './render-cache.js';
import { createCompensationUI } from './compensation-ui.js';
import { createFilterRules } from './filter-rules.js';
import { createSortRules } from './sort-rules.js';
import { createManualJobRules } from './manual-job.js';
import { createStateStorage } from './state-storage.js';
import { validateBackup, validateJob, httpUrl } from './backup-rules.js';
const storage = await createStateStorage();
import { mergeWorkflowState, reconcileNewIds } from './state-rules.js';
import { hasRoleFitEvidence, isDefaultRecommendation as recommendationRule } from './recommendation-rules.js';

const legacyDismissed = new Set(JSON.parse(storage.getItem('jobDismissed') || '[]'));
const storedStates = JSON.parse(storage.getItem('jobStates') || '{}');
const storedHidden = new Set(JSON.parse(storage.getItem('jobHidden') || '[]'));
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
  favorites: new Set(JSON.parse(storage.getItem('jobFavorites') || '[]')),
  jobStates: storedStates,
  hiddenIds: storedHidden,
  manualJobs: JSON.parse(storage.getItem('manualJobs') || '[]'),
  newIds: new Set(JSON.parse(storage.getItem('jobNewIds') || '[]')),
  reviewedIds: new Set(JSON.parse(storage.getItem('reviewedJobIds') || '[]')),
  trackedJobs: JSON.parse(storage.getItem('trackedJobs') || '{}'),
  selectedIds: new Set(),
  visibleLimit: 60,
  lastHidden: null,
  toastTimer: null,
  currentDetailId: null,
  detailQueue: [],
  detailReturnFocus: null,
  loadError: null,
  dynamicFiltersInitialized: false,
  marketTab: storage.getItem('jobMarketTab') === 'domestic' ? 'domestic' : 'overseas_remote'
};

const $ = (id) => document.getElementById(id);
function syncStoredState() {
  state.favorites = new Set(JSON.parse(storage.getItem('jobFavorites') || '[]'));
  state.jobStates = JSON.parse(storage.getItem('jobStates') || '{}');
  state.hiddenIds = new Set(JSON.parse(storage.getItem('jobHidden') || '[]'));
  state.reviewedIds = new Set(JSON.parse(storage.getItem('reviewedJobIds') || '[]'));
  state.newIds = new Set(JSON.parse(storage.getItem('jobNewIds') || '[]'));
  state.manualJobs = JSON.parse(storage.getItem('manualJobs') || '[]');
  state.trackedJobs = JSON.parse(storage.getItem('trackedJobs') || '{}');
  const fresh = JSON.parse(storage.getItem('jobFiltersByMarket') || '{}');
  // Preserve the active editor; pick up other markets before the next switch.
  for (const market of ['domestic', 'overseas_remote']) if (market !== state.marketTab && fresh[market]) savedFiltersByMarket[market] = fresh[market];
  mergeJobs();
}
function showStorageStatus() {
  const panel = $('storageStatus');
  panel.hidden = !storage.readOnly;
  if (storage.readOnly) {
    $('storageStatusText').textContent = `상태를 저장할 수 없어 읽기 전용으로 표시합니다. (${storage.error?.message || '저장소 오류'})`;
    for (const el of document.querySelectorAll('#addJobBtn,#importStateBtn,#addForm button[type=submit],.favorite,.job-state,.dismiss,#addForm button[value=default],#batchFavorite,#batchPlanned,#batchApplied,#batchReviewed,#batchHide,#undoHide')) el.disabled = true;
  }
}
function commitState(mode = 'edit') {
  if (storage.readOnly) { showStorageStatus(); return Promise.resolve(); }
  return storage.commit(mode).catch(() => { syncStoredState(); showStorageStatus(); });
}

const controls = ['query', 'source', 'category', 'remote', 'eligibility', 'domesticProvince', 'domesticLocality', 'domesticNeighborhood', 'compensationFilter', 'ageFilter', 'listingFilter', 'sourceKindFilter', 'paymentFilter', 'requirementsFilter', 'minScore', 'sort', 'statusFilter'];
const fallbackDomesticProvinceOptions = [
  '서울특별시', '전남광주통합특별시', '부산광역시', '대구광역시', '인천광역시', '대전광역시', '울산광역시', '세종특별자치시',
  '경기도', '충청북도', '충청남도', '경상북도', '경상남도', '제주특별자치도', '강원특별자치도', '전북특별자치도'
];
const activeFilterLabels = {
  query: '검색', source: '출처', category: '분야', remote: '근무 형태', eligibility: '지원 범위',
  domesticProvince: '시·도', domesticLocality: '시·군·구', domesticNeighborhood: '읍·면·동',
  compensationFilter: '보수 정보', ageFilter: '게시 시점', listingFilter: '모집 상태',
  sourceKindFilter: '출처 검증', paymentFilter: '지급 신뢰 근거', requirementsFilter: '필수요건 확인',
  minScore: '최소 검토 우선순위', statusFilter: '내 상태'
};
const filterDefaults = {
  overseas_remote: { query: '', source: '', category: '', remote: '', eligibility: 'likely', domesticProvince: '', domesticLocality: '', domesticNeighborhood: '', compensationFilter: '', ageFilter: '', listingFilter: 'active', sourceKindFilter: '', paymentFilter: '', requirementsFilter: '', minScore: '20', sort: 'score', statusFilter: 'active' },
  domestic: { query: '', source: '', category: '', remote: 'local', eligibility: '', domesticProvince: '전북특별자치도', domesticLocality: '전주·완주', domesticNeighborhood: '', compensationFilter: '', ageFilter: '', listingFilter: 'active', sourceKindFilter: '', paymentFilter: '', requirementsFilter: '', minScore: '20', sort: 'distance', statusFilter: 'active' }
};
const currentFilterSchemaVersion = 8;
const legacyDomesticFilterDefaults = [
  { query: '', source: '', category: '', remote: '', eligibility: '', domesticProvince: '', domesticLocality: '', compensationFilter: '', ageFilter: '', listingFilter: 'active', sourceKindFilter: '', paymentFilter: '', requirementsFilter: '', minScore: '20', sort: 'score', statusFilter: 'active' },
  { query: '', source: '', category: '', remote: '', eligibility: '', domesticProvince: '', domesticLocality: '', compensationFilter: '', ageFilter: '', listingFilter: 'active', sourceKindFilter: '', paymentFilter: '', requirementsFilter: '', minScore: '20', sort: 'distance', statusFilter: 'active' },
  { query: '', source: '', category: '', remote: '', eligibility: '', domesticProvince: '', domesticLocality: '', domesticNeighborhood: '', compensationFilter: '', ageFilter: '', listingFilter: 'active', sourceKindFilter: '', paymentFilter: '', requirementsFilter: '', minScore: '20', sort: 'score', statusFilter: 'active' },
  { query: '', source: '', category: '', remote: '', eligibility: '', domesticProvince: '', domesticLocality: '', domesticNeighborhood: '', compensationFilter: '', ageFilter: '', listingFilter: 'active', sourceKindFilter: '', paymentFilter: '', requirementsFilter: '', minScore: '20', sort: 'distance', statusFilter: 'active' }
];
function exactFilterState(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const valueKeys = Object.keys(value).sort();
  const expectedKeys = Object.keys(expected).sort();
  return valueKeys.length === expectedKeys.length
    && valueKeys.every((key, index) => key === expectedKeys[index] && value[key] === expected[key]);
}
function migrateDomesticFilterState(value, fromSchemaVersion = 0) {
  if (Number(fromSchemaVersion || 0) >= currentFilterSchemaVersion) return value;
  return legacyDomesticFilterDefaults.some((legacy) => exactFilterState(value, legacy))
    ? { ...filterDefaults.domestic }
    : value;
}
const legacySavedFilters = JSON.parse(storage.getItem('jobFilters') || '{}');
const savedFiltersByMarket = JSON.parse(storage.getItem('jobFiltersByMarket') || '{}');
const filterSchemaVersion = Number(storage.getItem('jobFilterSchemaVersion') || 0);
function normalizeDomesticProvinceFilter(value) {
  return ({ '광주광역시': '전남광주통합특별시', '전라남도': '전남광주통합특별시' })[value] || value || '';
}
if (filterSchemaVersion < 3) {
  if (legacySavedFilters.minScore === undefined || legacySavedFilters.minScore === '0') legacySavedFilters.minScore = '20';
  if (legacySavedFilters.listingFilter === undefined) legacySavedFilters.listingFilter = 'active';
  const oldEligibilityMap = {
    '한국 명시': 'korea',
    '한국에서 지원 가능': 'korea',
    'Worldwide': 'worldwide',
    '지역 제한 가능': 'restricted',
    '특정 국가 제한': 'restricted',
    '확인 필요': 'unknown',
    '현지 근무/확인 필요': 'restricted'
  };
  legacySavedFilters.eligibility = oldEligibilityMap[legacySavedFilters.eligibility] ?? 'likely';
  if (['korea', 'worldwide'].includes(legacySavedFilters.remote)) legacySavedFilters.remote = '';
  storage.setItem('jobFilterSchemaVersion', '3');
  storage.setItem('jobFilters', JSON.stringify(legacySavedFilters));
}
if (filterSchemaVersion < 4) {
  if (legacySavedFilters.paymentFilter === 'caution') legacySavedFilters.paymentFilter = 'has_caution';
  if (legacySavedFilters.paymentFilter === 'not_payer') legacySavedFilters.paymentFilter = 'not_applicable';
  storage.setItem('jobFilterSchemaVersion', '4');
  storage.setItem('jobFilters', JSON.stringify(legacySavedFilters));
}
if (filterSchemaVersion < 5) {
  if (legacySavedFilters.requirementsFilter === undefined) legacySavedFilters.requirementsFilter = '';
  storage.setItem('jobFilterSchemaVersion', '5');
  storage.setItem('jobFilters', JSON.stringify(legacySavedFilters));
}
if (filterSchemaVersion < 6) {
  if (!savedFiltersByMarket.overseas_remote) savedFiltersByMarket.overseas_remote = { ...legacySavedFilters };
  storage.setItem('jobFiltersByMarket', JSON.stringify(savedFiltersByMarket));
  storage.setItem('jobFilterSchemaVersion', '6');
}
if (filterSchemaVersion < 7) {
  legacySavedFilters.domesticProvince = normalizeDomesticProvinceFilter(legacySavedFilters.domesticProvince);
  if (savedFiltersByMarket.domestic && typeof savedFiltersByMarket.domestic === 'object') {
    savedFiltersByMarket.domestic.domesticProvince = normalizeDomesticProvinceFilter(savedFiltersByMarket.domestic.domesticProvince);
  }
  storage.setItem('jobFilters', JSON.stringify(legacySavedFilters));
  storage.setItem('jobFiltersByMarket', JSON.stringify(savedFiltersByMarket));
  storage.setItem('jobFilterSchemaVersion', '7');
}
if (filterSchemaVersion < currentFilterSchemaVersion) {
  if (savedFiltersByMarket.domestic && typeof savedFiltersByMarket.domestic === 'object') {
    savedFiltersByMarket.domestic = migrateDomesticFilterState(savedFiltersByMarket.domestic, filterSchemaVersion);
    if (state.marketTab === 'domestic') storage.setItem('jobFilters', JSON.stringify(savedFiltersByMarket.domestic));
  }
  storage.setItem('jobFiltersByMarket', JSON.stringify(savedFiltersByMarket));
  storage.setItem('jobFilterSchemaVersion', String(currentFilterSchemaVersion));
}
if (!savedFiltersByMarket.overseas_remote) savedFiltersByMarket.overseas_remote = { ...legacySavedFilters };
const savedFilters = { ...filterDefaults[state.marketTab], ...(savedFiltersByMarket[state.marketTab] || {}) };
function updateAdvancedFilterSummary() {
  const summary = $('advancedFiltersSummary');
  if (!summary) return;
  const active = activeFilterEntries().length;
  summary.textContent = active ? `추가 필터 · 현재 조건 ${active}개` : '추가 필터';
}

const renderCache = createRenderCache();
const distanceSummary = renderCache.wrap('distance', calculateDistanceSummary);
const { salaryLabel, salarySummary: uncachedSalarySummary, compensationMatches } = createCompensationUI({  });
const salarySummary = renderCache.wrap('salary', uncachedSalarySummary);
const { jobMatchesFilters, matchingJobs: uncachedMatchingJobs } = createFilterRules({ state, currentFilterValues, jobMarketScopes, filterDefaults, salaryLabel, domesticLocalityMatches, compensationMatches, paymentEvidenceState, roleFitEvidenceFor });
const matchingJobs = renderCache.wrap('matches', uncachedMatchingJobs, (options = {}) => JSON.stringify([state.marketTab, currentFilterValues(), options]));
const { filteredJobs } = createSortRules({ state, currentFilterValues, matchingJobs, distanceSummary, distanceSortBand, deadlinePriority, salarySummary });
const { manualJobRecord } = createManualJobRules({  });
const { render } = createCardRenderer({ $, activeMarketJobs, captureJobCardFocus, distanceSummary, domesticLocalityMatches, effectivePaymentEvidence, eligibilityDisplayLabel, escapeHtml, filteredJobs, formatDate, formatDeadline, friendlyUiText, hideWithUndo, isBroadActiveView, jobMarketScopes, listingDisplayLabel, openDetails, paymentFreshnessLabel, persist, qualityClass, renderActiveFilters, renderCollectionCoverage, renderStats, renderVerificationBadges, requirementsDisplayLabel, restoreJobCardFocus, roleFitEvidenceFor, salarySummary, setHidden, setJobState, showStorageStatus, snapshotJob, syncStoredState, updateBatchUI, workplaceModeLabel, state, storage, renderCache });
let queryTimer;
for (const id of controls) {
  if (!['source', 'category', 'domesticProvince', 'domesticLocality', 'domesticNeighborhood'].includes(id) && savedFilters[id] !== undefined) $(id).value = savedFilters[id];
  const update = () => {
    state.visibleLimit = 60;
    state.selectedIds.clear();
    if (id === 'domesticProvince') {
      updateDomesticLocalityOptions('');
      updateDomesticNeighborhoodOptions('');
    }
    if (id === 'domesticLocality') updateDomesticNeighborhoodOptions('');
    persistFilters();
    updateDynamicFilters();
    updateAdvancedFilterSummary();
    render();
  };
  $(id).addEventListener('input', () => {
    clearTimeout(queryTimer);
    if (id === 'query') queryTimer = setTimeout(update, 150);
    else update();
  });
}
$('marketOverseas').addEventListener('click', () => setMarketTab('overseas_remote'));
$('marketDomestic').addEventListener('click', () => setMarketTab('domestic'));
const advancedFilters = $('advancedFilters');
if (advancedFilters) {
  const storedOpen = storage.getItem('jobAdvancedFiltersOpen');
  advancedFilters.open = storedOpen === null ? !matchMedia('(max-width: 720px)').matches : storedOpen === 'true';
  advancedFilters.addEventListener('toggle', () => { storage.setItem('jobAdvancedFiltersOpen', String(advancedFilters.open)); commitState(); });
}
updateAdvancedFilterSummary();
updateMarketUI();

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

let importing = false;
function persist() {
  storage.setItem('jobFavorites', JSON.stringify([...state.favorites]));
  storage.setItem('jobStates', JSON.stringify(state.jobStates));
  storage.setItem('jobHidden', JSON.stringify([...state.hiddenIds]));
  storage.setItem('reviewedJobIds', JSON.stringify([...state.reviewedIds]));
  storage.setItem('jobNewIds', JSON.stringify([...state.newIds]));
  storage.setItem('manualJobs', JSON.stringify(state.manualJobs));
  storage.setItem('trackedJobs', JSON.stringify(state.trackedJobs));
  if (!importing) return commitState();
}


function migrateLegacyState() {
  const known = new Set(JSON.parse(storage.getItem('knownJobIds') || '[]'));
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
    storage.setItem('knownJobIds', JSON.stringify([...known]));
  }
  return known;
}

function currentFilterValues() {
  return Object.fromEntries(controls.map((id) => [id, $(id)?.value ?? '']));
}

function deadlineDaysRemaining(job, now = Date.now()) {
  if (job.deadlineType !== 'fixed' || !job.deadlineDate) return null;
  const closeAt = Date.parse(`${job.deadlineDate}T23:59:59+09:00`);
  if (!Number.isFinite(closeAt)) return null;
  return Math.ceil((closeAt - now) / 86400000);
}

function deadlinePriority(job, now = Date.now()) {
  const days = deadlineDaysRemaining(job, now);
  if (Number.isFinite(days)) {
    if (days < 0) return -2;
    if (days <= 3) return 4;
    if (days <= 7) return 3;
    if (days <= 14) return 2;
    return 1;
  }
  if (job.deadlineType === 'rolling') return 0;
  return -1;
}

function formatDeadline(job) {
  const earlyClose = job.deadlineCloseOnHire ? ' · 채용 시 조기마감 가능' : '';
  if (job.deadlineType === 'rolling') return `${job.deadlineLabel || '상시·채용시까지'}${earlyClose}`;
  if (job.deadlineDate) {
    const date = new Date(`${job.deadlineDate}T00:00:00+09:00`);
    if (!Number.isNaN(date.getTime())) {
      const label = date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
      const days = deadlineDaysRemaining(job);
      return `${Number.isFinite(days) && days >= 0 && days <= 3 ? `마감 임박 · ${label}` : `마감 ${label}`}${earlyClose}`;
    }
  }
  return job.deadlineLabel ? `마감 ${job.deadlineLabel}${earlyClose}` : '';
}

function persistFilters() {
  const values = currentFilterValues();
  savedFiltersByMarket[state.marketTab] = values;
  storage.setItem('jobFiltersByMarket', JSON.stringify(savedFiltersByMarket));
  storage.setItem('jobFilters', JSON.stringify(values));
  storage.setItem('jobMarketTab', state.marketTab);
  if (!importing) return commitState();
}

function applyFilterValues(values = {}) {
  const merged = { ...filterDefaults[state.marketTab], ...values };
  for (const id of controls) {
    const element = $(id);
    if (!element || ['source', 'category', 'domesticProvince', 'domesticLocality', 'domesticNeighborhood'].includes(id)) continue;
    const value = String(merged[id] ?? '');
    if (element.tagName === 'SELECT' && ![...element.options].some((option) => option.value === value)) continue;
    element.value = value;
  }
}

function jobMarketScopes(job) {
  if (Array.isArray(job.marketScopes) && job.marketScopes.length) return job.marketScopes;
  return [job.marketSegment || 'overseas_remote'];
}

function setMarketTab(market) {
  if (!['overseas_remote', 'domestic'].includes(market) || market === state.marketTab) return;
  persistFilters();
  state.marketTab = market;
  state.visibleLimit = 60;
  state.selectedIds.clear();
  applyFilterValues(savedFiltersByMarket[market] || filterDefaults[market]);
  updateMarketUI();
  updateDynamicFilters(true);
  persistFilters();
  render();
}

function updateMarketUI() {
  for (const button of document.querySelectorAll('.market-tab')) {
    const selected = button.dataset.market === state.marketTab;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('active', selected);
  }
  for (const element of document.querySelectorAll('.market-overseas-only')) element.hidden = state.marketTab !== 'overseas_remote';
  for (const element of document.querySelectorAll('.market-domestic-only')) element.hidden = state.marketTab !== 'domestic';
  const distanceOption = $('sort')?.querySelector('option[value="distance"]');
  if (distanceOption) distanceOption.hidden = state.marketTab !== 'domestic';
  const reference = state.meta?.locationReference;
  if ($('distanceReference')) {
    $('distanceReference').textContent = reference
      ? `거리 기준 · ${reference.label} · 직선거리 기준(실제 이동거리 아님)`
      : '거리 기준 · 전북특별자치도 전주시 덕진구 산정동 · 직선거리 기준';
  }
}

function haversineKm(a, b) {
  if (![a?.lat, a?.lon, b?.lat, b?.lon].every(Number.isFinite)) return null;
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function calculateDistanceSummary(job) {
  if (!jobMarketScopes(job).includes('domestic')) return null;
  if (job.remote && !/hybrid/i.test(job.workplaceMode || '')) {
    return { value: '원격 · 출근 거리 비해당', note: '한국 내 지원 지역은 확인되지만 출근 위치 비교 대상이 아닙니다.', km: null, kind: 'remote' };
  }
  const region = job.domesticRegion || {};
  const reference = state.meta?.locationReference || { lat: 35.84434, lon: 127.1736277, label: '전북특별자치도 전주시 덕진구 산정동' };
  const km = haversineKm(reference, { lat: region.lat, lon: region.lon });
  if (!Number.isFinite(km)) {
    return { value: '주소 부족으로 거리 계산 불가', note: '공고에 거리 계산에 충분한 주소·좌표가 없습니다.', km: null, kind: 'unknown' };
  }
  const rounded = km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
  const regionBased = !['exact', 'address', 'coordinates'].includes(region.coordinatePrecision);
  const targetEvidence = regionBased
    ? `${region.coordinateLabel || region.label || region.province || '공고 지역'} 기준`
    : '공고 위치 좌표 기준';
  return {
    value: regionBased ? `지역 기준 직선거리 약 ${rounded}km` : `직선거리 약 ${rounded}km`,
    note: `${targetEvidence} · ${reference.label}에서의 직선거리 · 실제 도로 이동거리 아님${regionBased ? ' · 지역 중심점은 거리 구간을 보수적으로 판정' : ''}${region.coordinateSource ? ` · 좌표 ${region.coordinateSource}` : ''}`,
    km,
    kind: regionBased ? 'region' : 'exact',
    coordinatePrecision: region.coordinatePrecision || ''
  };
}

function distanceSortBand(summary) {
  if (!Number.isFinite(summary?.km)) return Number.POSITIVE_INFINITY;
  let band = summary.km <= 10 ? 0 : summary.km <= 20 ? 1 : summary.km <= 40 ? 2 : 3;
  if (summary.kind === 'region' && ['province', 'city', 'district'].includes(summary.coordinatePrecision)) {
    band = Math.min(3, band + 1);
  }
  return band;
}

function domesticLocalityMatches(region = {}, value = '') {
  if (!value) return true;
  if (value === '전주·완주') return ['전주시', '완주군'].includes(region.city);
  return region.locality === value || region.city === value || region.district === value;
}

function workplaceModeLabel(job) {
  return ({ remote: '원격', hybrid: '하이브리드', onsite: '출근' })[job.workplaceMode] || '';
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
    id: _id, description, sourceSummary, sourceEvidence, paymentSignals, listingEvidence, matchedKeywords, tags,
    alternateUrls, legacyIds, verificationHistory, ...rest
  } = job;
  state.trackedJobs[id] = {
    ...rest,
    description: String(description || '').slice(0, 500),
    sourceSummary: String(sourceSummary || '').slice(0, 300),
    sourceEvidence: Array.isArray(sourceEvidence) ? sourceEvidence.slice(0, 4) : [],
    paymentSignals: Array.isArray(paymentSignals) ? paymentSignals.slice(0, 4) : [],
    listingEvidence: Array.isArray(listingEvidence) ? listingEvidence.slice(0, 3) : [],
    matchedKeywords: Array.isArray(matchedKeywords) ? matchedKeywords.slice(0, 8) : [],
    tags: Array.isArray(tags) ? tags.slice(0, 8) : [],
    alternateUrls: Array.isArray(alternateUrls) ? alternateUrls.slice(0, 4) : [],
    legacyIds: Array.isArray(legacyIds) ? legacyIds.slice(0, 8) : [],
    verificationHistory: Array.isArray(verificationHistory) ? verificationHistory.slice(-8) : []
  };
}

function renderStats(filtered = matchingJobs()) {
  if (storage.pending) { render(); return; }
  const filteredIds = new Set(filtered.map((job) => job.id));
  const recommended = filtered.filter((job) => isRecommendedJob(job)).length;
  const saved = [...state.favorites].filter((id) => filteredIds.has(id)).length;
  const planned = Object.entries(state.jobStates).filter(([id, value]) => filteredIds.has(id) && value === 'planned').length;
  const unreviewed = filtered.filter((job) => !state.reviewedIds.has(job.id) && isRecommendedJob(job)).length;
  $('stats').innerHTML = [
    ['추천 공고', `${recommended}개`],
    ['관심 공고', `${saved}개`],
    ['지원 예정', `${planned}개`],
    ['아직 안 본 공고', `${unreviewed}개`]
  ].map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
  renderMarketPulse();
}

function topFrequency(items, selector) {
  const counts = new Map();
  for (const item of items) {
    const value = String(selector(item) || '').trim();
    if (!value || ['회사 미상', '비회원', '기업정보 미상', '기타'].includes(value)) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'ko'))[0] || null;
}

function marketPulseJobs() {
  const values = { ...currentFilterValues(), statusFilter: 'all', minScore: '0' };
  return matchingJobs({ values, ignore: ['statusFilter', 'minScore'] })
    .filter((job) => !['source_error', 'archived_missing', 'talent_pool', 'expired'].includes(job.listingStatus));
}

function currentCollectionGaps() {
  return (Array.isArray(state.meta?.collectionGaps) ? state.meta.collectionGaps : [])
    .filter((gap) => !Array.isArray(gap?.markets) || gap.markets.includes(state.marketTab));
}

function renderMarketPulse() {
  const container = $('marketPulseCards');
  const note = $('marketPulseNote');
  if (!container || !note) return;
  const jobs = marketPulseJobs();
  container.replaceChildren();
  if (!jobs.length) {
    const empty = document.createElement('div');
    empty.className = 'market-pulse-card';
    empty.innerHTML = '<span>시장 요약</span><strong>표시할 공고 없음</strong><small>지역·분야·출처 필터를 완화하면 시장 요약을 볼 수 있습니다.</small>';
    container.append(empty);
    const gapCount = currentCollectionGaps().length;
    note.textContent = `수집된 공고만 요약하며 전체 채용시장을 대표하지 않습니다.${gapCount ? ` · 자동 수집 제한 ${gapCount}개 출처` : ''}`;
    return;
  }

  const referenceAt = Date.parse(state.meta?.updatedAt || '') || Date.now();
  const dated = jobs
    .map((job) => ({ job, at: Date.parse(job.postedAt || '') }))
    .filter((item) => Number.isFinite(item.at) && item.at <= referenceAt + 86400000);
  const ageDays = (at) => (referenceAt - at) / 86400000;
  const recent7 = dated.filter((item) => ageDays(item.at) >= 0 && ageDays(item.at) < 7).length;
  const prior7 = dated.filter((item) => ageDays(item.at) >= 7 && ageDays(item.at) < 14).length;
  const delta = recent7 - prior7;
  const trendDetail = prior7 || recent7
    ? `직전 7일 ${prior7}개 대비 ${delta > 0 ? '+' : ''}${delta}개`
    : '최근 14일 게시일 확인 공고 없음';
  const salaryKnown = jobs.filter((job) => salarySummary(job).hasAmount).length;
  const salaryRate = Math.round((salaryKnown / jobs.length) * 100);
  const category = topFrequency(jobs, (job) => job.category);
  const applicationCompany = topFrequency(jobs.filter(isRecommendedJob), (job) => job.company);
  const applicationCompanyActiveCount = applicationCompany
    ? jobs.filter((job) => String(job.company || '').trim() === applicationCompany[0]).length
    : 0;
  const decisionUnknown = topFrequency(
    jobs.flatMap((job) => Array.isArray(job.decisionUnknowns) ? job.decisionUnknowns.filter(Boolean) : []),
    (value) => value
  );

  const cards = [
    ['최근 7일 신규', `${recent7}개`, trendDetail],
    ['보수 금액 공개', `${salaryKnown}/${jobs.length}개 · ${salaryRate}%`, '금액이 구조화된 공고 기준'],
    ['공고 수 상위 분야', category ? `${category[0]} · ${category[1]}개` : '분야 정보 부족', '현재 필터 안에서 가장 많이 수집된 분야'],
    ['지원 후보 상위 회사', applicationCompany ? `${applicationCompany[0]} · ${applicationCompany[1]}개` : '추천 후보 없음', applicationCompany ? `활성 ${applicationCompanyActiveCount}개 중 추천 기준 충족 ${applicationCompany[1]}개` : '현재 필터에서 추천 기준을 충족한 회사 공고가 없습니다.'],
    ['가장 많은 확인 필요', decisionUnknown ? `${decisionUnknown[1]}개` : '추가 확인 없음', decisionUnknown ? decisionUnknown[0] : '현재 필터에서 별도 확인 항목이 없습니다.']
  ];
  for (const [label, value, detail] of cards) {
    const card = document.createElement('article');
    card.className = 'market-pulse-card';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const valueEl = document.createElement('strong');
    valueEl.textContent = value;
    const detailEl = document.createElement('small');
    detailEl.textContent = detail;
    card.append(labelEl, valueEl, detailEl);
    container.append(card);
  }
  const gapCount = currentCollectionGaps().length;
  note.textContent = `현재 필터의 활성 공고 ${jobs.length}개 기준 · 게시일 확인 ${dated.length}/${jobs.length}개 · 개인 상태/최소 점수는 시장 요약에서 제외${gapCount ? ` · 자동 수집 제한 ${gapCount}개 출처` : ''} · 전체 채용시장 대표 통계 아님`;
}

function broadActiveFilterValues({ includeHidden = false } = {}) {
  return {
    ...filterDefaults[state.marketTab],
    query: '', source: '', category: '', remote: '', eligibility: '',
    domesticProvince: '', domesticLocality: '', domesticNeighborhood: '',
    compensationFilter: '', ageFilter: '', listingFilter: 'active',
    sourceKindFilter: '', paymentFilter: '', requirementsFilter: '', minScore: '0',
    sort: state.marketTab === 'domestic' ? 'distance' : 'score',
    statusFilter: includeHidden ? 'all' : 'active'
  };
}

function activeMarketJobs() {
  return matchingJobs({ values: broadActiveFilterValues() });
}

function isBroadActiveView() {
  const current = currentFilterValues();
  const broad = broadActiveFilterValues();
  return Object.entries(broad).every(([key, value]) => key === 'sort' || String(current[key] ?? '') === String(value));
}

function showAllActiveJobs() {
  const values = broadActiveFilterValues();
  for (const [id, value] of Object.entries(values)) {
    const element = $(id);
    if (!element) continue;
    if (element.tagName === 'SELECT' && ![...element.options].some((option) => option.value === String(value))) continue;
    element.value = String(value);
  }
  state.visibleLimit = 60;
  state.selectedIds.clear();
  updateDynamicFilters();
  updateAdvancedFilterSummary();
  persistFilters();
  render();
}

function activeFilterValueLabel(id, value) {
  const element = $(id);
  if (element?.tagName === 'SELECT') return element.selectedOptions?.[0]?.textContent?.trim() || String(value);
  return String(value).trim();
}

function activeFilterEntries() {
  const current = currentFilterValues();
  const broad = broadActiveFilterValues();
  return controls
    .filter((id) => id !== 'sort' && String(current[id] ?? '') !== String(broad[id] ?? ''))
    .map((id) => ({
      id,
      label: activeFilterLabels[id] || id,
      value: activeFilterValueLabel(id, current[id])
    }))
    .filter((entry) => entry.value);
}

function renderActiveFilters() {
  const panel = $('activeFilters');
  const container = $('activeFilterChips');
  if (!panel || !container) return;
  const entries = activeFilterEntries();
  panel.hidden = entries.length === 0;
  container.replaceChildren();
  for (const entry of entries) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'active-filter-chip';
    button.dataset.filterId = entry.id;
    button.setAttribute('aria-label', `${entry.label} ${entry.value} 조건 해제`);
    button.textContent = `${entry.label}: ${entry.value} ×`;
    container.append(button);
  }
}

function clearFilterConstraint(id) {
  if (!controls.includes(id) || id === 'sort') return;
  const broad = broadActiveFilterValues();
  const element = $(id);
  if (!element) return;
  const nextValue = String(broad[id] ?? '');
  if (element.tagName === 'SELECT' && ![...element.options].some((option) => option.value === nextValue)) return;
  element.value = nextValue;
  if (id === 'domesticProvince') {
    $('domesticLocality').value = '';
    $('domesticNeighborhood').value = '';
  } else if (id === 'domesticLocality') {
    $('domesticNeighborhood').value = '';
  }
  state.visibleLimit = 60;
  state.selectedIds.clear();
  updateDynamicFilters();
  updateAdvancedFilterSummary();
  persistFilters();
  render();
}

async function setJobState(id, value) {
  state.newIds.delete(id);
  if (value) state.jobStates[id] = value;
  else delete state.jobStates[id];
  if (['planned', 'applied'].includes(value) || state.favorites.has(id)) snapshotJob(id);
  await persist();
  render();
}

async function setHidden(id, hidden) {
  state.newIds.delete(id);
  hidden ? state.hiddenIds.add(id) : state.hiddenIds.delete(id);
  await persist();
  render();
}

function captureHideState(ids) {
  return ids.map((id) => ({
    id,
    hidden: state.hiddenIds.has(id),
    isNew: state.newIds.has(id)
  }));
}

function restoreHideState(items = []) {
  for (const item of items) {
    if (!item?.id) continue;
    item.hidden ? state.hiddenIds.add(item.id) : state.hiddenIds.delete(item.id);
    item.isNew ? state.newIds.add(item.id) : state.newIds.delete(item.id);
  }
}

async function hideWithUndo(job) {
  state.lastHidden = { items: captureHideState([job.id]) };
  await setHidden(job.id, true);
  if (storage.readOnly) return;
  $('toastText').textContent = `${job.title} 공고를 숨겼습니다.`;
  $('undoHide').hidden = false;
  $('toast').hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { $('toast').hidden = true; state.lastHidden = null; }, 5000);
}

function qualityClass(type, value) {
  if (type === 'listing') {
    if (value === 'verified_open') return 'verified';
    if (value === 'official_listed') return 'official-listed';
    if (value === 'current_feed') return '';
    if (value === 'stale') return 'stale';
    if (value === 'source_error') return 'stale';
    if (value === 'archived_missing') return 'stale';
    if (value === 'expired') return 'expired';
    if (value === 'talent_pool') return 'talent-pool';
  }
  if (type === 'trust' && ['official_ats', 'official_government', 'official_platform'].includes(value)) return 'official';
  if (type === 'payment' && ['caution', 'caution_repeated', 'mixed_caution', 'caution_single'].includes(value)) return 'caution';
  if (type === 'payment' && value === 'policy_only') return 'policy';
  if (type === 'payment' && value === 'evidence_expired') return 'stale';
  if (type === 'payment' && value === 'insufficient') return 'unknown';
  if (type === 'eligibility' && ['korea', 'worldwide'].includes(value)) return 'eligible';
  if (type === 'eligibility' && value === 'restricted') return 'restricted';
  if (type === 'requirements' && value === 'hard_check') return 'restricted';
  if (type === 'requirements' && value === 'routine_check') return 'caution';
  if (type === 'requirements' && value === 'clear') return 'eligible';
  return '';
}

function listingDisplayLabel(job) {
  if (job?.listingStatus === 'source_error') return '출처 확인 실패';
  return friendlyUiText(job?.listingLabel || '상태 확인 필요');
}

function eligibilityDisplayLabel(job) {
  if (job?.eligibilityCode === 'worldwide') return '전 세계 지원 가능';
  return friendlyUiText(job?.eligibility || '지원 범위 확인 필요');
}

function requirementsDisplayLabel(job) {
  return friendlyUiText(job?.requirementsLabel || '필수조건 상태 미상');
}

function friendlyUiText(value) {
  return String(value || '')
    .replace(/공식 ATS/g, '공식 채용 페이지')
    .replace(/\bWorldwide\b/gi, '전 세계')
    .replace(/하드요건/g, '필수조건')
    .replace(/소스 확인 실패/g, '출처 확인 실패')
    .replace(/소스 복구/g, '출처 복구');
}

function sourceQualityLabel(value) {
  return ({ strong: '좋음', mixed: '혼합', weak: '낮음', degraded: '저하' })[value] || '미상';
}

function sourceReliabilityLabel(value) {
  return ({ reliable: '안정', observed: '관찰 중', unstable: '불안정', degraded: '저하' })[value] || '미상';
}

function evidenceRefreshabilityLabel(value) {
  return ({
    direct_api: '직접 API',
    approved_open_api: '승인형 공식 API',
    official_rest_api: '공식 REST API',
    official_rss: '공식 RSS',
    public_api: '공개 API',
    public_html: '공개 웹페이지',
    public_html_structured_data: '공개 웹페이지·구조화 데이터',
    public_feed: '공개 피드',
    manual: '수동 확인'
  })[value] || value || '미상';
}

function effectiveSignalFreshness(signal, now = Date.now()) {
  const expiresAt = Date.parse(signal?.expiresAt || '');
  const maxAgeDays = Number(signal?.maxAgeDays || 0);
  if (!Number.isFinite(expiresAt)) return signal?.freshness || 'unknown';
  if (now > expiresAt) return 'expired';
  if (maxAgeDays > 0) {
    const windowMs = maxAgeDays * 86400000;
    const referenceAt = expiresAt - windowMs;
    const agingAt = referenceAt + windowMs * 0.75;
    if (now >= agingAt) return 'aging';
  }
  return 'fresh';
}

function effectivePaymentEvidence(job, now = Date.now()) {
  if (job.paymentStatus === 'not_payer' || job.paymentEvidenceState === 'not_applicable') {
    return { state: 'not_applicable', label: '지급 주체 아님', freshness: 'not_applicable', nextReviewAt: '', signals: [] };
  }
  const signals = (job.paymentSignals || []).map((signal) => ({ ...signal, freshness: effectiveSignalFreshness(signal, now) }));
  if (!signals.length) {
    return {
      state: job.paymentEvidenceState || 'insufficient',
      label: job.paymentEvidenceLabel || '근거 부족',
      freshness: job.paymentEvidenceFreshness || 'insufficient',
      nextReviewAt: job.paymentEvidenceNextReviewAt || '',
      signals
    };
  }
  const current = signals.filter((signal) => !['expired', 'unknown'].includes(signal.freshness));
  const expiredCount = signals.filter((signal) => signal.freshness === 'expired').length;
  const hasRepeatedMixed = current.some((signal) => signal.direction === 'mixed' && signal.recurrence === 'repeated');
  const hasRepeatedCaution = current.some((signal) => signal.direction === 'caution' && signal.recurrence === 'repeated');
  const hasSingleCaution = current.some((signal) => signal.direction === 'caution' && signal.recurrence === 'single');
  const hasPolicy = current.some((signal) => signal.type === 'official_policy');
  let state = 'insufficient';
  let label = '근거 부족';
  if (!current.length) {
    state = 'evidence_expired';
    label = '근거 만료·재검토 필요';
  } else if (hasRepeatedMixed) {
    state = 'mixed_caution';
    label = '상반된 신호·반복 주의';
  } else if (hasRepeatedCaution) {
    state = 'caution_repeated';
    label = '반복 주의 신호';
  } else if (hasSingleCaution) {
    state = 'caution_single';
    label = '단일 주의 사례';
  } else if (hasPolicy) {
    state = 'policy_only';
    label = '공식 지급 정책 확인';
  }
  const freshness = !current.length
    ? 'expired'
    : expiredCount
      ? 'mixed_age'
      : current.some((signal) => signal.freshness === 'aging')
        ? 'aging'
        : 'fresh';
  const expiries = current.map((signal) => Date.parse(signal.expiresAt || '')).filter(Number.isFinite);
  return {
    state,
    label,
    freshness,
    nextReviewAt: expiries.length ? new Date(Math.min(...expiries)).toISOString() : '',
    signals
  };
}

function paymentEvidenceState(job) {
  return effectivePaymentEvidence(job).state;
}

function paymentFreshnessLabel(job) {
  const freshness = effectivePaymentEvidence(job).freshness;
  return {
    fresh: '근거 최신',
    aging: '재검토 시점 임박',
    mixed_age: '일부 근거 만료',
    expired: '근거 만료',
    insufficient: '근거 부족',
    not_applicable: '해당 없음'
  }[freshness] || '최신성 미상';
}

function isRecommendedJob(job) {
  return recommendationRule(job, state.meta?.recommendationPolicyVersion || 0);
}

function roleFitEvidenceFor(job) {
  return hasRoleFitEvidence(job, state.meta?.recommendationPolicyVersion || 0);
}

function recentVerificationBadges(job, now = Date.now()) {
  const badges = [];
  const recent = (value, days = 7) => {
    const at = Date.parse(value || '');
    return Number.isFinite(at) && now - at <= days * 86400000;
  };
  const lifecycle = {
    source_failed: { state: 'source-failed', label: '출처 확인 실패' },
    content_changed: { state: 'changed', label: '원문 변경됨' },
    reappeared: { state: 'reappeared', label: '재등장' },
    source_recovered: { state: 'recovered', label: '출처 복구' }
  };
  const recentEvents = (Array.isArray(job.verificationHistory) ? job.verificationHistory : [])
    .filter((item) => lifecycle[item?.event] && recent(item.at, 7))
    .slice()
    .reverse();
  if (job.listingStatus === 'source_error' && !recentEvents.some((item) => item.event === 'source_failed')) {
    recentEvents.unshift({ event: 'source_failed', at: job.lastChangeAt || job.sourceFailureCheckedAt || job.missingCheckedAt });
  }
  const lifecycleStates = new Set();
  for (const event of recentEvents) {
    const badge = lifecycle[event.event];
    if (!badge || lifecycleStates.has(badge.state)) continue;
    lifecycleStates.add(badge.state);
    badges.push(badge);
    if (badges.length >= 2) break;
  }
  if (!badges.length && lifecycle[job.lastChangeKind] && recent(job.lastChangeAt, 7)) {
    badges.push(lifecycle[job.lastChangeKind]);
  }
  const payment = effectivePaymentEvidence(job, now);
  if (payment.freshness === 'aging') badges.push({ state: 'aging', label: '근거 만료 임박' });
  if (payment.freshness === 'expired') badges.push({ state: 'expired', label: '지급 근거 만료' });
  if ((job.requirementsStatus || 'clear') === 'hard_check') badges.push({ state: 'hard', label: '미확인 핵심요건' });
  if (!badges.length && recent(job.lastVerifiedAt || job.listingCheckedAt || job.verifiedAt, 1)) {
    badges.push({ state: 'recent',
      label: ['public_rss', 'public_rss_cached_detail'].includes(job.sourceListingState)
        ? 'RSS 목록 최근 확인' : '최근 검증됨' });
  }
  return badges.slice(0, 3);
}

function renderVerificationBadges(container, job) {
  container.replaceChildren();
  for (const badge of recentVerificationBadges(job)) {
    const span = document.createElement('span');
    span.className = `verification-badge ${badge.state}`;
    span.dataset.state = badge.state;
    span.textContent = badge.label;
    container.append(span);
  }
}

function renderVerificationHistory(job) {
  const container = $('detailsHistory');
  const summary = $('detailsHistorySummary');
  container.replaceChildren();
  const eventLabels = {
    first_seen: '처음 발견',
    verified_unchanged: '변경 없이 재검증',
    rss_list_seen: 'RSS 목록 재확인',
    verification_scope_changed: '확인 근거 범위 변경',
    content_changed: '원문 변경',
    status_changed: '모집 상태 변경',
    disappeared: '원천에서 사라짐',
    reappeared: '재등장',
    source_failed: '출처 확인 실패',
    source_recovered: '출처 복구',
    evidence_freshness_changed: '근거 최신성 변경',
    evidence_state_changed: '지급 근거 상태 변경',
    legacy_content_change_unverified: '구형 원문 변경 기록·재검토',
    source_fingerprint_rebased: '원문 판정 기준 재설정'
  };
  const history = Array.isArray(job.verificationHistory) ? job.verificationHistory.slice(-6).reverse() : [];
  summary.textContent = history.length
    ? `최근 ${history.length}개 검증 사건 · 최초 발견 ${job.firstSeenAt ? new Date(job.firstSeenAt).toLocaleDateString('ko-KR') : '미상'}`
    : '아직 누적된 검증 이력이 없습니다.';
  for (const item of history) {
    const row = document.createElement('div');
    row.className = 'history-item';
    row.dataset.event = item.event || '';
    const heading = document.createElement('strong');
    heading.textContent = eventLabels[item.event] || item.event || '검증';
    const meta = document.createElement('span');
    const at = Date.parse(item.at || '');
    meta.textContent = Number.isFinite(at) ? new Date(at).toLocaleString('ko-KR') : '시각 미상';
    row.append(heading, meta);
    if (item.reason) {
      const reason = document.createElement('small');
      reason.textContent = friendlyUiText(item.reason);
      row.append(reason);
    }
    container.append(row);
  }
}

function appendEvidenceLinks(container, evidenceItems = []) {
  container.replaceChildren();
  for (const evidence of evidenceItems) {
    const href = safeExternalUrl(evidence?.url);
    if (!href) continue;
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `${evidence.label || '근거 열기'} ↗`;
    container.append(link);
  }
}

function renderPaymentSignals(job) {
  const container = $('detailsPaymentSignals');
  container.replaceChildren();
  const payment = effectivePaymentEvidence(job);
  const labels = {
    official_policy: '공식 정책',
    review_aggregate: '리뷰 집계',
    community_report: '커뮤니티 사례'
  };
  const recurrenceLabels = {
    repeated: '반복 신호',
    single: '단일 사례',
    policy: '공식 문서'
  };
  const freshnessLabels = {
    fresh: '최신',
    aging: '재검토 임박',
    expired: '만료',
    unknown: '날짜 미상'
  };
  for (const signal of payment.signals || []) {
    const row = document.createElement('div');
    row.className = 'signal-item';
    const meta = document.createElement('span');
    meta.className = `signal-meta ${signal.direction === 'caution' || signal.direction === 'mixed' ? 'caution' : ''}`;
    const sourceDate = signal.latestSourceAt ? `최근 출처 ${signal.latestSourceAt}` : '';
    const observed = signal.checkedAt ? `확인 ${signal.checkedAt}` : '';
    const freshness = freshnessLabels[signal.freshness] || signal.freshness || '';
    const expires = signal.expiresAt ? `재검토 기준 ${new Date(signal.expiresAt).toLocaleDateString('ko-KR')}` : '';
    meta.textContent = [
      labels[signal.type] || signal.type,
      recurrenceLabels[signal.recurrence] || signal.recurrence,
      sourceDate,
      observed,
      freshness,
      expires
    ].filter(Boolean).join(' · ');
    const href = safeExternalUrl(signal.url);
    if (href) {
      const link = document.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = signal.label || '근거 보기';
      row.append(link);
    } else {
      const title = document.createElement('strong');
      title.textContent = signal.label || '근거';
      row.append(title);
    }
    row.append(meta);
    if (signal.note) {
      const note = document.createElement('small');
      note.textContent = signal.note;
      row.append(note);
    }
    container.append(row);
  }
  if (!container.childElementCount) {
    const empty = document.createElement('span');
    empty.className = 'signal-empty';
    empty.textContent = payment.state === 'not_applicable'
      ? '이 소스는 지급 주체가 아닙니다. 고용주·프로젝트 원문에서 지급 조건을 확인하세요.'
      : '구조화된 공개 지급 평판 근거가 충분하지 않습니다.';
    container.append(empty);
  }
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

async function openDetails(job) {
  const openingFromList = !$('detailsDialog').open;
  if (openingFromList || !state.detailQueue.includes(job.id)) state.detailQueue = filteredJobs().map((item) => item.id);
  if (openingFromList) state.detailReturnFocus = captureJobCardFocus() || { jobId: job.id, selector: '.details', index: 0 };
  if (!storage.readOnly) { state.reviewedIds.add(job.id); state.newIds.delete(job.id); }
  state.currentDetailId = job.id;
  await persist();
  renderStats();
  $('detailsTitle').textContent = job.title;
  $('detailsCompany').textContent = job.company;
  const compensation = salarySummary(job);
  $('detailsCompensation').classList.toggle('unknown', compensation.unknown);
  $('detailsCompensation').classList.toggle('limited', compensation.limited);
  $('detailsCompensationValue').textContent = compensation.value;
  $('detailsCompensationNote').textContent = compensation.note;
  const distance = distanceSummary(job);
  $('detailsDistance').hidden = !distance || state.marketTab !== 'domestic';
  if (distance && state.marketTab === 'domestic') {
    $('detailsDistance').classList.toggle('unknown', distance.kind === 'unknown');
    $('detailsDistance').classList.toggle('remote', distance.kind === 'remote');
    $('detailsDistanceValue').textContent = distance.value;
    $('detailsDistanceNote').textContent = distance.note;
  }
  $('detailsMeta').innerHTML = [
    job.location,
    jobMarketScopes(job).includes('domestic') ? workplaceModeLabel(job) : '',
    job.type,
    job.workSchedule ? `근무 ${job.workSchedule}` : '',
    job.workPeriod ? `기간 ${job.workPeriod}` : '',
    job.experience ? `경력 ${job.experience}` : '',
    job.education ? `학력 ${job.education}` : '',
    (job.preferredConditions || []).length ? `우대 ${job.preferredConditions.slice(0, 3).join(', ')}` : '',
    formatDeadline(job),
    eligibilityDisplayLabel(job),
    job.category
  ].filter(Boolean).map((v) => `<span>${escapeHtml(v)}</span>`).join('');
  const payment = effectivePaymentEvidence(job);
  $('detailsTrust').innerHTML = [
    `<span class="${qualityClass('listing', job.listingStatus)}">${escapeHtml(listingDisplayLabel(job))}</span>`,
    `<span class="${qualityClass('eligibility', job.eligibilityCode)}">${escapeHtml(eligibilityDisplayLabel(job))}</span>`,
    `<span class="${qualityClass('trust', job.sourceKind)}">${escapeHtml(job.sourceTrustLabel || job.source)}</span>`,
    `<span class="${qualityClass('payment', payment.state)}">${escapeHtml(payment.label || job.paymentLabel || '지급 근거 확인 필요')}</span>`,
    `<span class="${qualityClass('requirements', job.requirementsStatus || 'clear')}">${escapeHtml(requirementsDisplayLabel(job))}</span>`,
    `<span>검토 우선순위 ${Number(job.score || 0)}</span>`
  ].join('');
  $('detailsDecisionValue').textContent = (job.applyValueReasons || []).length
    ? job.applyValueReasons.map(friendlyUiText).join(' · ')
    : '현재 자동으로 확인된 지원 가치 신호가 없습니다.';
  $('detailsDecisionUnknown').textContent = (job.decisionUnknowns || []).length
    ? job.decisionUnknowns.map(friendlyUiText).join(' · ')
    : '현재 자동 감지된 주요 미확인 항목이 없습니다.';
  $('detailsListingReason').textContent = friendlyUiText(job.listingReason || '현재 모집 상태의 자동 판정 근거가 없습니다.');
  appendEvidenceLinks($('detailsListingEvidence'), job.listingEvidence || [{ label: '공고 원문', url: job.url }]);
  $('detailsSourceSummary').textContent = friendlyUiText(job.sourceSummary || '원문에서 모집 상태와 계약·지급 조건을 확인하세요.');
  const sourceMetric = state.meta?.sourceMetrics?.[job.source];
  $('detailsSourceHealth').textContent = sourceMetric
    ? `출처 품질 ${sourceQualityLabel(sourceMetric.qualityTier)} · 수집 신뢰 ${sourceReliabilityLabel(sourceMetric.reliabilityState)} · 최근 성공 ${Math.round(Number(sourceMetric.recentSuccessRate || 0) * 100)}% · 검색 발견 ${sourceMetric.discoveredCount ?? sourceMetric.rawCount ?? 0} · 유효 ${sourceMetric.keptCount || 0}/${sourceMetric.matchedCount || 0} (${Math.round(Number(sourceMetric.validJobRate || sourceMetric.keptRate || 0) * 100)}%) · 노이즈 ${Math.round(Number(sourceMetric.noiseRate || 0) * 100)}% · 중복 ${Math.round(Number(sourceMetric.duplicateRate || 0) * 100)}% · 저품질 ${Math.round(Number(sourceMetric.lowQualityRate || 0) * 100)}%${sourceMetric.continuityProbeCount ? ` · 연속성 확인 ${sourceMetric.continuityRecoveredCount || 0}/${sourceMetric.continuityProbeCount}` : ''}${sourceMetric.discoveryCollapseSuspected ? ' · 검색 급락 방어 작동' : ''} · 근거 갱신 ${evidenceRefreshabilityLabel(sourceMetric.evidenceRefreshability)}${job.sourceRecommendationGateReason ? ` · 추천 제외: ${job.sourceRecommendationGateReason}` : ''}`
    : `출처 품질 ${sourceQualityLabel(job.sourceQualityTier)} · 근거 갱신 ${evidenceRefreshabilityLabel(job.sourceEvidenceRefreshability)}`;
  appendEvidenceLinks($('detailsEvidence'), job.sourceEvidence || []);
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
  const paymentFreshness = paymentFreshnessLabel(job);
  const nextPaymentReview = payment.nextReviewAt
    ? ` · 다음 재검토 기준 ${new Date(payment.nextReviewAt).toLocaleDateString('ko-KR')}`
    : '';
  const paymentSummary = payment.state === 'evidence_expired'
    ? '기존 지급 평판 근거의 유효기간이 지나 최신 근거 재검토가 필요합니다.'
    : (job.paymentSummary || '공개 지급 평판 근거가 충분하지 않습니다. 실제 계약·정산 조건을 원문에서 확인하세요.');
  $('detailsPaymentSummary').textContent = `${paymentSummary} · ${paymentFreshness}${nextPaymentReview}`;
  renderPaymentSignals(job);
  $('detailsEligibilityReason').textContent = job.eligibilityReason || '지원 가능 국가 범위의 자동 판정 근거가 없습니다.';
  const fitReasonParts = [
    `이 점수는 합격 가능성이 아니라 검토 우선순위 ${Number(job.score || 0)}점입니다.`,
    ...(job.fitReasons || []).map(friendlyUiText)
  ];
  $('detailsFitReasons').textContent = fitReasonParts.join(' · ');
  const requirements = job.requirementChecks?.length
    ? job.requirementChecks.map((item) => friendlyUiText(item.label))
    : (job.fitWarnings?.length ? job.fitWarnings.map(friendlyUiText) : (job.fitWarning ? [friendlyUiText(job.fitWarning)] : []));
  $('detailsFitWarnings').textContent = requirements.length
    ? `확인 필요: ${requirements.join(' · ')}`
    : '현재 자동 감지된 추가 필수조건 없음';
  $('detailsFitWarnings').classList.toggle('has-warning', requirements.length > 0);
  const checkedAt = job.listingCheckedAt || job.verifiedAt;
  const reviewNote = job.paymentEvidenceCheckedAt || job.sourceReviewAt
    ? ` · 지급 근거 검토: ${job.paymentEvidenceCheckedAt || job.sourceReviewAt} (${paymentFreshness})`
    : '';
  const rssScope = ['public_rss', 'public_rss_cached_detail'].includes(job.sourceListingState);
  const priorDetail = rssScope && job.lastDetailVerifiedAt
    ? ` · 상세 마지막 교차 검증: ${new Date(job.lastDetailVerifiedAt).toLocaleString('ko-KR')} (이번 수집에서는 재검증 안 됨)`
    : '';
  $('detailsVerifiedAt').textContent = checkedAt
    ? `${rssScope ? 'RSS 목록 마지막 확인' : '모집 출처 마지막 확인'}: ${new Date(checkedAt).toLocaleString('ko-KR')}${priorDetail}${reviewNote}`
    : `모집 확인 시각 미상${priorDetail}${reviewNote}`;
  renderVerificationHistory(job);
  $('detailsDescription').textContent = job.description || '상세 설명이 제공되지 않았습니다.';
  $('detailsLink').href = job.url;
  $('detailsLink').textContent = job.source === '고용24' ? '채용정보 제공사이트로 이동 ↗' : '원문 공고 보기 ↗';
  $('work24Attribution').hidden = job.source !== '고용24';
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

function captureJobCardFocus() {
  const active = document.activeElement;
  const card = active?.closest?.('.job-card');
  if (!card?.dataset?.jobId) return null;
  const selectors = ['.favorite', '.dismiss', '.job-state', '.job-select', '.details', '.apply'];
  const selector = selectors.find((candidate) => active.matches?.(candidate)) || '.details';
  const cards = [...document.querySelectorAll('.job-card')];
  return { jobId: card.dataset.jobId, selector, index: Math.max(0, cards.indexOf(card)) };
}

function restoreJobCardFocus(snapshot) {
  if (!snapshot) return;
  const cards = [...document.querySelectorAll('.job-card')];
  let card = cards.find((item) => item.dataset.jobId === snapshot.jobId);
  if (!card && cards.length) card = cards[Math.min(snapshot.index, cards.length - 1)];
  const target = card?.querySelector(snapshot.selector) || card?.querySelector('.details') || $('resultCount');
  target?.focus?.({ preventScroll: true });
}

function updateBatchUI(visibleJobs = filteredJobs().slice(0, state.visibleLimit)) {
  const selected = [...state.selectedIds].filter((id) => state.jobs.some((job) => job.id === id));
  state.selectedIds = new Set(selected);
  $('batchBar').hidden = visibleJobs.length === 0;
  $('batchBar').classList.toggle('collapse-hidden', visibleJobs.length === 0 && Boolean(state.meta));
  $('batchBar').classList.toggle('has-selection', selected.length > 0);
  $('selectedCount').textContent = `${selected.length}개 선택`;
  for (const id of ['batchFavorite', 'batchPlanned', 'batchApplied', 'batchReviewed', 'batchHide', 'clearSelection']) $(id).disabled = selected.length === 0;
  const visibleIds = visibleJobs.map((job) => job.id);
  const selectedVisible = visibleIds.filter((id) => state.selectedIds.has(id)).length;
  $('selectVisible').checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
  $('selectVisible').indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
}

async function applyBatch(action) {
  const allowed = new Set(filteredJobs().map((job) => job.id));
  state.selectedIds = new Set([...state.selectedIds].filter((id) => allowed.has(id)));
  if (!state.selectedIds.size) { render(); return; }
  const affectedIds = [...state.selectedIds];
  const hideSnapshot = action === 'hide' ? captureHideState(affectedIds) : [];
  for (const id of affectedIds) {
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
  await persist();
  if (storage.readOnly) { render(); return; }
  if (action === 'hide') {
    state.lastHidden = { items: hideSnapshot };
    $('toastText').textContent = `${affectedIds.length}개 공고를 숨겼습니다.`;
    $('undoHide').hidden = false;
    $('toast').hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { $('toast').hidden = true; state.lastHidden = null; }, 5000);
    state.selectedIds.clear();
  }
  persist();
  render();
}

function resetFilters() {
  const defaults = filterDefaults[state.marketTab];
  for (const [id, value] of Object.entries(defaults)) if ($(id)) $(id).value = value;
  updateDomesticLocalityOptions();
  updateDomesticNeighborhoodOptions();
  state.visibleLimit = 60;
  persistFilters();
  updateDynamicFilters();
  updateAdvancedFilterSummary();
  render();
}

async function exportState() {
  await persistFilters();
  await storage.refresh();
  syncStoredState();
  const payload = {
    schema: 'job-search-radar-state',
    version: 2,
    filterSchemaVersion: currentFilterSchemaVersion,
    exportedAt: new Date().toISOString(),
    favorites: [...state.favorites],
    jobStates: state.jobStates,
    hiddenIds: [...state.hiddenIds],
    reviewedIds: [...state.reviewedIds],
    newIds: [...state.newIds],
    manualJobs: state.manualJobs,
    trackedJobs: state.trackedJobs,
    marketTab: state.marketTab,
    filters: currentFilterValues(),
    filtersByMarket: JSON.parse(storage.getItem('jobFiltersByMarket') || '{}'),
    knownJobIds: JSON.parse(storage.getItem('knownJobIds') || '[]')
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

function mergeManualJobs(jobs) {
  const current = new Map(state.manualJobs.map((job) => [job.id || job.url, job]));
  for (const job of jobs || []) {
    if (!job || typeof job !== 'object' || !job.url || !job.title) continue;
    current.set(job.id || job.url, job);
  }
  state.manualJobs = [...current.values()];
}

function isLinkedInAlertImport(payload) {
  return Array.isArray(payload)
    && payload.length > 0
    && payload.every((job) => job && typeof job === 'object'
      && (String(job.id || '').startsWith('linkedin-alert:') || job.linkedinJobId)
      && /^https:\/\/www\.linkedin\.com\/jobs\/view\/\d+\/?/i.test(String(job.url || '')));
}

function linkedinAlertManualJobs(payload) {
  return payload.map((job) => {
    const location = String(job.location || '').trim();
    const remote = Boolean(job.remote) || job.workplace === 'remote';
    const koreaLocation = /(?:south\s+korea|republic\s+of\s+korea|대한민국|한국|서울|부산|대구|인천|대전|울산|세종|경기|강원|충청|전라|경상|제주|전주|완주)/i.test(location);
    const market = !remote && koreaLocation ? 'domestic' : 'overseas_remote';
    const linkedinJobId = String(job.linkedinJobId || String(job.id || '').replace(/^linkedin-alert:/, '')).trim();
    return manualJobRecord({
      id: `linkedin-alert:${linkedinJobId}`,
      source: 'LinkedIn Job Alert',
      title: job.title,
      company: job.company,
      location,
      url: `https://www.linkedin.com/jobs/view/${linkedinJobId}/`,
      remote,
      market,
      sourceSummary: 'LinkedIn 공식 Job Alert 이메일에서 사용자가 내보낸 항목입니다. 공고 원문에서 현재 모집·지원 범위를 다시 확인하세요.',
      listingEvidenceLabel: 'LinkedIn 공고 원문'
    });
  });
}

async function importState(file) {
  if (storage.readOnly) throw new Error('상태 저장소가 읽기 전용입니다.');
  const parsed = JSON.parse(await file.text());
  const payload = isLinkedInAlertImport(parsed) ? parsed : validateBackup(parsed, manualJobRecord);
  if (isLinkedInAlertImport(payload)) {
    const importedJobs = linkedinAlertManualJobs(payload);
    mergeManualJobs(importedJobs);
    await persist();
    await storage.flush();
    syncStoredState();
    mergeJobs();
    updateDynamicFilters(true);
    if (importedJobs.length && !importedJobs.some((job) => job.marketSegment === state.marketTab)) setMarketTab(importedJobs[0].marketSegment);
    showAllActiveJobs();
    return { kind: 'linkedin-alert', count: importedJobs.length };
  }
  if (payload?.schema !== 'job-search-radar-state' || ![1, 2].includes(payload?.version)) throw new Error('지원하지 않는 백업 파일입니다.');
  const importBefore = { market: state.marketTab, filters: currentFilterValues(), byMarket: structuredClone(savedFiltersByMarket) };
  importing = true;
  try {
  const importedFilterSchemaVersion = Number(payload.filterSchemaVersion || 0);
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
    mergeManualJobs(payload.manualJobs);
  }
  if (payload.trackedJobs && typeof payload.trackedJobs === 'object' && !Array.isArray(payload.trackedJobs)) {
    for (const [id, snapshot] of Object.entries(payload.trackedJobs)) {
      if (!snapshot || typeof snapshot !== 'object' || !snapshot.title || !snapshot.url) continue;
      if (!state.trackedJobs[id]) state.trackedJobs[id] = snapshot;
    }
  }
  const known = new Set(JSON.parse(storage.getItem('knownJobIds') || '[]'));
  mergeArraySet(known, payload.knownJobIds);
  storage.setItem('knownJobIds', JSON.stringify([...known]));
  if (payload.filtersByMarket && typeof payload.filtersByMarket === 'object' && !Array.isArray(payload.filtersByMarket)) {
    for (const market of ['overseas_remote', 'domestic']) {
      if (payload.filtersByMarket[market] && typeof payload.filtersByMarket[market] === 'object') {
        const importedFilters = market === 'domestic'
          ? migrateDomesticFilterState(payload.filtersByMarket[market], importedFilterSchemaVersion)
          : payload.filtersByMarket[market];
        savedFiltersByMarket[market] = { ...filterDefaults[market], ...importedFilters };
        if (market === 'domestic') {
          savedFiltersByMarket[market].domesticProvince = normalizeDomesticProvinceFilter(savedFiltersByMarket[market].domesticProvince);
        }
      }
    }
  } else if (payload.filters && typeof payload.filters === 'object') {
    savedFiltersByMarket.overseas_remote = { ...filterDefaults.overseas_remote, ...payload.filters };
  }
  storage.setItem('jobFilterSchemaVersion', String(currentFilterSchemaVersion));
  if (['overseas_remote', 'domestic'].includes(payload.marketTab)) state.marketTab = payload.marketTab;
  storage.setItem('jobMarketTab', state.marketTab);
  mergeJobs();
  migrateLegacyState();
  state.newIds = reconcileNewIds(state.newIds, state.reviewedIds, new Set(state.jobs.map((job) => job.id)));
  persist();
  applyFilterValues(savedFiltersByMarket[state.marketTab] || filterDefaults[state.marketTab]);
  updateMarketUI();
  updateDynamicFilters(true);
  persistFilters();
  importing = false;
  await storage.commit('import');
  syncStoredState();
  render();
  return { kind: 'backup' };
  } catch (error) {
    storage.discard();
    state.marketTab = importBefore.market;
    for (const key of Object.keys(savedFiltersByMarket)) delete savedFiltersByMarket[key];
    Object.assign(savedFiltersByMarket, importBefore.byMarket);
    syncStoredState();
    applyFilterValues(importBefore.filters);
    updateMarketUI();
    updateDynamicFilters();
    render();
    throw error;
  } finally { importing = false; }
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

function updateDomesticLocalityOptions(preferred = null, values = currentFilterValues()) {
  const province = $('domesticProvince')?.value || '';
  const desired = preferred ?? $('domesticLocality').value;
  const regions = matchingJobs({
    market: 'domestic',
    values: { ...values, domesticProvince: province },
    ignore: ['domesticLocality', 'domesticNeighborhood']
  })
    .map((job) => job.domesticRegion || {});
  const localityValues = regions.flatMap((region) => [region.city, region.locality]).filter(Boolean);
  if (province === '전북특별자치도' && regions.some((region) => ['전주시', '완주군'].includes(region.city))) localityValues.unshift('전주·완주');
  fillSelect('domesticLocality', desired ? [...localityValues, desired] : localityValues);
  if (desired && [...$('domesticLocality').options].some((option) => option.value === desired)) $('domesticLocality').value = desired;
}

function updateDomesticNeighborhoodOptions(preferred = null, values = currentFilterValues()) {
  const province = $('domesticProvince')?.value || '';
  const locality = $('domesticLocality')?.value || '';
  const desired = preferred ?? $('domesticNeighborhood').value;
  const neighborhoodValues = matchingJobs({
    market: 'domestic',
    values: { ...values, domesticProvince: province, domesticLocality: locality },
    ignore: ['domesticNeighborhood']
  })
    .map((job) => job.domesticRegion || {})
    .map((region) => region.neighborhood)
    .filter(Boolean);
  fillSelect('domesticNeighborhood', desired ? [...neighborhoodValues, desired] : neighborhoodValues);
  if (desired && [...$('domesticNeighborhood').options].some((option) => option.value === desired)) $('domesticNeighborhood').value = desired;
}

function updateDynamicFilters(forceSaved = false) {
  const desired = forceSaved || !state.dynamicFiltersInitialized
    ? { ...filterDefaults[state.marketTab], ...(savedFiltersByMarket[state.marketTab] || {}) }
    : currentFilterValues();
  const values = { ...currentFilterValues(), ...desired };
  const sourceJobs = matchingJobs({ values, ignore: ['source'] });
  const categoryJobs = matchingJobs({ values, ignore: ['category'] });
  fillSelect('source', [...sourceJobs.flatMap((job) => job.sources?.length ? job.sources : [job.source]), desired.source].filter(Boolean));
  fillSelect('category', [...categoryJobs.map((job) => job.category), desired.category].filter(Boolean));
  if (state.marketTab === 'domestic') {
    const provinceJobs = matchingJobs({
      market: 'domestic',
      values,
      ignore: ['domesticProvince', 'domesticLocality', 'domesticNeighborhood']
    });
    const feedProvinceOptions = Array.isArray(state.meta?.domesticProvinceOptions) && state.meta.domesticProvinceOptions.length
      ? state.meta.domesticProvinceOptions
      : fallbackDomesticProvinceOptions;
    fillSelect('domesticProvince', [
      ...feedProvinceOptions,
      ...provinceJobs.map((job) => job.domesticRegion?.province).filter(Boolean),
      desired.domesticProvince
    ].filter(Boolean));
    if ((forceSaved || !state.dynamicFiltersInitialized) && desired.domesticProvince && [...$('domesticProvince').options].some((option) => option.value === desired.domesticProvince)) {
      $('domesticProvince').value = desired.domesticProvince;
    }
    updateDomesticLocalityOptions((forceSaved || !state.dynamicFiltersInitialized) ? desired.domesticLocality : null, values);
    updateDomesticNeighborhoodOptions((forceSaved || !state.dynamicFiltersInitialized) ? desired.domesticNeighborhood : null, values);
  } else {
    $('domesticProvince').value = '';
    updateDomesticLocalityOptions('');
    updateDomesticNeighborhoodOptions('');
  }
  if (forceSaved || !state.dynamicFiltersInitialized) {
    for (const id of ['source', 'category']) {
      const value = desired[id];
      if (value !== undefined && [...$(id).options].some((option) => option.value === value)) $(id).value = value;
    }
    state.dynamicFiltersInitialized = true;
  }
  updateMarketUI();
  updateAdvancedFilterSummary();
}

function renderSourceHealth(sourceStatus = []) {
  const panel = $('sourceHealth');
  if (!panel) return;
  const searchFailureLabels = {
    http_forbidden: 'HTTP 403 접근 거부',
    http_rate_limited: 'HTTP 429 요청 제한',
    http_server_error: 'HTTP 서버 오류',
    http_client_error: 'HTTP 요청 오류',
    tls_error: 'TLS 인증서 연결 오류',
    dns_error: 'DNS 조회 실패',
    timeout: '응답 시간 초과',
    network_error: '네트워크 연결 오류',
    other_error: '실패 원인 미분류'
  };
  const searchFailureDescription = (source) => {
    const reasons = source.searchFailureReasons;
    if (!reasons || typeof reasons !== 'object' || Array.isArray(reasons)) return '';
    const scopes = Array.isArray(source.searchFailureScopes) ? source.searchFailureScopes : [];
    const details = scopes.slice(0, 3)
      .filter((scope) => typeof scope === 'string' && Object.hasOwn(searchFailureLabels, reasons[scope]))
      .map((scope) => `${scope}: ${searchFailureLabels[reasons[scope]]}`);
    return details.length ? ` · ${details.join(', ')}` : '';
  };
  const failed = (sourceStatus || []).filter((source) => !source.ok);
  const partial = (sourceStatus || []).filter((source) => source.ok && (
    Number(source.searchFailureCount || 0) > 0
    || Number(source.rssListOnlyCount || 0) > 0
    || Boolean(source.detailCollapseSuspected)
    || Number(source.detailFailureCount || 0) > 0
    || Number(source.workplaceUnverifiedCount || 0) > 0
    || Number(source.accessRestrictedCount || 0) > 0
    || Number(source.listFallbackCount || 0) > 0
  ));
  const recovered = (sourceStatus || []).filter((source) => source.ok && (
    Number(source.detailRecoveredCount || 0) > 0 || Number(source.continuityRecoveredCount || 0) > 0));
  const sourceMetrics = state.meta?.sourceMetrics || {};
  const qualityWarnings = Object.values(sourceMetrics).filter((metric) =>
    ['weak'].includes(metric?.qualityTier) || ['unstable', 'degraded'].includes(metric?.reliabilityState));
  if (!failed.length && !partial.length && !qualityWarnings.length) {
    panel.hidden = true;
    panel.replaceChildren();
    return;
  }
  const preserved = [...failed, ...partial].reduce((sum, source) => sum + Number(source.preserved || 0), 0);
  const summary = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = failed.length
    ? `일부 출처 확인 실패 · ${failed.length}개`
    : partial.length
      ? `일부 수집 제약 · ${partial.length}개 소스`
      : `출처 품질 주의 · ${qualityWarnings.length}개`;
  const text = document.createElement('span');
  const failureText = failed.map((source) => `${source.source}${source.preserved ? ` · 이전 ${source.preserved}개 보존` : ''}${searchFailureDescription(source)}`);
  const partialText = partial.map((source) => {
    const details = [];
    if (Number(source.preserved || 0) > 0) details.push(`이전 ${Number(source.preserved)}개 보존 · 현재 모집 미확인`);
    if (Number(source.searchFailureCount || 0) > 0) {
      const scopes = Array.isArray(source.searchFailureScopes) ? source.searchFailureScopes.filter(Boolean) : [];
      details.push(`지역 검색 실패 ${Number(source.searchFailureCount)}개${scopes.length ? `(${scopes.join(', ')})` : ''}${searchFailureDescription(source)}`);
    }
    if (Number(source.rssListOnlyCount || 0) > 0) details.push(`공식 공개 RSS 목록 ${Number(source.rssListOnlyCount)}건 · 상세 미검증`);
    if (source.detailCollapseSuspected) details.push('상세 응답·검증 대량 실패 · 기존 공고 현재 모집 미확인');
    if (Number(source.detailFailureCount || 0) > 0) details.push(`상세 파싱·응답 실패 ${Number(source.detailFailureCount)}건`);
    if (Number(source.workplaceUnverifiedCount || 0) > 0) details.push(`근무지 확인 불가 ${Number(source.workplaceUnverifiedCount)}건 제외`);
    if (Number(source.accessRestrictedCount || 0) > 0) details.push(`로그인·연령 인증 필요 ${Number(source.accessRestrictedCount)}건 제외`);
    if (Number(source.listFallbackCount || 0) > 0) details.push(`상세 접근 제한 → 공개 목록 근거 ${Number(source.listFallbackCount)}건 유지`);
    return `${source.source} · ${details.join(' · ')}`;
  });
  const recoveryText = recovered.map((source) => {
    const details = [];
    if (Number(source.detailRecoveredCount || 0) > 0) details.push(`대체 상세 구조 ${Number(source.detailRecoveredCount)}건 복구`);
    if (Number(source.continuityRecoveredCount || 0) > 0) details.push(`검색창 이탈 ${Number(source.continuityRecoveredCount)}건 상세 재확인`);
    return `${source.source} · ${details.join(' · ')}`;
  });
  const qualityText = qualityWarnings
    .filter((metric) => !failed.some((source) => source.source === metric.source))
    .map((metric) => {
      if (['unstable', 'degraded'].includes(metric.reliabilityState)) {
        return `${metric.source} · 수집 신뢰 ${sourceReliabilityLabel(metric.reliabilityState)}`;
      }
      return `${metric.source} · 유효 ${metric.keptCount || 0}/${metric.matchedCount || 0} · 노이즈 ${Math.round(Number(metric.noiseRate || 0) * 100)}%`;
    });
  text.textContent = [...failureText, ...partialText, ...recoveryText, ...qualityText].join(' / ');
  summary.append(title, text);
  panel.replaceChildren(summary);
  if (preserved > 0) {
    const button = document.createElement('button');
    button.id = 'showSourceErrors';
    button.className = 'button compact secondary-light';
    button.type = 'button';
    button.textContent = `보존 공고 ${preserved}개 보기`;
    button.addEventListener('click', () => {
      $('listingFilter').value = 'source_error';
      $('eligibility').value = '';
      $('minScore').value = '0';
      $('sourceKindFilter').value = '';
      $('paymentFilter').value = '';
      $('requirementsFilter').value = '';
      $('statusFilter').value = 'all';
      persistFilters();
      updateDynamicFilters();
      updateAdvancedFilterSummary();
      render();
    });
    panel.append(button);
  }
  panel.hidden = false;
}

function renderCollectionCoverage() {
  const panel = $('collectionCoverage');
  const summary = $('collectionCoverageSummary');
  const list = $('collectionCoverageList');
  if (!panel || !summary || !list) return;
  const gaps = currentCollectionGaps();
  panel.hidden = gaps.length === 0;
  list.replaceChildren();
  if (!gaps.length) return;
  summary.textContent = `수집 범위 제한 · ${gaps.length}개 출처`;
  for (const gap of gaps) {
    const item = document.createElement('article');
    item.className = 'collection-gap-item';
    const heading = document.createElement('strong');
    heading.textContent = `${gap.source} · ${gap.label || '자동 수집 제한'}`;
    const reason = document.createElement('span');
    reason.textContent = gap.reason || '';
    const alternative = document.createElement('small');
    alternative.textContent = gap.alternative ? `대체 경로 · ${gap.alternative}` : '';
    item.append(heading, reason);
    if (alternative.textContent) item.append(alternative);
    list.append(item);
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
  storage.setItem('knownJobIds', JSON.stringify(state.jobs.map((job) => job.id)));
  updateDynamicFilters();
  $('updatedAt').textContent = data.updatedAt ? `마지막 수집 ${new Date(data.updatedAt).toLocaleString('ko-KR')}` : '수집 시각 미상';
  const failedSources = (data.sourceStatus || []).filter((source) => !source.ok);
  if (failedSources.length) {
    const labels = failedSources.map((source) => `${source.source}${source.preserved ? `(${source.preserved}개 유지)` : ''}`).join(', ');
    $('updatedAt').textContent += ` · 출처 오류: ${labels}`;
  }
  renderSourceHealth(data.sourceStatus || []);
  state.loadError = null;
  $('loadErrorBanner').hidden = true;
  render();
}

async function feedRequest(url, options = {}) {
  const response = await fetch(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${response.status}`);
  const data = await response.json();
  if (!data || !Array.isArray(data.jobs) || data.jobs.some((job) => !job || typeof job.id !== 'string' || typeof job.title !== 'string' || !httpUrl(job.url))) throw new Error('잘못된 공고 피드 형식');
  data.jobs.forEach((job, index) => validateJob(job, `jobs[${index}]`));
  if (data.sourceStatus !== undefined && (!Array.isArray(data.sourceStatus) || data.sourceStatus.some((s) => !s || typeof s.source !== 'string' || typeof s.ok !== 'boolean'))) throw new Error('잘못된 출처 상태 형식');
  return data;
}
async function fetchFeed() {
  const staticPages = location.hostname.endsWith('.github.io');
  const candidates = staticPages ? [`./jobs.json?ts=${Date.now()}`] : ['/api/jobs', `./jobs.json?ts=${Date.now()}`];
  let lastError;
  for (const url of candidates) {
    try {
      return await feedRequest(url);
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
  const staticPages = location.hostname.endsWith('.github.io');
  const idleLabel = staticPages ? '목록 다시 확인' : '목록 새로고침';
  button.disabled = true;
  button.textContent = staticPages ? '목록 확인 중…' : '수집 중…';
  try {
    let data, collectionError;
    if (staticPages) {
      data = await fetchFeed();
    } else {
      try {
        data = await feedRequest('/api/refresh', { method: 'POST' });
      } catch (error) {
        collectionError = error;
        data = await fetchFeed();
      }
    }
    applyFeedData(data, true);
    if (collectionError) {
      state.loadError = collectionError.message;
      $('loadErrorText').textContent = `새 수집에 실패하여 마지막 목록을 표시합니다. (${collectionError.message})`;
      $('loadErrorBanner').hidden = false;
    }
  } catch (error) {
    state.loadError = error.message;
    $('loadErrorText').textContent = `새 목록을 확인하지 못했습니다. 현재 화면은 마지막으로 성공한 수집 결과를 유지합니다. (${error.message})`;
    $('loadErrorBanner').hidden = false;
    if (!state.jobs.length) {
      $('emptyMessage').textContent = `공고를 다시 불러오지 못했습니다: ${error.message}`;
      $('empty').hidden = false;
    }
  } finally {
    button.disabled = false;
    button.textContent = idleLabel;
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
    const imported = await importState(file);
    $('toastText').textContent = imported?.kind === 'linkedin-alert'
      ? `LinkedIn 알림 공고 ${imported.count}개를 현재 목록에 병합했습니다.`
      : '백업 상태를 현재 데이터에 병합했습니다.';
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
});
$('detailsDialog').addEventListener('close', () => {
  const returnFocus = state.detailReturnFocus;
  state.detailReturnFocus = null;
  render();
  restoreJobCardFocus(returnFocus);
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
$('showAllActive').addEventListener('click', showAllActiveJobs);
$('clearActiveFilters').addEventListener('click', showAllActiveJobs);
$('activeFilterChips').addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter-id]');
  if (!button) return;
  clearFilterConstraint(button.dataset.filterId);
});
$('marketPulseToggle').addEventListener('click', () => {
  const panel = $('marketPulse');
  const expanded = !panel.classList.contains('expanded');
  panel.classList.toggle('expanded', expanded);
  $('marketPulseToggle').setAttribute('aria-expanded', String(expanded));
  $('marketPulseToggle').textContent = expanded ? '요약 접기' : '요약 보기';
});
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
  restoreHideState(state.lastHidden.items || []);
  state.lastHidden = null;
  clearTimeout(state.toastTimer);
  $('toast').hidden = true;
  persist();
  render();
});

$('addForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const data = Object.fromEntries(form);
  const url = String(data.url || '').trim();
  const title = String(data.title || '').trim();
  const location = String(data.location || '').trim();
  const manualMarket = form.has('remote') ? 'overseas_remote' : state.marketTab;
  if (!title || !url) return;
  if (!httpUrl(url)) { alert('HTTP 또는 HTTPS URL을 입력해 주세요.'); return; }
  const manual = manualJobRecord({
    source: data.source,
    title,
    company: data.company,
    location,
    url,
    remote: form.has('remote'),
    description: data.description,
    market: manualMarket
  });
  state.manualJobs.unshift(manual);
  await persist();
  if (storage.readOnly) return;
  mergeJobs();
  updateDynamicFilters();
  formElement.reset();
  dialog.close();
  if (manualMarket !== state.marketTab) setMarketTab(manualMarket);
  showAllActiveJobs();
  $('toastText').textContent = '공고를 추가했습니다. 방금 추가한 공고가 보이도록 현재 조건을 넓혔습니다.';
  $('undoHide').hidden = true;
  $('toast').hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { $('toast').hidden = true; $('undoHide').hidden = false; }, 3500);
});

storage.subscribe(() => { syncStoredState(); showStorageStatus(); render(); });
$('retryStorage').addEventListener('click', () => location.reload());
$('downloadRecovery').addEventListener('click', async () => {
  const records = await storage.recoveries();
  const url = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'job-search-radar-recovery.json'; link.click(); URL.revokeObjectURL(url);
});
const recoveries = await storage.recoveries().catch(() => []);
if (recoveries.length) {
  $('recoveryNotice').hidden = false;
  $('recoveryNoticeText').textContent = `손상된 저장 항목 ${recoveries.length}개를 기본값으로 복구했습니다. 정상 상태와 원본 기록은 보존했습니다.`;
}
showStorageStatus();
await commitState();
try {
  await load();
} catch (error) {
  state.loadError = error.message;
  $('empty').hidden = false;
  $('emptyMessage').textContent = `공고를 불러오지 못했습니다: ${error.message}`;
}
