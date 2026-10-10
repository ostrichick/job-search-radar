import { mergeWorkflowState } from './state-rules.js';

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const safeId = (v) => typeof v === 'string' && v.length > 0 && !['__proto__', 'constructor', 'prototype'].includes(v);
function check(ok, path) { if (!ok) throw new Error(`${path}: 잘못된 값 또는 자료형입니다.`); }
export function httpUrl(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}
export function validateJob(job, path = 'job', snapshot = false) {
  check(object(job), path);
  check(typeof job.title === 'string' && job.title.trim(), `${path}.title`);
  check(typeof job.url === 'string' && httpUrl(job.url), `${path}.url`);
  if (!snapshot) check(safeId(job.id), `${path}.id`);
  for (const key of ['company', 'location', 'description', 'source', 'category', 'postedAt']) {
    if (job[key] !== undefined && !(key === 'postedAt' && job[key] === null)) check(typeof job[key] === 'string', `${path}.${key}`);
  }
  for (const key of ['tags', 'matchedKeywords', 'sources', 'legacyIds', 'marketScopes', 'fitReasons', 'fitWarnings', 'applyValueReasons', 'decisionUnknowns', 'alternateUrls', 'compensationNotes']) {
    if (job[key] !== undefined) check(Array.isArray(job[key]) && job[key].every((x) => typeof x === 'string'), `${path}.${key}`);
  }
  for (const key of ['sourceEvidence', 'paymentSignals', 'listingEvidence', 'verificationHistory', 'requirementChecks']) {
    if (job[key] !== undefined) check(Array.isArray(job[key]) && job[key].every(object), `${path}.${key}`);
    for (const [index, item] of (job[key] || []).entries()) {
      for (const field of ['type', 'kind', 'label', 'url', 'checkedAt', 'at', 'event', 'freshness', 'expiresAt', 'latestSourceAt']) {
        if (item[field] !== undefined && item[field] !== null) check(typeof item[field] === 'string', `${path}.${key}[${index}].${field}`);
      }
      if (item.url) check(httpUrl(item.url), `${path}.${key}[${index}].url`);
      if (item.changedFields !== undefined) check(Array.isArray(item.changedFields) && item.changedFields.every((x) => typeof x === 'string'), `${path}.${key}[${index}].changedFields`);
    }
  }
  for (const key of ['salaryInfo', 'domesticRegion']) {
    if (job[key] !== undefined && job[key] !== null) check(object(job[key]), `${path}.${key}`);
  }
  if (job.score !== undefined) check(Number.isFinite(job.score), `${path}.score`);
  if (job.salaryInfo) {
    for (const field of ['raw', 'display', 'currency', 'period', 'confidence', 'scope', 'paymentBasis']) {
      if (job.salaryInfo[field] !== undefined) check(typeof job.salaryInfo[field] === 'string', `${path}.salaryInfo.${field}`);
    }
  }
  return job;
}
export function validateBackup(payload, normalizeManual = (job) => job) {
  check(object(payload) && payload.schema === 'job-search-radar-state' && [1, 2].includes(payload.version), 'backup.schema/version');
  const result = structuredClone(payload);
  for (const key of ['favorites', 'hiddenIds', 'reviewedIds', 'newIds', 'knownJobIds']) {
    if (result[key] !== undefined) check(Array.isArray(result[key]) && result[key].every(safeId), key);
  }
  if (result.jobStates !== undefined) {
    check(object(result.jobStates), 'jobStates');
    for (const [id, v] of Object.entries(result.jobStates)) check(safeId(id) && ['planned', 'applied', ''].includes(v), `jobStates.${id}`);
  }
  if (result.manualJobs !== undefined) {
    check(Array.isArray(result.manualJobs), 'manualJobs');
    result.manualJobs = result.manualJobs.map((job, i) => {
      validateJob(job, `manualJobs[${i}]`);
      return { ...normalizeManual(job), ...job, manual: true };
    });
  }
  if (result.trackedJobs !== undefined) {
    check(object(result.trackedJobs), 'trackedJobs');
    for (const [id, job] of Object.entries(result.trackedJobs)) { check(safeId(id), `trackedJobs.${id}`); validateJob(job, `trackedJobs.${id}`, true); }
  }
  for (const key of ['filters', 'filtersByMarket']) if (result[key] !== undefined) check(object(result[key]), key);
  const filters = result.filtersByMarket ? Object.entries(result.filtersByMarket) : [];
  for (const [market, value] of filters) {
    check(['domestic', 'overseas_remote'].includes(market) && object(value), `filtersByMarket.${market}`);
  }
  for (const [label, value] of [...filters, ...(result.filters ? [['filters', result.filters]] : [])]) {
    for (const [key, v] of Object.entries(value)) check(v === null || ['string', 'number', 'boolean'].includes(typeof v), `${label}.${key}`);
  }
  return result;
}

// Apply only the changes made by this tab to the latest committed document.
// Missing map/set members are explicit removals, rather than an additive union.
export function mergeStorageChanges(latest, before, after, mode = 'edit') {
  const result = { ...latest };
  const sets = new Set(['jobFavorites', 'jobHidden', 'reviewedJobIds', 'jobNewIds', 'knownJobIds', 'jobDismissed']);
  const maps = new Set(['jobStates', 'trackedJobs', 'jobFiltersByMarket']);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] === after[key]) continue;
    if (sets.has(key)) {
      const a = new Set(JSON.parse(before[key] || '[]')), b = new Set(JSON.parse(after[key] || '[]'));
      const current = new Set(JSON.parse(result[key] || '[]'));
      for (const id of a) if (!b.has(id)) current.delete(id);
      for (const id of b) if (!a.has(id)) current.add(id);
      result[key] = JSON.stringify([...current]);
    } else if (maps.has(key) || key === 'manualJobs') {
      const asMap = (raw) => key === 'manualJobs' ? Object.fromEntries(JSON.parse(raw || '[]').map((j) => [j.id, j])) : JSON.parse(raw || '{}');
      const a = asMap(before[key]), b = asMap(after[key]), current = asMap(result[key]);
      for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (JSON.stringify(a[id]) === JSON.stringify(b[id])) continue;
        if (!Object.hasOwn(b, id)) delete current[id];
        else Object.defineProperty(current, id, { value: mode === 'import' && key === 'jobStates' ? mergeWorkflowState(current[id], b[id]) : b[id], enumerable: true, writable: true, configurable: true });
      }
      result[key] = JSON.stringify(key === 'manualJobs' ? Object.values(current) : current);
    } else if (after[key] === undefined) delete result[key];
    else result[key] = after[key];
  }
  if (result.jobNewIds && result.reviewedJobIds) {
    const reviewed = new Set(JSON.parse(result.reviewedJobIds));
    result.jobNewIds = JSON.stringify(JSON.parse(result.jobNewIds).filter((id) => !reviewed.has(id)));
  }
  return result;
}
