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
  dynamicFiltersInitialized: false,
  marketTab: localStorage.getItem('jobMarketTab') === 'domestic' ? 'domestic' : 'overseas_remote'
};

const $ = (id) => document.getElementById(id);
const controls = ['query', 'source', 'category', 'remote', 'eligibility', 'domesticProvince', 'domesticLocality', 'compensationFilter', 'ageFilter', 'listingFilter', 'sourceKindFilter', 'paymentFilter', 'requirementsFilter', 'minScore', 'sort', 'statusFilter'];
const domesticProvinceOptions = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시', '세종특별자치시',
  '경기도', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도'
];
const advancedFilterDefaults = {
  category: '', remote: '', ageFilter: '', listingFilter: 'active',
  sourceKindFilter: '', paymentFilter: '', requirementsFilter: '', minScore: '20', sort: 'score'
};
const filterDefaults = {
  overseas_remote: { query: '', source: '', category: '', remote: '', eligibility: 'likely', domesticProvince: '', domesticLocality: '', compensationFilter: '', ageFilter: '', listingFilter: 'active', sourceKindFilter: '', paymentFilter: '', requirementsFilter: '', minScore: '20', sort: 'score', statusFilter: 'active' },
  domestic: { query: '', source: '', category: '', remote: '', eligibility: '', domesticProvince: '', domesticLocality: '', compensationFilter: '', ageFilter: '', listingFilter: 'active', sourceKindFilter: '', paymentFilter: '', requirementsFilter: '', minScore: '20', sort: 'score', statusFilter: 'active' }
};
const legacySavedFilters = JSON.parse(localStorage.getItem('jobFilters') || '{}');
const savedFiltersByMarket = JSON.parse(localStorage.getItem('jobFiltersByMarket') || '{}');
const filterSchemaVersion = Number(localStorage.getItem('jobFilterSchemaVersion') || 0);
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
  localStorage.setItem('jobFilterSchemaVersion', '3');
  localStorage.setItem('jobFilters', JSON.stringify(legacySavedFilters));
}
if (filterSchemaVersion < 4) {
  if (legacySavedFilters.paymentFilter === 'caution') legacySavedFilters.paymentFilter = 'has_caution';
  if (legacySavedFilters.paymentFilter === 'not_payer') legacySavedFilters.paymentFilter = 'not_applicable';
  localStorage.setItem('jobFilterSchemaVersion', '4');
  localStorage.setItem('jobFilters', JSON.stringify(legacySavedFilters));
}
if (filterSchemaVersion < 5) {
  if (legacySavedFilters.requirementsFilter === undefined) legacySavedFilters.requirementsFilter = '';
  localStorage.setItem('jobFilterSchemaVersion', '5');
  localStorage.setItem('jobFilters', JSON.stringify(legacySavedFilters));
}
if (filterSchemaVersion < 6) {
  if (!savedFiltersByMarket.overseas_remote) savedFiltersByMarket.overseas_remote = { ...legacySavedFilters };
  localStorage.setItem('jobFiltersByMarket', JSON.stringify(savedFiltersByMarket));
  localStorage.setItem('jobFilterSchemaVersion', '6');
}
if (!savedFiltersByMarket.overseas_remote) savedFiltersByMarket.overseas_remote = { ...legacySavedFilters };
const savedFilters = { ...filterDefaults[state.marketTab], ...(savedFiltersByMarket[state.marketTab] || {}) };
function updateAdvancedFilterSummary() {
  const summary = $('advancedFiltersSummary');
  if (!summary) return;
  const active = Object.entries(advancedFilterDefaults)
    .filter(([id, defaultValue]) => $(id) && $(id).value !== defaultValue)
    .length;
  summary.textContent = active ? `추가 필터 · ${active}개 적용` : '추가 필터';
}

for (const id of controls) {
  if (!['source', 'category', 'domesticProvince', 'domesticLocality'].includes(id) && savedFilters[id] !== undefined) $(id).value = savedFilters[id];
  $(id).addEventListener('input', () => {
    state.visibleLimit = 60;
    state.selectedIds.clear();
    if (id === 'domesticProvince') updateDomesticLocalityOptions('');
    persistFilters();
    updateAdvancedFilterSummary();
    render();
  });
}
$('marketOverseas').addEventListener('click', () => setMarketTab('overseas_remote'));
$('marketDomestic').addEventListener('click', () => setMarketTab('domestic'));
const advancedFilters = $('advancedFilters');
if (advancedFilters) {
  const storedOpen = localStorage.getItem('jobAdvancedFiltersOpen');
  advancedFilters.open = storedOpen === null ? !matchMedia('(max-width: 720px)').matches : storedOpen === 'true';
  advancedFilters.addEventListener('toggle', () => localStorage.setItem('jobAdvancedFiltersOpen', String(advancedFilters.open)));
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

function currentFilterValues() {
  return Object.fromEntries(controls.map((id) => [id, $(id)?.value ?? '']));
}

function persistFilters() {
  const values = currentFilterValues();
  savedFiltersByMarket[state.marketTab] = values;
  localStorage.setItem('jobFiltersByMarket', JSON.stringify(savedFiltersByMarket));
  localStorage.setItem('jobFilters', JSON.stringify(values));
  localStorage.setItem('jobMarketTab', state.marketTab);
}

function applyFilterValues(values = {}) {
  const merged = { ...filterDefaults[state.marketTab], ...values };
  for (const id of controls) {
    const element = $(id);
    if (!element || ['source', 'category', 'domesticProvince', 'domesticLocality'].includes(id)) continue;
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
  renderStats();
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

function distanceSummary(job) {
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
    ? `${region.label || region.province || '공고 지역'} 기준`
    : '공고 위치 좌표 기준';
  return {
    value: regionBased ? `지역 기준 직선거리 약 ${rounded}km` : `직선거리 약 ${rounded}km`,
    note: `${targetEvidence} · ${reference.label}에서의 직선거리 · 실제 도로 이동거리 아님${region.coordinateSource ? ` · 좌표 ${region.coordinateSource}` : ''}`,
    km,
    kind: regionBased ? 'region' : 'exact'
  };
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

function filteredJobs() {
  const q = $('query').value.trim().toLowerCase();
  const source = $('source').value;
  const category = $('category').value;
  const remote = $('remote').value;
  const eligibility = $('eligibility').value;
  const domesticProvince = $('domesticProvince').value;
  const domesticLocality = $('domesticLocality').value;
  const compensationFilter = $('compensationFilter').value;
  const ageFilter = Number($('ageFilter').value || 0);
  const listingFilter = $('listingFilter').value;
  const sourceKindFilter = $('sourceKindFilter').value;
  const paymentFilter = $('paymentFilter').value;
  const requirementsFilter = $('requirementsFilter').value;
  const status = $('statusFilter').value;
  const minScore = Number($('minScore').value);
  let jobs = state.jobs.filter((job) => {
    if (!jobMarketScopes(job).includes(state.marketTab)) return false;
    const region = job.domesticRegion || {};
    const haystack = [job.title, job.company, job.location, region.label, region.province, region.locality, job.description, job.category, salaryLabel(job), ...(job.tags || []), ...(job.matchedKeywords || [])].join(' ').toLowerCase();
    const jobState = state.jobStates[job.id] || '';
    const hidden = state.hiddenIds.has(job.id);
    if (q && !haystack.includes(q)) return false;
    if (source && job.source !== source && !(job.sources || []).includes(source)) return false;
    if (category && job.category !== category) return false;
    if (state.marketTab === 'overseas_remote') {
      if (eligibility === 'likely' && !['korea', 'worldwide'].includes(job.eligibilityCode)) return false;
      if (eligibility && eligibility !== 'likely' && job.eligibilityCode !== eligibility) return false;
    }
    if (state.marketTab === 'domestic') {
      if (domesticProvince && region.province !== domesticProvince) return false;
      if (domesticLocality && region.locality !== domesticLocality) return false;
    }
    if (!compensationMatches(job, compensationFilter)) return false;
    if (ageFilter) {
      const posted = Date.parse(job.postedAt);
      if (!posted || ((Date.now() - posted) / 86400000) > ageFilter) return false;
    }
    if (listingFilter === 'active' && ['stale', 'source_error', 'archived_missing', 'talent_pool', 'expired'].includes(job.listingStatus)) return false;
    if (listingFilter && listingFilter !== 'active' && listingFilter !== 'all' && job.listingStatus !== listingFilter) return false;
    if (sourceKindFilter && job.sourceKind !== sourceKindFilter) return false;
    const paymentEvidence = paymentEvidenceState(job);
    if (paymentFilter === 'exclude_caution' && ['caution_repeated', 'mixed_caution', 'caution_single'].includes(paymentEvidence)) return false;
    if (paymentFilter === 'has_caution' && !['caution_repeated', 'mixed_caution', 'caution_single'].includes(paymentEvidence)) return false;
    if (paymentFilter && !['', 'exclude_caution', 'has_caution'].includes(paymentFilter) && paymentEvidence !== paymentFilter) return false;
    if (requirementsFilter && (job.requirementsStatus || 'clear') !== requirementsFilter) return false;
    if (job.score < minScore) return false;
    if (minScore >= 20 && job.recommendationEligible === false) return false;
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
    if (sort === 'distance') {
      const aDistance = distanceSummary(a)?.km;
      const bDistance = distanceSummary(b)?.km;
      const distanceDiff = (Number.isFinite(aDistance) ? aDistance : Number.POSITIVE_INFINITY)
        - (Number.isFinite(bDistance) ? bDistance : Number.POSITIVE_INFINITY);
      if (distanceDiff) return distanceDiff;
    }
    const aReviewed = state.reviewedIds.has(a.id) ? 1 : 0;
    const bReviewed = state.reviewedIds.has(b.id) ? 1 : 0;
    if (aReviewed !== bReviewed) return aReviewed - bReviewed;
    const scoreDiff = b.score - a.score;
    if (scoreDiff) return scoreDiff;
    const reliabilityRank = { reliable: 3, observed: 2, unstable: 1, degraded: 0 };
    const reliabilityDiff = (reliabilityRank[b.sourceReliabilityState] || 0) - (reliabilityRank[a.sourceReliabilityState] || 0);
    if (reliabilityDiff) return reliabilityDiff;
    const listingRank = { verified_open: 3, official_listed: 2, current_feed: 1 };
    const listingDiff = (listingRank[b.listingStatus] || 0) - (listingRank[a.listingStatus] || 0);
    if (listingDiff) return listingDiff;
    const eligibilityRank = { korea: 3, worldwide: 2, unknown: 1, restricted: 0 };
    const eligibilityDiff = (eligibilityRank[b.eligibilityCode] || 0) - (eligibilityRank[a.eligibilityCode] || 0);
    if (eligibilityDiff) return eligibilityDiff;
    const requirementRank = { clear: 3, routine_check: 2, hard_check: 0 };
    const requirementDiff = (requirementRank[b.requirementsStatus] || 0) - (requirementRank[a.requirementsStatus] || 0);
    if (requirementDiff) return requirementDiff;
    const compensationRank = (job) => {
      const summary = salarySummary(job);
      return summary.hasAmount ? 2 : summary.value !== '금액 미공개' ? 1 : 0;
    };
    const compensationDiff = compensationRank(b) - compensationRank(a);
    if (compensationDiff) return compensationDiff;
    const sourceRank = { strong: 3, mixed: 2, weak: 1, degraded: 0 };
    const sourceDiff = (sourceRank[b.sourceQualityTier] || 0) - (sourceRank[a.sourceQualityTier] || 0);
    if (sourceDiff) return sourceDiff;
    const unknownDiff = (a.decisionUnknowns || []).length - (b.decisionUnknowns || []).length;
    if (unknownDiff) return unknownDiff;
    const verificationDiff = (Date.parse(b.lastVerifiedAt) || 0) - (Date.parse(a.lastVerifiedAt) || 0);
    if (verificationDiff) return verificationDiff;
    return (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0);
  });
  return jobs;
}

function renderStats() {
  const marketJobs = state.jobs.filter((job) => jobMarketScopes(job).includes(state.marketTab));
  const marketIds = new Set(marketJobs.map((job) => job.id));
  const recommended = marketJobs.filter((j) => !state.hiddenIds.has(j.id) && isRecommendedJob(j)).length;
  const saved = [...state.favorites].filter((id) => marketIds.has(id)).length;
  const planned = Object.entries(state.jobStates).filter(([id, value]) => marketIds.has(id) && value === 'planned').length;
  const unreviewed = marketJobs.filter((j) => !state.hiddenIds.has(j.id) && !state.reviewedIds.has(j.id) && isRecommendedJob(j)).length;
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

function captureHideState(ids) {
  return ids.map((id) => ({
    id,
    hidden: state.hiddenIds.has(id),
    reviewed: state.reviewedIds.has(id),
    isNew: state.newIds.has(id)
  }));
}

function restoreHideState(items = []) {
  for (const item of items) {
    if (!item?.id) continue;
    item.hidden ? state.hiddenIds.add(item.id) : state.hiddenIds.delete(item.id);
    item.reviewed ? state.reviewedIds.add(item.id) : state.reviewedIds.delete(item.id);
    item.isNew ? state.newIds.add(item.id) : state.newIds.delete(item.id);
  }
}

function hideWithUndo(job) {
  state.lastHidden = { items: captureHideState([job.id]) };
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

function salarySummary(job) {
  const info = job.salaryInfo || {};
  const value = salaryLabel(job);
  const hasAmount = Number.isFinite(info.min) || Number.isFinite(info.max);
  const notes = [];
  if (info.confidence === 'regional_only') notes.push('지역 한정 금액 · 다른 지역은 확인 필요');
  else if (info.confidence === 'basis_only') notes.push('금액 미공개 · 지급 방식만 확인됨');
  else if (info.qualifier === 'maximum') notes.push('상한액');
  else if (info.qualifier === 'approximate') notes.push('대략적 금액');
  if (info.scope === 'geography_dependent') notes.push('지역·국가에 따라 실제 단가 변동');
  if (info.paymentBasis === 'per_task_equivalent') notes.push('건당 지급을 시간당으로 환산');
  if (job.salaryMetadataConflict) notes.push('원문과 채용보드 메타데이터 불일치');
  else if (job.salaryMetadataSuppressed) notes.push('채용보드 금액은 원문 미확인');
  if (!value) notes.push('원문에서 확인 필요');
  return {
    value: value || '금액 미공개',
    note: [...new Set(notes)].join(' · '),
    hasAmount,
    period: info.period || '',
    confidence: info.confidence || 'none',
    paymentBasis: info.paymentBasis || '',
    limited: Boolean(value) && (!hasAmount || info.confidence === 'regional_only' || info.scope === 'geography_dependent' || job.salaryMetadataConflict || job.salaryMetadataSuppressed),
    unknown: !value
  };
}

function compensationMatches(job, filter) {
  if (!filter) return true;
  const summary = salarySummary(job);
  if (filter === 'amount') return summary.hasAmount;
  if (filter === 'hour') return summary.hasAmount && summary.period === 'hour';
  if (filter === 'salary') return summary.hasAmount && ['day', 'week', 'month', 'year'].includes(summary.period);
  if (filter === 'piece') return ['project', 'episode', 'set'].includes(summary.period)
    || ['per_task_equivalent', 'per_completed_set'].includes(summary.paymentBasis);
  if (filter === 'basis_only') return summary.confidence === 'basis_only';
  if (filter === 'undisclosed') return !summary.hasAmount;
  return true;
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
  if (type === 'trust' && ['official_ats', 'official_platform'].includes(value)) return 'official';
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
  return job.recommendationEligible !== false
    && Number(job.score || 0) >= 20
    && ['korea', 'worldwide'].includes(job.eligibilityCode)
    && (job.requirementsStatus || 'clear') !== 'hard_check'
    && !['stale', 'source_error', 'archived_missing', 'talent_pool', 'expired'].includes(job.listingStatus);
}

function recentVerificationBadges(job, now = Date.now()) {
  const badges = [];
  const recent = (value, days = 7) => {
    const at = Date.parse(value || '');
    return Number.isFinite(at) && now - at <= days * 86400000;
  };
  const lifecycle = {
    source_failed: { state: 'source-failed', label: '소스 확인 실패' },
    content_changed: { state: 'changed', label: '원문 변경됨' },
    reappeared: { state: 'reappeared', label: '재등장' },
    source_recovered: { state: 'recovered', label: '소스 복구' }
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
    badges.push({ state: 'recent', label: '최근 검증됨' });
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
    content_changed: '원문 변경',
    status_changed: '모집 상태 변경',
    disappeared: '원천에서 사라짐',
    reappeared: '재등장',
    source_failed: '소스 확인 실패',
    source_recovered: '소스 복구',
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
      reason.textContent = item.reason;
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

function openDetails(job) {
  if (!$('detailsDialog').open || !state.detailQueue.includes(job.id)) state.detailQueue = filteredJobs().map((item) => item.id);
  state.reviewedIds.add(job.id);
  state.newIds.delete(job.id);
  state.currentDetailId = job.id;
  persist();
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
  $('detailsMeta').innerHTML = [job.location, jobMarketScopes(job).includes('domestic') ? workplaceModeLabel(job) : '', job.type, job.eligibility, job.category].filter(Boolean).map((v) => `<span>${escapeHtml(v)}</span>`).join('');
  const payment = effectivePaymentEvidence(job);
  $('detailsTrust').innerHTML = [
    `<span class="${qualityClass('listing', job.listingStatus)}">${escapeHtml(job.listingLabel || '상태 확인 필요')}</span>`,
    `<span class="${qualityClass('eligibility', job.eligibilityCode)}">${escapeHtml(job.eligibility || '지원 범위 확인 필요')}</span>`,
    `<span class="${qualityClass('trust', job.sourceKind)}">${escapeHtml(job.sourceTrustLabel || job.source)}</span>`,
    `<span class="${qualityClass('payment', payment.state)}">${escapeHtml(payment.label || job.paymentLabel || '지급 근거 확인 필요')}</span>`,
    `<span class="${qualityClass('requirements', job.requirementsStatus || 'clear')}">${escapeHtml(job.requirementsLabel || '필수요건 상태 미상')}</span>`,
    `<span>검토 우선순위 ${Number(job.score || 0)}</span>`
  ].join('');
  $('detailsDecisionValue').textContent = (job.applyValueReasons || []).length
    ? job.applyValueReasons.join(' · ')
    : '현재 자동으로 확인된 지원 가치 신호가 없습니다.';
  $('detailsDecisionUnknown').textContent = (job.decisionUnknowns || []).length
    ? job.decisionUnknowns.join(' · ')
    : '현재 자동 감지된 주요 미확인 항목이 없습니다.';
  $('detailsListingReason').textContent = job.listingReason || '현재 모집 상태의 자동 판정 근거가 없습니다.';
  appendEvidenceLinks($('detailsListingEvidence'), job.listingEvidence || [{ label: '공고 원문', url: job.url }]);
  $('detailsSourceSummary').textContent = job.sourceSummary || '원문에서 모집 상태와 계약·지급 조건을 확인하세요.';
  const sourceMetric = state.meta?.sourceMetrics?.[job.source];
  $('detailsSourceHealth').textContent = sourceMetric
    ? `소스 품질 ${sourceMetric.qualityTier || '미상'} · 최근 성공 ${Math.round(Number(sourceMetric.recentSuccessRate || 0) * 100)}% · 유효 ${sourceMetric.keptCount || 0}/${sourceMetric.matchedCount || 0} (${Math.round(Number(sourceMetric.validJobRate || sourceMetric.keptRate || 0) * 100)}%) · 노이즈 ${Math.round(Number(sourceMetric.noiseRate || 0) * 100)}% · 중복 ${Math.round(Number(sourceMetric.duplicateRate || 0) * 100)}% · 저품질 ${Math.round(Number(sourceMetric.lowQualityRate || 0) * 100)}% · 근거 갱신 ${sourceMetric.evidenceRefreshability || '미상'}${job.sourceRecommendationGateReason ? ` · 추천 제외: ${job.sourceRecommendationGateReason}` : ''}`
    : `소스 품질 ${job.sourceQualityTier || '미상'} · 근거 갱신 ${job.sourceEvidenceRefreshability || '미상'}`;
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
    ...(job.fitReasons || [])
  ];
  $('detailsFitReasons').textContent = fitReasonParts.join(' · ');
  const requirements = job.requirementChecks?.length
    ? job.requirementChecks.map((item) => item.label)
    : (job.fitWarnings?.length ? job.fitWarnings : (job.fitWarning ? [job.fitWarning] : []));
  $('detailsFitWarnings').textContent = requirements.length
    ? `확인 필요: ${requirements.join(' · ')}`
    : '현재 자동 감지된 추가 하드요건 없음';
  $('detailsFitWarnings').classList.toggle('has-warning', requirements.length > 0);
  const checkedAt = job.listingCheckedAt || job.verifiedAt;
  const reviewNote = job.paymentEvidenceCheckedAt || job.sourceReviewAt
    ? ` · 지급 근거 검토: ${job.paymentEvidenceCheckedAt || job.sourceReviewAt} (${paymentFreshness})`
    : '';
  $('detailsVerifiedAt').textContent = checkedAt ? `모집 소스 마지막 확인: ${new Date(checkedAt).toLocaleString('ko-KR')}${reviewNote}` : `모집 확인 시각 미상${reviewNote}`;
  renderVerificationHistory(job);
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
  if (!jobs.length && !state.loadError) {
    const province = state.marketTab === 'domestic' ? $('domesticProvince').value : '';
    const locality = state.marketTab === 'domestic' ? $('domesticLocality').value : '';
    const regionLabel = [province, locality].filter(Boolean).join(' ');
    const hasRegionJobs = state.marketTab === 'domestic' && province
      ? state.jobs.some((job) => jobMarketScopes(job).includes('domestic')
        && job.domesticRegion?.province === province
        && (!locality || job.domesticRegion?.locality === locality))
      : true;
    $('emptyMessage').textContent = regionLabel && !hasRegionJobs
      ? `현재 연결된 공식 소스에서 ${regionLabel} 공고를 확인하지 못했습니다. 지역 조건을 넓히거나 나중에 다시 확인해 주세요.`
      : '현재 필터에 맞는 공고가 없습니다. 필터를 초기화하거나 조건을 넓혀보세요.';
  }
  $('loadMore').hidden = visibleJobs.length >= jobs.length;
  const container = $('jobs');
  container.replaceChildren();
  const template = $('jobTemplate');
  for (const job of visibleJobs) {
    const node = template.content.cloneNode(true);
    node.querySelector('.job-card').dataset.jobId = job.id;
    node.querySelector('.source').textContent = job.source;
    if ((job.sources || []).length > 1) node.querySelector('.source').textContent = `${job.source} +${job.sources.length - 1}`;
    node.querySelector('.score').textContent = job.manual ? '직접 추가' : `검토 우선순위 ${job.score}`;
    if (!job.manual) node.querySelector('.score').title = '합격 가능성이 아니라 먼저 확인할 순서를 위한 점수입니다.';
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
    listingBadge.dataset.state = job.listingStatus || '';
    const trustBadge = node.querySelector('.trust-badge');
    trustBadge.textContent = job.sourceTrustLabel || job.source;
    trustBadge.className = `trust-badge ${qualityClass('trust', job.sourceKind)}`;
    const eligibilityBadge = node.querySelector('.eligibility-badge');
    eligibilityBadge.textContent = job.eligibility || '지원 범위 확인 필요';
    eligibilityBadge.className = `eligibility-badge ${qualityClass('eligibility', job.eligibilityCode)}`;
    const paymentBadge = node.querySelector('.payment-badge');
    const payment = effectivePaymentEvidence(job);
    paymentBadge.textContent = payment.label || job.paymentLabel || '지급 근거 확인 필요';
    paymentBadge.className = `payment-badge ${qualityClass('payment', payment.state)}`;
    paymentBadge.dataset.state = payment.state;
    paymentBadge.dataset.freshness = payment.freshness || '';
    paymentBadge.title = `${paymentFreshnessLabel(job)}${payment.nextReviewAt ? ` · 재검토 기준 ${new Date(payment.nextReviewAt).toLocaleDateString('ko-KR')}` : ''}`;
    const requirementsBadge = node.querySelector('.requirements-badge');
    requirementsBadge.textContent = job.requirementsLabel || '필수요건 상태 미상';
    requirementsBadge.className = `requirements-badge ${qualityClass('requirements', job.requirementsStatus || 'clear')}`;
    requirementsBadge.dataset.state = job.requirementsStatus || 'clear';
    renderVerificationBadges(node.querySelector('.verification-badges'), job);
    const valueLine = node.querySelector('.decision-value');
    valueLine.textContent = `지금 볼 이유 · ${(job.applyValueReasons || []).slice(0, 3).join(' · ') || '추가 근거 확인 필요'}`;
    const unknownLine = node.querySelector('.decision-unknown');
    unknownLine.textContent = `미확인 · ${(job.decisionUnknowns || []).slice(0, 3).join(' · ') || '주요 미확인 항목 없음'}`;
    node.querySelector('.title').textContent = job.title;
    node.querySelector('.company').textContent = job.company;
    const compensation = salarySummary(job);
    const compensationNode = node.querySelector('.compensation');
    compensationNode.classList.toggle('unknown', compensation.unknown);
    compensationNode.classList.toggle('limited', compensation.limited);
    node.querySelector('.compensation-value').textContent = compensation.value;
    node.querySelector('.compensation-note').textContent = compensation.note;
    const distance = distanceSummary(job);
    const distanceNode = node.querySelector('.distance-summary');
    distanceNode.hidden = !distance || state.marketTab !== 'domestic';
    if (distance && state.marketTab === 'domestic') {
      distanceNode.classList.toggle('unknown', distance.kind === 'unknown');
      distanceNode.classList.toggle('remote', distance.kind === 'remote');
      node.querySelector('.distance-value').textContent = distance.value;
      node.querySelector('.distance-note').textContent = distance.note;
    }
    const meta = [job.location, state.marketTab === 'domestic' ? workplaceModeLabel(job) : '', job.type, job.category].filter(Boolean);
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
    jobState.setAttribute('aria-label', `${job.title} 지원 상태`);
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
  $('batchBar').classList.toggle('collapse-hidden', visibleJobs.length === 0 && Boolean(state.meta));
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
  const hideSnapshot = action === 'hide' ? captureHideState(affectedIds) : [];
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
    state.lastHidden = { items: hideSnapshot };
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
  const defaults = filterDefaults[state.marketTab];
  for (const [id, value] of Object.entries(defaults)) if ($(id)) $(id).value = value;
  updateDomesticLocalityOptions();
  state.visibleLimit = 60;
  persistFilters();
  updateAdvancedFilterSummary();
  render();
}

function exportState() {
  persistFilters();
  const payload = {
    schema: 'job-search-radar-state',
    version: 2,
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
    filtersByMarket: savedFiltersByMarket,
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
  if (payload?.schema !== 'job-search-radar-state' || ![1, 2].includes(payload?.version)) throw new Error('지원하지 않는 백업 파일입니다.');
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
  if (payload.filtersByMarket && typeof payload.filtersByMarket === 'object' && !Array.isArray(payload.filtersByMarket)) {
    for (const market of ['overseas_remote', 'domestic']) {
      if (payload.filtersByMarket[market] && typeof payload.filtersByMarket[market] === 'object') {
        savedFiltersByMarket[market] = { ...filterDefaults[market], ...payload.filtersByMarket[market] };
      }
    }
  } else if (payload.filters && typeof payload.filters === 'object') {
    savedFiltersByMarket.overseas_remote = { ...filterDefaults.overseas_remote, ...payload.filters };
  }
  if (['overseas_remote', 'domestic'].includes(payload.marketTab)) state.marketTab = payload.marketTab;
  localStorage.setItem('jobMarketTab', state.marketTab);
  mergeJobs();
  migrateLegacyState();
  state.newIds = reconcileNewIds(state.newIds, state.reviewedIds, new Set(state.jobs.map((job) => job.id)));
  persist();
  applyFilterValues(savedFiltersByMarket[state.marketTab] || filterDefaults[state.marketTab]);
  updateMarketUI();
  updateDynamicFilters(true);
  persistFilters();
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

function updateDomesticLocalityOptions(preferred = null) {
  const province = $('domesticProvince')?.value || '';
  const desired = preferred ?? $('domesticLocality').value;
  const values = state.jobs
    .filter((job) => jobMarketScopes(job).includes('domestic'))
    .filter((job) => !province || job.domesticRegion?.province === province)
    .map((job) => job.domesticRegion?.locality)
    .filter(Boolean);
  fillSelect('domesticLocality', desired ? [...values, desired] : values);
  if (desired && [...$('domesticLocality').options].some((option) => option.value === desired)) $('domesticLocality').value = desired;
}

function updateDynamicFilters(forceSaved = false) {
  const marketJobs = state.jobs.filter((job) => jobMarketScopes(job).includes(state.marketTab));
  const desired = { ...filterDefaults[state.marketTab], ...(savedFiltersByMarket[state.marketTab] || {}) };
  fillSelect('source', marketJobs.flatMap((job) => job.sources?.length ? job.sources : [job.source]));
  fillSelect('category', marketJobs.map((job) => job.category));
  if (state.marketTab === 'domestic') {
    fillSelect('domesticProvince', [...domesticProvinceOptions, ...marketJobs.map((job) => job.domesticRegion?.province).filter(Boolean)]);
    if ((forceSaved || !state.dynamicFiltersInitialized) && desired.domesticProvince && [...$('domesticProvince').options].some((option) => option.value === desired.domesticProvince)) {
      $('domesticProvince').value = desired.domesticProvince;
    }
    updateDomesticLocalityOptions((forceSaved || !state.dynamicFiltersInitialized) ? desired.domesticLocality : null);
  } else {
    $('domesticProvince').value = '';
    updateDomesticLocalityOptions('');
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
  const failed = (sourceStatus || []).filter((source) => !source.ok);
  const sourceMetrics = state.meta?.sourceMetrics || {};
  const qualityWarnings = Object.values(sourceMetrics).filter((metric) =>
    ['weak'].includes(metric?.qualityTier) || ['unstable', 'degraded'].includes(metric?.reliabilityState));
  if (!failed.length && !qualityWarnings.length) {
    panel.hidden = true;
    panel.replaceChildren();
    return;
  }
  const preserved = failed.reduce((sum, source) => sum + Number(source.preserved || 0), 0);
  const summary = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = failed.length
    ? `일부 소스 확인 실패 · ${failed.length}개`
    : `소스 품질 주의 · ${qualityWarnings.length}개`;
  const text = document.createElement('span');
  const failureText = failed.map((source) => `${source.source}${source.preserved ? ` · 이전 ${source.preserved}개 보존` : ''}`);
  const qualityText = qualityWarnings
    .filter((metric) => !failed.some((source) => source.source === metric.source))
    .map((metric) => {
      if (['unstable', 'degraded'].includes(metric.reliabilityState)) {
        return `${metric.source} · 수집 신뢰 ${metric.reliabilityState}`;
      }
      return `${metric.source} · 유효 ${metric.keptCount || 0}/${metric.matchedCount || 0} · 노이즈 ${Math.round(Number(metric.noiseRate || 0) * 100)}%`;
    });
  text.textContent = [...failureText, ...qualityText].join(' / ');
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
      updateAdvancedFilterSummary();
      render();
    });
    panel.append(button);
  }
  panel.hidden = false;
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
  renderSourceHealth(data.sourceStatus || []);
  state.loadError = null;
  renderStats();
  render();
}

async function fetchFeed() {
  const staticPages = location.hostname.endsWith('.github.io');
  const candidates = staticPages ? [`./jobs.json?ts=${Date.now()}`] : ['/api/jobs', `./jobs.json?ts=${Date.now()}`];
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
    if (location.hostname.endsWith('.github.io')) {
      data = await fetchFeed();
    } else {
      try {
        const response = await fetch('/api/refresh', { method: 'POST', cache: 'no-store' });
        if (!response.ok) throw new Error(`${response.status}`);
        data = await response.json();
      } catch {
        data = await fetchFeed();
      }
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
  restoreHideState(state.lastHidden.items || []);
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
    eligibilityBasis: 'manual',
    eligibilityReason: '직접 추가 공고라 지원 가능한 국가 범위를 자동 검증하지 않음',
    listingStatus: 'manual',
    listingLabel: '직접 확인 필요',
    listingBasis: 'manual',
    listingReason: '사용자가 직접 추가한 공고라 원문에서 현재 모집 여부를 확인해야 함',
    listingVerification: 'manual',
    sourceKind: 'manual',
    sourceCoverage: 'manual',
    sourceTrustLabel: '사용자 직접 추가',
    sourceOfficiality: 'manual',
    paymentStatus: 'unknown',
    paymentLabel: '직접 확인 필요',
    paymentEvidenceState: 'insufficient',
    paymentEvidenceLabel: '근거 부족',
    paymentConfidence: 'low',
    paymentEvidenceFreshness: 'insufficient',
    paymentEvidenceCheckedAt: '',
    paymentEvidenceNextReviewAt: '',
    paymentSummary: '직접 추가 공고라 구조화된 공개 지급 평판 근거가 없습니다.',
    paymentSignals: [],
    sourceSummary: '사용자가 직접 추가한 공고입니다. 원문에서 현재 모집과 지급 조건을 확인하세요.',
    sourceEvidence: [],
    salaryInfo: { raw: '', display: '', confidence: 'none' },
    verifiedAt: new Date().toISOString(),
    listingCheckedAt: new Date().toISOString(),
    listingEvidence: [{ type: 'manual_listing', label: '직접 추가 원문', url }],
    fitReasons: ['사용자가 직접 검토 대상으로 추가함'],
    fitWarnings: [],
    fitWarning: '',
    requirementChecks: [],
    requirementsStatus: 'clear',
    requirementsLabel: '추가 하드요건 감지 없음',
    applyValueReasons: ['사용자가 직접 검토 대상으로 추가함'],
    decisionUnknowns: ['현재 모집 여부', '지원 가능 국가', '급여·단가', '지급 신뢰 근거'],
    score: 50,
    marketScopes: [state.marketTab],
    marketSegment: state.marketTab,
    ...(state.marketTab === 'domestic' ? {
      domesticRegion: {
        country: '대한민국',
        province: $('domesticProvince').value || '',
        locality: $('domesticLocality').value || '',
        label: [$('domesticProvince').value, $('domesticLocality').value].filter(Boolean).join(' ') || String(data.location || '').trim(),
        evidenceLevel: 'manual_tab_context'
      },
      workplaceMode: form.has('remote') ? 'remote' : 'unknown'
    } : {}),
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
