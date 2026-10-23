import assert from 'node:assert/strict';
import { convertNicoleState } from '../public/munseong/nicole-migration.js';

const doc = {
  saved: ['job-a', 'manual:one'], hidden: { jobs: ['job-b'], companies: ['  Example   Client '], sources: [' UPWORK '] },
  manual: [{ id: 'manual:one', title: 'My lead', url: 'https://www.upwork.com/jobs/123', market: 'online',
    category: 'translation', company: 'Example Client', description: 'Text', savedAt: '2026-10-22T00:00:00Z' }], revision: 7
};
const immutable = JSON.stringify(doc);
const converted = convertNicoleState(doc);
assert.deepEqual(JSON.parse(converted.jobFavorites), ['job-a', 'manual:one']);
assert.deepEqual(JSON.parse(converted.jobHidden), ['job-b']);
assert.deepEqual(JSON.parse(converted.jobHiddenCompanies), ['example client']);
assert.deepEqual(JSON.parse(converted.jobHiddenSources), ['upwork']);
const [manual] = JSON.parse(converted.manualJobs);
assert.equal(manual.id, 'manual:one');
assert.equal(manual.source, 'Upwork');
assert.deepEqual(manual.marketScopes, ['overseas_remote']);
assert.equal(manual.category, 'translation');
assert.equal(JSON.stringify(doc), immutable, 'state conversion must not mutate original');
assert.throws(() => convertNicoleState({ ...doc, hidden: { jobs: [], companies: [], sources: null } }), /unexpected format/);
assert.throws(() => convertNicoleState({ ...doc, manual: [{ ...doc.manual[0], url: 'javascript:bad' }] }), /invalid/);
console.log('Nicole state conversion tests passed');
