import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptNicoleFeed, adaptNicoleJob, isGermanLanguageJob, sourceForManual } from '../public/munseong/nicole-feed.js';
import { validatePublicFeed } from '../public/munseong/backup-rules.js';
import { getProfile } from '../public/munseong/profiles.js';

const baseline = JSON.parse(fs.readFileSync('profiles/dubu/public/jobs.json', 'utf8'));
const original = JSON.stringify(baseline);
const adapted = adaptNicoleFeed(baseline);
const eligible = baseline.jobs.filter((job) => !isGermanLanguageJob(job));
assert.equal(baseline.jobs.length - eligible.length, 3, 'three German-language leads in the current baseline');
assert.equal(adapted.jobs.length, eligible.length);
assert.equal(validatePublicFeed(adapted), adapted);
assert.equal(JSON.stringify(baseline), original, 'original feed must not change');
for (let i = 0; i < eligible.length; i++) {
  const src = eligible[i], job = adapted.jobs[i];
  assert.deepEqual(job.marketScopes, [src.market === 'online' ? 'overseas_remote' : 'domestic']);
  assert.equal(job.languageFitStatus, ['match', 'mismatch'].includes(src.languageFitStatus) ? src.languageFitStatus : 'unknown');
  assert.equal(job.collectionState, src.collectionState || 'unknown');
  for (const key of ['postedAt', 'firstSeenAt', 'lastSeenAt', 'researchReviewedAt']) {
    assert.equal(job[key], src[key] || '');
  }
}
assert.equal(isGermanLanguageJob({ title: 'German/Spanish Marketing' }), true);
assert.equal(isGermanLanguageJob({ languageRequirements: 'English, German' }), true);
assert.equal(isGermanLanguageJob({ description: 'You must speak German to work in this role.' }), true);
assert.equal(isGermanLanguageJob({ description: 'Sehr gute Deutschkenntnisse in Wort und Schrift.' }), true);
assert.equal(isGermanLanguageJob({ languageRequirements: 'English', location: 'Berlin, Germany', description: 'Work with German customers in an English speaking team.' }), false);
assert.equal(isGermanLanguageJob({ title: 'Content Marketing for Germany', description: 'German is an optional plus' }), false);
assert.equal(getProfile('nicole').dbName, 'job-search-radar-nicole');
assert.equal(getProfile('munseong').dbName, 'job-search-radar');
assert.equal(adaptNicoleJob({ id: 'test', market: 'offline', url: 'https://example.org/j', title: 'Example', location: '' }).domesticRegion.commuteClass, 'unknown');
assert.equal(sourceForManual('https://www.upwork.com/jobs/abc'), 'Upwork');
assert.equal(sourceForManual('https://kowork.kr/en/jobs/abc'), 'KOWORK');
console.log(`Nicole feed conversion tests passed (${adapted.jobs.length} jobs)`);
