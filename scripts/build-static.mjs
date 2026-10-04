import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectJobs } from './collect-jobs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const feedPath = path.join(root, 'public', 'jobs.json');
let previous = null;
try {
  previous = JSON.parse(await fs.readFile(feedPath, 'utf8'));
} catch {
  try { previous = JSON.parse(await fs.readFile(path.join(root, 'docs', 'jobs.json'), 'utf8')); } catch { previous = null; }
}
const payload = await collectJobs({ includeManual: false, persist: false, previousJobs: previous?.jobs || [] });
await fs.writeFile(feedPath, `${JSON.stringify(payload)}\n`, 'utf8');
console.log(`Static job feed built: ${payload.jobs.length} jobs`);
