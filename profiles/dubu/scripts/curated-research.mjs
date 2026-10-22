import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assessEligibility, assessLanguageFit, classifyRole, excludeQualificationReason,
  excludeOnlineJobReason, isoDate, safePublicUrl, safeText, stableId } from './rules.mjs';
import { commuteRegion, koreaProvince } from './collect-korea.mjs';

// This collector DOES NOT SEARCH the web or pretend to use AI in GitHub Actions.
// A human/AI researcher must individually check an original job page and record
// the evidence in config/research-jobs.json. The six-hour feed refresh just
// incorporates these dated, independently curated leads.
const DEFAULT_FILE = 'config/research-jobs.json';
const MAX_REVIEW_AGE_DAYS = 30;
const MAX_RECORDS = 1000;
const allowedSources = new Set(['KOWORK', 'Hanultari', 'JOBPLOY', 'K-WORK',
  'PeopleNJob', 'Company Careers', 'LinkedIn', 'ProZ', 'Upwork', 'Workana',
  'Saramin', 'JobKorea', '전주교차로', 'Other original source']);
const tombstoneSources = new Set([...allowedSources, 'Arbeitnow', 'Remote OK']);

function dateAt(value) {
  const date = reviewedDate(value);
  return date ? Date.parse(date) : NaN;
}
function reviewedDate(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(raw)) return null;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T00:00:00Z' : raw);
  const iso = Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  if (!iso || iso.slice(0, 10) !== raw.slice(0, 10) ||
      parsed.getUTCFullYear() < 2000 || parsed.getUTCFullYear() > 2035) return null;
  return iso;
}

export function normalizeCuratedResearch(item, { now = new Date().toISOString(),
  languages = { es: 'native', en: 'unverified', ko: 'beginner' } } = {}) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const url = safePublicUrl(item.url);
  const title = safeText(item.title, 240);
  const company = safeText(item.company, 160);
  const source = safeText(item.source, 70);
  const location = safeText(item.location, 240);
  const reviewedAt = reviewedDate(item.reviewedAt);
  const reviewedMs = dateAt(reviewedAt);
  const nowMs = dateAt(now);
  if (!url || !title || !company || !location || !reviewedAt ||
      !allowedSources.has(source) || !['online', 'offline'].includes(item.market) ||
      !Number.isFinite(reviewedMs) || !Number.isFinite(nowMs) ||
      reviewedMs > nowMs + 86400000 ||
      nowMs - reviewedMs > MAX_REVIEW_AGE_DAYS * 86400000) return null;

  const deadline = reviewedDate(item.deadline);
  // A deadline is a calendar day, not the first second of that day in UTC.
  if (deadline && deadline.slice(0, 10) < now.slice(0, 10)) return null;
  if (item.applicationsClosed === true || item.homeCountryEligible === 'no' ||
      item.requiredKoreanLevel === 'business' ||
      item.requiredKoreanLevel === 'fluent' ||
      item.requiredKoreanLevel === 'native' ||
      (Number(item.requiredExperienceYears) >= 5 &&
       Number.isFinite(Number(item.requiredExperienceYears)))) return null;

  const description = safeText(item.researchSummary, 700);
  const essential = safeText(item.essentialRequirements, 1000);
  const category = ['marketing', 'advertising', 'translation', 'interpreting', 'content', 'other']
    .includes(item.category) ? item.category : classifyRole({
      title, description: description + ' ' + essential, market: item.market,
    });
  if (!category || (item.market === 'online' && category === 'interpreting') ||
      excludeQualificationReason({ title, description: essential }) ||
      (item.market === 'online' && excludeOnlineJobReason({
        title, description: essential, location,
        restriction: item.locationRestriction || location, category, source, market: 'online',
      }, { knownLanguages: languages }))) return null;

  const languageRequirements = safeText(item.languageRequirements, 240) ||
    'Confirm on original listing';
  const workplaceMode = ['onsite', 'hybrid', 'remote', 'unknown'].includes(item.workplaceMode)
    ? item.workplaceMode : item.market === 'online' ? 'remote' : 'unknown';
  const eligibilityDetail = assessEligibility({
    market: item.market, location, homeCountry: 'KR',
    restriction: item.locationRestriction || location, description: essential,
  });
  const detectedFit = assessLanguageFit({
    title, description: essential, category, languageRequirements,
  }, languages);
  const fit = ['match', 'mismatch', 'unknown'].includes(item.languageFitStatus) &&
    safeText(item.languageFitReason, 240)
    ? { languageFitStatus: item.languageFitStatus, languageFitReason: safeText(item.languageFitReason, 240) }
    : detectedFit;
  return {
    id: stableId('curated', url, url), url, title, company, source,
    legacyIds: source === 'KOWORK' && /\/post\/(\d+)\/?$/.test(new URL(url).pathname)
      ? [stableId('KOWORK', new URL(url).pathname.match(/\/post\/(\d+)\/?$/)[1], url)] : [],
    sourceKind: 'curated_research', researchMethod: 'reviewed_original_page',
    researchReviewedAt: reviewedAt,
    researchPriority: ['high', 'low'].includes(item.priority) ? item.priority : 'normal',
    listingStatus: item.listingStatus === 'listed' ? 'listed' : 'unconfirmed',
    market: item.market, workplaceMode, category, location,
    province: item.market === 'offline' ? koreaProvince(location) : '',
    commuteClass: item.market === 'offline' ? commuteRegion(location) : '',
    postedAt: reviewedDate(item.postedAt), deadline, pay: safeText(item.pay, 140) || null,
    description, languageRequirements,
    eligibility: safeText(item.eligibilityNote, 250) ||
      'Manually researched lead; confirm employment, location and language requirements at the original source.',
    eligibilityStatus: item.homeCountryEligible === 'possible'
      ? 'possible' : eligibilityDetail.status, eligibilityDetail,
    ...fit,
    verifiedAt: reviewedAt,
    evidenceNote: 'Manually reviewed the source page on ' + reviewedAt.slice(0, 10) +
      '. NOT refreshed by the automated crawler. Recheck the original job for current availability. ' +
      safeText(item.researchNote, 250),
  };
}

export async function collectCuratedResearch({
  root, file = DEFAULT_FILE, readFileImpl = readFile,
  now = new Date().toISOString(), languages,
} = {}) {
  let entries;
  try {
    const raw = await readFileImpl(join(root, file), 'utf8');
    const payload = JSON.parse(raw);
    if (!Array.isArray(payload?.jobs) || payload.jobs.length > MAX_RECORDS) throw Error('Invalid curated research data');
    entries = payload.jobs;
  } catch (error) {
    const notFound = error?.code === 'ENOENT';
    return { jobs: [], successfulRequests: 0,
      sourceStatus: [{
        source: 'ChatGPT Research', status: notFound ? 'not_configured' : 'error',
        count: 0, checkedAt: now,
        detail: notFound ? 'No reviewed job research file yet.' :
          'Curated research import failed: ' + safeText(error?.message || error, 140),
      }],
    };
  }
  // Tombstones remove stale or disqualified leads from both the current feed and
  // retained history without pretending that the source itself confirmed closure.
  const withdrawn = entries.filter((item) => item?.withdrawnFromRadar === true);
  const excludedUrls = [...new Set(withdrawn.flatMap((item) => {
    const source = safeText(item.source, 70);
    const url = safePublicUrl(item.url);
    return tombstoneSources.has(source) && url ? [url] : [];
  }))];
  const activeEntries = entries.filter((item) => item?.withdrawnFromRadar !== true);
  const jobs = activeEntries.flatMap((item) => {
    const job = normalizeCuratedResearch(item, { now, languages });
    return job ? [job] : [];
  });
  const rejected = activeEntries.length - jobs.length;
  return { jobs, excludedUrls, successfulRequests: 0,
    sourceStatus: [{
      source: 'ChatGPT Research', status: 'manual', count: jobs.length, checkedAt: now,
      detail: String(jobs.length) + ' individually researched leads; ' + rejected +
        ' excluded or expired; ' + excludedUrls.length +
        ' manually withdrawn from the radar. Not live-checked at each scheduled refresh.',
    }] };
}
