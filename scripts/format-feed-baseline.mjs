import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// Preserve every value and the original job order, but show each job field on
// one line. Git can then diff a changed timestamp or evidence field without
// treating all of its nested JSON formatting as changed content.
export function formatFeedBaseline(feed) {
  if (!feed || !Array.isArray(feed.jobs) || feed.jobs.length === 0) {
    throw new Error('Expected a non-empty job feed');
  }
  const normalized = JSON.parse(JSON.stringify(feed));
  const fields = Object.entries(normalized).map(([name, value]) => {
    if (name !== 'jobs') {
      return `  ${JSON.stringify(name)}: ${JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')}`;
    }
    const jobs = value.map((job) => {
      const lines = Object.entries(job).map(([key, data]) => `      ${JSON.stringify(key)}: ${JSON.stringify(data)}`);
      return `    {\n${lines.join(',\n')}\n    }`;
    });
    return `  "jobs": [\n${jobs.join(',\n')}\n  ]`;
  });
  const result = `{\n${fields.join(',\n')}\n}\n`;
  if (JSON.stringify(JSON.parse(result)) !== JSON.stringify(normalized)) {
    throw new Error('Formatting must not change data or array order');
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = path.resolve(process.argv[2] || 'public/jobs.json');
  const destination = path.resolve(process.argv[3] || 'docs/jobs.json');
  const feed = JSON.parse(await fs.readFile(source, 'utf8'));
  const formatted = formatFeedBaseline(feed);
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, formatted, { flag: 'wx' });
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  console.log(`Formatted feed baseline: ${feed.jobs.length} jobs`);
}
