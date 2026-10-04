import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectJobs } from './collect-jobs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const docsDir = path.join(root, 'docs');

await fs.mkdir(docsDir, { recursive: true });
for (const name of ['index.html', 'app.js', 'styles.css']) {
  await fs.copyFile(path.join(publicDir, name), path.join(docsDir, name));
}

const payload = await collectJobs({ includeManual: false, persist: false });
await fs.writeFile(path.join(docsDir, 'jobs.json'), `${JSON.stringify(payload)}\n`, 'utf8');
await fs.writeFile(path.join(docsDir, '.nojekyll'), '', 'utf8');
console.log(`GitHub Pages build complete: ${payload.jobs.length} jobs`);
