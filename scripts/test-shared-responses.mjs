import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SHARED_SOURCE_URLS, saveSharedResponse, loadSharedResponse } from './shared-responses.mjs';
import { buildFeed } from '../profiles/dubu/scripts/collect.mjs';
import { fetchJson } from './network.mjs';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shared-responses-'));
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dubu-shared-root-'));
try {
  // Store and reuse success and failure; ignore unshared URLs and other runs.
  await saveSharedResponse(SHARED_SOURCE_URLS.remotive, { body: { jobs: [{ id: 1 }] } }, dir);
  assert.deepEqual(await loadSharedResponse(SHARED_SOURCE_URLS.remotive, dir), { body: { jobs: [{ id: 1 }] } });
  await saveSharedResponse(SHARED_SOURCE_URLS.jobicy, { error: new Error('429 Too Many Requests') }, dir);
  assert.deepEqual(await loadSharedResponse(SHARED_SOURCE_URLS.jobicy, dir), { error: '429 Too Many Requests' });
  assert.equal(await loadSharedResponse(SHARED_SOURCE_URLS.remoteok, dir), null, 'missing record means fetch yourself');
  await saveSharedResponse('https://api.lever.co/v0/postings/x?mode=json', { body: [] }, dir);
  assert.equal(await loadSharedResponse('https://api.lever.co/v0/postings/x?mode=json', dir), null, 'only listed sources are shared');
  assert.equal(await loadSharedResponse(SHARED_SOURCE_URLS.remotive, dir, Date.now() + 2 * 60 * 60 * 1000), null, 'stale records from another run are ignored');
  assert.equal(await loadSharedResponse(SHARED_SOURCE_URLS.remotive, ''), null, 'disabled without a directory');

  // The main collector's network layer records shared responses and failures.
  const writerDir = path.join(dir, 'writer');
  const originalFetch = globalThis.fetch;
  process.env.SHARED_RESPONSE_DIR = writerDir;
  try {
    globalThis.fetch = async (url) => String(url) === SHARED_SOURCE_URLS.remoteok
      ? new Response('{}', { status: 429, statusText: 'Too Many Requests' })
      : Response.json({ jobs: [{ id: 'shared' }] });
    assert.deepEqual(await fetchJson(SHARED_SOURCE_URLS.remotive), { jobs: [{ id: 'shared' }] });
    await assert.rejects(fetchJson(SHARED_SOURCE_URLS.remoteok), /429/);
    assert.deepEqual(await loadSharedResponse(SHARED_SOURCE_URLS.remotive, writerDir), { body: { jobs: [{ id: 'shared' }] } });
    assert.match((await loadSharedResponse(SHARED_SOURCE_URLS.remoteok, writerDir)).error, /^429/);
  } finally { globalThis.fetch = originalFetch; delete process.env.SHARED_RESPONSE_DIR; }

  // The Dubu collector must reuse the shared responses instead of calling the APIs again.
  await fs.mkdir(path.join(root, 'config'), { recursive: true });
  await fs.writeFile(path.join(root, 'config/profile.json'), JSON.stringify({
    homeCountry: 'KR', spokenLanguages: { es: 'native' },
    collectors: { remotive: true, jobicy: true, remoteok: false, arbeitnow: false, koreaAts: false, curatedResearch: false }
  }));
  const calls = [];
  const fetchImpl = async (url) => { calls.push(String(url)); throw new Error('network must not be used for shared sources'); };
  process.env.SHARED_RESPONSE_DIR = dir;
  try {
    const { feed } = await buildFeed({ root, fetchImpl, now: new Date().toISOString() });
    const status = Object.fromEntries(feed.sourceStatus.map((s) => [s.source, s]));
    assert.equal(status.Remotive.status, 'ok', 'shared Remotive response is used');
    assert.ok(!calls.includes(SHARED_SOURCE_URLS.remotive) && !calls.includes(SHARED_SOURCE_URLS.jobicy), 'shared URLs are not fetched again');
    assert.match(status.Jobicy.detail, /shared request failed: 429/, 'a shared failure is reported, not retried');
    assert.ok(calls.every((url) => url.startsWith(`${SHARED_SOURCE_URLS.jobicy}&`)), 'only Dubu-specific Jobicy searches hit the network');
    assert.equal(calls.length, 3);
  } finally { delete process.env.SHARED_RESPONSE_DIR; }
  console.log('shared source responses are reused across collectors');
} finally {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rm(root, { recursive: true, force: true });
}
