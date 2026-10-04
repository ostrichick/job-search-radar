import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['index.html', 'app.js', 'styles.css', 'state-rules.js']) {
  const [source, deployed] = await Promise.all([
    fs.readFile(path.join(root, 'public', name), 'utf8'),
    fs.readFile(path.join(root, 'docs', name), 'utf8')
  ]);
  assert.equal(deployed, source, `docs/${name} must exactly match public/${name}`);
}
console.log('Pages UI is synchronized with public source');
