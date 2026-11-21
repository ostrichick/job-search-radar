import assert from 'node:assert/strict';
import { workKind, workKindLabel } from '../public/munseong/work-kind.js';

for (const [type, kind] of [
  ['정규직', 'permanent'], ['Full Time', 'full_time'], ['계약직', 'contract'],
  ['Temporary/Contract', 'contract'], ['Contractor', 'freelance'],
  ['Freelance', 'freelance'], ['아르바이트', 'part_time'],
  ['Part Time', 'part_time'], ['정규직, 계약직', 'mixed']
]) assert.equal(workKind({ type }), kind, type);
assert.equal(workKind({ type: 'Contractor', title: 'Conversations in Korean (Paid Data Task, Remote, Contract)' }), 'task');
assert.equal(workKind({ type: '', title: '일회성 한국어 녹음 데이터 과업' }), 'task');
assert.equal(workKind({ type: '', title: 'Freelance SEO Specialist (Korean)' }), 'freelance');
assert.equal(workKind({ type: '', title: 'Part-Time Video Editor' }), 'part_time');
assert.equal(workKind({ type: '계약직 (정규직 전환 가능)' }), 'contract');
assert.equal(workKind({ type: '정규직 우대' }), 'unknown');
assert.equal(workKind({ type: '정규직, 아르바이트' }), 'mixed');
assert.equal(workKind({ type: '정규직', title: '일회성 행사 기획 담당' }), 'permanent');
assert.equal(workKind({ type: '', title: 'Korean AI Trainer', salaryInfo: { period: 'hour' } }), 'unknown',
  'hourly pay must not be misclassified as part-time work');
assert.equal(workKindLabel({ type: 'Full Time' }), '상근(계약형태 확인)');
assert.equal(workKindLabel({ type: 'Freelance' }, true), 'Freelance');
console.log('distinct employment types and no unwarranted permanent/part-time assumptions passed');
