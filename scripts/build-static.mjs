import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectJobs } from './collect-jobs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const payload = await collectJobs({ includeManual: false, persist: false });
await fs.writeFile(path.join(root, 'public', 'jobs.json'), `${JSON.stringify(payload)}\n`, 'utf8');
console.log(`Static job feed built: ${payload.jobs.length} jobs`);
