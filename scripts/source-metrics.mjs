import crypto from 'node:crypto';
export function createSourceMetrics({ sourceMetricHistoryLimit, sourceMeta, isOfficialKind, isDefaultRecommendation, appendLimitedHistory }) {
function sourceQualityTier(meta, recentHistory, current) {
  const history = [...recentHistory, current].filter(Boolean).slice(-sourceMetricHistoryLimit);
  const attempts = history.length;
  const successes = history.filter((item) => item.ok).length;
  const successRate = attempts ? successes / attempts : 0;
  const consecutiveFailures = history.slice().reverse().findIndex((item) => item.ok);
  const failureStreak = consecutiveFailures === -1 ? attempts : consecutiveFailures;
  if (isOfficialKind(meta.kind)) return failureStreak >= 2 ? 'degraded' : 'strong';
  const qualityAttempts = history
    .filter((item) => item.ok && Number(item.matchedCount || 0) >= 3)
    .slice(-4);
  const noisyAttempts = qualityAttempts.filter((item) => {
    const matchedCount = Number(item.matchedCount || 0);
    const noiseCount = Number(item.duplicateCount || 0) + Number(item.lowQualityCount || 0);
    return matchedCount > 0 && noiseCount / matchedCount >= 0.8;
  });
  if ((attempts >= 4 && successRate < 0.75) || (qualityAttempts.length >= 3 && noisyAttempts.length >= 3)) return 'weak';
  return 'mixed';
}

function sourceReliabilityState(meta, history) {
  const attempts = history.length;
  const successes = history.filter((item) => item.ok).length;
  const successRate = attempts ? successes / attempts : 1;
  let consecutiveFailures = 0;
  for (const item of history.slice().reverse()) {
    if (item.ok) break;
    consecutiveFailures += 1;
  }
  if (consecutiveFailures >= 2) return 'degraded';
  if (attempts >= 4 && successRate < 0.75) return 'unstable';
  return isOfficialKind(meta.kind) ? 'reliable' : 'observed';
}

function buildSourceMetrics(sourceNames, sourceRuns, sourceStatus, dedupedJobs, keptJobs, previousSourceMetrics = {}, now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  const metrics = {};
  for (const source of sourceNames) {
    const meta = sourceMeta(source);
    const status = sourceStatus.find((item) => item.source === source) || { source, ok: false };
    const run = sourceRuns.get(source) || {};
    const rawCount = Number(run.rawCount || 0);
    const matchedCount = Number(run.matchedCount || status.count || 0);
    // Historical rows retained for continuity did not pass this collection.
    // Exclude them from present-run yield rather than producing 4/1 (400%).
    const currentlyObserved = (job) => !['source_error', 'archived_missing'].includes(job.listingStatus)
      && (job.source === source || (job.sources || []).includes(source));
    const uniqueMatchedCount = Math.min(matchedCount, dedupedJobs.filter(currentlyObserved).length);
    const keptCount = Math.min(matchedCount, keptJobs.filter(currentlyObserved).length);
    const preservedCount = Number(status.preserved || 0);
    const recommendedCount = keptJobs.filter((job) =>
      (job.source === source || (job.sources || []).includes(source))
      && isDefaultRecommendation({ ...job, recommendationEligible: true })).length;
    const duplicateCount = Math.max(0, matchedCount - uniqueMatchedCount);
    const lowQualityCount = Math.max(0, uniqueMatchedCount - keptCount);
    const noiseCount = duplicateCount + lowQualityCount;
    const matchRate = rawCount ? matchedCount / rawCount : 0;
    const keptRate = matchedCount ? keptCount / matchedCount : 0;
    const duplicateRate = matchedCount ? duplicateCount / matchedCount : 0;
    const lowQualityRate = matchedCount ? lowQualityCount / matchedCount : 0;
    const noiseRate = matchedCount ? noiseCount / matchedCount : 0;
    const previous = previousSourceMetrics?.[source] || {};
    const previousHistory = Array.isArray(previous.history) ? previous.history : [];
    const historyEntry = {
      at: nowIso,
      // A region-level partial search is not a complete verification of this
      // source. Otherwise repeated partial outages would appear fully reliable.
      ok: Boolean(status.ok) && Number(run.searchFailureCount || 0) === 0
        && !run.detailCollapseSuspected
        && !(Number(run.rssListOnlyCount || 0) > 0 && Number(run.detailSuccessCount || 0) === 0),
      rawCount,
      discoveredCount: Number(run.discoveredCount ?? rawCount),
      searchAttemptCount: Number(run.searchAttemptCount || 0),
      searchSuccessCount: Number(run.searchSuccessCount || 0),
      searchFailureCount: Number(run.searchFailureCount || 0),
      searchFailureScopes: Array.isArray(run.searchFailureScopes) ? [...run.searchFailureScopes] : [],
      searchFailureReasons: run.searchFailureReasons && typeof run.searchFailureReasons === 'object'
        ? { ...run.searchFailureReasons } : {},
      rssStatus: run.rssStatus || '',
      rssItemCount: Number(run.rssItemCount || 0),
      rssListOnlyCount: Number(run.rssListOnlyCount || 0),
      detailCollapseSuspected: Boolean(run.detailCollapseSuspected),
      rssFailureCode: run.rssFailureCode || '',
      detailAttemptCount: Number(run.detailAttemptCount || 0),
      detailSuccessCount: Number(run.detailSuccessCount || 0),
      matchedCount,
      keptCount,
      preservedCount,
      recommendedCount,
      duplicateCount,
      lowQualityCount,
      noiseCount,
      detailFailureCount: Number(run.detailFailureCount || 0),
      detailRejectedCount: Number(run.detailRejectedCount || 0),
      detailRejectionCounts: run.detailRejectionCounts && typeof run.detailRejectionCounts === 'object'
        ? { ...run.detailRejectionCounts }
        : {},
      workplaceUnverifiedCount: Number(run.workplaceUnverifiedCount || 0),
      accessRestrictedCount: Number(run.accessRestrictedCount || 0),
      listFallbackCount: Number(run.listFallbackCount || 0),
      detailRecoveredCount: Number(run.detailRecoveredCount || 0),
      continuityProbeCount: Number(run.continuityProbeCount || 0),
      continuityRecoveredCount: Number(run.continuityRecoveredCount || 0),
      continuityTerminalCount: Number(run.continuityTerminalCount || 0),
      continuityFailureCount: Number(run.continuityFailureCount || 0),
      discoveryCollapseSuspected: Boolean(run.discoveryCollapseSuspected),
      discoveryReferenceCount: Number(run.discoveryReferenceCount || 0),
      discoveryOverlapCount: Number(run.discoveryOverlapCount || 0),
      ...(status.error ? { error: String(status.error).slice(0, 240) } : {})
    };
    const history = appendLimitedHistory(previousHistory, historyEntry, sourceMetricHistoryLimit);
    const recentAttempts = history.length;
    const recentSuccesses = history.filter((item) => item.ok).length;
    let consecutiveFailures = 0;
    for (const item of history.slice().reverse()) {
      if (item.ok) break;
      consecutiveFailures += 1;
    }
    const currentForTier = { ...historyEntry, lowQualityRate, noiseRate };
    const qualityTier = sourceQualityTier(meta, history.slice(0, -1), currentForTier);
    const reliabilityState = sourceReliabilityState(meta, history);
    metrics[source] = {
      source,
      kind: meta.kind,
      officiality: isOfficialKind(meta.kind) ? 'official' : meta.kind === 'manual' ? 'manual' : 'intermediary',
      coverage: meta.coverage || 'unknown',
      evidenceRefreshability: meta.evidenceRefreshability || 'unknown',
      qualityTier,
      reliabilityState,
      lastAttemptAt: nowIso,
      lastSuccessAt: historyEntry.ok ? nowIso : (previous.lastSuccessAt || ''),
      lastFailureAt: historyEntry.ok ? (previous.lastFailureAt || '') : nowIso,
      consecutiveFailures,
      recentAttempts,
      recentSuccessRate: recentAttempts ? Math.round((recentSuccesses / recentAttempts) * 1000) / 1000 : 0,
      rawCount,
      discoveredCount: Number(run.discoveredCount ?? rawCount),
      searchAttemptCount: Number(run.searchAttemptCount || 0),
      searchSuccessCount: Number(run.searchSuccessCount || 0),
      searchFailureCount: Number(run.searchFailureCount || 0),
      searchFailureScopes: Array.isArray(run.searchFailureScopes) ? [...run.searchFailureScopes] : [],
      searchFailureReasons: run.searchFailureReasons && typeof run.searchFailureReasons === 'object'
        ? { ...run.searchFailureReasons } : {},
      rssStatus: run.rssStatus || '',
      rssItemCount: Number(run.rssItemCount || 0),
      rssListOnlyCount: Number(run.rssListOnlyCount || 0),
      detailCollapseSuspected: Boolean(run.detailCollapseSuspected),
      rssFailureCode: run.rssFailureCode || '',
      detailAttemptCount: Number(run.detailAttemptCount || 0),
      detailSuccessCount: Number(run.detailSuccessCount || 0),
      detailSuccessRate: Number(run.detailAttemptCount || 0)
        ? Math.round((Number(run.detailSuccessCount || 0) / Number(run.detailAttemptCount || 0)) * 1000) / 1000
        : null,
      localeEligibleCount: Number(run.localeEligibleCount || 0),
      profileMatchedCount: Number(run.profileMatchedCount ?? matchedCount),
      detailFailureCount: Number(run.detailFailureCount || 0),
      detailRejectedCount: Number(run.detailRejectedCount || 0),
      detailRejectionCounts: run.detailRejectionCounts && typeof run.detailRejectionCounts === 'object'
        ? { ...run.detailRejectionCounts }
        : {},
      workplaceUnverifiedCount: Number(run.workplaceUnverifiedCount || 0),
      accessRestrictedCount: Number(run.accessRestrictedCount || 0),
      listFallbackCount: Number(run.listFallbackCount || 0),
      detailRecoveredCount: Number(run.detailRecoveredCount || 0),
      continuityProbeCount: Number(run.continuityProbeCount || 0),
      continuityRecoveredCount: Number(run.continuityRecoveredCount || 0),
      continuityTerminalCount: Number(run.continuityTerminalCount || 0),
      continuityFailureCount: Number(run.continuityFailureCount || 0),
      discoveryCollapseSuspected: Boolean(run.discoveryCollapseSuspected),
      discoveryReferenceCount: Number(run.discoveryReferenceCount || 0),
      discoveryOverlapCount: Number(run.discoveryOverlapCount || 0),
      matchedCount,
      keptCount,
      preservedCount,
      recommendedCount,
      duplicateCount,
      lowQualityCount,
      noiseCount,
      matchRate: Math.round(matchRate * 1000) / 1000,
      validJobRate: Math.round(keptRate * 1000) / 1000,
      keptRate: Math.round(keptRate * 1000) / 1000,
      duplicateRate: Math.round(duplicateRate * 1000) / 1000,
      lowQualityRate: Math.round(lowQualityRate * 1000) / 1000,
      noiseRate: Math.round(noiseRate * 1000) / 1000,
      history
    };
  }
  return metrics;
}

function applySourceMetricsToJobs(jobs, sourceMetrics = {}) {
  return jobs.map((job) => {
    const metric = sourceMetrics[job.source] || {};
    const sourceRecommendationGateReason = ['public_rss', 'public_rss_cached_detail'].includes(job.sourceListingState)
      ? 'RSS 목록만 확인되어 상세 자격·모집 상태 미검증'
      : ['degraded', 'unstable'].includes(metric.reliabilityState)
        ? '반복 수집 실패로 소스 신뢰가 낮음'
      : metric.qualityTier === 'weak'
        ? '반복적으로 유효 공고 비율이 낮거나 중복·저품질 비율이 높은 소스'
        : '';
    const roleRecommendationGateReason = job.roleFitEvidence === true
      ? ''
      : '관심 업무와 직접 일치하는 근거 부족';
    const recommendationEligible = !sourceRecommendationGateReason
      && !roleRecommendationGateReason
      && job.requirementsStatus !== 'hard_check';
    return {
      ...job,
      sourceQualityTier: metric.qualityTier || (isOfficialKind(job.sourceKind) ? 'strong' : 'mixed'),
      sourceReliabilityState: metric.reliabilityState || (isOfficialKind(job.sourceKind) ? 'reliable' : 'observed'),
      sourceRecentSuccessRate: metric.recentSuccessRate ?? null,
      sourceEvidenceRefreshability: metric.evidenceRefreshability || sourceMeta(job.source).evidenceRefreshability || 'unknown',
      sourceRecommendationGateReason,
      roleRecommendationGateReason,
      recommendationEligible
    };
  });
}


return { sourceQualityTier, sourceReliabilityState, buildSourceMetrics, applySourceMetricsToJobs };
}
