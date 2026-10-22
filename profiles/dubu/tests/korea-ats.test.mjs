import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeAtsJob, collectKoreanAtsJobs } from '../scripts/collect-korea-ats.mjs';

const job = (overrides = {}) => ({ id: 1234, title: 'Spanish Localization Marketing Specialist',
  location: { name: 'Seoul, South Korea' }, absolute_url: 'https://boards.greenhouse.io/krafton/jobs/1234',
  first_published: '2026-10-16T00:00:00Z', content: '<b>Spanish</b> advertising analysis', ...overrides });

test('official Korean ATS postings carry nationwide relocation classification', () => {
  const a = normalizeAtsJob(job(), { board: 'krafton', source: 'KRAFTON', company: 'KRAFTON' });
  assert.equal(a.market, 'offline');
  assert.equal(a.commuteClass, 'relocation');
  assert.equal(a.province, '서울특별시');
  assert.equal(a.category, 'translation');
  assert.equal(a.id, 'greenhouse:krafton:1234');
  assert.equal(normalizeAtsJob(job({ title: 'Site Reliability Engineer' }), { board: 'krafton', company: 'KRAFTON' }), null);
  assert.equal(normalizeAtsJob(job({ location: { name: 'Tokyo, Japan' } }), { board: 'krafton', company: 'KRAFTON' }), null);
  assert.equal(normalizeAtsJob(job({ absolute_url: 'https://attacker.example/jobs/1234' }), { board: 'krafton', company: 'KRAFTON' }), null);
});

test('supplemental company discovery records success and failures separately', async () => {
  let calls = 0;
  const res = await collectKoreanAtsJobs({ fetchImpl: async () => {
    calls++;
    if (calls === 2) throw new Error('offline network');
    return { ok: true, json: async () => ({ jobs: [job()] }) };
  } });
  assert.equal(res.jobs.length, 1);
  assert.equal(res.sourceStatus.length, 2);
  assert.equal(res.sourceStatus[1].status, 'error');
});
