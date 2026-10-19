import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { normalizeCuratedLead, collectCuratedLeads } from './curated-research.mjs';
import { normalizeJob, reconcileVerificationHistory } from './collect-jobs.mjs';

const now = '2026-10-19T12:40:00.000Z';
const sample = {
  originalSource: 'Company Careers',
  title: 'Korean AI Evaluation Coordinator',
  company: 'Example Research',
  url: 'https://jobs.example.org/openings/korean-ai-quality',
  location: 'Remote in South Korea',
  countryCode: 'KR',
  workplaceMode: 'remote',
  reviewedAt: '2026-10-19T08:30:00.000Z',
  postedAt: null,
  deadlineDate: null,
  openingStatus: 'unconfirmed',
  researchSummary: 'Review Korean AI responses and check data quality against project rubrics.',
  requirements: 'Native Korean, quality evaluation interest; English proficiency needs individual confirmation.',
  eligibilityNote: 'South Korea residents accepted subject to contract verification.',
  researchNote: 'Original employer page individually inspected; deadline not shown.'
};
const item = normalizeCuratedLead(sample, { now });
assert.ok(item);
assert.equal(item.postedAt, null);
assert.equal(item.researchReviewedAt, sample.reviewedAt);
assert.equal(item.source, 'ChatGPT 수동 조사');
assert.equal(normalizeCuratedLead({ ...sample, reviewedAt: '2026-10-20T08:30:00.000Z' }, { now }), null);
assert.equal(normalizeCuratedLead({ ...sample, url: 'http://localhost/admin' }, { now }), null);
assert.equal(normalizeCuratedLead({ ...sample, originalSource: 'Unidentified platform' }, { now }), null);
assert.equal(normalizeCuratedLead({ ...sample, deadlineDate: '2026-10-18' }, { now }), null);
assert.equal(normalizeCuratedLead({ ...sample, postedAt: '2026-13-40' }, { now }), null);
assert.equal(normalizeCuratedLead({ ...sample, reviewedAt: '2026-09-15T08:30:00.000Z' }, { now }), null);

const work = await fs.mkdtemp(path.join(os.tmpdir(), 'job-radar-curated-'));
try {
  await fs.mkdir(path.join(work, 'config'), { recursive: true });
  await fs.writeFile(path.join(work, 'config/curated-research-jobs.json'), JSON.stringify({ jobs: [
    sample, { ...sample, url: 'https://jobs.example.org/expired', deadlineDate: '2026-10-18' }
  ] }));
  const found = await collectCuratedLeads({ root: work, now });
  assert.equal(found.rawCount, 2);
  assert.equal(found.jobs.length, 1);
  assert.equal(found.rejected, 1);

  const normalized = normalizeJob(found.jobs[0]);
  assert.equal(normalized.sourceKind, 'manual');
  assert.equal(normalized.listingStatus, 'manual');
  assert.equal(normalized.listingBasis, 'manual_original_review');
  assert.equal(normalized.verifiedAt, sample.reviewedAt);
  const first = reconcileVerificationHistory([normalized], [], Date.parse(now))[0];
  assert.equal(first.firstSeenAt, now);
  assert.equal(first.lastSeenAt, now);
  assert.equal(first.lastVerifiedAt, sample.reviewedAt);
  const nextAt = '2026-10-20T04:00:00.000Z';
  const second = reconcileVerificationHistory([normalizeJob(found.jobs[0])], [first], Date.parse(nextAt))[0];
  assert.equal(second.firstSeenAt, now);
  assert.equal(second.lastSeenAt, nextAt);
  assert.equal(second.lastVerifiedAt, sample.reviewedAt);
  assert.equal(second.verificationHistory.length, 1, 'refresh must not add a fake original-page verification');
  const edited = { ...found.jobs[0], description: found.jobs[0].description + ' Updated curation.' };
  const changed = reconcileVerificationHistory([normalizeJob(edited)], [second], Date.parse(nextAt) + 1000)[0];
  assert.equal(changed.lastChangeKind, 'curated_record_changed');
  assert.equal(changed.lastVerifiedAt, sample.reviewedAt);
} finally {
  await fs.rm(work, { recursive: true, force: true });
}
console.log('curated source review dates, exclusion rules, merge history and re-check semantics passed');
