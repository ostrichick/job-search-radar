import assert from 'node:assert/strict';
import { mergeWorkflowState, reconcileNewIds } from '../public/munseong/state-rules.js';
import { createFilterRules } from '../public/munseong/filter-rules.js';

assert.equal(mergeWorkflowState('applied', 'planned'), 'applied');
assert.equal(mergeWorkflowState('planned', 'applied'), 'applied');
assert.equal(mergeWorkflowState('', 'planned'), 'planned');
assert.equal(mergeWorkflowState('planned', ''), 'planned');
assert.equal(['planned', 'applied'].reduce((current, incoming) => mergeWorkflowState(current, incoming), ''), 'applied');

const reconciled = reconcileNewIds(new Set(['fresh', 'reviewed', 'gone']), new Set(['reviewed']), new Set(['fresh', 'reviewed']));
assert.deepEqual([...reconciled], ['fresh']);

const filterState = {
  marketTab: 'overseas_remote', jobStates: {}, hiddenIds: new Set(), hiddenCompanies: new Set(), hiddenSources: new Set(),
  jobs: [
    { id: 'fit', market: 'online', title: 'Fit role', company: 'Example', source: 'API', description: '', languageFitStatus: 'match' },
    { id: 'mismatch', market: 'online', title: 'Mismatch role', company: 'Example', source: 'API', description: '', languageFitStatus: 'mismatch' }
  ]
};
const filterValues = {
  query: '', source: '', category: '', remote: '', eligibility: '', statusFilter: 'all', listingFilter: 'active',
  includeAllFits: '', archiveFilter: 'all', minScore: '0'
};
const { matchingJobs } = createFilterRules({
  state: filterState, currentFilterValues: () => filterValues, jobMarketScopes: () => ['overseas_remote'],
  filterDefaults: { overseas_remote: {} }, salaryLabel: () => '', domesticLocalityMatches: () => true,
  compensationMatches: () => true, paymentEvidenceState: () => '', roleFitEvidenceFor: () => true,
  profileFit: (job) => ({ status: job.id === 'mismatch' ? 'fail' : 'high' }), isNicole: true,
  isNicoleReviewCandidate: () => true
});
assert.deepEqual(matchingJobs({ ignore: ['statusFilter', 'minScore'] }).map((job) => job.id), ['fit']);

console.log('state rules tests passed');
