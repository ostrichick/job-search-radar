import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const checkedFiles = [];
for (const directory of ['public/munseong', 'public/nicole', 'public/household', 'scripts', 'profiles/dubu/scripts']) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:mjs|js)$/.test(entry.name)) continue;
    const file = `${directory}/${entry.name}`;
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
    checkedFiles.push(file);
  }
}
// A module that imports a file missing from the repo passes --check locally
// but breaks every fresh checkout (CI/Pages). Fail closed on unresolvable
// relative imports instead of shipping a blank dashboard.
const specifierPattern = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
for (const file of checkedFiles) {
  const source = await fs.readFile(file, 'utf8');
  for (const match of source.matchAll(specifierPattern)) {
    const specifier = match[1] || match[2];
    if (!specifier.startsWith('.')) continue;
    const candidates = [specifier, `${specifier}.js`, `${specifier}.mjs`, `${specifier}/index.js`];
    let resolved = false;
    for (const candidate of candidates) {
      try {
        await fs.access(path.normalize(path.join(path.dirname(file), candidate)));
        resolved = true;
        break;
      } catch { /* try next candidate */ }
    }
    if (!resolved) {
      console.error(`${file} imports missing file: ${specifier}`);
      process.exit(1);
    }
  }
}
console.log('all JavaScript modules passed syntax checks');
