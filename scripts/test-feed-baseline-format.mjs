import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { formatFeedBaseline } from './format-feed-baseline.mjs';

const input = {
  updatedAt: '2026-10-20T09:35:08Z',
  meta: { active: true, nested: ['서울', { count: 2 }] },
  jobs: [
    { id: 'first', listingEvidence: [{ at: '2026-10-20', source: '원문' }], verifiedAt: '2026-10-20' },
    { id: 'second', verificationHistory: [{ at: '2026-10-01' }], score: 30 }
  ]
};
const before = JSON.stringify(input);
const output = formatFeedBaseline(input);
assert.deepEqual(JSON.parse(output), input, 'All fields, Unicode text and ordering remain identical');
assert.equal(JSON.stringify(input), before, 'Formatter must not mutate its input');
assert.match(output, /"listingEvidence": \[\{"at":"2026-10-20","source":"원문"\}\]/);
assert.match(output, /"verificationHistory": \[\{"at":"2026-10-01"\}\]/);
assert.equal(formatFeedBaseline(JSON.parse(output)), output, 'Formatting must be idempotent');
assert.throws(() => formatFeedBaseline({ jobs: [] }), /non-empty/);

const productionBaseline = JSON.parse(await fs.readFile('docs/jobs.json', 'utf8'));
const canonical = formatFeedBaseline(productionBaseline);
assert.deepEqual(JSON.parse(canonical), productionBaseline, 'Existing baseline is semantically unchanged');
assert.equal(formatFeedBaseline(JSON.parse(canonical)), canonical);
console.log(`Feed baseline field-level formatting passed; preserved ${productionBaseline.jobs.length} existing jobs`);
