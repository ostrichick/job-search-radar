// Deterministic same-feed comparison of the previous committed matching/sort
// implementation against the proposed code. The only snapshots read are the
// checked-in JSON files. No application, profile, or browser state is written.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createFilterRules } from '../public/munseong/filter-rules.js';
import { createSortRules } from '../public/munseong/sort-rules.js';
import { adaptNicoleFeed, isNicoleReviewCandidate } from '../public/munseong/nicole-feed.js';
import { evaluateProfileFit } from '../public/munseong/profile-fit.js';
import { hasRoleFitEvidence } from '../public/munseong/recommendation-rules.js';

const oldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-ranking-audit-'));
const previousCodeRef = '6d7f4a6'; // immutable reference before recommendation-quality work
const hid = (id) => createHash('sha256').update(String(id)).digest('hex').slice(0, 12);
function summarize({ who, market, jobs, visible, profileFit }) {
  const top = visible.slice(0, 20);
  const fit = { high: 0, check: 0, fail: 0 };
  for (const job of top) fit[profileFit(job).status]++;
  return {
    who, market, raw: jobs.length, visible: visible.length, topN: top.length,
    topCurrent: top.filter((job) => job.collectionState === 'seen').length,
    topHistorical: top.filter((job) => job.collectionState === 'not_seen').length,
    topExplicitlyRestricted: top.filter((job) => job.eligibilityCode === 'restricted' || job.eligibilityStatus === 'restricted').length,
    topFit: fit, topIds: top.map((job) => hid(job.id))
  };
}
function evaluate({ old, modules, isNicole, market, feed }) {
  const jobs = isNicole ? modules.adaptNicoleFeed(feed).jobs : feed.jobs;
  const state = {
    jobs, jobStates: {}, hiddenIds: new Set(), reviewedIds: new Set(), favorites: new Set(),
    newIds: new Set(), hiddenCompanies: new Set(), hiddenSources: new Set(), marketTab: market
  };
  const profileFit = (job) => modules.evaluateProfileFit(job, { isNicole });
  const base = {
    query: '', source: '', category: '', remote: '', eligibility: isNicole ? '' : 'likely',
    domesticProvince: '', domesticLocality: '', compensationFilter: '', ageFilter: '',
    listingFilter: isNicole ? 'all' : 'active', sourceKindFilter: '', paymentFilter: '',
    requirementsFilter: '', minScore: isNicole ? '0' : '20', includeAllFits: '',
    sort: isNicole ? 'fit' : 'score', statusFilter: 'active', teachingOnly: '',
    commuteFilter: 'all', archiveFilter: 'all'
  };
  const domestic = {
    ...base, eligibility: '', remote: isNicole ? '' : 'local',
    domesticProvince: isNicole ? '' : '전북특별자치도',
    domesticLocality: isNicole ? '' : '전주·완주',
    minScore: isNicole || !old ? '0' : '20', sort: isNicole ? 'fit' : 'distance'
  };
  const defaults = { overseas_remote: base, domestic };
  const values = defaults[market];
  const { matchingJobs } = createFilterRules({
    state, currentFilterValues: () => values, filterDefaults: defaults,
    jobMarketScopes: (job) => job.marketScopes?.length ? job.marketScopes : [job.marketSegment || 'overseas_remote'],
    salaryLabel: (job) => job.salary || job.pay || '',
    domesticLocalityMatches: (region, v) => !v || (v === '전주·완주' ? ['전주시', '완주군'].includes(region?.city) : [region?.city, region?.locality, region?.district].includes(v)),
    compensationMatches: () => true, paymentEvidenceState: () => 'unknown',
    roleFitEvidenceFor: (job) => hasRoleFitEvidence(job, Number(feed.recommendationPolicyVersion || 0)),
    profileFit, isNicole, isNicoleReviewCandidate: modules.isNicoleReviewCandidate
  });
  const { filteredJobs } = modules.createSortRules({
    state, currentFilterValues: () => values, matchingJobs,
    distanceSummary: () => null, distanceSortBand: () => Infinity,
    deadlinePriority: () => 0,
    salarySummary: (job) => ({ hasAmount: Boolean(job.salaryInfo?.min || job.salary), value: job.salary || job.pay || '금액 미공개' }),
    profileFit, isNicole
  });
  return summarize({ who: isNicole ? 'nicole' : 'munseong', market, jobs, visible: filteredJobs(), profileFit });
}
try {
  // Save previous source modules in a unique temporary path, never touching
  // tracked or untracked project assets or relying on the current HEAD SHA.
  fs.writeFileSync(path.join(oldDir, 'package.json'), '{"type":"module"}');
  for (const file of ['sort-rules.js', 'profile-fit.js', 'nicole-feed.js', 'backup-rules.js', 'state-rules.js']) {
    fs.writeFileSync(path.join(oldDir, file), cp.execFileSync('git', ['show', `${previousCodeRef}:public/munseong/${file}`], { encoding: 'utf8', maxBuffer: 1024 * 1024 }));
  }
  const prev = async (name) => import(pathToFileURL(path.join(oldDir, name)).href);
  const [oldSort, oldFit, oldNicole] = await Promise.all([prev('sort-rules.js'), prev('profile-fit.js'), prev('nicole-feed.js')]);
  const prior = { createSortRules: oldSort.createSortRules, evaluateProfileFit: oldFit.evaluateProfileFit,
    adaptNicoleFeed: oldNicole.adaptNicoleFeed, isNicoleReviewCandidate: oldNicole.isNicoleReviewCandidate };
  const current = { createSortRules, evaluateProfileFit, adaptNicoleFeed, isNicoleReviewCandidate };
  const inputs = [
    { isNicole: false, feed: JSON.parse(fs.readFileSync('docs/jobs.json', 'utf8')) },
    { isNicole: true, feed: JSON.parse(fs.readFileSync('profiles/dubu/public/jobs.json', 'utf8')) }
  ];
  const rows = [];
  for (const { isNicole, feed } of inputs) for (const market of ['overseas_remote', 'domestic']) {
    const before = evaluate({ old: true, modules: prior, isNicole, market, feed });
    const after = evaluate({ old: false, modules: current, isNicole, market, feed });
    rows.push({ who: before.who, market, raw: before.raw, prior: before, after,
      addedTop: after.topIds.filter((id) => !before.topIds.includes(id)),
      displacedTop: before.topIds.filter((id) => !after.topIds.includes(id)) });
  }
  console.log(JSON.stringify({ method: 'same current feeds; immutable pre-change code ref and proposed working tree', baselineRef: previousCodeRef,
    limitations: 'Simulated default-state filters with no personal saves/hides; domestic geographic ordering uses a fixed distance placeholder; counts and Nicole fit-sort are more meaningful than domestic top-order',
    inputDates: inputs.map((item) => ({ who: item.isNicole ? 'nicole' : 'munseong', updatedAt: item.feed.updatedAt, jobCount: item.feed.jobs.length })), rows }, null, 2));
} finally {
  // Only remove the unique OS-temporary folder created by this script.
  fs.rmSync(oldDir, { recursive: true, force: true });
}
