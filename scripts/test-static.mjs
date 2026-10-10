import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'job-radar-static-'));
const output = path.join(temporary, 'jobs.json');
const baseline = await fs.readFile('docs/jobs.json', 'utf8');
const publicBefore = await fs.readFile('public/jobs.json', 'utf8').catch(() => null);
try {
  const vercel = JSON.parse(await fs.readFile('vercel.json', 'utf8'));
  for (const name of (await fs.readdir('public')).filter((name) => name.endsWith('.js'))) {
    assert.ok(vercel.rewrites.some((route) => route.source === `/${name}` && route.destination === `/public/${name}`), `${name} needs a Vercel module route`);
  }
  const build = spawnSync(process.execPath, ['scripts/build-static.mjs', '--fixture', 'docs/jobs.json', '--output', output], { encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);
  assert.deepEqual(JSON.parse(await fs.readFile(output, 'utf8')), JSON.parse(baseline));
  const validate = spawnSync(process.execPath, ['scripts/validate-feed.mjs', output, 'docs/jobs.json'], { encoding: 'utf8' });
  assert.equal(validate.status, 0, validate.stderr);
  const forbidden = spawnSync(process.execPath, ['scripts/build-static.mjs', '--fixture', 'docs/jobs.json', '--output', 'docs/jobs.json'], { encoding: 'utf8' });
  assert.notEqual(forbidden.status, 0);
  assert.equal(await fs.readFile('docs/jobs.json', 'utf8'), baseline);
  assert.equal(await fs.readFile('public/jobs.json', 'utf8').catch(() => null), publicBefore);
  console.log('isolated static build and feed validation passed; production feeds unchanged');
} finally { assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep)); await fs.rm(temporary, { recursive: true, force: true }); }
