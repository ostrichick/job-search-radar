import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const docsDir = path.join(root, 'docs');

await fs.mkdir(docsDir, { recursive: true });
for (const name of ['index.html', 'app.js', 'styles.css', 'state-rules.js']) {
  await fs.copyFile(path.join(publicDir, name), path.join(docsDir, name));
}
await fs.writeFile(path.join(docsDir, '.nojekyll'), '', 'utf8');
console.log('Pages UI mirror synchronized without refreshing the job feed');
