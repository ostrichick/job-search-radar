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
const feedPath = path.join(docsDir, 'jobs.json');
let shouldWriteFeed = true;
try {
  const previous = JSON.parse(await fs.readFile(feedPath, 'utf8'));
  const previousComparable = JSON.stringify({ sourceStatus: previous.sourceStatus, jobs: previous.jobs });
  const nextComparable = JSON.stringify({ sourceStatus: payload.sourceStatus, jobs: payload.jobs });
  shouldWriteFeed = previousComparable !== nextComparable;
} catch {
  shouldWriteFeed = true;
}
if (shouldWriteFeed) await fs.writeFile(feedPath, `${JSON.stringify(payload)}\n`, 'utf8');
await fs.writeFile(path.join(docsDir, '.nojekyll'), '', 'utf8');
console.log(`GitHub Pages build complete: ${payload.jobs.length} jobs (${shouldWriteFeed ? 'feed updated' : 'no feed changes'})`);
