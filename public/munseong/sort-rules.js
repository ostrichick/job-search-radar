import { classifyWorkplace } from './profile-fit.js';

export function createSortRules({ state, currentFilterValues, matchingJobs, distanceSummary, distanceSortBand, deadlinePriority, salarySummary, profileFit, isNicole = false }) {
function filteredJobs() {
  const values = currentFilterValues();
  let jobs = matchingJobs({ values });
  const sort = values.sort;
  jobs.sort((a, b) => {
    let exactDistanceDiff = 0;
    const reviewedIds = state.reviewedIdsAtLoad || state.reviewedIds;
    if (sort === 'newest') return (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0);
    if (sort === 'oldest') return (Date.parse(a.postedAt) || 0) - (Date.parse(b.postedAt) || 0);
    if (sort === 'company') return a.company.localeCompare(b.company, 'ko');
    if (sort === 'title') return a.title.localeCompare(b.title, 'ko');
    // A historical listing must not outrank a currently collected one merely
    // because its job title has a higher heuristic fit score. History remains
    // accessible through the collection-status filter.
    if (isNicole && ['fit', 'score', 'distance'].includes(sort)) {
      const freshness = (job) => job.collectionState === 'seen' ? 2
        : job.collectionState === 'not_seen' ? 0 : 1;
      const freshnessDiff = freshness(b) - freshness(a);
      if (freshnessDiff) return freshnessDiff;
    }
    if (sort === 'fit') {
      const fitDiff = profileFit(b).score - profileFit(a).score;
      if (fitDiff) return fitDiff;
    }
    if (sort === 'score') {
      const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
      if (scoreDiff) return scoreDiff;
    }
    // The distance mode groups by commute convenience. The fit and score
    // modes must rank relevance *before* geographic tie-breaking.
    if (state.marketTab === 'domestic' && ['fit', 'score', 'distance'].includes(sort)) {
      const groupDiff = classifyWorkplace(a).rank - classifyWorkplace(b).rank;
      if (groupDiff) return groupDiff;
    }
    if (sort === 'distance') {
      const aSummary = distanceSummary(a);
      const bSummary = distanceSummary(b);
      const bucket = (summary) => summary?.kind === 'remote' ? 2 : Number.isFinite(summary?.km) ? 0 : 1;
      const bucketDiff = bucket(aSummary) - bucket(bSummary);
      if (bucketDiff) return bucketDiff;
      const aDistance = aSummary?.km;
      const bDistance = bSummary?.km;
      const bandDiff = distanceSortBand(aSummary) - distanceSortBand(bSummary);
      if (bandDiff) return bandDiff;
      exactDistanceDiff = (Number.isFinite(aDistance) ? aDistance : Number.POSITIVE_INFINITY)
        - (Number.isFinite(bDistance) ? bDistance : Number.POSITIVE_INFINITY);
    }
    const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
    if (scoreDiff) return scoreDiff;
    const aReviewed = reviewedIds.has(a.id) ? 1 : 0;
    const bReviewed = reviewedIds.has(b.id) ? 1 : 0;
    if (aReviewed !== bReviewed) return aReviewed - bReviewed;
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
    if (sort === 'distance') {
      const deadlineDiff = deadlinePriority(b) - deadlinePriority(a);
      if (deadlineDiff) return deadlineDiff;
    }
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
    if (sort === 'distance' && exactDistanceDiff) return exactDistanceDiff;
    return (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0);
  });
  return jobs;
}


return { filteredJobs };
}
