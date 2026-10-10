export function createSortRules({ state, currentFilterValues, matchingJobs, distanceSummary, distanceSortBand, deadlinePriority, salarySummary }) {
function filteredJobs() {
  const values = currentFilterValues();
  let jobs = matchingJobs({ values });
  const sort = values.sort;
  jobs.sort((a, b) => {
    let exactDistanceDiff = 0;
    if (sort === 'newest') return (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0);
    if (sort === 'oldest') return (Date.parse(a.postedAt) || 0) - (Date.parse(b.postedAt) || 0);
    if (sort === 'company') return a.company.localeCompare(b.company, 'ko');
    if (sort === 'title') return a.title.localeCompare(b.title, 'ko');
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
