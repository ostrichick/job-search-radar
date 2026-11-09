import test from 'node:test';
import assert from 'node:assert/strict';
import { collectKoworkJobs, parseKoworkDetail, parseKoworkListing } from '../scripts/collect-kowork.mjs';

const html = (id, title, company, qualifications, extras = '') => '<html><head><meta property="og:title" content="' +
  title + '"/></head><body><h1>' + title + '</h1> ' + company +
  ' Job Type Temporary Job Category Marketing/Ads Work Model Hybrid Working Days Mon, Tue, Wed ' +
  'Work Time 09:00 Salary Negotiable Location Hanam-si, Gyeonggi-do, Republic of Korea Copy Address Save Share ' +
  'Job Detail Company Info Current Residence Korea residents only Required Languages Spanish Fluent ' +
  'Preferred Languages Korean Fluent Job Description Assist with e-commerce marketing. ' +
  'Qualifications ' + qualifications + ' Preferred Nice to have, not required: Korean communication. ' +
  extras + ' Benefits Insurance</body></html>';

test('KOWORK SSR listing parser extracts direct links, not full scraped descriptions', () => {
  const listing = '<html><a id="post-list-post-card-7322" href="/en/post/7322">' +
    '<p>E-commerce Marketing Intern</p><p>Estar</p><p>Marketing/Ads</p><p>Hanam-si</p></a>' +
    '<a id="post-list-post-card-42" href="/en/post/42"><p>Manufacturing</p><p>Test</p><p>Manufacturing</p></a></html>';
  const result = parseKoworkListing(listing);
  assert.equal(result.length, 2);
  assert.equal(result[0].url, 'https://kowork.kr/en/post/7322');
  assert.equal(result[0].company, 'Estar');
});

test('public KOWORK detail parser extracts qualification section and does not confuse preferred Korean with required', () => {
  const detail = parseKoworkDetail(
    html('7322', 'E-commerce Marketing Intern', 'Estar Corp', 'Native Spanish. One year of social media experience.'),
    'https://kowork.kr/en/post/7322');
  assert.equal(detail.title, 'E-commerce Marketing Intern');
  assert.equal(detail.company, 'Estar Corp');
  assert.equal(detail.location.includes('Hanam-si'), true);
  assert.equal(detail.qualification.includes('Native Spanish'), true);
  assert.equal(detail.qualification.includes('Nice to have'), false);
  assert.equal(parseKoworkDetail('<html>Not found</html>', 'https://kowork.kr/api/unknown'), null);
  const duplicateTitle = '<html><head><meta property="og:title" content="Marketing Intern"/></head>' +
    '<body>Marketing Intern Jobs For Foreigners In Korea Career Booster ' +
    '<h1>Marketing Intern</h1> Estar Corp Job Type Temporary Job Category Marketing/Ads ' +
    'Work Model On-site Location Seoul Copy Address Qualifications Spanish required Preferred Korean preferred</body></html>';
  assert.equal(parseKoworkDetail(duplicateTitle, 'https://kowork.kr/en/post/7322').company, 'Estar Corp');
});

test('one lightweight KOWORK index and two explicit details filter 5-year and mandatory high Korean', async () => {
  const listing = '<html><a id="post-list-post-card-7322" href="/en/post/7322">' +
    '<p>E-commerce Marketing Intern</p><p>Estar</p><p>Marketing/Ads</p></a></html>';
  const seen = [];
  const urls = ['7322', '7244', '5036'];
  const entries = {
    '7322': html('7322', 'E-commerce Marketing Intern', 'Estar Corp',
      'Native Spanish, strong written Spanish. Entry-level applicants welcome.'),
    '7244': html('7244', 'Spanish Marketer', 'Demo Co',
      'Business Korean conversation required. Interview is conducted in Korean.'),
    '5036': html('5036', 'Marketing Producer', 'Media Co',
      'Applicants must have at least 5 years of professional marketing experience.'),
  };
  const mock = async (url) => {
    seen.push(url);
    const value = url.endsWith('/en') ? listing : entries[url.split('/').pop()];
    if (!value) throw new Error('no fixture route');
    return { ok: true, text: async () => value };
  };
  const collected = await collectKoworkJobs({ fetchImpl: mock,
    now: '2026-10-19T00:00:00Z', delayMs: 0, maxDetails: 3, seeds: urls });
  assert.equal(seen.length, 4);
  assert.equal(collected.jobs.length, 1);
  assert.equal(collected.jobs[0].title, 'E-commerce Marketing Intern');
  assert.equal(collected.jobs[0].source, 'KOWORK');
  assert.equal(collected.jobs[0].commuteClass, 'relocation');
  assert.equal(collected.jobs[0].description.includes('Native Spanish'), false);
  assert.equal(collected.excludedUrls.length, 2);
  assert.equal(collected.sourceStatus[0].status, 'ok');
});

test('zero unexpected detail requests on public page failure', async () => {
  let total = 0;
  const result = await collectKoworkJobs({ fetchImpl: async () => {
    total++;
    return { ok: false, status: 403 };
  } });
  assert.equal(result.jobs.length, 0);
  assert.equal(result.sourceStatus[0].status, 'error');
  assert.equal(total, 1);
});

test('KOWORK detail extracts structured metadata, expiry and visa/residence fields', () => {
  const metadata = '<html><head><meta property="og:title" content="Spanish Content Marketer"/></head><body>' +
    '<h1>Spanish Content Marketer</h1> Demo Studio Job Type Full-time Job Category Marketing/Ads ' +
    'Work Model Hybrid Working Days Mon-Fri Work Time 09:00-18:00 Salary KRW 3,000,000 ' +
    'Location Seoul, Republic of Korea Copy Address Save Share Job Detail Current Residence Korea residents only ' +
    'Required Languages Spanish Fluent Preferred Languages Korean Intermediate Required Visas F-2, F-4, F-6 ' +
    'Preferred Visas F-6 Job Description Full copyrighted description. Qualifications One year of experience. ' +
    'Expire on 2026-12-31 Benefits Insurance</body></html>';
  const detail = parseKoworkDetail(metadata, 'https://kowork.kr/en/post/9001', '2026-10-19T00:00:00Z');
  assert.equal(detail.jobType, 'Full-time');
  assert.equal(detail.salary, 'KRW 3,000,000');
  assert.equal(detail.deadline, '2026-12-31');
  assert.equal(detail.currentResidence, 'Korea residents only');
  assert.equal(detail.requiredLanguages, 'Spanish Fluent');
  assert.equal(detail.preferredLanguages, 'Korean Intermediate');
  assert.equal(detail.requiredVisas, 'F-2, F-4, F-6');
  assert.equal(detail.closed, false);

  const expired = parseKoworkDetail(
    metadata.replace('Expire on 2026-12-31', 'Expired position. Expire on 2026-01-01'),
    'https://kowork.kr/en/post/9001', '2026-10-19T00:00:00Z');
  assert.equal(expired.deadline, '2026-01-01');
  assert.equal(expired.closed, true);
});

test('KOWORK collected jobs keep non-copying metadata and exclude expired detail pages', async () => {
  const listing = '<html><a id="post-list-post-card-9001" href="/en/post/9001">' +
    '<p>Spanish Content Marketer</p><p>Demo Studio</p><p>Marketing/Ads</p></a></html>';
  const current = '<html><head><meta property="og:title" content="Spanish Content Marketer"/></head><body>' +
    '<h1>Spanish Content Marketer</h1> Demo Studio Job Type Full-time Job Category Marketing/Ads ' +
    'Work Model Hybrid Salary KRW 3,000,000 Location Seoul Copy Address Current Residence Korea residents only ' +
    'Required Languages Spanish Fluent Preferred Languages Korean Intermediate Required Visas F-2, F-4, F-6 ' +
    'Qualifications One year of experience. Expire on 2026-12-31 Benefits Insurance</body></html>';
  const expired = current.replace('Expire on 2026-12-31', 'Expired position.');
  let detailCalls = 0;
  const mock = async (url) => {
    if (url.endsWith('/en')) return { ok: true, text: async () => listing };
    detailCalls++;
    return { ok: true, text: async () => detailCalls === 1 ? current : expired };
  };
  const collected = await collectKoworkJobs({ fetchImpl: mock, now: '2026-10-19T00:00:00Z',
    delayMs: 0, maxDetails: 2, seeds: ['9001', '9002'] });
  assert.equal(collected.jobs.length, 1);
  const job = collected.jobs[0];
  assert.equal(job.deadline, '2026-12-31');
  assert.equal(job.pay, 'KRW 3,000,000');
  assert.match(job.description, /Current residence: Korea residents only/);
  assert.match(job.description, /Required visas: F-2, F-4, F-6/);
  assert.doesNotMatch(job.description, /Full copyrighted description/);
  assert.match(job.languageRequirements, /Preferred: Korean Intermediate/);
  assert.equal(job.eligibilityStatus, 'possible');
  assert.equal(collected.excludedUrls.length, 1);
});
