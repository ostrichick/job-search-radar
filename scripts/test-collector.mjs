import assert from 'node:assert/strict';
import { eligibilityFor, extractSalary, relevantToProfile, currentListingState, markPreservedSourceFailure, normalizeJob, dedupe, carryForwardLegacyIds, carryRecentlyMissing, oneFormaCandidate } from './collect-jobs.mjs';

const remote = (location, description = '', countryCode = '') => ({ location, description, remote: true, countryCode });

assert.deepEqual(eligibilityFor(remote('Remote')), { code: 'unknown', label: '확인 필요' });
assert.deepEqual(eligibilityFor(remote('Anywhere in France')), { code: 'restricted', label: '특정 국가 제한' });
assert.deepEqual(eligibilityFor(remote('Worldwide')), { code: 'worldwide', label: 'Worldwide' });
assert.deepEqual(eligibilityFor(remote('Seoul', '', 'KR')), { code: 'korea', label: '한국에서 지원 가능' });
assert.deepEqual(eligibilityFor(remote('Remote', 'Location: South Korea (Work from Home).')), { code: 'korea', label: '한국에서 지원 가능' });
assert.deepEqual(eligibilityFor(remote('Remote', 'Candidates must reside in Germany.')), { code: 'restricted', label: '특정 국가 제한' });
assert.deepEqual(eligibilityFor(remote('Hong Kong')), { code: 'restricted', label: '특정 국가 제한' });
assert.deepEqual(eligibilityFor(remote('Sweden')), { code: 'restricted', label: '특정 국가 제한' });
assert.deepEqual(eligibilityFor(remote('Greater Orlando')), { code: 'restricted', label: '특정 국가 제한' });

const hourly = extractSalary('', 'Pay Rate: $13/hour\nFlexible schedule.');
assert.equal(hourly.currency, 'USD');
assert.equal(hourly.min, 13);
assert.equal(hourly.period, 'hour');
assert.equal(hourly.display, '$13/시간');

const decimal = extractSalary('', 'Rate: 22.95 USD/hour');
assert.equal(decimal.min, 22.95);
assert.equal(decimal.display, '$22.95/시간');

const suspicious = extractSalary('USD 74000 hourly');
assert.equal(suspicious.confidence, 'suspicious');
assert.match(suspicious.display, /단위 확인 필요/);

const decimalComma = extractSalary('$35,3k- $52k');
assert.equal(decimalComma.min, 35300);
assert.equal(decimalComma.max, 52000);

const sharedSuffix = extractSalary('€75–90k');
assert.equal(sharedSuffix.min, 75000);
assert.equal(sharedSuffix.max, 90000);

const proseNotSalary = extractSalary('', 'Competitive compensation package. Customizable benefits package, 28 days of vacation.');
assert.equal(proseNotSalary.confidence, 'none');

const employeeExpense = extractSalary('', 'Benefits include wellness support. Pay €23 yourself for the optional upgrade.');
assert.equal(employeeExpense.confidence, 'none');

const episodeRate = extractSalary('', 'Compensation: 40-120 EUR/gross per episode.');
assert.equal(episodeRate.min, 40);
assert.equal(episodeRate.max, 120);
assert.equal(episodeRate.period, 'episode');
assert.equal(episodeRate.display, '€40–€120/에피소드');

assert.equal(relevantToProfile({ title: 'Video Reviewer', description: 'This project involves data annotation for AI training.', tags: [] }), true);
assert.equal(relevantToProfile({ title: 'Senior Backend Engineer', description: 'Works with data and AI systems.', tags: [] }), false);

const pool = currentListingState({ source: 'Welo Global', title: 'AI Trainers Network - Korean', description: 'This is not an active job opening.', postedAt: new Date().toISOString() });
assert.equal(pool.code, 'talent_pool');

const currentProject = currentListingState({ source: 'Welo Global', title: 'Generative AI Analyst | Korean (Korea)', description: 'Project Details. Commitment: 4 weeks. Pay Rate: $13/hour. Apply now. Join our database and become part of our growing community.', postedAt: new Date().toISOString() });
assert.equal(currentProject.code, 'verified_open');

const expired = currentListingState({ source: 'Remote OK', title: 'Reviewer', description: 'Applications are closed.', postedAt: new Date().toISOString() });
assert.equal(expired.code, 'expired');

const activeTalentDuty = currentListingState({ source: 'Remote OK', title: 'Founding Talent Partner', description: 'Own recruiting end to end and build a talent pool for future hiring needs.', postedAt: new Date().toISOString() });
assert.equal(activeTalentDuty.code, 'current_feed');

const preservedFailure = markPreservedSourceFailure({ listingStatus: 'verified_open', listingLabel: '모집 확인됨', stale: false, score: 100 });
assert.equal(preservedFailure.listingStatus, 'source_error');
assert.equal(preservedFailure.stale, true);
assert.equal(preservedFailure.score, 80);

const base = {
  source: 'Welo Global', company: 'Example Inc.', title: 'Korean Evaluator', remote: true,
  type: 'Remote', salary: '', postedAt: new Date().toISOString(), description: '', tags: [], countryCode: ''
};
const korea = normalizeJob({ ...base, id: 'one', location: 'South Korea', url: 'https://example.com/korea' });
const france = normalizeJob({ ...base, id: 'two', location: 'France', url: 'https://example.com/france' });
const regional = dedupe([korea, france]);
assert.equal(regional.length, 2, 'specific regional postings must remain distinct');
assert.equal(new Set(regional.map((job) => job.id)).size, 2, 'specific regional postings need distinct stable ids');

const boardCopy = normalizeJob({ ...base, id: 'three', source: 'Remote OK', location: 'South Korea', url: 'https://board.example/korea' });
const merged = dedupe([korea, boardCopy]);
assert.equal(merged.length, 1);
assert.equal(merged[0].source, 'Welo Global', 'official ATS should be preferred as primary source');
assert.equal(merged[0].duplicateCount, 2);
assert.ok(merged[0].alternateUrls.includes('https://board.example/korea'));

const berlin = normalizeJob({ ...base, id: 'berlin', source: 'Arbeitnow', location: 'Berlin, Germany', url: 'https://example.com/berlin' });
const paris = normalizeJob({ ...base, id: 'paris', source: 'Arbeitnow', location: 'Paris, France', url: 'https://example.com/paris' });
const regionalBoardCopies = dedupe([berlin, paris]);
assert.equal(regionalBoardCopies.length, 2, 'same title/company in different restricted locations must not merge');
assert.equal(new Set(regionalBoardCopies.map((job) => job.id)).size, 2);

const priorUnknown = dedupe([normalizeJob({ ...base, id: 'remoteok:42', source: 'Remote OK', location: 'Remote', url: 'https://example.com/same' })])[0];
const freshKorea = dedupe([normalizeJob({ ...base, id: 'remoteok:42', source: 'Remote OK', location: 'South Korea', url: 'https://example.com/same' })])[0];
assert.notEqual(priorUnknown.id, freshKorea.id, 'eligibility changes can legitimately change the stable id');
const carried = carryForwardLegacyIds([freshKorea], [priorUnknown])[0];
assert.ok(carried.legacyIds.includes(priorUnknown.id), 'previous stable id must remain an alias for client state migration');

const now = Date.parse('2026-10-04T00:00:00Z');
const disappeared = { ...priorUnknown, id: 'job:old-missing', missingSince: '2026-10-03T00:00:00Z' };
const withGracePeriod = carryRecentlyMissing([], [disappeared], now);
assert.equal(withGracePeriod.length, 1);
assert.equal(withGracePeriod[0].listingStatus, 'archived_missing');
assert.equal(withGracePeriod[0].score, 0);
const tooOld = carryRecentlyMissing([], [{ ...disappeared, missingSince: '2026-09-01T00:00:00Z' }], now);
assert.equal(tooOld.length, 0, 'missing jobs must age out after the grace period');

const specialist = normalizeJob({ ...base, id: 'legal', source: 'RWS TrainAI', title: 'Legal Annotators - Korean', location: 'South Korea', url: 'https://example.com/legal' });
assert.ok(specialist.score < 20, 'unverified specialist credentials must not enter default recommendations');
assert.match(specialist.fitWarning, /전문/);

const oneFormaPost = {
  id: 2366,
  date_gmt: '2026-09-30T08:00:00',
  link: 'https://www.oneforma.com/projects/multilingual-ai-quality-assurance-reviewer/',
  title: { rendered: 'Multilingual AI Quality Assurance Reviewer' },
  content: { rendered: '<p>Review multilingual AI outputs as a remote quality reviewer.</p>' },
  _embedded: {
    'wp:term': [
      [{ taxonomy: 'job_type', name: 'Annotation' }],
      [{ taxonomy: 'job_tag', name: 'Fixed Rate Per Hour' }, { taxonomy: 'job_tag', name: 'Remote' }, { taxonomy: 'job_tag', name: 'Selected Locations' }],
      [{ taxonomy: 'domain', name: 'Languages' }],
      [{ taxonomy: 'country', name: 'South Korea' }, { taxonomy: 'country', name: 'Japan' }],
      [{ taxonomy: 'language', name: 'Korean' }, { taxonomy: 'language', name: 'Japanese' }]
    ]
  }
};
const oneFormaRaw = oneFormaCandidate(oneFormaPost);
assert.equal(oneFormaRaw.remote, true);
assert.match(oneFormaRaw.location, /South Korea/);
assert.ok(oneFormaRaw.tags.includes('Korean'));
const oneFormaJob = normalizeJob(oneFormaRaw);
assert.equal(oneFormaJob.eligibilityCode, 'korea');
assert.equal(oneFormaJob.sourceKind, 'official_platform');
assert.equal(oneFormaJob.listingStatus, 'verified_open');

const translationRater = normalizeJob({
  ...base,
  id: 'translation-rater',
  source: 'OneForma',
  title: 'Bilingual Translation Quality Rater',
  location: 'Worldwide',
  url: 'https://example.com/translation-rater',
  description: 'Candidates should have some translation background and rate translations for selected language pairs.',
  tags: ['Korean', 'Worldwide', 'Quality Rater']
});
assert.ok(translationRater.score < 20, 'translation roles must not be default recommendations without verified translation qualifications');
assert.match(translationRater.fitWarning, /번역/);

const residencyRequirement = normalizeJob({
  ...base,
  id: 'residency',
  source: 'OneForma',
  title: 'Local Search Quality Evaluator',
  location: 'South Korea',
  url: 'https://example.com/residency',
  description: 'You must be living in South Korea for at least 5 years and be fluent in Korean.',
  tags: ['Korean', 'Search Evaluator']
});
assert.ok(residencyRequirement.score < 20, 'unverified long-term residency requirements must not enter default recommendations');
assert.match(residencyRequirement.fitWarning, /거주/);

const annotationTenure = normalizeJob({
  ...base,
  id: 'annotation-tenure',
  source: 'OneForma',
  title: 'Multilingual Intent And Response Annotator',
  location: 'Worldwide',
  url: 'https://example.com/annotation-tenure',
  description: 'Requirements: At least 1 year of experience working on annotation or data labeling projects.',
  tags: ['Korean', 'Annotation']
});
assert.ok(annotationTenure.score < 20, 'unverified one-year annotation tenure must not enter default recommendations');
assert.match(annotationTenure.fitWarning, /1년/);

const transcriptionExperience = normalizeJob({
  ...base,
  id: 'transcription-experience',
  source: 'OneForma',
  title: 'Multilingual Podcast Transcription And Speech Annotator',
  location: 'South Korea',
  url: 'https://example.com/transcription-experience',
  description: 'Requirements: Native Korean. Previous transcription or speech annotation experience.',
  tags: ['Korean', 'Speech Annotator']
});
assert.ok(transcriptionExperience.score < 20, 'required transcription experience must be treated as an unverified hard requirement');
assert.match(transcriptionExperience.fitWarning, /전사/);

console.log('collector tests passed');
