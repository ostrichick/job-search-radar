import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recommendationCollapseRisk } from './collect-jobs.mjs';

const target = process.argv[2] || './data/jobs.json';
const feed = JSON.parse(fs.readFileSync(target, 'utf8'));
const baselineTarget = process.argv[3] || '';
let baseline = null;
if (baselineTarget && fs.existsSync(baselineTarget)) {
  try { baseline = JSON.parse(fs.readFileSync(baselineTarget, 'utf8')); } catch { baseline = null; }
}
assert.ok(Array.isArray(feed.jobs) && feed.jobs.length > 0, 'feed must contain jobs');
assert.ok(feed.sourceMetrics && typeof feed.sourceMetrics === 'object' && !Array.isArray(feed.sourceMetrics),
  'feed must persist sourceMetrics for long-term source quality tracking');
assert.ok(feed.recommendationSummary && typeof feed.recommendationSummary === 'object',
  'feed must persist recommendationSummary');
assert.ok(Number.isInteger(feed.recommendationPolicyVersion) && feed.recommendationPolicyVersion >= 1,
  'feed must persist recommendationPolicyVersion');
assert.ok(feed.locationReference && typeof feed.locationReference === 'object', 'feed must persist the domestic distance reference');
assert.equal(feed.locationReference.label, '전북특별자치도 전주시 덕진구 산정동', 'distance reference must remain the user-selected Sanjeong-dong baseline');
assert.ok(Number.isFinite(feed.locationReference.lat) && Number.isFinite(feed.locationReference.lon), 'distance reference must use reproducible coordinates');
assert.equal(feed.locationReference.distanceMethod, 'haversine_straight_line', 'distance contract must explicitly remain straight-line Haversine');

const ids = feed.jobs.map((job) => job.id);
assert.equal(new Set(ids).size, ids.length, 'stable job ids must be unique');

for (const job of feed.jobs) {
  assert.ok(Array.isArray(job.marketScopes) && job.marketScopes.length > 0, `${job.id} must declare at least one market scope`);
  assert.ok(job.marketScopes.every((scope) => ['overseas_remote', 'domestic'].includes(scope)), `${job.id} market scopes must use the supported contract`);
  if (job.marketScopes.includes('domestic')) {
    assert.ok(job.domesticRegion && typeof job.domesticRegion === 'object', `${job.id} domestic discovery requires structured region evidence`);
    assert.equal(job.domesticRegion.country, '대한민국', `${job.id} domestic region must resolve to Korea`);
    assert.ok(job.domesticRegion.evidenceLevel, `${job.id} domestic region must explain its evidence level`);
    const hasLat = job.domesticRegion.lat !== undefined && job.domesticRegion.lat !== null;
    const hasLon = job.domesticRegion.lon !== undefined && job.domesticRegion.lon !== null;
    assert.equal(hasLat, hasLon, `${job.id} domestic coordinates must be complete or absent`);
    if (hasLat) {
      assert.ok(Number.isFinite(job.domesticRegion.lat) && Number.isFinite(job.domesticRegion.lon), `${job.id} domestic coordinates must be finite`);
      assert.ok(job.domesticRegion.coordinatePrecision, `${job.id} geocoded domestic region must retain coordinate precision`);
      assert.ok(job.domesticRegion.coordinateSource, `${job.id} geocoded domestic region must retain coordinate source`);
    }
  }
  assert.ok(job.eligibilityCode, `${job.id} must have eligibilityCode`);
  assert.ok(job.eligibilityReason, `${job.id} must explain eligibility classification`);
  assert.ok(job.eligibilityBasis, `${job.id} must identify eligibility evidence basis`);
  assert.ok(job.listingStatus, `${job.id} must have listingStatus`);
  assert.ok(job.listingReason, `${job.id} must explain listing status`);
  assert.ok(job.listingBasis, `${job.id} must identify listing evidence basis`);
  assert.ok(job.listingVerification, `${job.id} must identify the strength of listing verification`);
  assert.ok(job.sourceCoverage, `${job.id} must identify source coverage`);
  assert.ok(job.sourceEvidenceRefreshability, `${job.id} must identify whether source evidence can be refreshed safely`);
  assert.ok(job.sourceQualityTier, `${job.id} must retain source quality tier`);
  assert.ok(job.sourceReliabilityState, `${job.id} must retain source reliability state`);
  assert.ok(job.paymentEvidenceState, `${job.id} must separate payment evidence state from listing/source trust`);
  assert.ok(job.paymentEvidenceLabel, `${job.id} must have a user-readable payment evidence label`);
  assert.ok(job.paymentEvidenceFreshness, `${job.id} must expose payment evidence freshness`);
  assert.ok(['clear', 'routine_check', 'hard_check'].includes(job.requirementsStatus), `${job.id} must expose requirements review state`);
  assert.ok(job.requirementsLabel, `${job.id} must have a user-readable requirements label`);
  assert.ok(job.contentFingerprint, `${job.id} must have a content fingerprint`);
  if (!['archived_missing', 'source_error'].includes(job.listingStatus)) {
    assert.equal(job.contentFingerprintVersion, 2, `${job.id} current source fingerprint must use contract v2`);
    assert.ok(job.sourceFieldFingerprints && typeof job.sourceFieldFingerprints === 'object',
      `${job.id} current source fingerprint must retain per-field hashes`);
  }
  assert.ok(job.firstSeenAt, `${job.id} must retain firstSeenAt`);
  assert.ok(job.lastVerifiedAt || job.listingStatus === 'archived_missing',
    `${job.id} must retain last successful verification timestamp`);
  assert.ok(Array.isArray(job.verificationHistory) && job.verificationHistory.length > 0,
    `${job.id} must retain bounded verification history`);
  assert.ok(job.verificationHistory.length <= 24, `${job.id} verification history must remain bounded`);
  if (job.listingStatus === 'archived_missing') {
    assert.ok(job.missingSince, `${job.id} missing listing must retain missingSince`);
    assert.ok(job.missingCheckedAt, `${job.id} missing listing must record the latest missing check`);
    assert.ok(job.verificationHistory.some((item) => item.event === 'disappeared'),
      `${job.id} missing listing must explain when it disappeared`);
  }
  if (job.sourceKind === 'official_ats' && !['talent_pool', 'expired', 'archived_missing', 'source_error'].includes(job.listingStatus)) {
    assert.equal(job.listingStatus, 'verified_open', `${job.id} official ATS current listing must use verified_open`);
  }
  if (job.sourceKind === 'official_platform' && !['talent_pool', 'expired', 'archived_missing', 'source_error'].includes(job.listingStatus)) {
    assert.equal(job.listingStatus, 'official_listed', `${job.id} official platform publication must not be conflated with direct ATS open status`);
  }
  if (['verified_open', 'official_listed'].includes(job.listingStatus)) {
    assert.ok(Array.isArray(job.listingEvidence) && job.listingEvidence.some((item) => item?.url === job.url),
      `${job.id} verified official listing must link directly to the checked posting`);
    assert.ok(job.listingCheckedAt || job.verifiedAt, `${job.id} verified official listing must include a check timestamp`);
  }
  if (['caution_repeated', 'mixed_caution', 'caution_single', 'policy_only', 'evidence_expired'].includes(job.paymentEvidenceState)) {
    assert.ok(Array.isArray(job.paymentSignals) && job.paymentSignals.length > 0,
      `${job.id} payment evidence state must have structured evidence signals`);
    for (const signal of job.paymentSignals) {
      assert.ok(signal.type, `${job.id} payment signal must have type`);
      assert.ok(signal.url, `${job.id} payment signal must retain source URL`);
      assert.ok(signal.checkedAt, `${job.id} payment signal must retain checkedAt`);
      assert.ok(signal.freshness, `${job.id} payment signal must expose freshness`);
      assert.ok(Number.isFinite(signal.maxAgeDays) && signal.maxAgeDays > 0, `${job.id} payment signal must have expiry policy`);
      if (signal.freshness !== 'unknown') assert.ok(signal.expiresAt, `${job.id} dated payment signal must expose expiresAt`);
      if (signal.type === 'review_aggregate') {
        assert.ok(signal.latestSourceAt, `${job.id} review aggregate must retain latestSourceAt`);
      }
    }
    if (job.paymentEvidenceState === 'evidence_expired') {
      assert.ok(job.paymentSignals.every((signal) => ['expired', 'unknown'].includes(signal.freshness)),
        `${job.id} expired payment evidence must not contain a current signal`);
    }
  }
}

const recommended = feed.jobs.filter((job) =>
  job.recommendationEligible !== false &&
  job.score >= 20 &&
  ['korea', 'worldwide'].includes(job.eligibilityCode) &&
  job.requirementsStatus !== 'hard_check' &&
  !['stale', 'source_error', 'archived_missing', 'talent_pool', 'expired'].includes(job.listingStatus)
);
assert.ok(recommended.length > 0, 'default recommendation set must not be empty');
assert.equal(recommended.filter((job) => job.fitWarning).length, 0, 'default recommendations must not require unverified specialist credentials');
assert.equal(recommended.filter((job) => job.requirementsStatus === 'hard_check').length, 0, 'default recommendations must not contain unresolved hard requirements');
assert.equal(recommended.filter((job) => job.eligibilityCode === 'restricted').length, 0);
assert.equal(feed.recommendationSummary.count, recommended.length,
  'recommendationSummary must match the actual default recommendation contract');
assert.equal(feed.recommendationSummary.hardRequirementCount, 0,
  'recommendation summary must not include unresolved hard requirements');
assert.equal(recommended.filter((job) => ['degraded', 'unstable'].includes(job.sourceReliabilityState)).length, 0,
  'recommendations must exclude sources with repeated reliability failures');
assert.equal(recommended.filter((job) => job.sourceQualityTier === 'weak').length, 0,
  'recommendations must exclude sources with repeatedly low valid-job yield');

const recommendationRegression = recommendationCollapseRisk(feed, baseline);
if (recommendationRegression.collapse) {
  const jobs = recommendationRegression.unexplainedLosses
    .slice(0, 8)
    .map(({ previous }) => `${previous.id}:${previous.title}`)
    .join(', ');
  assert.fail(`recommendation set collapsed from ${recommendationRegression.baselineCount} to ${recommendationRegression.currentCount} without source/content explanation: ${jobs}`);
}

for (const [source, metric] of Object.entries(feed.sourceMetrics)) {
  assert.equal(metric.source, source, `${source} source metric identity must be stable`);
  assert.ok(metric.kind, `${source} metric must retain source kind`);
  assert.ok(metric.coverage, `${source} metric must retain coverage`);
  assert.ok(metric.evidenceRefreshability, `${source} metric must retain evidence refreshability`);
  assert.ok(metric.qualityTier, `${source} metric must expose quality tier`);
  assert.ok(metric.reliabilityState, `${source} metric must expose reliability state`);
  assert.ok(Array.isArray(metric.history) && metric.history.length > 0, `${source} metric must retain recent history`);
  assert.ok(metric.history.length <= 24, `${source} metric history must remain bounded`);
  assert.ok(Number.isFinite(metric.rawCount) && metric.rawCount >= 0, `${source} rawCount must be non-negative`);
  assert.ok(Number.isFinite(metric.matchedCount) && metric.matchedCount >= 0, `${source} matchedCount must be non-negative`);
  assert.ok(Number.isFinite(metric.keptCount) && metric.keptCount >= 0, `${source} keptCount must be non-negative`);
  assert.ok(Number.isFinite(metric.validJobRate) && metric.validJobRate >= 0 && metric.validJobRate <= 1,
    `${source} validJobRate must be a ratio`);
  assert.ok(Number.isFinite(metric.duplicateRate) && metric.duplicateRate >= 0 && metric.duplicateRate <= 1,
    `${source} duplicateRate must be a ratio`);
  assert.ok(Number.isFinite(metric.lowQualityRate) && metric.lowQualityRate >= 0 && metric.lowQualityRate <= 1,
    `${source} lowQualityRate must be a ratio`);
  assert.ok(Number.isFinite(metric.noiseRate) && metric.noiseRate >= 0 && metric.noiseRate <= 1,
    `${source} noiseRate must be a ratio`);
  assert.ok(metric.keptCount <= metric.matchedCount || !metric.history.at(-1)?.ok,
    `${source} kept count cannot exceed matched count on successful collection`);
  if (['degraded', 'unstable'].includes(metric.reliabilityState) || metric.qualityTier === 'weak') {
    assert.equal(metric.recommendedCount, 0, `${source} unreliable or repeatedly weak source must not contribute default recommendations`);
  }
}

const unanchored = feed.jobs.filter((job) => job.score > 5 && job.category === '기타' && !(job.matchedKeywords || []).length);
assert.equal(unanchored.length, 0, 'unanchored jobs must not receive meaningful positive relevance');

const fakeWorldwide = feed.jobs.filter((job) => job.eligibilityCode === 'worldwide' && /^remote$/i.test(job.location || ''));
assert.equal(fakeWorldwide.length, 0, 'generic Remote location must not be treated as Worldwide');

const zeroScoreNoise = feed.jobs.filter((job) =>
  Number(job.score || 0) <= 0
  && !['official_ats', 'official_platform', 'manual'].includes(job.sourceKind)
  && !['source_error', 'archived_missing'].includes(job.listingStatus));
assert.equal(zeroScoreNoise.length, 0, 'zero-score collected noise must not remain in the active feed');

const lowScoreIntermediaryNoise = feed.jobs.filter((job) =>
  Number(job.score || 0) < 10
  && !['official_ats', 'official_platform', 'manual'].includes(job.sourceKind)
  && !['source_error', 'archived_missing'].includes(job.listingStatus));
assert.equal(lowScoreIntermediaryNoise.length, 0, 'very-low-score intermediary noise must not remain in the active feed');

for (const job of feed.jobs.filter((job) => job.salaryInfo?.confidence === 'suspicious')) {
  assert.match(job.salaryInfo.display, /확인 필요/);
}

console.log(JSON.stringify({
  validatedJobs: feed.jobs.length,
  recommended: recommended.length,
  verifiedOpen: feed.jobs.filter((job) => job.listingStatus === 'verified_open').length,
  officialListed: feed.jobs.filter((job) => job.listingStatus === 'official_listed').length,
  sourceWarnings: Object.values(feed.sourceMetrics).filter((metric) =>
    metric.qualityTier === 'weak' || ['degraded', 'unstable'].includes(metric.reliabilityState)).length,
  stale: feed.jobs.filter((job) => job.stale).length,
  mergedDuplicates: feed.jobs.filter((job) => job.duplicateCount > 1).length
}, null, 2));
