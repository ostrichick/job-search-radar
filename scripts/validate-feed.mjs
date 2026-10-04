import assert from 'node:assert/strict';
import fs from 'node:fs';

const target = process.argv[2] || './data/jobs.json';
const feed = JSON.parse(fs.readFileSync(target, 'utf8'));
assert.ok(Array.isArray(feed.jobs) && feed.jobs.length > 0, 'feed must contain jobs');

const ids = feed.jobs.map((job) => job.id);
assert.equal(new Set(ids).size, ids.length, 'stable job ids must be unique');

for (const job of feed.jobs) {
  assert.ok(job.eligibilityCode, `${job.id} must have eligibilityCode`);
  assert.ok(job.eligibilityReason, `${job.id} must explain eligibility classification`);
  assert.ok(job.eligibilityBasis, `${job.id} must identify eligibility evidence basis`);
  assert.ok(job.listingStatus, `${job.id} must have listingStatus`);
  assert.ok(job.listingReason, `${job.id} must explain listing status`);
  assert.ok(job.listingBasis, `${job.id} must identify listing evidence basis`);
  assert.ok(job.paymentEvidenceState, `${job.id} must separate payment evidence state from listing/source trust`);
  assert.ok(job.paymentEvidenceLabel, `${job.id} must have a user-readable payment evidence label`);
  if (['official_ats', 'official_platform'].includes(job.sourceKind) && job.listingStatus === 'verified_open') {
    assert.ok(Array.isArray(job.listingEvidence) && job.listingEvidence.some((item) => item?.url === job.url),
      `${job.id} verified official listing must link directly to the checked posting`);
    assert.ok(job.listingCheckedAt || job.verifiedAt, `${job.id} verified official listing must include a check timestamp`);
  }
  if (['caution_repeated', 'mixed_caution'].includes(job.paymentEvidenceState)) {
    assert.ok(Array.isArray(job.paymentSignals) && job.paymentSignals.length > 0,
      `${job.id} payment caution must have structured evidence signals`);
  }
}

const recommended = feed.jobs.filter((job) =>
  job.score >= 20 &&
  ['korea', 'worldwide'].includes(job.eligibilityCode) &&
  !['stale', 'source_error', 'archived_missing', 'talent_pool', 'expired'].includes(job.listingStatus)
);
assert.ok(recommended.length > 0, 'default recommendation set must not be empty');
assert.equal(recommended.filter((job) => job.fitWarning).length, 0, 'default recommendations must not require unverified specialist credentials');
assert.equal(recommended.filter((job) => job.eligibilityCode === 'restricted').length, 0);

const unanchored = feed.jobs.filter((job) => job.score > 5 && job.category === '기타' && !(job.matchedKeywords || []).length);
assert.equal(unanchored.length, 0, 'unanchored jobs must not receive meaningful positive relevance');

const fakeWorldwide = feed.jobs.filter((job) => job.eligibilityCode === 'worldwide' && /^remote$/i.test(job.location || ''));
assert.equal(fakeWorldwide.length, 0, 'generic Remote location must not be treated as Worldwide');

for (const job of feed.jobs.filter((job) => job.salaryInfo?.confidence === 'suspicious')) {
  assert.match(job.salaryInfo.display, /확인 필요/);
}

console.log(JSON.stringify({
  validatedJobs: feed.jobs.length,
  recommended: recommended.length,
  verifiedOpen: feed.jobs.filter((job) => job.listingStatus === 'verified_open').length,
  stale: feed.jobs.filter((job) => job.stale).length,
  mergedDuplicates: feed.jobs.filter((job) => job.duplicateCount > 1).length
}, null, 2));
