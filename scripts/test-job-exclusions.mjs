import assert from 'node:assert/strict';
import { isShortTermHourlyJob } from './job-exclusions.mjs';

assert.equal(isShortTermHourlyJob({ title: '카페 주말 아르바이트', type: '아르바이트', source: '알바몬', salaryInfo: { period: 'hour' } }), true);
assert.equal(isShortTermHourlyJob({ title: '단기 물류센터', type: '계약직', source: '사람인', workPeriod: '1개월', salaryInfo: { period: 'hour' } }), true);
assert.equal(isShortTermHourlyJob({ title: '전주시 기간제근로자 채용', type: '기간제', source: '전주시 공공기관', salaryInfo: { period: 'month' } }), false);
assert.equal(isShortTermHourlyJob({ title: 'AI Korean Evaluator', type: 'Freelance', source: 'Himalayas', salaryInfo: { period: 'hour' } }), false);
assert.equal(isShortTermHourlyJob({ title: '정규 사무원', type: '정규직', source: '알바몬', salaryInfo: { period: 'month' } }), false);
assert.equal(isShortTermHourlyJob({ title: '단기 프로젝트 사무보조', type: '계약직', source: '사람인', workPeriod: '2개월', salaryInfo: { period: 'month' } }), false);

console.log('short-term hourly exclusion tests passed');
