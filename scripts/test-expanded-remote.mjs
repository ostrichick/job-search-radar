import assert from 'node:assert/strict';
import { expandedRemoteCandidates, isFutureOnlyProductivePlayhouse } from './expanded-remote-sources.mjs';
import { normalizeExpandedRemote, mergeHistoricalFeed } from '../profiles/dubu/scripts/collect.mjs';
import { dedupe, normalizeJob, carryRecentlyMissing, preserveFailedSourceJobs } from './collect-jobs.mjs';
import { validateJob } from '../public/munseong/backup-rules.js';

const now = Date.parse('2026-10-28T06:00:00Z');
const h = {
  title: 'Korean AI Response Reviewer', companyName: 'Test Agency',
  locationRestrictions: ['South Korea'],
  applicationLink: 'https://himalayas.app/companies/test/jobs/korean-ai-reviewer?utm_source=api',
  pubDate: now / 1000 - 1000, expiryDate: now / 1000 + 86400,
  employmentType: 'Contractor', description: '<p>Korean annotation and review.</p>',
  minSalary: 30, maxSalary: 50, salaryPeriod: 'hourly', currency: 'USD'
};
const himalayas = expandedRemoteCandidates('himalayas', { jobs: [
  h,
  { ...h, title: 'Spanish Marketing', locationRestrictions: ['United States'] },
  { ...h, title: 'Internal Job Posting', applicationLink: 'https://himalayas.app/companies/test/jobs/internal' },
  { ...h, expiryDate: now / 1000 - 1, applicationLink: 'https://himalayas.app/companies/test/jobs/expired' }
] }, now);
assert.equal(himalayas.length, 1);
const futurePool = { ...h, title: 'Korean - AI Product Evaluator', companyName: 'Productive Playhouse',
  applicationLink: 'https://himalayas.app/companies/productive-playhouse/jobs/korean-ai-product-evaluator-2546261984?utm_source=api' };
assert.equal(expandedRemoteCandidates('himalayas', { jobs: [futurePool] }, now).length, 0,
  'an employer future-project talent pool must not enter active recruitment');
const priorFuturePool = { ...normalizeJob({ ...himalayas[0], title: futurePool.title, company: futurePool.companyName,
  url: futurePool.applicationLink }), listingStatus: 'current_feed', score: 78 };
assert.equal(isFutureOnlyProductivePlayhouse(priorFuturePool), true);
assert.equal(carryRecentlyMissing([], [priorFuturePool], now).length, 0,
  'previous future-only posting must not survive as archived_missing');
assert.equal(preserveFailedSourceJobs('Himalayas', [priorFuturePool]).length, 0,
  'failed source must not resurrect prior future-only posting');
assert.match(himalayas[0].id, /^himalayas:[0-9a-f]{20}$/);
const normalized = dedupe([normalizeJob(himalayas[0])])[0];
assert.equal(typeof normalized.id, 'string');
assert.ok((normalized.legacyIds || []).every((id) => typeof id === 'string'));
validateJob(normalized);
assert.equal(himalayas[0].salary, 'USD 30–50 hourly');
assert.equal(himalayas[0].listingExpiresAt, '2026-10-29T06:00:00.000Z');
const nicole = normalizeExpandedRemote('himalayas', { jobs: [{
  ...h, title: 'Spanish Social Media Content Creator',
  description: 'Create Spanish TikTok and Instagram content for a global audience.'
}] }, { now: new Date(now).toISOString(), homeCountry: 'KR', languages: { es: 'native', en: 'unverified', ko: 'beginner' } });
assert.equal(nicole.length, 1);
assert.equal(nicole[0].url, h.applicationLink, 'Himalayas Apply link must remain unchanged');
const untranslatedKoreanRole = { ...h, title: 'Freelance Translators/Checkers - Korean to English - Surgery',
  applicationLink: 'https://himalayas.app/companies/ulatus/jobs/korean-to-english-surgery',
  companyName: 'Ulatus', description: 'Expert-level Korean-English medical translation required' };
assert.equal(normalizeExpandedRemote('himalayas', { jobs: [untranslatedKoreanRole] }, {
  now: new Date(now).toISOString(), homeCountry: 'KR', languages: { es: 'native', en: 'unverified', ko: 'beginner' }
}).length, 0, 'Nicole must not receive Korean-fluency translation jobs with explicit language mismatch');
const previousKoreanTranslation = { ...nicole[0], title: untranslatedKoreanRole.title,
  company: 'Ulatus', source: 'Himalayas', languageFitStatus: 'mismatch',
  url: untranslatedKoreanRole.applicationLink };
assert.equal(mergeHistoricalFeed({ updatedAt: new Date(now).toISOString(), jobs: [],
  sourceStatus: [{ source: 'Himalayas', status: 'ok' }] }, { jobs: [previousKoreanTranslation] },
{ knownLanguages: { es: 'native', en: 'unverified', ko: 'beginner' } }).jobs.length, 0,
  'historical mismatch must not re-enter Nicole after filtering new API jobs');
const commonRemote = {
  id: 'bosnian-review', title: 'English to Bosnian (Cyrillic) Review Lead for UI, Marketing & Product Content',
  url: 'https://remotejobs.org/remote-jobs/bosnian-review',
  company: { name: 'Test Agency' }, description: 'Review Bosnian translation and marketing text',
  applicant_location_requirements: {
    status: 'known', allowed_countries: ['KR'], work_arrangement: 'remote'
  },
  location_normalization: { status: 'known', scope: 'restricted', allowed_countries: ['KR'] }
};
const nicoleOptions = { now: new Date(now).toISOString(), homeCountry: 'KR',
  languages: { es: 'native', en: 'unverified', ko: 'beginner' } };
assert.equal(normalizeExpandedRemote('remotejobs', { data: [commonRemote] }, nicoleOptions).length, 0,
  'foreign-language Review Lead must not pass because the title contains Marketing & Content');
assert.equal(normalizeExpandedRemote('remotejobs', { data: [{
  ...commonRemote, id: 'spanish-review', title: 'English to Spanish Review Lead for UI, Marketing & Product Content',
  url: 'https://remotejobs.org/remote-jobs/spanish-review',
  description: 'Review Spanish translations and product text'
}] }, nicoleOptions).length, 1, 'Spanish review is relevant to this profile');
const remote = {
  id: 'test1', title: 'Korean AI Data Labeler', url: 'https://remotejobs.org/remote-jobs/korean-labeler',
  company: { name: 'Test Agency' }, description: 'Review Korean AI annotations',
  posted_at: '2026-10-27T10:00:00Z',
  applicant_location_requirements: {
    status: 'known', allowed_countries: ['KR'], work_arrangement: 'remote', worldwide_permission_verified: false
  },
  location_normalization: {
    status: 'known', scope: 'restricted', allowed_countries: ['KR'], allowed_subdivisions: [], allowed_regions: []
  }
};
const output = expandedRemoteCandidates('remotejobs', { data: [
  remote,
  { ...remote, id: 'us-only', applicant_location_requirements: { status: 'known', allowed_countries: ['US'], work_arrangement: 'remote' } },
  { ...remote, id: 'conflict', applicant_location_requirements: { status: 'known', allowed_countries: [], worldwide_permission_verified: true, work_arrangement: 'remote' },
    location_normalization: { status: 'known', scope: 'restricted', allowed_countries: [], allowed_subdivisions: ['US-NY'] } },
  { ...remote, id: 'ireland', title: 'Engineer - Ireland',
    applicant_location_requirements: { status: 'known', allowed_countries: [], worldwide_permission_verified: true, work_arrangement: 'remote' },
    location_normalization: { status: 'unknown' } },
  { ...remote, id: 'onsite', applicant_location_requirements: { status: 'known', allowed_countries: ['KR'], work_arrangement: 'onsite' } }
] }, now);
assert.equal(output.length, 1);
assert.equal(output[0].source, 'RemoteJobs.org');
assert.match(output[0].id, /^remotejobsorg:[0-9a-f]{20}$/);
validateJob(normalizeJob(output[0]));
const unknownGeo = { ...remote, id: 'uncertain-worldwide', title: 'Spanish Social Media Content Creator',
  url: 'https://remotejobs.org/remote-jobs/uncertain-worldwide',
  description: 'Create Spanish social media content',
  applicant_location_requirements: { status: 'known', allowed_countries: [],
    worldwide_permission_verified: true, work_arrangement: 'remote' },
  location_normalization: { status: 'unknown' } };
const [unknownCandidate] = expandedRemoteCandidates('remotejobs', { data: [unknownGeo] }, now);
assert.equal(unknownCandidate.location, 'Remote', 'an unverified geo warning must not be embedded as location evidence');
assert.equal(normalizeJob(unknownCandidate).eligibilityCode, 'unknown',
  'main radar must not convert a location warning into verified Korean eligibility');
const [nicoleUnknown] = normalizeExpandedRemote('remotejobs', { data: [unknownGeo] }, nicoleOptions);
assert.equal(nicoleUnknown.eligibilityStatus, 'unknown',
  'Nicole radar must not claim possible Korean eligibility from inferred worldwide metadata');
assert.equal(mergeHistoricalFeed({ updatedAt: nicoleOptions.now, jobs: [],
  sourceStatus: [{ source: 'Himalayas', status: 'ok' }] },
{ jobs: [{ ...nicole[0], title: futurePool.title, company: futurePool.companyName,
  url: futurePool.applicationLink }] }, { knownLanguages: nicoleOptions.languages }).jobs.length, 0,
  'Nicole historical merge must not restore a future-project pool');
assert.throws(() => expandedRemoteCandidates('himalayas', {}), /jobs array missing/);
console.log('Expanded remote sources eligibility, expiry and attribution tests passed');
