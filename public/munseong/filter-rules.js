export function createFilterRules({ state, currentFilterValues, jobMarketScopes, filterDefaults, salaryLabel, domesticLocalityMatches, compensationMatches, paymentEvidenceState, roleFitEvidenceFor }) {
function jobMatchesFilters(job, values = currentFilterValues(), { market = state.marketTab, ignore = [] } = {}) {
  const skipped = ignore instanceof Set ? ignore : new Set(ignore);
  if (!jobMarketScopes(job).includes(market)) return false;
  const region = job.domesticRegion || {};
  const value = (id) => String(values[id] ?? filterDefaults[market]?.[id] ?? '');
  const q = value('query').trim().toLowerCase();
  const source = value('source');
  const category = value('category');
  const remote = value('remote');
  const eligibility = value('eligibility');
  const domesticProvince = value('domesticProvince');
  const domesticLocality = value('domesticLocality');
  const domesticNeighborhood = value('domesticNeighborhood');
  const compensationFilter = value('compensationFilter');
  const ageFilter = Number(value('ageFilter') || 0);
  const listingFilter = value('listingFilter');
  const sourceKindFilter = value('sourceKindFilter');
  const paymentFilter = value('paymentFilter');
  const requirementsFilter = value('requirementsFilter');
  const status = value('statusFilter');
  const minScore = Number(value('minScore') || 0);
  const haystack = [job.title, job.company, job.location, region.label, region.province, region.locality, job.description, job.category, salaryLabel(job), ...(job.tags || []), ...(job.matchedKeywords || [])].join(' ').toLowerCase();
  const jobState = state.jobStates[job.id] || '';
  const hidden = state.hiddenIds.has(job.id);
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
    if (!skipped.has('domesticNeighborhood') && domesticNeighborhood && region.neighborhood !== domesticNeighborhood) return false;
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
  if (!skipped.has('minScore')) {
    if (job.score < minScore) return false;
    if (minScore >= 20 && !job.manual && (job.recommendationEligible === false || !roleFitEvidenceFor(job))) return false;
  }
  if (!skipped.has('statusFilter')) {
    if (status === 'active' && hidden) return false;
    if (status === 'new' && !state.newIds.has(job.id)) return false;
    if (status === 'unreviewed' && state.reviewedIds.has(job.id)) return false;
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
