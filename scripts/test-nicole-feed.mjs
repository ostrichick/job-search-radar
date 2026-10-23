import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptNicoleFeed, adaptNicoleJob, sourceForManual } from '../public/munseong/nicole-feed.js';
import { validatePublicFeed } from '../public/munseong/backup-rules.js';
import { getProfile } from '../public/munseong/profiles.js';

const baseline = JSON.parse(fs.readFileSync('profiles/dubu/public/jobs.json', 'utf8'));
const original = JSON.stringify(baseline);
const adapted = adaptNicoleFeed(baseline);
assert.equal(adapted.jobs.length, baseline.jobs.length);
assert.equal(validatePublicFeed(adapted), adapted);
assert.equal(JSON.stringify(baseline), original, 'original feed must not change');
for (let i = 0; i < baseline.jobs.length; i++) {
  const src = baseline.jobs[i], job = adapted.jobs[i];
  assert.deepEqual(job.marketScopes, [src.market === 'online' ? 'overseas_remote' : 'domestic']);
  assert.equal(job.languageFitStatus, ['match', 'mismatch'].includes(src.languageFitStatus) ? src.languageFitStatus : 'unknown');
  assert.equal(job.collectionState, src.collectionState || 'unknown');
  for (const key of ['postedAt', 'firstSeenAt', 'lastSeenAt', 'researchReviewedAt']) {
    assert.equal(job[key], src[key] || '');
  }
}
assert.equal(getProfile('nicole').dbName, 'job-search-radar-nicole');
assert.equal(getProfile('munseong').dbName, 'job-search-radar');
assert.equal(adaptNicoleJob({ id: 'test', market: 'offline', url: 'https://example.org/j', title: 'Example', location: '' }).domesticRegion.commuteClass, 'unknown');
assert.equal(sourceForManual('https://www.upwork.com/jobs/abc'), 'Upwork');
assert.equal(sourceForManual('https://kowork.kr/en/jobs/abc'), 'KOWORK');
console.log(`Nicole feed conversion tests passed (${adapted.jobs.length} jobs)`);
