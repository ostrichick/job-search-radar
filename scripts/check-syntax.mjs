import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

for (const directory of ['public', 'scripts', 'api']) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:mjs|js)$/.test(entry.name)) continue;
    const result = spawnSync(process.execPath, ['--check', `${directory}/${entry.name}`], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('all JavaScript modules passed syntax checks');
