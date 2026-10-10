import crypto from 'node:crypto';
export function createRecommendationGuard({ isDefaultRecommendation, normalizedUrl }) {
function recommendationCollapseRisk(feed, baseline) {
  if (!baseline
    || baseline.recommendationPolicyVersion !== feed.recommendationPolicyVersion
    || !Array.isArray(baseline.jobs)) {
    return { guarded: false, collapse: false, baselineCount: 0, currentCount: 0, threshold: 0, unexplainedLosses: [], sourceCollapses: [] };
  }
  const baselineRecommended = baseline.jobs.filter(isDefaultRecommendation);
  const currentRecommended = (feed.jobs || []).filter(isDefaultRecommendation);
  const currentById = new Map();
  const currentByUrl = new Map();
  for (const job of feed.jobs || []) {
    for (const id of [job.id, ...(job.legacyIds || [])].filter(Boolean)) currentById.set(id, job);
    for (const url of [job.url, ...(job.alternateUrls || [])].filter(Boolean)) currentByUrl.set(normalizedUrl(url), job);
  }
  const findCurrent = (previous) => currentById.get(previous.id)
    || (previous.legacyIds || []).map((id) => currentById.get(id)).find(Boolean)
    || currentByUrl.get(normalizedUrl(previous.url))
    || (previous.alternateUrls || []).map((url) => currentByUrl.get(normalizedUrl(url))).find(Boolean)
    || null;
  const losses = baselineRecommended
    .map((previous) => ({ previous, current: findCurrent(previous) }))
    .filter(({ current }) => !isDefaultRecommendation(current || {}));
  const explained = ({ current }) => Boolean(current) && (
    ['source_error', 'talent_pool', 'expired', 'stale'].includes(current.listingStatus)
    || (current.listingStatus === 'archived_missing' && current.sourceCoverage === 'bounded_window')
    || ['degraded', 'unstable'].includes(current.sourceReliabilityState)
    || current.sourceQualityTier === 'weak'
    || (current.lastChangeKind === 'content_changed'
      && (current.requirementsStatus === 'hard_check'
        || current.eligibilityCode === 'restricted'
        || Number(current.score || 0) < 20))
  );
  const unexplainedLosses = losses.filter((item) => !explained(item));
  const threshold = baselineRecommended.length >= 5
    ? Math.max(3, Math.ceil(baselineRecommended.length * 0.5))
    : 1;
  const sourceCollapses = [];
  const baselineBySource = new Map();
  for (const job of baselineRecommended) {
    const source = job.source || 'unknown';
    if (!baselineBySource.has(source)) baselineBySource.set(source, []);
    baselineBySource.get(source).push(job);
  }
  for (const [source, sourceBaseline] of baselineBySource.entries()) {
    if (sourceBaseline.length < 5) continue;
    const sourceCurrent = currentRecommended.filter((job) => job.source === source);
    const sourceThreshold = Math.max(2, Math.ceil(sourceBaseline.length * 0.5));
    if (sourceCurrent.length >= sourceThreshold) continue;
    const sourceLosses = sourceBaseline
      .map((previous) => ({ previous, current: findCurrent(previous) }))
      .filter(({ current }) => !isDefaultRecommendation(current || {}));
    const sourceExplained = ({ current }) => Boolean(current) && (
      ['source_error', 'talent_pool', 'expired', 'stale'].includes(current.listingStatus)
      || ['degraded', 'unstable'].includes(current.sourceReliabilityState)
      || current.sourceQualityTier === 'weak'
      || (current.lastChangeKind === 'content_changed'
        && (current.requirementsStatus === 'hard_check'
          || current.eligibilityCode === 'restricted'
          || Number(current.score || 0) < 20))
    );
    const sourceUnexplainedLosses = sourceLosses.filter((item) => !sourceExplained(item));
    if (sourceUnexplainedLosses.length) {
      sourceCollapses.push({
        source,
        baselineCount: sourceBaseline.length,
        currentCount: sourceCurrent.length,
        threshold: sourceThreshold,
        unexplainedLosses: sourceUnexplainedLosses
      });
    }
  }
  return {
    guarded: baselineRecommended.length >= 5 || sourceCollapses.length > 0,
    collapse: (baselineRecommended.length >= 5
      && currentRecommended.length < threshold
      && unexplainedLosses.length > 0)
      || sourceCollapses.length > 0,
    baselineCount: baselineRecommended.length,
    currentCount: currentRecommended.length,
    threshold,
    unexplainedLosses,
    sourceCollapses
  };
}


return { recommendationCollapseRisk };
}
