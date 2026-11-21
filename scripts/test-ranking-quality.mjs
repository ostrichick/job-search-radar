import assert from 'node:assert/strict';
import { createSortRules } from '../public/munseong/sort-rules.js';
import { evaluateProfileFit } from '../public/munseong/profile-fit.js';
import { assessEligibility, classifyRole, excludeOnlineJobReason } from '../profiles/dubu/scripts/rules.mjs';
import { isGermanLanguageJob } from '../public/munseong/nicole-feed.js';

const make = (id, extra = {}) => ({
  id, title: 'Korean AI Data Evaluator', location: 'Worldwide',
  workplaceMode: 'remote', remote: true, collectionState: 'seen',
  listingStatus: 'current_feed', score: 30, sourceReliabilityState: 'observed',
  postedAt: '2026-11-21T00:00:00Z', ...extra
});
const sorted = (items, { sort = 'fit', marketTab = 'overseas_remote', isNicole = false, reviewed = [] } = {}) => {
  const state = { marketTab, reviewedIds: new Set(reviewed) };
  return createSortRules({ state, isNicole, currentFilterValues: () => ({ sort }),
    matchingJobs: () => [...items], profileFit: (job) => ({ score: job.fitScore || 0 }),
    distanceSummary: () => ({ kind: 'exact', km: 10 }), distanceSortBand: () => 0,
    deadlinePriority: () => 0, salarySummary: () => ({ hasAmount: false, value: '금액 미공개' })
  }).filteredJobs().map((job) => job.id);
};

assert.deepEqual(sorted([
  make('historical', { collectionState: 'not_seen', fitScore: 90 }),
  make('current', { collectionState: 'seen', fitScore: 60 })
], { isNicole: true }), ['current', 'historical'], 'current opportunities before historical collection records');
assert.deepEqual(sorted([
  make('old-reviewed', { score: 95 }), make('new-unreviewed', { score: 20 })
], { sort: 'score', reviewed: ['old-reviewed'] }), ['old-reviewed', 'new-unreviewed'], 'personal review status never outweighs large relevance gap');
assert.deepEqual(sorted([
  make('near-low', { location: 'Jeonju', workplaceMode: 'onsite', remote: false, score: 20, fitScore: 25 }),
  make('remote-high', { score: 90, fitScore: 75 })
], { sort: 'fit', marketTab: 'domestic' }), ['remote-high', 'near-low'], 'fit ranking checks relevance before locality');
assert.deepEqual(sorted([
  make('near-low', { location: 'Jeonju', workplaceMode: 'onsite', remote: false, score: 20, fitScore: 25 }),
  make('remote-high', { score: 90, fitScore: 75 })
], { sort: 'score', marketTab: 'domestic' }), ['remote-high', 'near-low'], 'score ranking also respects relevance before locality');

const abroadOnly = 'This is a 100% remote contract position open to applicants in Mexico.';
const irelandOnly = 'We are looking for a Localisation Project Manager based in Ireland to join our team.';
const locationUnsure = 'Remote team serves Spanish-speaking customers in Mexico.';
assert.equal(evaluateProfileFit(make('language-hard', { title: 'Kinyarwanda Language Specialist - AI Trainer' })).status, 'fail',
  'a required non-profile language cannot score as generic AI trainer');
assert.notEqual(evaluateProfileFit(make('language-alt', { title: 'Spanish or French Translator' }), { isNicole: true }).status, 'fail',
  'alternative Spanish language must remain eligible for review');
assert.notEqual(evaluateProfileFit(make('language-market', { title: 'Marketing campaigns for French market' })).status, 'fail',
  'market/language mention is not a required fluency');
assert.equal(assessEligibility({ description: abroadOnly, location: 'Mexico' }).status, 'restricted');
assert.equal(assessEligibility({ description: irelandOnly, location: 'Ireland, UK' }).status, 'restricted');
assert.notEqual(assessEligibility({ location: 'South Korea', description: 'Open to applicants in Mexico and Korea.' }).status, 'restricted', 'the same explicit applicant clause allows Korea');
assert.equal(excludeOnlineJobReason({ title: 'Spanish Marketing', category: 'marketing', location: 'South Korea', description: 'Open to applicants in Mexico and Korea.' }), null);
for (const description of [
  'Open to applicants in Mexico. Applicants in Korea are not accepted.',
  'Open to applicants in Mexico for projects in Korea.',
  'Applicants based in South Korea are ineligible for this contract.',
  'We do not accept applicants from South Korea.',
  'We do not hire applicants based in Korea.',
  'Applicants from South Korea must not apply.',
  'We do not hire South Korea-based applicants.',
  'No applicants from Korea are accepted.'
]) {
  assert.equal(assessEligibility({ location: 'Mexico', description }).status, 'restricted', description);
  assert.equal(excludeOnlineJobReason({ title: 'Spanish Marketing', category: 'marketing', location: 'Mexico', description }), 'outside_supported_residence', description);
}
assert.equal(assessEligibility({ location: 'Remote', description: 'Open to candidates based in South Korea.' }).status, 'possible');
assert.notEqual(assessEligibility({ location: 'Remote', description: 'Our company is based in Germany. Applicants worldwide may apply.' }).status, 'restricted', 'employer headquarters is not a worker residency constraint');
assert.equal(assessEligibility({ location: 'Berlin, Germany', description: 'Serving customers in Germany.' }).status, 'unknown', 'bare location is not an applicant-country hard gate');
assert.equal(assessEligibility({ restriction: 'Europe', description: 'Only Europe-based remote workers.' }).status, 'restricted', 'explicit employer country restriction remains a hard gate');
assert.equal(excludeOnlineJobReason({ title: 'Spanish Content Marketer', category: 'marketing', description: abroadOnly, location: 'Mexico' }), 'outside_supported_residence');
assert.equal(evaluateProfileFit(make('mx-only', { title: 'Spanish Content Marketer', description: abroadOnly,
  location: 'Mexico', eligibilityCode: 'unknown' }), { isNicole: true }).status, 'fail');
assert.notEqual(evaluateProfileFit(make('mx-mention', { title: 'Spanish Content Marketer', description: locationUnsure,
  location: 'Mexico', eligibilityCode: 'unknown' }), { isNicole: true }).status, 'fail');
assert.equal(evaluateProfileFit(make('us-only-apac', { title: 'Spanish Content Marketer', location: 'Remote APAC',
  description: 'US residents only.', eligibilityCode: 'unknown' }), { isNicole: true }).status, 'fail');
assert.notEqual(evaluateProfileFit(make('us-client-market', { title: 'Spanish Content Marketer', location: 'Remote',
  description: 'Our services are US only; workers worldwide.', eligibilityCode: 'unknown' }), { isNicole: true }).status, 'fail');
assert.equal(assessEligibility({ restriction: 'APAC' }).status, 'possible');

for (const [title, category] of [
  ['Spanish Customer Support Agent', 'support'],
  ['Spanish AI Data Annotator', 'ai_data'],
  ['Online Spanish Tutor', 'education'],
  ['Bilingual Spanish English Data Entry', 'admin']
  ,['Tutor de Español', 'education']
  ,['Search Engine Evaluator', 'ai_data']
]) assert.equal(classifyRole({ title }), category, `${title} must not be discarded at discovery`);
assert.equal(classifyRole({ title: 'Spanish Software Engineer' }), null, 'unrelated title not broadly included');
assert.equal(isGermanLanguageJob({ title: 'German-speaking Marketing Coordinator' }), true);
assert.equal(isGermanLanguageJob({ title: 'Spanish / German Marketing', languageRequirements: 'Spanish or German preferred' }), false);
assert.equal(isGermanLanguageJob({ title: 'Spanish Support', description: 'German language skills are optional.' }), false);
assert.equal(isGermanLanguageJob({ title: 'Spanish Support', description: 'German preferred. Fluent German required for everyone.' }), true);
console.log('ranking and hard-gate counterexamples passed');
