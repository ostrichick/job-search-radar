import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isDefaultRecommendation as recommendationRule } from '../public/recommendation-rules.js';

const root = process.cwd();
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'jobs.json'), 'utf8'));
const localSources = new Set(['알바몬', '알바천국', '잡코리아', '사람인', '인크루트']);
const templateIndex = baseline.jobs.findIndex((job) =>
  localSources.has(job.source)
  && job.marketScopes?.includes('domestic')
  && job.domesticRegion?.province === '전북특별자치도'
  && ['전주시', '완주군'].includes(job.domesticRegion?.city)
  && !['archived_missing', 'source_error'].includes(job.listingStatus)
);

assert.notEqual(templateIndex, -1, 'tracked feed must contain one active Jeonju/Wanju local-board row for validator regression tests');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-feed-validator-'));
const validator = path.join(root, 'scripts', 'validate-feed.mjs');

function saraminFeed() {
  const feed = structuredClone(baseline);
  const row = feed.jobs[templateIndex];
  row.source = '사람인';
  row.platform = '사람인';
  row.sourcePostingId = '99999999';
  row.sourceKind = 'job_board';
  row.url = 'https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=99999999';
  row.workAddressEvidence = 'detail_html';
  row.remote = false;
  row.workplaceMode = 'onsite';
  row.marketScopes = ['domestic'];
  row.domesticRegion.evidenceLevel = 'source_structured';
  return feed;
}

function incruitFeed() {
  const feed = structuredClone(baseline);
  const row = feed.jobs[templateIndex];
  row.source = '인크루트';
  row.platform = '인크루트';
  row.sourcePostingId = '2609110000252';
  row.sourceKind = 'job_board';
  row.url = 'https://job.incruit.com/jobdb_info/jobpost.asp?job=2609110000252';
  row.workAddress = '전북특별자치도 전주시 완산구 쑥고개로 398-16';
  row.location = row.workAddress;
  row.workAddressEvidence = 'detail_crosschecked';
  row.remote = false;
  row.workplaceMode = 'onsite';
  row.marketScopes = ['domestic'];
  row.domesticRegion = {
    ...(row.domesticRegion || {}),
    country: '대한민국',
    province: '전북특별자치도',
    city: '전주시',
    district: '완산구',
    neighborhood: '',
    precision: 'address',
    evidenceLevel: 'source_structured',
    sourceAddress: row.workAddress
  };
  return feed;
}

function runValidator(feed, name) {
  const file = path.join(tempDir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(feed));
  return spawnSync(process.execPath, [validator, file], { cwd: root, encoding: 'utf8' });
}

function refreshRecommendationSummary(feed) {
  feed.recommendationSummary.count = feed.jobs.filter((job) => recommendationRule(job, feed.recommendationPolicyVersion)).length;
}

function expectRejected(name, mutate, message, makeFeed = saraminFeed) {
  const feed = makeFeed();
  mutate(feed.jobs[templateIndex]);
  const result = runValidator(feed, name);
  assert.notEqual(result.status, 0, `${name} must be rejected by final feed validation`);
  assert.match(`${result.stdout}\n${result.stderr}`, message, `${name} must fail for the expected contract`);
}

try {
  const valid = runValidator(saraminFeed(), 'valid-saramin');
  assert.equal(valid.status, 0, `valid Saramin final-feed row must pass: ${valid.stderr || valid.stdout}`);

  expectRejected('unstable-posting-id', (job) => { job.sourcePostingId = 'saramin-row'; }, /numeric source id/);
  expectRejected('list-only-workplace', (job) => {
    job.workAddressEvidence = 'public_list';
    job.domesticRegion.precision = 'city';
  }, /Saramin workplace evidence must come from the public detail page/);
  expectRejected('outside-target-workplace', (job) => { job.domesticRegion.city = '군산시'; }, /must be in Jeonju or Wanju/);
  expectRejected('remote-local-row', (job) => { job.remote = true; }, /remote boolean must agree with canonical workplaceMode/);
  expectRejected('nationwide-row', (job) => { job.title = `전국 모집 ${job.title}`; }, /nationwide posting must not be retained/);
  expectRejected('wrong-detail-url', (job) => { job.url = 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=99999999'; }, /public source detail page/);

  const validIncruit = runValidator(incruitFeed(), 'valid-incruit');
  assert.equal(validIncruit.status, 0, `valid Incruit final-feed row must pass: ${validIncruit.stderr || validIncruit.stdout}`);
  expectRejected('incruit-uncrosschecked-workplace', (job) => {
    job.workAddressEvidence = 'detail_structured';
  }, /Incruit workplace must be cross-checked/, incruitFeed);
  expectRejected('incruit-non-address-workplace', (job) => {
    job.domesticRegion.precision = 'city';
  }, /Incruit must retain a posting-specific detail address/, incruitFeed);
  expectRejected('incruit-wrong-detail-url', (job) => {
    job.url = 'https://job.incruit.com/jobdb_info/jobpost.asp?job=2609110000252&src=search';
  }, /public source detail page/, incruitFeed);

  const expiredTerminal = saraminFeed();
  expiredTerminal.jobs[templateIndex].score = 0;
  expiredTerminal.jobs[templateIndex].recommendationEligible = false;
  expiredTerminal.jobs[templateIndex].listingStatus = 'expired';
  expiredTerminal.jobs[templateIndex].listingBasis = 'detail_http_terminal';
  expiredTerminal.jobs[templateIndex].listingLabel = '종료 확인';
  expiredTerminal.jobs[templateIndex].listingReason = '공개 상세 페이지가 HTTP 404/410으로 종료 상태를 확인함';
  refreshRecommendationSummary(expiredTerminal);
  const validExpiredTerminal = runValidator(expiredTerminal, 'valid-expired-terminal');
  assert.equal(validExpiredTerminal.status, 0,
    `terminally expired local-board row must be retained without being classified as active noise: ${validExpiredTerminal.stderr || validExpiredTerminal.stdout}`);

  const zeroScoreActive = saraminFeed();
  zeroScoreActive.jobs[templateIndex].score = 0;
  zeroScoreActive.jobs[templateIndex].recommendationEligible = false;
  refreshRecommendationSummary(zeroScoreActive);
  const invalidZeroScoreActive = runValidator(zeroScoreActive, 'invalid-zero-score-active');
  assert.notEqual(invalidZeroScoreActive.status, 0, 'active zero-score intermediary row must still be rejected');
  assert.match(`${invalidZeroScoreActive.stdout}\n${invalidZeroScoreActive.stderr}`, /zero-score collected noise/,
    'active zero-score intermediary row must fail the active-noise contract');

  console.log('feed validator tests passed');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
