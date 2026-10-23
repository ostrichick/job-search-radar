import { createManualJobRules } from './manual-job.js';
import { sourceForManual } from './nicole-feed.js';

const { manualJobRecord } = createManualJobRules({});
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const ids = (value) => Array.isArray(value) && value.every((id) => typeof id === 'string' && id.length && id.length <= 500);
const canonical = (value) => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

export function convertNicoleState(current) {
  if (!isObject(current) || !ids(current.saved) || !isObject(current.hidden) ||
      !['jobs', 'companies', 'sources'].every((key) => ids(current.hidden[key])) || !Array.isArray(current.manual)) {
    throw new Error('The original Nicole state has an unexpected format');
  }
  const manualJobs = current.manual.map((job) => {
    if (!isObject(job) || !job.id?.startsWith('manual:') || typeof job.title !== 'string' ||
        !job.title.trim() || !['online', 'offline'].includes(job.market) || !['http:', 'https:'].includes(new URL(job.url).protocol)) {
      throw new Error('An original manually saved job is invalid');
    }
    const online = job.market === 'online';
    return {
      ...manualJobRecord({
        id: job.id, title: job.title, url: job.url, company: job.company, location: job.location,
        description: job.description, source: sourceForManual(job.url, job.source),
        remote: online, market: online ? 'overseas_remote' : 'domestic'
      }),
      category: job.category || 'other', savedAt: job.savedAt || '',
      firstSeenAt: job.firstSeenAt || '', lastSeenAt: job.lastSeenAt || ''
    };
  });
  return {
    jobFavorites: JSON.stringify([...new Set(current.saved)]),
    jobHidden: JSON.stringify([...new Set(current.hidden.jobs)]),
    jobHiddenCompanies: JSON.stringify([...new Set(current.hidden.companies.map(canonical))]),
    jobHiddenSources: JSON.stringify([...new Set(current.hidden.sources.map(canonical))]),
    manualJobs: JSON.stringify(manualJobs)
  };
}

const request = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
export async function readOriginalNicoleState() {
  // databases() avoids accidentally creating or upgrading the original database.
  if (typeof indexedDB.databases !== 'function') throw new Error('IndexedDB database discovery is unavailable');
  const existing = await indexedDB.databases();
  if (!existing.some((entry) => entry.name === 'dubu-job-radar')) {
    return convertNicoleState({ saved: [], hidden: { jobs: [], companies: [], sources: [] }, manual: [] });
  }
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('dubu-job-radar');
    r.onupgradeneeded = () => { r.transaction.abort(); reject(new Error('Original Nicole storage cannot be read safely')); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Original Nicole storage is blocked'));
  });
  try {
    if (!db.objectStoreNames.contains('state')) throw new Error('Original Nicole state store is missing');
    const doc = await request(db.transaction('state', 'readonly').objectStore('state').get('current'));
    if (!doc) throw new Error('Original Nicole state document is missing');
    return convertNicoleState(doc);
  } finally { db.close(); }
}
