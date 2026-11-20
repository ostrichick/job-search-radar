export function createFilterRules({ state, currentFilterValues, jobMarketScopes, filterDefaults, salaryLabel, domesticLocalityMatches, compensationMatches, paymentEvidenceState, roleFitEvidenceFor, profileFit, isNicole = false }) {
function jobMatchesFilters(job, values = currentFilterValues(), { market = state.marketTab, ignore = [] } = {}) {
  const skipped = ignore instanceof Set ? ignore : new Set(ignore);
  const region = job.domesticRegion || {};
  const value = (id) => String(values[id] ?? filterDefaults[market]?.[id] ?? '');
  const teachingOnly = value('teachingOnly') === 'true';
  const teachingMatch = (job.tags || []).some((tag) => /korean[- ](language[- ]teaching|edtech|customer[- ]support|localization|content|curriculum|learning)/i.test(String(tag)))
    || /\bKorean\s+(Language\s+)?(Teacher|Instructor|Tutor|Teaching|EdTech|Customer\s+Support|Support|Localization|Content|Curriculum|Learning|Quality)\b/i.test(job.title || '')
    || /한국어교원|한국어\s*강사|한국어\s*선생님|한국어\s*튜터|세종학당|한국어\s*콘텐츠|한국어\s*고객|한국어\s*CS|에듀테크/i.test(job.title || '');
  if (teachingOnly && !teachingMatch) return false;
  if (!teachingOnly && !jobMarketScopes(job).includes(market)) return false;
  const q = value('query').trim().toLowerCase();
  const source = value('source');
  const category = value('category');
  const remote = value('remote');
  const eligibility = value('eligibility');
  const domesticProvince = value('domesticProvince');
  const domesticLocality = value('domesticLocality');
  const compensationFilter = value('compensationFilter');
  const ageFilter = Number(value('ageFilter') || 0);
  const listingFilter = value('listingFilter');
  const sourceKindFilter = value('sourceKindFilter');
  const paymentFilter = value('paymentFilter');
  const requirementsFilter = value('requirementsFilter');
  const minScore = Number(value('minScore') || 0);
  const status = value('statusFilter');
  const includeAllFits = teachingOnly
    || value('includeAllFits') === 'true'
    || (!isNicole && listingFilter !== 'active')
    || ['saved', 'hidden'].includes(status)
    || (isNicole && value('archiveFilter') !== 'all');
  const haystack = [job.title, job.company, job.location, region.label, region.province, region.locality, job.description, job.category, salaryLabel(job), ...(job.tags || []), ...(job.matchedKeywords || [])].join(' ').toLowerCase();
  const jobState = state.jobStates[job.id] || '';
  const canonical = (text) => String(text || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  const hidden = state.hiddenIds.has(job.id) || (isNicole && (
    state.hiddenCompanies?.has(canonical(job.company)) || state.hiddenSources?.has(canonical(job.source))));
  if (isNicole) {
    const collection = job.collectionState || 'unknown';
    if (!skipped.has('archiveFilter') && value('archiveFilter') === 'current' && collection !== 'seen' && !job.manual) return false;
    if (!skipped.has('archiveFilter') && value('archiveFilter') === 'archived' && collection !== 'not_seen') return false;
    if (!skipped.has('archiveFilter') && value('archiveFilter') === 'unverified' && !['unverified', 'unknown'].includes(collection)) return false;
    if (!includeAllFits && (job.languageFitStatus || 'unknown') === 'mismatch') return false;
    if (!skipped.has('commuteFilter') && market === 'domestic' && !['', 'all'].includes(value('commuteFilter')) && (region.commuteClass || 'unknown') !== value('commuteFilter')) return false;
    if (market === 'overseas_remote' && (job.category === 'interpreting' || /live\s*interpret|video\s*interpret|remote\s*interpreter|실시간\s*통역/i.test(`${job.title || ''} ${job.description || ''}`))) return false;
  }
  if (!skipped.has('query') && q && !haystack.includes(q)) return false;
  if (!skipped.has('source') && source && job.source !== source && !(job.sources || []).includes(source)) return false;
  if (!skipped.has('category') && category && job.category !== category) return false;
  if (market === 'overseas_remote' && !skipped.has('eligibility')) {
    if (eligibility === 'likely' && !['korea', 'worldwide'].includes(job.eligibilityCode)) return false;
    if (eligibility && eligibility !== 'likely' && job.eligibilityCode !== eligibility) return false;
  }
  if (market === 'domestic') {
    if (!skipped.has('domesticProvince') && domesticProvince && region.province !== domesticProvince) return false;
    if (!skipped.has('domesticLocality') && !domesticLocalityMatches(region, domesticLocality)) return false;
  }
  if (!skipped.has('compensationFilter') && !compensationMatches(job, compensationFilter)) return false;
  if (!skipped.has('ageFilter') && ageFilter) {
    const posted = Date.parse(job.postedAt);
    if (!posted || ((Date.now() - posted) / 86400000) > ageFilter) return false;
  }
  if (!skipped.has('listingFilter')) {
    if (listingFilter === 'active' && ['stale', 'source_error', 'archived_missing', 'talent_pool', 'expired'].includes(job.listingStatus)) return false;
    if (listingFilter && listingFilter !== 'active' && listingFilter !== 'all' && job.listingStatus !== listingFilter) return false;
  }
  if (!skipped.has('sourceKindFilter') && sourceKindFilter && job.sourceKind !== sourceKindFilter) return false;
  if (!skipped.has('paymentFilter')) {
    const paymentEvidence = paymentEvidenceState(job);
    if (paymentFilter === 'exclude_caution' && ['caution_repeated', 'mixed_caution', 'caution_single'].includes(paymentEvidence)) return false;
    if (paymentFilter === 'has_caution' && !['caution_repeated', 'mixed_caution', 'caution_single'].includes(paymentEvidence)) return false;
    if (paymentFilter && !['', 'exclude_caution', 'has_caution'].includes(paymentFilter) && paymentEvidence !== paymentFilter) return false;
  }
  if (!skipped.has('requirementsFilter') && requirementsFilter && (job.requirementsStatus || 'clear') !== requirementsFilter) return false;
  if (!includeAllFits && profileFit(job).status === 'fail') return false;
  if (!includeAllFits && !skipped.has('minScore')) {
    if (job.score < minScore) return false;
    if (minScore >= 20 && !job.manual && (job.recommendationEligible === false || !roleFitEvidenceFor(job))) return false;
  }
  if (!skipped.has('statusFilter')) {
    if (['active', 'saved'].includes(status) && hidden) return false;
    const reviewedIds = state.reviewedIdsAtLoad || state.reviewedIds;
    if (status === 'new' && !state.newIds.has(job.id)) return false;
    if (status === 'unreviewed' && reviewedIds.has(job.id)) return false;
    if (status === 'reviewed' && !reviewedIds.has(job.id)) return false;
    if (status === 'saved' && !state.favorites.has(job.id)) return false;
    if (status === 'planned' && jobState !== 'planned') return false;
    if (status === 'applied' && jobState !== 'applied') return false;
    if (status === 'hidden' && !hidden) return false;
  }
  if (!skipped.has('remote')) {
    if (remote === 'remote' && !job.remote) return false;
    if (remote === 'local' && job.remote) return false;
  }
  return true;
}

function matchingJobs(options = {}) {
  const values = options.values || currentFilterValues();
  return state.jobs.filter((job) => jobMatchesFilters(job, values, options));
}


return { jobMatchesFilters, matchingJobs };
}
