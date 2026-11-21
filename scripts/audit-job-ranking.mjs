// Reproducible, read-only ranking diagnostic over the repository's current feeds.
// No personal browser state or externally verified employment claims are used.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createFilterRules } from '../public/munseong/filter-rules.js';
import { createSortRules } from '../public/munseong/sort-rules.js';
import { adaptNicoleFeed, isNicoleReviewCandidate } from '../public/munseong/nicole-feed.js';
import { evaluateProfileFit } from '../public/munseong/profile-fit.js';
import { hasRoleFitEvidence } from '../public/munseong/recommendation-rules.js';

const compactId = (id) => createHash('sha256').update(String(id)).digest('hex').slice(0, 12);
const manual = process.argv.includes('--details');
const compact = process.argv.includes('--compact');
const feeds = [
  { who: 'munseong', raw: JSON.parse(fs.readFileSync('docs/jobs.json', 'utf8')), isNicole: false },
  { who: 'nicole', raw: adaptNicoleFeed(JSON.parse(fs.readFileSync('profiles/dubu/public/jobs.json', 'utf8'))), isNicole: true }
];
const outputs = [];
for (const { who, raw, isNicole } of feeds) {
  const policy = Number(raw.recommendationPolicyVersion || 0);
  const profileFit = (job) => evaluateProfileFit(job, { isNicole });
  const base = {
    query: '', source: '', category: '', remote: '', eligibility: isNicole ? '' : 'likely',
    domesticProvince: '', domesticLocality: '', compensationFilter: '', ageFilter: '',
    listingFilter: isNicole ? 'all' : 'active', sourceKindFilter: '', paymentFilter: '',
    requirementsFilter: '', minScore: isNicole ? '0' : '20', includeAllFits: '',
    sort: isNicole ? 'fit' : 'score', statusFilter: 'active', teachingOnly: '',
    commuteFilter: 'all', archiveFilter: 'all'
  };
  const state = {
    jobs: raw.jobs, jobStates: {}, hiddenIds: new Set(), reviewedIds: new Set(),
    favorites: new Set(), newIds: new Set(), marketTab: 'overseas_remote'
  };
  let current = base;
  const defaults = { overseas_remote: base, domestic: { ...base, eligibility: '', remote: isNicole ? '' : 'local', domesticProvince: isNicole ? '' : '전북특별자치도', domesticLocality: isNicole ? '' : '전주·완주', minScore: '0', sort: isNicole ? 'fit' : 'distance' } };
  const { matchingJobs } = createFilterRules({
    state, currentFilterValues: () => current, filterDefaults: defaults,
    jobMarketScopes: (j) => j.marketScopes?.length ? j.marketScopes : [j.marketSegment || 'overseas_remote'],
    salaryLabel: (j) => j.salary || j.pay || '',
    domesticLocalityMatches: (region, val) => !val || (val === '전주·완주' ? ['전주시', '완주군'].includes(region?.city) : [region?.city, region?.locality, region?.district].includes(val)),
    compensationMatches: () => true, paymentEvidenceState: () => 'unknown',
    roleFitEvidenceFor: (job) => hasRoleFitEvidence(job, policy),
    profileFit, isNicole, isNicoleReviewCandidate
  });
  const { filteredJobs } = createSortRules({
    state, currentFilterValues: () => current, matchingJobs,
    distanceSummary: () => null, distanceSortBand: () => Infinity,
    deadlinePriority: () => 0, salarySummary: (j) => ({ hasAmount: Boolean(j.salaryInfo?.min || j.salary), value: j.salary || j.pay || '금액 미공개' }),
    profileFit, isNicole
  });
  for (const market of ['overseas_remote', 'domestic']) {
    state.marketTab = market;
    current = defaults[market];
    const visible = filteredJobs();
    const first = visible.slice(0, 20);
    const statusCounts = (arr) => arr.reduce((acc, j) => { const v = profileFit(j).status; acc[v] = (acc[v] || 0) + 1; return acc; }, {});
    const skipped = raw.jobs.filter((j) => (j.marketScopes || [j.marketSegment]).includes(market) && !visible.some((x) => x.id === j.id));
    const summary = {
      who, market, rawInMarket: raw.jobs.filter((j) => (j.marketScopes || [j.marketSegment]).includes(market)).length,
      defaultVisible: visible.length, topN: first.length,
      topFitStatus: statusCounts(first), unseenFitStatus: statusCounts(skipped),
      topHistorical: first.filter((j) => j.collectionState === 'not_seen').length,
      topCurrent: first.filter((j) => j.collectionState === 'seen').length,
      topIds: first.map((j) => compactId(j.id)),
      topRows: first.map((j, rank) => ({ rank: rank + 1, id: compactId(j.id), fit: profileFit(j).status, fitScore: profileFit(j).score, score: j.score, state: j.collectionState || '', listing: j.listingStatus, eligibility: j.eligibilityCode, source: j.source }))
    };
    outputs.push(summary);
    if (manual) {
      console.log(`\n${who} ${market} visible=${visible.length}`);
      for (const [index, j] of first.entries()) console.log(JSON.stringify({ rank: index + 1, id: compactId(j.id), title: j.title, fit: profileFit(j).status, fitScore: profileFit(j).score, score: j.score, state: j.collectionState, eligibility: j.eligibilityCode, source: j.source, location: j.location }));
      console.log('omitted sample:', skipped.filter((j) => profileFit(j).status !== 'fail').slice(0, 12).map((j) => ({ id: compactId(j.id), title: j.title, source: j.source, fit: profileFit(j).status, score: j.score, reason: j.listingStatus })));
    }
  }
}
if (compact) for (const value of outputs) {
  console.log(`${value.who} ${value.market} visible=${value.defaultVisible} topN=${value.topN} current=${value.topCurrent} historical=${value.topHistorical} fit=${JSON.stringify(value.topFitStatus)} topIds=${value.topIds.join(',')}`);
} else console.log(JSON.stringify({ analysis: 'rule-derived only; not ground truth or actual application eligibility', outputs }, null, manual ? 0 : 2));
