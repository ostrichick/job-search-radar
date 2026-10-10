import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fetchJson, fetchText, runSources } from './network.mjs';
import { atomicWriteJson, withFileLock, singleFlight } from './file-storage.mjs';
import { collectJobs, normalizeJob } from './collect-jobs.mjs';
import { validateBackup, mergeStorageChanges } from '../public/backup-rules.js';
import jobsHandler from '../api/jobs.mjs';
import refreshHandler from '../api/refresh.mjs';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'job-radar-runtime-'));
const target = path.join(directory, 'jobs.json');
let active = 0, peak = 0;
const server = http.createServer(async (req, res) => {
  if (req.url === '/headers') return;
  if (req.url === '/body') { res.writeHead(200); res.write('{'); return; }
  active++; peak = Math.max(peak, active); await delay(25); active--;
  res.writeHead(200); res.end('{"ok":true}');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
try {
  for (const endpoint of ['/headers', '/body']) {
    const [outcome] = await runSources([['hung', () => fetchJson(url + endpoint)]], { requestTimeoutMs: 40, sourceTimeoutMs: 200 });
    assert.equal(outcome.timedOut, true, `request must time out during ${endpoint}`);
  }
  const pool = await runSources([['pool', () => Promise.all(Array.from({ length: 7 }, () => fetchText(url + '/ok')))]], { sourceTimeoutMs: 1000 });
  assert.equal(pool[0].error, undefined); assert.equal(peak, 2, 'per-host concurrency is bounded');
  const outcomes = await runSources([['hang', () => new Promise(() => {})], ['ok', async () => 'kept'], ['late', async () => { await delay(80); return 'ignored'; }]], { sourceTimeoutMs: 30, concurrency: 2 });
  assert.equal(outcomes[0].timedOut, true); assert.equal(outcomes[1].result, 'kept'); assert.equal(outcomes[2].result, undefined);
  const total = await runSources(Array.from({ length: 5 }, (_, i) => [String(i), () => new Promise(() => {})]), { sourceTimeoutMs: 200, totalTimeoutMs: 35, concurrency: 2 });
  assert.ok(total.every((r) => r.timedOut));
  let calls = 0;
  const first = singleFlight('test-flight', async () => { calls++; await delay(20); return 1; });
  assert.strictEqual(singleFlight('test-flight', () => { throw new Error('duplicate'); }), first);
  await first; assert.equal(calls, 1);
  await assert.rejects(singleFlight('test-flight', () => Promise.reject(new Error('failure'))));
  assert.equal(await singleFlight('test-flight', () => 2), 2);

  await atomicWriteJson(target, { old: true });
  await assert.rejects(atomicWriteJson(target, { new: true }, { beforeRename: () => { throw new Error('disk failure'); } }));
  assert.deepEqual(JSON.parse(await fs.readFile(target, 'utf8')), { old: true });
  assert.equal((await fs.readdir(directory)).filter((x) => x.endsWith('.tmp')).length, 0);
  await withFileLock(target, async () => { await assert.rejects(withFileLock(target, () => {}), { code: 'collection_busy' }); });
  await fs.writeFile(target + '.lock', '{bad');
  await assert.rejects(withFileLock(target, () => {}), { code: 'collection_busy' });
  assert.equal(await fs.readFile(target + '.lock', 'utf8'), '{bad');
  await fs.unlink(target + '.lock');
  // A real second process must observe the lock, independently of singleFlight.
  const moduleUrl = new URL('./file-storage.mjs', import.meta.url).href;
  await withFileLock(target, async () => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', `import { withFileLock } from ${JSON.stringify(moduleUrl)}; try { await withFileLock(${JSON.stringify(target)},()=>{}); process.exitCode=1; } catch(e) { process.exitCode=e.code==='collection_busy'?0:2; }`], { stdio: 'pipe' });
    assert.equal(await new Promise((resolve) => child.once('exit', resolve)), 0);
  });
  const departed = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  await new Promise((resolve) => departed.once('exit', resolve));
  await fs.writeFile(target + '.lock', JSON.stringify({ pid: departed.pid, host: os.hostname(), token: 'dead-owner' }));
  const reclaimed = await Promise.allSettled([
    withFileLock(target, async () => { await delay(30); return 'reclaimed'; }),
    withFileLock(target, async () => { await delay(30); return 'reclaimed'; })
  ]);
  assert.equal(reclaimed.filter((r) => r.status === 'fulfilled').length, 1, 'only one process may reclaim ownership');
  assert.equal(reclaimed.filter((r) => r.status === 'rejected').length, 1);

  assert.throws(() => validateBackup({ schema: 'job-search-radar-state', version: 2, manualJobs: [{ id: 'bad', title: 'Bad', url: 'https://example.com', tags: {} }] }), /manualJobs\[0\].tags/);
  assert.throws(() => validateBackup({ schema: 'job-search-radar-state', version: 2, manualJobs: [{ id: 'bad', title: 'Bad', url: 'javascript:alert(1)' }] }), /url/);
  const before = { jobFavorites: '["a"]', jobStates: '{"a":"applied"}' };
  const latest = { ...before, jobFavorites: '["a","b"]' };
  const merged = mergeStorageChanges(latest, before, { jobFavorites: '[]', jobStates: '{"a":""}' });
  assert.deepEqual(JSON.parse(merged.jobFavorites), ['b']); assert.equal(JSON.parse(merged.jobStates).a, '');
  assert.equal(JSON.parse(mergeStorageChanges(latest, before, { ...before, jobStates: '{"a":"planned"}' }, 'import').jobStates).a, 'applied');

  const RealDate = Date, now = Date.parse('2026-10-10T09:00:00Z');
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  try {
    const adapters = ['Welo Global', 'RWS TrainAI', 'Jobicy'].map((source, i) => [source, async () => {
      await delay((3 - i) * 15);
      return [normalizeJob({ id: `test:${i}`, source, company: `Company ${i}`, title: 'Korean AI Data Annotator', location: 'South Korea', remote: true, url: `https://example.com/${i}`, description: 'Korean AI data evaluation', postedAt: '2026-10-09T00:00:00Z' })];
    }]);
    const options = { includeManual: false, persist: false, previousFeed: { jobs: [] }, sourceAdapters: adapters, outputPath: target };
    const start = performance.now(); const sequential = await collectJobs({ ...options, networkOptions: { concurrency: 1 } }); const sequentialMs = performance.now() - start;
    const parallelStart = performance.now(); const parallel = await collectJobs(options); const parallelMs = performance.now() - parallelStart;
    assert.deepEqual(parallel.jobs, sequential.jobs); assert.deepEqual(parallel.sourceMetrics, sequential.sourceMetrics);
    assert.deepEqual(parallel.recommendationSummary, sequential.recommendationSummary);
    const persistent = { ...options, persist: true };
    const a = collectJobs(persistent), b = collectJobs({ ...persistent, previousFeed: structuredClone(persistent.previousFeed) }); assert.strictEqual(a, b); await a;
    assert.ok(Array.isArray(JSON.parse(await fs.readFile(target, 'utf8')).jobs));
    const failed = await collectJobs({ ...options, previousFeed: parallel, sourceAdapters: [['Welo Global', () => new Promise(() => {})], ...adapters.slice(1)], networkOptions: { sourceTimeoutMs: 25 } });
    assert.equal(failed.sourceStatus[0].timedOut, true);
    assert.ok(failed.jobs.some((job) => job.source === 'Welo Global' && job.listingStatus === 'source_error'));
    console.log(`Controlled source benchmark: sequential=${Math.round(sequentialMs)}ms parallel=${Math.round(parallelMs)}ms (3 delayed fixture sources; not live performance)`);
  } finally { globalThis.Date = RealDate; }
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('offline API fixture'); };
    const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(value) { this.payload = value; return this; } });
    for (const [handler, method] of [[jobsHandler, 'GET'], [refreshHandler, 'POST']]) {
      const invalid = response(); await handler({ method: 'DELETE' }, invalid); assert.equal(invalid.code, 405); assert.equal(invalid.headers.Allow, method);
      const valid = response(); await handler({ method }, valid);
      assert.equal(valid.code, 200, JSON.stringify(valid.payload));
      assert.ok(valid.payload.jobs.length > 0, 'API outage retains the shipped baseline');
      assert.ok(valid.payload.sourceStatus.every((s) => !s.ok && !s.error.includes('is not defined')));
    }
  } finally { globalThis.fetch = originalFetch; }
  console.log('runtime, storage merge, backup and collection integration tests passed');
} finally {
  server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
  await fs.rm(directory, { recursive: true, force: true });
}
