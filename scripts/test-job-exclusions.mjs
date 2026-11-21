import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { collectJobs, normalizeJob } from './collect-jobs.mjs';
import { isGenderRestrictedJob, isShortTermHourlyJob } from './job-exclusions.mjs';

assert.equal(isShortTermHourlyJob({ title: '카페 주말 아르바이트', type: '아르바이트', source: '알바몬', salaryInfo: { period: 'hour' } }), true);
assert.equal(isShortTermHourlyJob({ title: '단기 물류센터', type: '계약직', source: '사람인', workPeriod: '1개월', salaryInfo: { period: 'hour' } }), true);
assert.equal(isShortTermHourlyJob({ title: '전주시 기간제근로자 채용', type: '기간제', source: '전주시 공공기관', salaryInfo: { period: 'month' } }), false);
assert.equal(isShortTermHourlyJob({ title: 'AI Korean Evaluator', type: 'Freelance', source: 'Himalayas', salaryInfo: { period: 'hour' } }), false);
assert.equal(isShortTermHourlyJob({ title: '정규 사무원', type: '정규직', source: '알바몬', salaryInfo: { period: 'month' } }), false);
assert.equal(isShortTermHourlyJob({ title: '단기 프로젝트 사무보조', type: '계약직', source: '사람인', workPeriod: '2개월', salaryInfo: { period: 'month' } }), false);

assert.equal(isGenderRestrictedJob({ title: 'Voice Talent Required - Korean (female) - Remote' }, 'male'), true);
assert.equal(isGenderRestrictedJob({ title: 'Korean AI Data Evaluator' }, 'male'), false);
assert.equal(isGenderRestrictedJob({ title: '남성 보이스 배우 모집' }, 'male'), false);

// The real collector must now retain an otherwise relevant hourly job instead
// of deleting it merely because its title/type contains "알바".
const localOpportunity = normalizeJob({
  id: 'synthetic:hourly', source: '알바몬', company: 'Test Korean AI Studio',
  title: '전주 한국어 AI 데이터 평가 알바',
  description: '한국어 AI 평가 및 Korean data annotation',
  location: '전북특별자치도 전주시', workAddress: '전북특별자치도 전주시',
  countryCode: 'KR', remote: false, workplaceMode: 'onsite', type: '아르바이트',
  salary: '시급 20,000원', url: 'https://www.albamon.com/jobs/detail/123456781',
  postedAt: '2026-11-21T00:00:00Z'
});
assert.equal(isShortTermHourlyJob(localOpportunity), true);
const output = path.join(os.tmpdir(), 'digitalnomad-collector-synthetic-hourly-not-written.json');
const collected = await collectJobs({ includeManual: false, persist: false, previousFeed: { jobs: [] }, outputPath: output,
  sourceAdapters: [['알바몬', async () => [localOpportunity]]] });
assert.ok(collected.jobs.some((job) => job.title === localOpportunity.title),
  'relevant local hourly jobs must survive the publisher-level collector filters');

console.log('short-term inclusion and gender restrictions tests passed');
