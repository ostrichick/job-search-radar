import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'jobs.json'), 'utf8'));
const localSources = new Set(['알바몬', '알바천국', '잡코리아', '사람인']);
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

function runValidator(feed, name) {
  const file = path.join(tempDir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(feed));
  return spawnSync(process.execPath, [validator, file], { cwd: root, encoding: 'utf8' });
}

function expectRejected(name, mutate, message) {
  const feed = saraminFeed();
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

  console.log('feed validator tests passed');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
