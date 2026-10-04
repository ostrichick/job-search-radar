import assert from 'node:assert/strict';
import fs from 'node:fs';

const target = process.argv[2] || './data/jobs.json';
const feed = JSON.parse(fs.readFileSync(target, 'utf8'));
assert.ok(Array.isArray(feed.jobs) && feed.jobs.length > 0, 'feed must contain jobs');

const ids = feed.jobs.map((job) => job.id);
assert.equal(new Set(ids).size, ids.length, 'stable job ids must be unique');

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
