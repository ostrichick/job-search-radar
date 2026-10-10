import crypto from 'node:crypto';
export function createMissingJobRules({ normalizedUrl, relevantToProfile, isOfficialKind, appendLimitedHistory, contentFingerprint, sourceMeta, derivePaymentEvidence, eligibilityFor, normalizeWorkplaceMode, domesticRegionFor, marketScopesFor, legacyLocalWorkAddressEvidence, extractSalary }) {
function carryForwardLegacyIds(jobs, previousJobs = []) {
  const previousByRawId = new Map();
  for (const previous of previousJobs || []) {
    for (const rawId of previous.legacyIds || []) {
      if (!rawId) continue;
      const matches = previousByRawId.get(rawId) ?? [];
      matches.push(previous);
      previousByRawId.set(rawId, matches);
    }
  }
  return jobs.map((job) => {
    const aliases = new Set(job.legacyIds || []);
    for (const rawId of job.legacyIds || []) {
      for (const previous of previousByRawId.get(rawId) || []) {
        if (previous.id) aliases.add(previous.id);
        for (const previousLegacyId of previous.legacyIds || []) aliases.add(previousLegacyId);
      }
    }
    aliases.delete(job.id);
    return { ...job, legacyIds: [...aliases] };
  });
}

function carryRecentlyMissing(jobs, previousJobs = [], now = Date.now()) {
  const representedIds = new Set();
  const representedUrls = new Set();
  for (const job of jobs) {
    representedIds.add(job.id);
    for (const id of job.legacyIds || []) representedIds.add(id);
    for (const url of [job.url, ...(job.alternateUrls || [])]) {
      if (url) representedUrls.add(normalizedUrl(url));
    }
  }
  const carried = [...jobs];
  const retentionMs = 14 * 86400000;
  const legacyEligibilityMap = {
    '한국 명시': 'korea',
    '한국에서 지원 가능': 'korea',
    'Worldwide': 'worldwide',
    '지역 제한 가능': 'restricted',
    '특정 국가 제한': 'restricted',
    '확인 필요': 'unknown',
    '현지 근무/확인 필요': 'restricted'
  };
  for (const previous of previousJobs || []) {
    const sourceSpecificRelevant = previous.source !== 'OneForma'
      || previous.countryCode === 'KR'
      || (previous.tags || []).some((tag) => /korean|한국어/i.test(String(tag)));
    const preserveForGrace = sourceSpecificRelevant
      && relevantToProfile(previous)
      && (
        Number(previous.score || 0) > 0
        || isOfficialKind(previous.sourceKind)
        || previous.listingStatus === 'archived_missing'
      );
    if (!preserveForGrace) continue;
    const previousUrl = normalizedUrl(previous.url);
    const aliases = [previous.id, ...(previous.legacyIds || [])].filter(Boolean);
    if (aliases.some((id) => representedIds.has(id)) || (previousUrl && representedUrls.has(previousUrl))) continue;
    const missingSince = Date.parse(previous.missingSince || '') || now;
    if (now - missingSince > retentionMs) continue;
    const nowIso = new Date(now).toISOString();
    const wasMissing = previous.listingStatus === 'archived_missing';
    let verificationHistory = Array.isArray(previous.verificationHistory) ? previous.verificationHistory : [];
    if (!wasMissing) {
      verificationHistory = appendLimitedHistory(verificationHistory, {
        at: nowIso,
        event: 'disappeared',
        fromStatus: previous.listingStatus,
        toStatus: 'archived_missing',
        fingerprint: previous.contentFingerprint || contentFingerprint(previous),
        reason: (previous.sourceCoverage || sourceMeta(previous.source).coverage) === 'bounded_window'
          ? '제한된 수집 창에서 더 이상 보이지 않음. 종료로 확인된 것은 아님'
          : '정상 수집된 원천 목록에서 더 이상 보이지 않음. 종료로 확인된 것은 아님'
      });
    }
    const quality = sourceMeta(previous.source);
    const paymentEvidence = previous.paymentEvidenceFreshness
      ? null
      : derivePaymentEvidence(quality, now);
    const eligibilityCode = previous.eligibilityCode || legacyEligibilityMap[previous.eligibility] || 'unknown';
    const derivedEligibility = eligibilityFor(previous);
    const eligibilityBasis = previous.eligibilityBasis
      || (derivedEligibility.code === eligibilityCode ? derivedEligibility.basis : 'legacy_classification');
    const eligibilityReason = previous.eligibilityReason
      || (derivedEligibility.code === eligibilityCode
        ? derivedEligibility.reason
        : `이전 피드의 지원 범위 분류를 보존: ${previous.eligibility || eligibilityCode}`);
    const legacyRequirementChecks = Array.isArray(previous.requirementChecks)
      ? previous.requirementChecks
      : (previous.fitWarnings || (previous.fitWarning ? [previous.fitWarning] : []))
        .filter(Boolean)
        .map((label) => ({ kind: 'hard', label }));
    const requirementsStatus = ['clear', 'routine_check', 'hard_check'].includes(previous.requirementsStatus)
      ? previous.requirementsStatus
      : legacyRequirementChecks.some((item) => item.kind === 'hard')
        ? 'hard_check'
        : legacyRequirementChecks.some((item) => item.kind === 'routine')
          ? 'routine_check'
          : 'clear';
    const requirementsLabel = previous.requirementsLabel || (requirementsStatus === 'hard_check'
      ? '하드요건 확인 필요'
      : requirementsStatus === 'routine_check'
        ? '일반 요건 확인 필요'
        : '추가 하드요건 감지 없음');
    const preservedContentFingerprint = previous.contentFingerprint || contentFingerprint(previous);
    const carriedWorkplaceMode = normalizeWorkplaceMode(previous.workplaceMode, Boolean(previous.remote));
    const carriedRemote = carriedWorkplaceMode === 'remote';
    const recalculatedDomesticRegion = domesticRegionFor({ ...previous, remote: carriedRemote, workplaceMode: carriedWorkplaceMode });
    const carriedDomesticRegion = carriedWorkplaceMode === 'remote'
      ? null
      : recalculatedDomesticRegion
        ? { ...(previous.domesticRegion || {}), ...recalculatedDomesticRegion }
        : previous.domesticRegion || null;
    const carriedMarketScopes = marketScopesFor({ ...previous, remote: carriedRemote, workplaceMode: carriedWorkplaceMode, domesticRegion: carriedDomesticRegion });
    const carriedWorkAddressEvidence = legacyLocalWorkAddressEvidence(previous);
    carried.push({
      ...previous,
      ...(carriedWorkAddressEvidence ? { workAddressEvidence: carriedWorkAddressEvidence } : {}),
      remote: carriedRemote,
      domesticRegion: carriedDomesticRegion,
      marketScopes: carriedMarketScopes,
      marketSegment: carriedMarketScopes[0] || 'overseas_remote',
      workplaceMode: carriedWorkplaceMode,
      eligibilityCode,
      eligibility: previous.eligibility || ({ korea: '한국에서 지원 가능', worldwide: 'Worldwide', restricted: '특정 국가 제한', unknown: '확인 필요' }[eligibilityCode]),
      eligibilityBasis,
      eligibilityReason,
      requirementChecks: legacyRequirementChecks,
      requirementsStatus,
      requirementsLabel,
      contentFingerprint: preservedContentFingerprint,
      sourceKind: previous.sourceKind || quality.kind,
      sourceCoverage: previous.sourceCoverage || quality.coverage || 'unknown',
      sourceTrustLabel: previous.sourceTrustLabel || quality.listingLabel,
      sourceOfficiality: previous.sourceOfficiality || (isOfficialKind(quality.kind) ? 'official' : quality.kind === 'manual' ? 'manual' : 'intermediary'),
      paymentStatus: previous.paymentStatus || quality.paymentStatus,
      paymentLabel: previous.paymentLabel || quality.paymentLabel,
      paymentEvidenceState: previous.paymentEvidenceState || paymentEvidence?.state || 'insufficient',
      paymentEvidenceLabel: previous.paymentEvidenceLabel || paymentEvidence?.label || '근거 부족',
      paymentConfidence: previous.paymentConfidence || paymentEvidence?.confidence || 'low',
      paymentEvidenceFreshness: previous.paymentEvidenceFreshness || paymentEvidence?.freshness || 'insufficient',
      paymentEvidenceCheckedAt: previous.paymentEvidenceCheckedAt || paymentEvidence?.checkedAt || '',
      paymentEvidenceNextReviewAt: previous.paymentEvidenceNextReviewAt || paymentEvidence?.nextReviewAt || '',
      paymentSummary: previous.paymentSummary || paymentEvidence?.summary || quality.paymentSummary || '',
      paymentSignals: previous.paymentSignals || paymentEvidence?.signals || [],
      sourceSummary: previous.sourceSummary || quality.summary,
      sourceEvidence: previous.sourceEvidence || quality.evidence,
      sourceReviewAt: previous.sourceReviewAt || quality.reviewedAt || '',
      salaryInfo: previous.salaryInfo || extractSalary(previous.salary || '', previous.description || ''),
      listingStatus: 'archived_missing',
      listingLabel: '현재 피드에서 사라짐',
      listingBasis: 'missing_from_feed',
      listingReason: (previous.sourceCoverage || quality.coverage) === 'bounded_window'
        ? `현재 제한된 수집 창에서 보이지 않아 ${new Date(missingSince).toISOString()}부터 14일간 보존 중. 종료로 확인된 것은 아님`
        : `현재 수집 피드에서 사라져 ${new Date(missingSince).toISOString()}부터 14일간 상태 보존 중. 종료로 확인된 것은 아님`,
      listingVerification: 'historical_missing',
      listingCheckedAt: previous.listingCheckedAt || previous.verifiedAt || '',
      listingEvidence: previous.listingEvidence || [{ type: 'historical_listing', label: '마지막 확인 공고 원문', url: previous.url, checkedAt: previous.verifiedAt || '' }],
      firstSeenAt: previous.firstSeenAt || previous.verifiedAt || previous.listingCheckedAt || nowIso,
      lastSeenAt: previous.lastSeenAt || previous.verifiedAt || previous.listingCheckedAt || '',
      lastVerifiedAt: previous.lastVerifiedAt || previous.verifiedAt || previous.listingCheckedAt || '',
      previousListingStatus: previous.listingStatus || '',
      lastChangeKind: wasMissing ? (previous.lastChangeKind || 'disappeared') : 'disappeared',
      lastChangeAt: wasMissing ? (previous.lastChangeAt || previous.missingSince || nowIso) : nowIso,
      lastChangedFields: previous.lastChangedFields || [],
      verificationHistory,
      stale: true,
      score: 0,
      missingSince: new Date(missingSince).toISOString(),
      missingCheckedAt: nowIso
    });
  }
  return carried;
}


return { carryForwardLegacyIds, carryRecentlyMissing };
}
