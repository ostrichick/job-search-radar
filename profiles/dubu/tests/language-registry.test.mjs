import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assessLanguageFit, extractLanguages } from '../scripts/rules.mjs';
import { languageNamesIn, languageRegex } from '../../../public/shared/language-fit.js';
import { evaluateProfileFit } from '../../../public/munseong/profile-fit.js';
import { mergeHistoricalFeed } from '../scripts/collect.mjs';

const known = { es: 'native', ko: 'beginner', en: 'unverified' };
const fit = (requirements, extra = {}) => assessLanguageFit({ languageRequirements: requirements, ...extra }, known);

test('unsupported required languages are mismatches without per-language code', () => {
  for (const requirements of [
    'Required: Nepali Native; Preferred: English Intermediate',
    'Required: Thai Native; Preferred: English Intermediate',
    'Required: Burmese Native',
    'Required: Swahili Fluent',
    'Required: Kinyarwanda Native'
  ]) {
    assert.equal(fit(requirements).languageFitStatus, 'mismatch', requirements);
  }
});

test('supported languages still match and uncertainty stays unknown', () => {
  assert.equal(fit('Required: Spanish Native').languageFitStatus, 'match');
  assert.equal(fit('Required: English C1').languageFitStatus, 'unknown');
  assert.equal(fit('Required: Spanish or Nepali Native').languageFitStatus, 'unknown');
  assert.equal(fit('Required: either Spanish or Thai Native').languageFitStatus, 'unknown');
  assert.equal(fit('Required: Fluent English or Japanese').languageFitStatus, 'unknown');
});

test('commas separate requirements from preferences without breaking OR lists', () => {
  assert.equal(fit('Required: Spanish required, Japanese preferred').languageFitStatus, 'match');
  assert.equal(fit('Required: Spanish, French, or Nepali Native').languageFitStatus, 'unknown');
  assert.equal(fit('Required: Spanish required, Nepali Native').languageFitStatus, 'mismatch');
  assert.notEqual(fit('Required: English. Proficiency in additional languages such as French, Spanish, or German is a plus.').languageFitStatus, 'mismatch');
});

test('alternative detection requires language names on both sides', () => {
  assert.equal(fit('Required: Language Skills: Fluent in Japanese and English. Zero trust, or managed security.').languageFitStatus, 'mismatch');
  assert.equal(fit('Required: Native proficiency of German, fluent English. Ahrefs, Semrush, or similar.').languageFitStatus, 'mismatch');
  assert.equal(fit('Required: Fluent in Thai and English. Incomplete or unclear information.').languageFitStatus, 'mismatch');
  assert.equal(fit('Required: English. German is a plus. Language Skills: Fluent in Japanese and English.').languageFitStatus, 'mismatch');
});

test('profile language maps keep Munseong Korean roles and reject them for Nicole', () => {
  const job = { title: 'Korean Language Teacher', description: '', category: 'education', languageRequirements: 'Required: Korean Native', sourceKind: 'manual' };
  assert.notEqual(evaluateProfileFit(job, { isNicole: false }).status, 'fail');
  assert.equal(evaluateProfileFit(job, { isNicole: true }).status, 'fail');
});

test('eligibility and tag metadata do not become language requirements', () => {
  const job = {
    title: 'Global Marketing Intern', description: 'General marketing work.', category: 'marketing',
    eligibility: 'does not state a Korean proficiency requirement', tags: ['Translation', 'Arabic', 'Azeri']
  };
  assert.notEqual(evaluateProfileFit(job, { isNicole: true }).status, 'fail');
});

test('country names and homographs are not treated as required languages', () => {
  assert.equal(fit('Preferred: English. Latin America market.',
    { description: 'Remote work from afar; fluent English required.' }).languageFitStatus, 'unknown');
  assert.notEqual(fit('Required: English. French customers in Latin America.').languageFitStatus, 'mismatch');
  assert.notEqual(fit('Required: English. Remote work from afar; fluent English required.').languageFitStatus, 'mismatch');
  assert.notEqual(fit('Required: polish the copy').languageFitStatus, 'mismatch');
  assert.notEqual(fit('Required: fluent Korean not specified').languageFitStatus, 'mismatch');
  assert.notEqual(fit('Required: does not state a Korean proficiency requirement').languageFitStatus, 'mismatch');
  assert.notEqual(fit('Required: English. Greek life is a significant plus.').languageFitStatus, 'mismatch');
  assert.ok(!languageNamesIn('farsighted').some((x) => x.code === 'fa'));
  assert.ok(languageRegex('일본어').test('일본어 필수'));
  assert.ok(languageNamesIn('Dermatology_Taiwanese language required').some((x) => x.code === 'zh'));
});

test('placeholder requirements still inspect title and description', () => {
  assert.equal(fit('공고 원문 확인 필요', {
    title: 'Yoruba Language Specialist', description: '', category: 'translation'
  }).languageFitStatus, 'mismatch');
});

test('language extraction keeps preference and nationality context', () => {
  assert.deepEqual(extractLanguages({ title: 'Hiring Filipino Foreign Marketers', description: '' }), []);
  assert.deepEqual(extractLanguages({
    title: 'Field Marketing Manager',
    description: 'Preferred Qualifications (nice-to-have, not required). Professional proficiency in French or German.'
  }), []);
  assert.deepEqual(extractLanguages({
    title: 'Customer Success Manager',
    description: 'Additional skills that you might also bring. We appreciate proficiency in Japanese, Korean, or Spanish.'
  }), []);
});

test('deprecated language codes are canonicalized', () => {
  assert.ok(languageNamesIn('Indonesian').some((x) => x.code === 'id'));
  assert.ok(languageNamesIn('Hebrew').some((x) => x.code === 'he'));
  assert.ok(!languageNamesIn('Indonesian').some((x) => x.code === 'in'));
});

test('collector and profile-fit contain no hardcoded target language lists', () => {
  for (const file of ['../scripts/collect-kowork.mjs', '../../../public/munseong/profile-fit.js']) {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.ok(!/OTHER_MANDATORY|UNSUPPORTED_LANGUAGE_SPECIALIST|LANGUAGE_RULES|OTHER_LANGUAGE_REQUIRED/.test(text), file);
  }
});

test('historical unknown fit is re-assessed for automated sources', () => {
  const baseline = JSON.parse(readFileSync(new URL('../public/jobs.json', import.meta.url), 'utf8'));
  const sourceJob = baseline.jobs.find((job) => job.languageFitStatus === 'unknown' && !job.manual &&
    !['curated_research', 'manual'].includes(job.sourceKind));
  assert.ok(sourceJob);
  const job = {
    ...sourceJob, id: 'historical-language-fit-test', title: 'General Marketing Assistant',
    description: 'Required: Spanish Native', category: 'marketing', languageRequirements: 'Required: Spanish Native',
    languageFitStatus: 'unknown', languageFitReason: 'Public metadata was checked',
    lastSeenAt: '2026-11-27T00:00:00Z', deadline: null, listingExpiresAt: null
  };
  const previous = { ...baseline, jobs: [job] };
  const incoming = { ...baseline, updatedAt: '2026-11-27T01:00:00Z', jobs: [], sourceStatus: [] };
  const result = mergeHistoricalFeed(incoming, previous, { knownLanguages: known });
  const retained = result.jobs.find((item) => item.id === job.id);
  assert.ok(retained);
  assert.equal(retained.languageFitStatus, 'match');
  assert.notEqual(retained.languageFitReason, 'Public metadata was checked');
});
