import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectJobs } from './collect-jobs.mjs';
import { atomicWriteJson } from './file-storage.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name) => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const fixturePath = argument('--fixture');
const output = argument('--output');
if (fixturePath && !output) throw new Error('--fixture requires an explicit --output outside production feeds');
const feedPath = output ? path.resolve(output) : path.join(root, 'public', 'jobs.json');
if (fixturePath && ['public/jobs.json', 'docs/jobs.json', 'data/jobs.json'].some((file) => feedPath === path.join(root, file))) {
  throw new Error('Fixture output cannot overwrite a production feed');
}
let previous = null;
try {
  previous = JSON.parse(await fs.readFile(path.join(root, 'docs', 'jobs.json'), 'utf8'));
} catch {
  try { previous = JSON.parse(await fs.readFile(feedPath, 'utf8')); } catch { previous = null; }
}
const payload = fixturePath ? JSON.parse(await fs.readFile(path.resolve(fixturePath), 'utf8')) : await collectJobs({
  includeManual: false,
  persist: false,
  previousJobs: previous?.jobs || [],
  previousFeed: previous
});
if (!Array.isArray(payload.jobs) || !payload.jobs.length) throw new Error('Invalid static feed');
await atomicWriteJson(feedPath, payload);
console.log(`Static job feed built: ${payload.jobs.length} jobs`);
