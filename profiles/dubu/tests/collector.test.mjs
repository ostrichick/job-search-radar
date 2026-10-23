import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assessEligibility, assessLanguageFit, classifyRole, dedupeJobs, excludeOnlineJobReason, extractLanguages, isoDate,
  requiresPhysicalAttendance, safePublicUrl, stableId, stripHtml,
} from '../scripts/rules.mjs';
import {
  buildFeed, mergeHistoricalFeed, normalizeArbeitnow, normalizeJobicy, normalizeManual,
  normalizeRemotive, normalizeRemoteOk, run,
} from '../scripts/collect.mjs';

const now = '2026-10-19T01:30:00.000Z';
const props = { now, homeCountry: 'KR' };

test('relevant jobs are matched by title; description-only incidental keywords do not inflate feed', () => {
  assert.equal(classifyRole({ title: 'Social Media Manager' }), 'marketing');
  assert.equal(classifyRole({ title: 'Paid Ads Specialist' }), 'advertising');
  assert.equal(classifyRole({ title: 'Spanish Localization Reviewer' }), 'translation');
  assert.equal(classifyRole({ title: 'Copywriter, Spanish' }), 'content');
  assert.equal(classifyRole({ title: 'Software Engineer', description: 'marketing with translation features' }), null);
  assert.equal(classifyRole({ title: 'Project Coordinator', categories: ['Marketing'], description: 'SEO marketing plans' }), 'marketing');
  assert.equal(classifyRole({ title: 'Project Coordinator', categories: ['Marketing'], description: 'software developer role' }), null);
});

test('online interpreting excluded, offline interpreting retained', () => {
  assert.equal(classifyRole({ title: 'Spanish Interpreter / Translator', market: 'online' }), null);
  assert.equal(classifyRole({ title: 'Spanish Remote Interpreter', market: 'online' }), null);
  assert.equal(classifyRole({ title: '스페인어 통역사', market: 'offline' }), 'interpreting');
  assert.equal(classifyRole({ title: 'Spanish Translator', market: 'online' }), 'translation');
});

test('language fit distinguishes known Spanish, unknown English, non-profile languages and beginner Korean', () => {
  const known = { es: 'native', ko: 'beginner', en: 'unverified' };
  const fit = (title, category = 'translation', description = '') =>
    assessLanguageFit({ title, category, description }, known);
  assert.equal(fit('Spanish Freelance Translator').languageFitStatus, 'match');
  assert.equal(fit('Hebrew Freelance Translator').languageFitStatus, 'mismatch');
  assert.equal(fit('Danish Speaking Solutions Consultant Work Sofia Bulgaria', 'marketing').languageFitStatus, 'mismatch');
  assert.match(fit('Hebrew Freelance Translator').languageFitReason, /Hebrew/);
  assert.equal(fit('English to Burmese Linguist').languageFitStatus, 'mismatch');
  assert.equal(fit('Japanese Translator').languageFitStatus, 'mismatch');
  assert.equal(fit('Korean Translator').languageFitStatus, 'mismatch');
  assert.equal(fit('Spanish to English Translator').languageFitStatus, 'unknown');
  assert.equal(fit('Digital Marketing Specialist', 'marketing').languageFitStatus, 'unknown');
  assert.equal(fit('Marketing Manager', 'marketing', 'Fluent German required for all candidates.').languageFitStatus, 'mismatch');
  assert.equal(fit('Marketing Manager', 'marketing', 'Korean preferred, no fluency requirement.',).languageFitStatus, 'unknown');
});

test('eligibility never assumes a legal right to work from Korea', () => {
  assert.equal(assessEligibility({ restriction: 'USA Only' }).status, 'restricted');
  assert.equal(assessEligibility({ restriction: 'Europe' }).status, 'restricted');
  assert.equal(assessEligibility({ restriction: 'APAC' }).status, 'possible');
  assert.equal(assessEligibility({ restriction: 'Worldwide' }).status, 'possible');
  assert.equal(assessEligibility({ restriction: 'South Korea' }).status, 'possible');
  assert.equal(assessEligibility({ location: 'Remote' }).status, 'unknown');
  assert.equal(assessEligibility({ restriction: 'Worldwide', description: 'US applicants only. Must be eligible in USA.' }).status, 'restricted');
  assert.equal(assessEligibility({ restriction: 'Worldwide', description: 'US work authorization required.' }).status, 'restricted');
  assert.equal(assessEligibility({ description: 'Wir suchen ausschließlich Kandidat:innen mit Wohnsitz in Deutschland oder Österreich.' }).status, 'restricted');
  assert.equal(assessEligibility({ market: 'offline', location: '전주시 완산구' }).status, 'unknown');
  assert.equal(excludeOnlineJobReason({ title: 'Marketing and Sales Administrator',
    description: 'Looking for Philippines-based candidates for this remote role.' }, props), 'outside_supported_residence');
});

test('hard exclusions require an unsupported language in the role or a mandatory requirement', () => {
  const knownLanguages = { es: 'native', ko: 'beginner', en: 'unverified' };
  const check = (job) => excludeOnlineJobReason(job, { homeCountry: 'KR', knownLanguages });
  assert.equal(check({ title: 'Hebrew Freelance Translator & Copy Editor', category: 'translation' }), 'unsupported_required_language');
  assert.equal(check({ title: 'English to Burmese (Myanmar) Linguist', category: 'translation' }), 'unsupported_required_language');
  assert.equal(check({ title: 'French-speaking Marketing Specialist', category: 'marketing' }), 'unsupported_required_language');
  assert.equal(check({ title: 'Danish Speaking Solutions Consultant Work Sofia Bulgaria', category: 'marketing' }), 'unsupported_required_language');
  for (const language of ['Swedish', 'Norwegian', 'Finnish', 'Dutch', 'Romanian', 'Bulgarian']) {
    assert.equal(check({ title: `${language} Speaking Customer Marketing Specialist`, category: 'marketing' }),
      'unsupported_required_language', language);
  }
  assert.equal(check({ title: 'Online Marketing Manager', category: 'marketing', description: 'Fluent German required for all candidates.' }), 'unsupported_required_language');
  assert.equal(check({ title: 'Marketing Manager', category: 'marketing', description: 'Spanish is required. German preferred.' }), null);
  assert.equal(check({ title: 'Marketing Manager', category: 'marketing', description: 'We work with French and German customers. Spanish-speaking market manager.' }), null);
  assert.equal(check({ title: 'Spanish Translator', category: 'translation' }), null);
  assert.equal(check({ title: 'Spanish to English Translator', category: 'translation' }), null);
  assert.equal(check({ title: 'Korean Translator', category: 'translation' }), null);
  assert.equal(check({ title: 'English Translator', category: 'translation' }), null);
  assert.equal(check({ title: 'Spanish or French Translator', category: 'translation' }), null);
  assert.equal(check({ title: 'Paid Media Marketing Specialist', description: 'We manage campaigns targeting Danish and Dutch customers.' }), null);
  assert.equal(check({ title: 'Paid Media Marketing Specialist', description: 'Danish language skills are optional; Spanish required.' }), null);
});

test('German-only remote jobs in Germany and explicit foreign residency are screened conservatively', () => {
  const germanAd = 'Wir suchen eine:n Online Marketing Manager:in. Du setzt Kampagnen um und betreust die Kunden. ' +
    'Deine Aufgaben umfassen die Planung und Optimierung von Werbung. Wir bieten Erfahrung im Marketing, ' +
    'Zusammenarbeit mit unserem Vertrieb und die Möglichkeit zur Bewerbung für spannende Projekte in Berlin.';
  const filter = (job) => excludeOnlineJobReason(job);
  assert.equal(filter({ source: 'Arbeitnow', category: 'marketing', title: 'Online Marketing Manager', location: 'Berlin, Germany', description: germanAd }), 'german_only_germany_job');
  assert.equal(filter({ source: 'Arbeitnow', category: 'marketing', title: 'Online Marketing Manager', location: 'Berlin', description: 'We hire worldwide. Excellent marketing strategy and SEO experience.' }), null);
  assert.equal(filter({ source: 'Arbeitnow', category: 'marketing', title: 'Spanish Social Media Manager', location: 'Berlin', description: `${germanAd} Diese Remote-Stelle ist worldwide und from anywhere möglich.` }), null);
  assert.equal(filter({ source: 'Jobicy', category: 'advertising', title: 'Campaign Coordinator', location: 'Worldwide', description: 'We need a Campaign Coordinator based in Latin America.' }), 'outside_supported_residence');
  assert.equal(filter({ source: 'Jobicy', category: 'marketing', title: 'Growth Manager LATAM', location: 'Worldwide', description: 'Manage campaigns for LATAM customers. Work from anywhere.' }), null);
  assert.equal(filter({ source: 'Jobicy', category: 'marketing', title: 'Growth Manager LATAM', location: 'LATAM', description: 'Remote manager for LATAM market.' }), 'outside_supported_residence');
  assert.equal(filter({ source: 'Remotive', title: 'Marketing Manager', location: 'South Korea', description: 'Create campaigns for Latin America.' }), null);
  assert.equal(filter({ source: 'Remotive', title: 'Marketing Manager', location: 'Worldwide', description: 'Must reside in Mexico City, Mexico.' }), 'outside_supported_residence');
  assert.equal(filter({ source: 'Arbeitnow', title: 'Freelance Acquisition Paid Media (Google Ads, Meta Ads)',
    location: 'Berlin', description: `Nous recherchons un partenaire pour les campagnes. Conditions : 100 % à distance, depuis l'Europe : nous travaillons sur le fuseau de Paris et les échanges se font en journée (UTC-1 à UTC+3).` }),
  'outside_supported_residence');
  assert.equal(filter({ source: 'Arbeitnow', title: 'Freelance Acquisition Paid Media (Google Ads, Meta Ads)',
    location: 'Berlin', description: `Nous lançons des campagnes ciblant les marchés européens. Work from anywhere, including Korea.` }), null);
});

test('HTML, dates and unsafe external URLs are rejected or normalized', () => {
  assert.equal(stripHtml('<script>alert(1)</script><p>Hola &amp; <b>hello</b></p>'), 'Hola & hello');
  assert.equal(safePublicUrl('javascript:alert(1)'), null);
  assert.equal(safePublicUrl('https://localhost/x'), null);
  assert.equal(safePublicUrl('https://10.0.0.1/callback'), null);
  assert.equal(safePublicUrl('https://user:password@example.com/listing'), null);
  assert.equal(safePublicUrl('http://example.com/job'), null);
  assert.equal(safePublicUrl('https://example.com/job?utm_source=abc&id=42#fragment'), 'https://example.com/job?id=42');
  assert.equal(isoDate(1792373400), '2026-10-19T01:30:00.000Z');
  assert.equal(isoDate('not-a-date'), null);
  assert.equal(stableId('Jobicy', 1, 'https://example.com/'), stableId('Jobicy', 1, 'https://another.example/'));
});

test('Remotive normalizes geographical limits, source credit and html descriptions', () => {
  const result = normalizeRemotive({ jobs: [
    { id: 10, title: 'Spanish Translator', company_name: 'Acme', url: 'https://remotive.com/remote-jobs/10', candidate_required_location: 'USA Only', publication_date: now, description: '<p>Spanish required, remote.</p>', salary: '$25 per hour', category: 'Writing' },
    { id: 11, title: 'English Interpreter', company_name: 'Acme', url: 'https://remotive.com/remote-jobs/11', candidate_required_location: 'Worldwide', description: 'interpreting', category: 'Translation' },
    { id: 12, title: 'Spanish Translator', company_name: 'Acme', url: 'https://remotive.com/remote-jobs/12', candidate_required_location: 'Worldwide', publication_date: now, description: '<p>Spanish required, remote.</p>', salary: '$25 per hour', category: 'Writing' },
  ] }, props);
  assert.equal(result.length, 1);
  assert.equal(result[0].source, 'Remotive');
  assert.equal(result[0].category, 'translation');
  assert.equal(result[0].eligibilityStatus, 'possible');
  assert.equal(result[0].description, 'Spanish required, remote.');
  assert.equal(result[0].languageRequirements, 'Spanish');
  assert.equal(result[0].pay, '$25 per hour');
  assert.equal(result[0].postedAt, now);
});

test('Jobicy handles API version, categories, missing pay, explicit jobGeo', () => {
  const jobs = normalizeJobicy({ success: true, jobs: [
    { id: 125, jobTitle: 'Marketing Assistant', companyName: 'Bright', jobIndustry: ['Marketing'], jobGeo: 'Anywhere', url: 'https://jobicy.com/jobs/125', jobDescription: 'SEO', pubDate: now },
    { id: 126, jobTitle: 'Marketing Analyst', companyName: 'Bright', jobIndustry: ['Marketing'], jobGeo: 'Europe', url: 'https://jobicy.com/jobs/126', jobDescription: 'Campaigns', pubDate: now },
  ] }, props);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].eligibilityStatus, 'possible');
  assert.equal(jobs[0].pay, null);
  assert.equal(jobs[0].sourceKind, 'public_api');
});

test('Remote OK ignores legal metadata and normalizes listing dates', () => {
  const jobs = normalizeRemoteOk([
    { legal: 'API jobs are provided by Remote OK', epoch: 0 },
    { id: '123', position: 'Spanish Ads Specialist', company: 'Gamma', location: 'Worldwide', url: 'https://remoteok.com/remote-jobs/123', description: 'Meta Ads', epoch: 1792373400, tags: ['Marketing'] },
  ], props);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].postedAt, now);
  assert.equal(jobs[0].source, 'Remote OK');
});

test('Remote OK removes the exact Danish-speaking Sofia ad but retains broad remote marketing', () => {
  const jobs = normalizeRemoteOk([
    { legal: 'API jobs are provided by Remote OK' },
    { id: '1137431', position: 'Danish Speaking Solutions Consultant Work Sofia Bulgaria',
      company: 'Mercier Consultancy Group', location: 'Remote',
      description: 'Native or fluent Danish (spoken and written). Valid EU passport (mandatory). Social media marketing and campaign expertise.',
      url: 'https://remoteok.com/remote-jobs/remote-danish-speaking-solutions-consultant-work-sofia-bulgaria-mercier-consultancy-group-1137431', tags: ['Marketing'] },
    { id: '1137432', position: 'Social Media Marketing Specialist', company: 'Broad Agency',
      description: 'Build social media campaigns for Danish-speaking audiences. Applicants anywhere.',
      location: 'Worldwide', url: 'https://remoteok.com/remote-jobs/1137432', tags: ['Marketing'] },
  ], { ...props, languages: { es: 'native', en: 'unverified', ko: 'beginner' } });
  assert.deepEqual(jobs.map((j) => j.company), ['Broad Agency']);
});

test('long French Arbeitnow description excludes Europe-only role and does not revive truncated legacy history', () => {
  const title = 'Freelance Acquisition Paid Media (Google Ads, Meta Ads)';
  const url = 'https://www.arbeitnow.com/jobs/companies/trustt/freelance-acquisition-paid-media-google-ads-meta-ads-berlin-11498';
  const description = `${'Nous recherchons un partenaire pour gérer des campagnes Google Ads et Meta Ads. '.repeat(30)}` +
    `Conditions : 100 % à distance, depuis l'Europe : nous travaillons sur le fuseau de Paris.`;
  const excludedUrls = [];
  const rows = normalizeArbeitnow({ data: [{
    slug: 'trustt-11498', company_name: 'Trustt', remote: true, location: 'Berlin', title, url, description,
  }] }, { ...props, onExcluded: ({ url: omitted }) => excludedUrls.push(omitted) });
  assert.equal(rows.length, 0);
  assert.deepEqual(excludedUrls, [url]);
  const legacy = { id: 'arbeitnow:old', title, source: 'Arbeitnow', company: 'Trustt',
    market: 'online', category: 'advertising', url, location: 'Berlin',
    description: description.slice(0, 1800), lastSeenAt: '2026-10-18T00:00:00.000Z' };
  const merged = mergeHistoricalFeed({ updatedAt: now, jobs: [], sourceStatus: [{ source: 'Arbeitnow', status: 'ok' }] },
    { jobs: [legacy] }, { excludedUrls });
  assert.deepEqual(merged.jobs, []);
});

test('Arbeitnow remote headquarters location does not get mistaken for applicant geo restriction', () => {
  const jobs = normalizeArbeitnow({ data: [
    { slug: 'x', title: 'Marketing Coordinator', company_name: 'D', remote: true, location: 'Berlin, Germany', url: 'https://www.arbeitnow.com/view/x', created_at: 1792373400 },
    { slug: 'y', title: 'Marketing Coordinator', company_name: 'D', remote: false, location: 'Berlin', url: 'https://www.arbeitnow.com/view/y' },
    { slug: 'z', title: 'Online Marketing Manager', company_name: 'D', remote: true, location: 'Berlin', url: 'https://www.arbeitnow.com/view/z', description: 'Ausschließlich Kandidat:innen mit Wohnsitz in Deutschland oder Österreich.', created_at: 1792373400 },
    { slug: 'w', title: 'Content Creator', company_name: 'D', remote: true, location: 'Berlin', url: 'https://www.arbeitnow.com/view/w', description: 'Wir suchen jemanden in Hamburg, der das übernimmt. 4-5 feste Drehtage im Monat bei meinen Kunden in Hamburg und Umgebung.', created_at: 1792373400 },
    { slug: 'german-language', title: 'Google Ads Manager', company_name: 'Simplyright', remote: true, location: 'Monheim am Rhein', url: 'https://www.arbeitnow.com/view/german-language', description: 'Wir suchen Dich für unser Team. Deine Aufgaben sind Google Ads und Kampagnensteuerung. Unsere Anforderungen: Deutschkenntnisse, mindestens zwei Jahre Berufserfahrung, sehr gute schriftliche und mündliche Kommunikation. Wir bieten flexible Arbeitszeiten und Homeoffice.', created_at: 1792373400 },
  ] }, props);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].eligibilityStatus, 'unknown');
  assert.equal(jobs[0].workplaceMode, 'remote');
  assert.equal(requiresPhysicalAttendance('4-5 feste Drehtage im Monat bei meinen Kunden in Hamburg'), true);
});

test('actual feed adapters exclude non-profile language roles without losing Spanish or general marketing', () => {
  const jobs = normalizeJobicy({ jobs: [
    { id: 1, jobTitle: 'Hebrew Freelance Translator', companyName: 'A', jobGeo: 'Worldwide', url: 'https://jobicy.com/jobs/1' },
    { id: 2, jobTitle: 'English to Burmese (Myanmar) Linguist', companyName: 'B', jobGeo: 'Worldwide', url: 'https://jobicy.com/jobs/2' },
    { id: 3, jobTitle: 'Spanish Translator', companyName: 'C', jobGeo: 'Worldwide', url: 'https://jobicy.com/jobs/3' },
    { id: 4, jobTitle: 'English Content Writer', companyName: 'D', jobGeo: 'Worldwide', url: 'https://jobicy.com/jobs/4' },
    { id: 5, jobTitle: 'Digital Marketing Specialist', companyName: 'E', jobGeo: 'Worldwide', url: 'https://jobicy.com/jobs/5',
      jobDescription: 'Marketing campaigns for French brands. French preferred, English experience helpful.' },
    { id: 6, jobTitle: 'Marketing Manager', companyName: 'F', jobGeo: 'Worldwide', url: 'https://jobicy.com/jobs/6',
      jobDescription: 'We need a marketing manager based in Latin America.' },
  ] }, { ...props, languages: { es: 'native', ko: 'beginner', en: 'unverified' } });
  assert.deepEqual(jobs.map((j) => j.company), ['C', 'D', 'E']);
});

test('manual leads demand valid https URLs and cannot add online interpreting', () => {
  const { valid, invalid } = normalizeManual({ jobs: [
    { title: 'Spanish Translator', company: 'A', url: 'https://example.com/job/4', market: 'online' },
    { title: 'Spanish Interpreter', company: 'B', url: 'https://example.com/job/5', market: 'online' },
    { title: '스페인어 통역사', company: 'C', url: 'https://example.com/job/6', market: 'offline', location: '전주' },
    { title: 'Marketing Specialist', company: 'C', url: 'file:///etc/passwd', market: 'online' },
  ] }, now);
  assert.equal(valid.length, 2);
  assert.equal(invalid, 2);
  assert.equal(valid[1].category, 'interpreting');
  assert.equal(valid[1].market, 'offline');
  assert.ok(valid[0].id.startsWith('manual-'));
});

test('dedupe normalizes tracking URLs and duplicate company-role-location', () => {
  const rows = [
    { id: '1', url: 'https://example.com/a?utm_source=one', title: 'Ads Manager', company: 'Acme', location: 'Worldwide' },
    { id: '2', url: 'https://example.com/a?utm_source=two', title: 'Ads Manager', company: 'Acme', location: 'Worldwide' },
    { id: '3', url: 'https://example.org/b', title: 'Ads Manager', company: 'Acme', location: 'Worldwide' },
    { id: '4', url: 'https://example.com/c', title: 'Content Writer', company: 'Acme', location: 'Worldwide' },
  ];
  assert.deepEqual(dedupeJobs(rows).map((r) => r.id), ['1', '4']);
});

test('historical jobs remain visible when an upstream feed no longer returns them', () => {
  const earlier = '2026-10-01T00:00:00.000Z';
  const next = '2026-10-19T00:00:00.000Z';
  const oldJob = { id: 'remotive:1', source: 'Remotive', sourceKind: 'public_api', url: 'https://remotive.com/jobs/1',
    title: 'Marketing Analyst', company: 'A', location: 'Worldwide', verifiedAt: earlier,
    market: 'online', collectionState: 'seen' };
  const recent = { id: 'remotive:2', source: 'Remotive', sourceKind: 'public_api', url: 'https://remotive.com/jobs/2',
    title: 'Content Writer', company: 'B', location: 'Worldwide', verifiedAt: next, market: 'online' };
  const updated = mergeHistoricalFeed({ updatedAt: next, jobs: [recent], sourceStatus: [{ source: 'Remotive', status: 'ok' }] },
    { updatedAt: earlier, jobs: [oldJob] });
  assert.equal(updated.jobs.length, 2);
  assert.equal(updated.jobs[0].collectionState, 'seen');
  assert.equal(updated.jobs[1].collectionState, 'not_seen');
  assert.equal(updated.jobs[1].lastSeenAt, earlier);
  // Legacy records without a firstSeenAt must not invent one from last verification.
  assert.equal(updated.jobs[1].firstSeenAt, null);
  assert.match(updated.historyPolicy.meaning, /모집 종료를 뜻하지 않음/);
});

test('failed or partially refreshed source never mislabels missing jobs as closed or not_seen', () => {
  const earlier = '2026-10-01T00:00:00.000Z';
  const next = '2026-10-19T00:00:00.000Z';
  const oldJob = { id: 'jobicy:1', source: 'Jobicy', url: 'https://jobicy.com/jobs/1',
    title: 'Spanish Translator', company: 'C', location: 'Remote', verifiedAt: earlier };
  for (const state of ['error', 'partial', 'disabled', 'not_configured']) {
    const refreshed = mergeHistoricalFeed({ updatedAt: next, jobs: [], sourceStatus: [{ source: 'Jobicy', status: state }] },
      { updatedAt: earlier, jobs: [oldJob] });
    assert.equal(refreshed.jobs[0].collectionState, 'unverified', state);
    assert.equal(refreshed.jobs[0].lastSeenAt, earlier, state);
  }
  const prevNotSeen = { ...oldJob, collectionState: 'not_seen', lastSeenAt: earlier };
  assert.equal(mergeHistoricalFeed({ updatedAt: next, jobs: [], sourceStatus: [{ source: 'Jobicy', status: 'error' }] },
    { jobs: [prevNotSeen], updatedAt: earlier }).jobs[0].collectionState, 'not_seen');
});

test('historical records expire after configured retention and use bounded record limits', () => {
  const next = '2026-10-19T00:00:00.000Z';
  const old = [1, 2, 3].map((id) => ({ id: `x${id}`, source: 'Jobicy', url: `https://jobicy.com/jobs/${id}`,
    title: `Marketing Manager ${id}`, company: 'Firm', location: 'Remote', lastSeenAt: `2026-10-0${id}T00:00:00.000Z` }));
  old.push({ id: 'too-old', source: 'Jobicy', url: 'https://jobicy.com/jobs/4', title: 'SEO Manager',
    company: 'Firm', location: 'Remote', lastSeenAt: '2026-07-01T00:00:00.000Z' });
  const result = mergeHistoricalFeed({ updatedAt: next, jobs: [], sourceStatus: [{ source: 'Jobicy', status: 'ok' }] },
    { jobs: old }, { retentionDays: 30, maxItems: 2 });
  assert.equal(result.jobs.length, 2);
  assert.deepEqual(result.jobs.map((j) => j.id), ['x3', 'x2']);
});

test('history gate removes previously misclassified overseas on-site jobs instead of keeping misleading remote leads', () => {
  const old = { id: 'arbeitnow:1', title: 'Content Creator', company: 'Studio', source: 'Arbeitnow',
    market: 'online', category: 'content', workplaceMode: 'remote',
    description: '4-5 feste Drehtage im Monat bei Kunden in Hamburg',
    url: 'https://www.arbeitnow.com/view/studio', location: 'Berlin',
    lastSeenAt: '2026-10-01T00:00:00.000Z' };
  const feed = mergeHistoricalFeed({ updatedAt: now, jobs: [], sourceStatus: [{ source: 'Arbeitnow', status: 'ok' }] }, { jobs: [old] });
  assert.equal(feed.jobs.length, 0);
});

test('history gate removes old ineligible listings while keeping legitimate previous leads', () => {
  const past = (id, title, source, description, location = 'Worldwide') => ({
    id, title, source, description, location, company: id,
    category: 'translation', market: 'online', url: `https://example.com/jobs/${id}`,
    lastSeenAt: '2026-10-18T00:00:00.000Z',
  });
  const previous = { jobs: [
    past('he', 'Hebrew Freelance Translator', 'Jobicy', ''),
    past('my', 'English to Burmese Linguist', 'Jobicy', ''),
    past('de', 'Online Marketing Manager', 'Arbeitnow', 'Kandidat:innen mit Wohnsitz in Deutschland oder Österreich.', 'Berlin'),
    past('latam', 'Spanish Marketing Manager', 'Jobicy', 'We need a manager based in Latin America.'),
    past('es', 'Spanish Translator', 'Jobicy', ''),
  ] };
  const feed = mergeHistoricalFeed({ updatedAt: now, jobs: [], sourceStatus: [{ source: 'Jobicy', status: 'ok' }, { source: 'Arbeitnow', status: 'ok' }] }, previous);
  assert.deepEqual(feed.jobs.map((j) => j.id), ['es']);
});

test('explicitly passed deadlines remove new and historical jobs; absence alone never implies expiry', () => {
  const current = '2026-10-23T12:00:00.000Z';
  const sample = (id, deadline, sourceKind = 'public_api') => ({
    id, title: 'Content Marketing Coordinator', company: id, source: 'Jobicy',
    url: `https://example.org/jobs/${id}`, category: 'marketing', market: 'online',
    location: 'Anywhere', description: 'English content marketing role',
    deadline, sourceKind, lastSeenAt: '2026-10-22T00:00:00.000Z'
  });
  const old = sample('old', '2026-10-22');
  const today = sample('today', '2026-10-23');
  const unknown = sample('unknown', null);
  const manual = sample('manual', '2026-10-22', 'manual');
  const timed = { ...sample('timed', '2026-10-23T10:30:00Z'), deadlineHasTime: true };
  const later = { ...sample('later', '2026-10-23T18:10:00Z'), deadlineHasTime: true };
  const next = mergeHistoricalFeed({ updatedAt: current, jobs: [old, today, unknown, manual, timed, later],
    sourceStatus: [{ source: 'Jobicy', status: 'ok' }] }, { jobs: [old, today, unknown] });
  assert.deepEqual(next.jobs.map((job) => job.id), ['today', 'unknown', 'manual', 'later']);
  const historical = mergeHistoricalFeed({ updatedAt: current, jobs: [],
    sourceStatus: [{ source: 'Jobicy', status: 'ok' }] }, { jobs: [old, today, unknown] });
  assert.deepEqual(historical.jobs.map((job) => job.id), ['today', 'unknown']);
  assert.ok(historical.jobs.every((job) => job.collectionState === 'not_seen'));
});

test('same prior ID updates firstSeenAt and lastSeenAt on refresh', () => {
  const prior = { id: 'a', url: 'https://example.com/a', company: 'Co', title: 'Marketing Manager',
    location: 'Anywhere', source: 'Jobicy', lastSeenAt: '2026-10-01T00:00:00.000Z', firstSeenAt: '2026-09-01T00:00:00.000Z' };
  const next = { ...prior, lastSeenAt: undefined, firstSeenAt: undefined };
  const merged = mergeHistoricalFeed({ updatedAt: now, jobs: [next], sourceStatus: [{ source: 'Jobicy', status: 'ok' }] },
    { jobs: [prior] });
  assert.equal(merged.jobs.length, 1);
  assert.equal(merged.jobs[0].firstSeenAt, '2026-09-01T00:00:00.000Z');
  assert.equal(merged.jobs[0].lastSeenAt, now);
  assert.equal(merged.jobs[0].collectionState, 'seen');
});

test('official ATS status can mark an absent Korean employer posting as not_seen', () => {
  const earlier = '2026-10-01T00:00:00.000Z';
  const old = { id: 'greenhouse:krafton:1', source: 'KRAFTON (공식 채용)', title: '광고 전문가',
    company: 'KRAFTON', location: '서울', url: 'https://boards.greenhouse.io/krafton/jobs/1', lastSeenAt: earlier };
  const updated = mergeHistoricalFeed({ updatedAt: now, jobs: [], sourceStatus: [{ source: 'KRAFTON', status: 'ok' }] },
    { jobs: [old] });
  assert.equal(updated.jobs[0].collectionState, 'not_seen');
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'job-radar-'));
  await mkdir(join(root, 'config'), { recursive: true });
  await writeFile(join(root, 'config/profile.json'), JSON.stringify({ homeCountry: 'KR', collectors: { korea: true }, manualFile: 'config/manual-jobs.json' }));
  return root;
}

function fakeFetch(url) {
  const href = String(url);
  if (href.includes('remotive.com')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ jobs: [
    { id: 2, title: 'Marketing Specialist', company_name: 'SourceCo', url: 'https://remotive.com/remote-jobs/2', candidate_required_location: 'Worldwide', description: 'Social marketing and ads', publication_date: now },
  ] }) });
  if (href.includes('jobicy.com')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, jobs: [] }) });
  if (href.includes('remoteok.com')) return Promise.reject(new Error('simulated outage'));
  if (href.includes('arbeitnow.com')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [] }) });
  throw new Error(`Unexpected URL ${href}`);
}

test('buildFeed merges online, Korean offline, manual and source statuses without Upwork fake listings', async (t) => {
  const root = await setup();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'config/manual-jobs.json'), JSON.stringify({ jobs: [
    { title: 'Marketing Specialist', company: 'ManualCo', url: 'https://example.com/saved', market: 'online' },
  ] }));
  const koreaCollector = async () => ({ jobs: [
    { id: 'work24:x', source: '고용24', title: '스페인어 마케팅', company: '전주기업', url: 'https://www.work24.go.kr/job/x', market: 'offline', category: 'marketing', workplaceMode: 'onsite', location: '전주시' },
    { id: 'work24:y', source: '고용24', title: '온라인 통역사', company: '인터프리터', url: 'https://www.work24.go.kr/job/y', market: 'online', category: 'interpreting', workplaceMode: 'remote', location: 'Remote' },
  ], sourceStatus: [{ source: '고용24', status: 'partial', detail: '8/9 requests', count: 2 }] });
  const koreaAtsCollector = async () => ({ jobs: [
    { id: 'greenhouse:krafton:7', source: 'KRAFTON (공식 채용)', title: '스페인어 마케팅', company: 'KRAFTON', url: 'https://boards.greenhouse.io/krafton/jobs/7', market: 'offline', category: 'marketing', workplaceMode: 'onsite', location: '서울' },
    { id: 'greenhouse:krafton:8', source: 'KRAFTON (공식 채용)', title: '원격 통역', company: 'KRAFTON', url: 'https://boards.greenhouse.io/krafton/jobs/8', market: 'online', category: 'interpreting', workplaceMode: 'remote', location: '서울' },
  ], sourceStatus: [{ source: 'KRAFTON', status: 'ok', count: 2, detail: 'official ATS checked' }] });
  const { feed, successfulRequests } = await buildFeed({ root, fetchImpl: fakeFetch, koreaCollector, koreaAtsCollector, now });
  assert.equal(feed.jobs.length, 4);
  assert.equal(feed.jobs.filter((x) => x.market === 'offline').length, 2);
  assert.equal(feed.jobs.filter((x) => x.market === 'online').length, 2);
  assert.ok(successfulRequests > 0);
  assert.equal(feed.sourceStatus.find((s) => s.source === 'Remote OK').status, 'error');
  assert.equal(feed.sourceStatus.find((s) => s.source === '고용24').status, 'partial');
  assert.equal(feed.sourceStatus.find((s) => s.source === 'KRAFTON').status, 'ok');
  assert.equal(feed.sourceStatus.find((s) => s.source === 'Upwork').status, 'manual');
  assert.deepEqual(
    [feed.sourceStatus.find((s) => s.source === 'KOWORK').status, feed.sourceStatus.find((s) => s.source === 'KOWORK').count,
      feed.sourceStatus.find((s) => s.source === 'KOWORK').url],
    ['manual', 0, 'https://kowork.kr/en'],
  );
  assert.equal(feed.jobs.filter((x) => x.source === 'Upwork').length, 0);
  assert.equal(feed.jobs.filter((x) => x.source === 'KOWORK').length, 0);
});

test('Upwork manual searches are linked research queries, never scraped listings', async (t) => {
  const root = await setup();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'config/profile.json'), JSON.stringify({
    homeCountry: 'KR', collectors: {}, manualFile: 'config/manual-jobs.json',
    upworkSearches: [
      { label: 'Spanish jobs', url: 'https://www.upwork.com/nx/search/jobs/?q=spanish' },
      { label: 'Untrusted', url: 'https://fake-upwork.com/nx/search/jobs/' },
    ],
  }));
  const { feed } = await buildFeed({ root, fetchImpl: fakeFetch, now,
    koreaCollector: async () => ({ jobs: [], sourceStatus: [{ source: '고용24', status: 'not_configured', count: 0 }] }),
    koreaAtsCollector: async () => ({ jobs: [], sourceStatus: [{ source: 'KRAFTON', status: 'error', count: 0 }] }) });
  assert.deepEqual(feed.sourceStatus.find((s) => s.source === 'Upwork').manualSearches.map((x) => x.label), ['Spanish jobs']);
  assert.ok(feed.jobs.every((j) => j.source !== 'Upwork'));
});

test('preserves last successfully written file if all upstream services fail', async (t) => {
  const root = await setup();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'public'));
  const previous = '{"updatedAt":"old","jobs":[{"id":"saved"}],"sourceStatus":[]}\n';
  await writeFile(join(root, 'public/jobs.json'), previous);
  const failed = await run({ root, now, fetchImpl: async () => { throw Error('offline'); },
    koreaCollector: async () => ({ jobs: [], sourceStatus: [{ source: '고용24', status: 'not_configured', count: 0, detail: 'Missing key' }] }) });
  assert.equal(failed.written, false);
  assert.equal(await readFile(join(root, 'public/jobs.json'), 'utf8'), previous);
});

test('upstream outage still applies curated additions, edits and withdrawals while preserving historical jobs', async (t) => {
  const root = await setup();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'public'));
  const existing = {
    updatedAt: '2026-10-18T00:00:00.000Z', sourceStatus: [], jobs: [
      { id: 'remotive:old', source: 'Remotive', sourceKind: 'public_listing',
        url: 'https://remotive.com/remote-jobs/old', title: 'Marketing Specialist',
        company: 'EarlierCo', location: 'Worldwide', market: 'online', category: 'marketing',
        lastSeenAt: '2026-10-18T00:00:00.000Z' },
      { id: 'kowork:old', source: 'KOWORK', sourceKind: 'public_listing_index',
        url: 'https://kowork.kr/en/post/7655', title: 'Marketing Specialist',
        company: 'WithdrawnCo', location: 'Seoul', market: 'offline', category: 'marketing',
        lastSeenAt: '2026-10-18T00:00:00.000Z' },
    ],
  };
  await writeFile(join(root, 'public/jobs.json'), JSON.stringify(existing));
  const curated = {
    source: 'Hanultari', url: 'https://mcfamily.or.kr/en/jobs/opening/14881',
    title: 'Spanish Content Marketing Coordinator', company: 'Chingu Mobile',
    market: 'offline', workplaceMode: 'onsite', location: 'Geumcheon-gu, Seoul',
    category: 'marketing', reviewedAt: '2026-10-19T00:00:00Z', deadline: '2026-11-06',
    languageRequirements: 'Spanish required', essentialRequirements: 'Spanish communication required',
    researchSummary: 'Spanish content and customer outreach.',
  };
  const withdrawn = { source: 'KOWORK', url: 'https://kowork.kr/en/post/7655', withdrawnFromRadar: true };
  const researchFile = join(root, 'config/research-jobs.json');
  await writeFile(researchFile, JSON.stringify({ jobs: [curated, withdrawn] }));
  const offline = { root, now, fetchImpl: async () => { throw Error('offline'); },
    koreaCollector: async () => ({ jobs: [], successfulRequests: 0, sourceStatus: [] }),
    koreaAtsCollector: async () => ({ jobs: [], successfulRequests: 0, sourceStatus: [] }) };

  const first = await run(offline);
  assert.equal(first.written, true);
  assert.deepEqual(first.feed.jobs.map((job) => job.company).sort(), ['Chingu Mobile', 'EarlierCo']);
  const snapshot = await readFile(join(root, 'public/jobs.json'), 'utf8');
  assert.equal((await run(offline)).written, false, 'unchanged curated data must not rewrite during an outage');
  assert.equal(await readFile(join(root, 'public/jobs.json'), 'utf8'), snapshot);

  await writeFile(researchFile, JSON.stringify({ jobs: [
    { ...curated, title: 'Spanish Social Media Coordinator' }, withdrawn,
  ] }));
  const edited = await run(offline);
  assert.equal(edited.written, true);
  assert.equal(edited.feed.jobs.find((job) => job.sourceKind === 'curated_research')?.title,
    'Spanish Social Media Coordinator');
  assert.ok(edited.feed.jobs.some((job) => job.company === 'EarlierCo'));
});

test('tombstone alone is persisted when upstream sources are unavailable', async (t) => {
  const root = await setup();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'public'));
  await writeFile(join(root, 'public/jobs.json'), JSON.stringify({ updatedAt: now, sourceStatus: [],
    jobs: [{ id: 'kowork:old', source: 'KOWORK', url: 'https://kowork.kr/en/post/7655' }] }));
  await writeFile(join(root, 'config/research-jobs.json'), JSON.stringify({ jobs: [
    { source: 'KOWORK', url: 'https://kowork.kr/en/post/7655', withdrawnFromRadar: true },
  ] }));
  const result = await run({ root, now, fetchImpl: async () => { throw Error('offline'); },
    koreaCollector: async () => ({ jobs: [], successfulRequests: 0, sourceStatus: [] }),
    koreaAtsCollector: async () => ({ jobs: [], successfulRequests: 0, sourceStatus: [] }) });
  assert.equal(result.written, true);
  assert.equal(result.feed.jobs.length, 0);
  assert.equal(JSON.parse(await readFile(join(root, 'public/jobs.json'), 'utf8')).jobs.length, 0);
});

test('writes a valid atomic snapshot when at least one source succeeds', async (t) => {
  const root = await setup();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await run({ root, now, fetchImpl: fakeFetch,
    koreaCollector: async () => ({ jobs: [], sourceStatus: [{ source: '고용24', status: 'not_configured', count: 0, detail: 'Missing key' }] }) });
  assert.equal(result.written, true);
  const snap = JSON.parse(await readFile(join(root, 'public/jobs.json'), 'utf8'));
  assert.equal(snap.updatedAt, now);
  assert.equal(snap.jobs.length, 1);
  assert.equal(snap.jobs[0].source, 'Remotive');
});
