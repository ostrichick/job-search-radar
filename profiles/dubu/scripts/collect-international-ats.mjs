import { assessEligibility, assessLanguageFit, classifyRole, excludeOnlineJobReason,
  excludeQualificationReason, extractLanguages, isoDate, safePublicUrl, safeText, stableId } from './rules.mjs';
import { koreaProvince, commuteRegion } from './collect-korea.mjs';

// First-party, public employer ATS feeds; deliberately not a third-party board scraper.
// Select only employers with verifiable operations in South Korea.
const BOARDS = [
  { source: 'ShopBack', slug: 'shopback-2', kind: 'lever' },
  { source: 'Xsolla', slug: 'xsolla', kind: 'lever' },
  { source: 'Channel Corp.', slug: 'zoyi', kind: 'lever' },
  { source: 'Match Group', slug: 'matchgroup', kind: 'lever' },
  { source: 'Sahara AI', slug: 'Sahara', kind: 'ashby' },
  { source: 'Plaud', slug: 'Plaud', kind: 'ashby' },
];
const KOREA = /\b(?:south\s+korea|republic\s+of\s+korea|korea|seoul|busan|incheon|daegu|daejeon|jeonju|gyeonggi|jeju)\b|한국|서울|부산|인천|대구|대전|광주|전주|전북|경기|제주/i;
const RECENT_DAYS = 90;
const nowISO = () => new Date().toISOString();

function locationInKorea(values) {
  const candidates = values.map((value) => safeText(value || '', 200)).filter(Boolean);
  const korean = candidates.find((value) => KOREA.test(value) && !/\bnorth\s+korea\b/i.test(value));
  if (!korean) return null;
  return /^(seoul|busan|incheon|daegu|daejeon|jeonju)$/i.test(korean)
    ? korean + ', South Korea' : korean;
}

function recent(date, now) {
  if (!date) return true; // Date not provided; status remains unverified.
  const normalized = isoDate(date);
  const posted = normalized ? Date.parse(normalized) : Number.NaN;
  const checked = Date.parse(now);
  return Number.isFinite(posted) && Number.isFinite(checked)
    && posted <= checked + 86400000 && checked - posted <= RECENT_DAYS * 86400000;
}

function normalize(row, board, { now, languages, onExcluded }) {
  const lever = board.kind === 'lever';
  const category = row?.categories || {};
  const address = row?.address?.postalAddress || {};
  if (!lever && row?.isListed === false) return null;
  const locations = lever
    ? [category.location, ...(Array.isArray(category.allLocations) ? category.allLocations : [])]
    : [row.location, ...(Array.isArray(row.secondaryLocations) ? row.secondaryLocations : []),
       address.addressLocality, address.addressCountry];
  const location = locationInKorea(locations);
  if (!location) return null;
  const url = safePublicUrl(lever ? row.hostedUrl : row.jobUrl);
  const title = safeText(lever ? row.text : row.title, 240);
  if (!url || !title || !row.id) return null;
  const host = new URL(url).hostname;
  if (host !== (lever ? 'jobs.lever.co' : 'jobs.ashbyhq.com')) return null;
  const description = safeText(lever ? row.descriptionPlain || row.description : row.descriptionPlain || row.descriptionHtml, 12000);
  const mode = String(row.workplaceType || '').toLowerCase();
  const workplaceMode = /hybrid/.test(mode) ? 'hybrid'
    : (/remote/.test(mode) || (!lever && row.isRemote === true)) ? 'remote'
    : /onsite|on-site|office/.test(mode) ? 'onsite' : 'unknown';
  const market = workplaceMode === 'remote' ? 'online' : 'offline';
  const employment = lever ? category.commitment : row.employmentType;
  const role = classifyRole({ title, description, market,
    categories: [lever ? category.department : row.department, employment] });
  if (!role || role === 'other' || (market === 'online' && role === 'interpreting')) return null;
  const postedRaw = lever ? row.createdAt : row.publishedAt;
  if (!recent(postedRaw, now) ||
      excludeQualificationReason({ title, description }) ||
      (market === 'online' && excludeOnlineJobReason({
        title, description, location, category: role, market, source: board.source,
      }, { homeCountry: 'KR', knownLanguages: languages }))) {
    onExcluded(url);
    return null;
  }
  const eligibilityDetail = assessEligibility({ market, location, restriction: location,
    description, homeCountry: 'KR' });
  const languageRequirements = extractLanguages({ title, description }).join(', ') || 'Verify on original listing';
  const fit = assessLanguageFit({ title, description, category: role, languageRequirements }, languages);
  const posted = isoDate(postedRaw);
  return {
    id: stableId(board.source, row.id, url), title, company: board.source,
    source: board.source + ' (Official ATS)', sourceKind: 'official_ats', url,
    market, workplaceMode, category: role, location,
    province: koreaProvince(location),
    commuteClass: market === 'offline' ? commuteRegion(location) : '',
    postedAt: posted ? posted.slice(0, 10) : null, deadline: null, pay: null,
    description: description.slice(0, 850),
    languageRequirements, eligibilityStatus: eligibilityDetail.status, eligibilityDetail,
    eligibility: 'Check language, hiring eligibility and job requirements at the employer site.',
    ...fit, verifiedAt: now,
    evidenceNote: board.source + ' official ' + (lever ? 'Lever' : 'Ashby') +
      ' job posting feed. Job description is abbreviated; check original posting.',
  };
}

export function normalizeLeverJob(row, board, options = {}) {
  return normalize(row, { ...board, kind: 'lever' }, {
    now: options.now || nowISO(),
    languages: options.languages || { es: 'native', en: 'unverified', ko: 'beginner' },
    onExcluded: options.onExcluded || (() => {}),
  });
}

export function normalizeAshbyJob(row, board, options = {}) {
  return normalize(row, { ...board, kind: 'ashby' }, {
    now: options.now || nowISO(),
    languages: options.languages || { es: 'native', en: 'unverified', ko: 'beginner' },
    onExcluded: options.onExcluded || (() => {}),
  });
}

export async function collectInternationalAtsJobs({ fetchImpl = fetch, now = nowISO(),
  languages = { es: 'native', en: 'unverified', ko: 'beginner' }, timeoutMs = 15000,
  retryPause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const jobs = [], sourceStatus = [], excludedUrls = new Set();
  let successfulRequests = 0;
  for (const board of BOARDS) {
    const startedAt = Date.now();
    let retryCount = 0;
    // Xsolla's public Lever response is several MB; a single CI timeout
    // need not mean the employer board is permanently unavailable. Extend
    // only this source's budget, never the rest of the ATS publishers.
    const boardTimeoutMs = board.source === 'Xsolla' ? Math.max(timeoutMs, 20000) : timeoutMs;
    const url = board.kind === 'lever'
      ? 'https://api.lever.co/v0/postings/' + encodeURIComponent(board.slug) + '?mode=json'
      : 'https://api.ashbyhq.com/posting-api/job-board/' + encodeURIComponent(board.slug);
    const browseUrl = board.kind === 'lever'
      ? 'https://jobs.lever.co/' + board.slug
      : 'https://jobs.ashbyhq.com/' + board.slug;
    try {
      const requestRows = async () => {
        const response = await fetchImpl(url, {
          headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(boardTimeoutMs),
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        // The abort deadline can also fire while parsing a large JSON body.
        const payload = await response.json();
        const rows = board.kind === 'lever' ? payload : payload?.jobs;
        if (!Array.isArray(rows)) throw new Error('Missing public job list');
        return rows;
      };
      let rows;
      try { rows = await requestRows(); }
      catch (error) {
        // One bounded retry for timeout only. Never repeat 4xx errors or
        // silently label a failed board as an empty successful collection.
        if (board.source !== 'Xsolla' || !['TimeoutError', 'AbortError'].includes(error?.name)) throw error;
        retryCount = 1;
        await retryPause(1500);
        rows = await requestRows();
      }
      const normalizeOne = board.kind === 'lever' ? normalizeLeverJob : normalizeAshbyJob;
      const relevant = rows.map((row) => normalizeOne(row, board, {
        now, languages, onExcluded: (excluded) => excludedUrls.add(excluded),
      })).filter(Boolean);
      jobs.push(...relevant);
      successfulRequests++;
      sourceStatus.push({ source: board.source, status: 'ok', count: relevant.length,
        checkedAt: now, url: browseUrl, durationMs: Date.now() - startedAt, retryCount,
        detail: String(rows.length) + ' employer postings checked; ' + relevant.length +
          ' Korea-based, role-relevant leads under the 90-day age policy. All eligibility unverified.' });
    } catch (error) {
      sourceStatus.push({ source: board.source, status: 'error', count: 0, checkedAt: now,
        url: browseUrl, durationMs: Date.now() - startedAt, timeoutMs: boardTimeoutMs,
        retryCount, detail: safeText(error?.message || error, 160) });
    }
  }
  return { jobs, sourceStatus, excludedUrls: [...excludedUrls], successfulRequests };
}
