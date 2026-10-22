import { classifyRole, excludeQualificationReason, safePublicUrl, stableId } from './rules.mjs';
import { koreaCategory, koreaProvince, commuteRegion } from './collect-korea.mjs';

// Public SSR URLs only. No /api/ access, logins, sitemap-wide scans, images,
// applicant data, employer contacts, or copyrighted full descriptions.
const ROOT = 'https://kowork.kr';
const HOME = ROOT + '/en';
const SEEDS = ['7322', '3448', '3322', '4193', '6527', '5036', '7244', '8102', '4814', '4490'];
const UNRELATED = /\b(?:mongolian|mongolia|chinese-korean|japanese-korean|vietnamese|myanmar)\b/i;
const KOREAN_MANDATORY = /\b(?:fluent|native|business|advanced|professional)\s+(?:in\s+)?korean\b|\bkorean\b.{0,45}\b(?:required|fluency|business|reports|meetings|interview|c1|c2)\b|한국어.{0,30}(?:능통|비즈니스|고급|유창|필수)|\btopik\s*(?:level\s*)?[4-6]\b/i;
const OTHER_MANDATORY = /\b(?:chinese|japanese|hebrew|burmese|mongolian|italian|dutch|russian)\b/i;

function decode(text) {
  return String(text || '').replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi, (_full, hex, num) => {
    const value = Number.parseInt(hex || num, hex ? 16 : 10);
    return Number.isInteger(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : ' ';
  }).replace(/&(amp|quot|apos|lt|gt|nbsp);/gi, (_m, v) =>
    ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[v.toLowerCase()] || ' ');
}
function txt(text, limit = 3000) {
  return decode(String(text || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, limit);
}
function field(text, start, stops, maxLength = 400) {
  const begin = text.indexOf(start);
  if (begin === -1) return '';
  const trailing = text.slice(begin + start.length);
  const ends = stops.map((token) => trailing.indexOf(token)).filter((v) => v >= 0);
  return trailing.slice(0, ends.length ? Math.min(...ends) : maxLength).trim().slice(0, maxLength);
}
function visible(html) {
  return txt(String(html).replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ''), 28000);
}

export function parseKoworkListing(html) {
  const cards = [];
  const rx = /<a\b[^>]*id="post-list-post-card-(\d+)"[^>]*href="(\/en\/post\/\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html).matchAll(rx)) {
    const tokens = [...match[3].matchAll(/<(?:p|span)\b[^>]*>([\s\S]*?)<\/(?:p|span)>/gi)]
      .map((token) => txt(token[1], 240)).filter(Boolean);
    if (tokens.length < 3) continue;
    cards.push({ id: match[1], url: ROOT + match[2], title: tokens[0],
      company: tokens[1], visibleLabels: tokens.slice(2, 9) });
  }
  return cards;
}

export function parseKoworkDetail(html, url) {
  const safe = safePublicUrl(url);
  if (!safe || new URL(safe).hostname !== 'kowork.kr' ||
      !/^\/en\/post\/\d+$/.test(new URL(safe).pathname)) return null;
  const match = String(html).match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  if (!match) return null;
  const title = txt(match[1], 240);
  const body = visible(html);
  const job = body.indexOf(' Job Type ');
  const pos = job < 0 ? -1 : body.lastIndexOf(title, job);
  if (pos < 0 || job < 0) return null;
  const company = body.slice(pos + title.length, job).trim().slice(0, 130);
  return {
    url: safe, title, company,
    category: field(body, ' Job Category ', [' Work Model ', ' Working Days ']),
    mode: field(body, ' Work Model ', [' Working Days ', ' Work Time ', ' Salary ']),
    location: field(body, ' Location ', [' Copy Address ', ' Save Share ', ' Job Detail '], 250),
    qualification: field(body, ' Qualifications ', [' Preferred ', ' Etc ', ' Preferred Visas ', ' Benefits '], 3000),
    requiredLanguages: field(body, ' Required Languages ', [' Preferred Languages ', ' Job Description ', ' Qualifications '], 450),
    closed: /(?:Applications Closed|Recruitment Closed|모집\s*마감)/i.test(body.slice(pos, job + 350)),
  };
}

function toJob(post, now) {
  if (!post || post.closed || UNRELATED.test(post.title)) return null;
  const category = classifyRole({ title: post.title, categories: [post.category], market: 'offline' })
    || koreaCategory(post.category);
  if (!category || !['marketing', 'advertising', 'translation', 'interpreting', 'content'].includes(category)) return null;
  const requirements = post.qualification + ' ' + post.requiredLanguages;
  if (excludeQualificationReason({ title: post.title, description: requirements }) ||
      KOREAN_MANDATORY.test(requirements)) return null;
  if (OTHER_MANDATORY.test(post.requiredLanguages) &&
      !/\b(?:spanish\s+or|or\s+spanish|either|one\s+of)\b/i.test(requirements)) return null;
  const id = post.url.match(/\/(\d+)$/)?.[1];
  if (!id) return null;
  const mode = /remote/i.test(post.mode) ? 'remote' : /hybrid/i.test(post.mode) ? 'hybrid'
    : /on[- ]site/i.test(post.mode) ? 'onsite' : 'unknown';
  const market = mode === 'remote' ? 'online' : 'offline';
  if (market === 'online' && category === 'interpreting') return null;
  return {
    id: stableId('KOWORK', id, post.url), title: post.title,
    company: post.company, source: 'KOWORK', url: post.url, sourceKind: 'public_listing_index',
    market, workplaceMode: mode, category, location: post.location || 'Location unverified',
    province: koreaProvince(post.location), commuteClass: market === 'offline' ? commuteRegion(post.location) : '',
    postedAt: null, deadline: null, pay: null,
    description: 'KOWORK public job reference. Open the original page for requirements and current availability.',
    languageRequirements: 'Verify on original KOWORK listing', languageFitStatus: 'unknown',
    languageFitReason: 'Public metadata was checked; language requirements still need confirmation.',
    eligibilityStatus: 'unknown', eligibility: 'Confirm exact language, employment and visa conditions on original listing.',
    verifiedAt: now,
    evidenceNote: 'Minimal title, company, workplace and source link only. No description text or copyrighted images reproduced.',
  };
}

export async function collectKoworkJobs({ fetchImpl = fetch, now = new Date().toISOString(),
  timeoutMs = 12000, delayMs = 1100, maxDetails = 6, seeds = SEEDS } = {}) {
  const get = async (url) => {
    const response = await fetchImpl(url, {
      headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const body = await response.text();
    if (!body.includes('<html') || body.length > 2_000_000) throw new Error('Unexpected public HTML');
    return body;
  };
  let listing;
  try {
    listing = parseKoworkListing(await get(HOME));
    if (!listing.length) throw new Error('No public posting cards (layout changed)');
  } catch (error) {
    return { jobs: [], successfulRequests: 0, sourceStatus: [{
      source: 'KOWORK', status: 'error', count: 0, checkedAt: now, url: HOME,
      detail: 'KOWORK public listing unavailable: ' + txt(error?.message || error, 150) }] };
  }
  const relevant = listing.filter((card) =>
    /marketing|advertis|spanish|translat|interpret|content/i.test(card.title + ' ' + card.visibleLabels.join(' ')));
  // Small rotating selection; no bulk crawl or private API. Some high-interest
  // Spanish leads are rechecked regularly rather than mirroring old posts.
  const index = Math.floor(Date.parse(now) / 21600000) % seeds.length;
  const rotated = [...seeds.slice(index), ...seeds.slice(0, index)];
  const ids = [...new Set([...rotated.slice(0, 4), ...relevant.map((c) => c.id)])]
    .slice(0, Math.max(0, Math.min(8, maxDetails)));
  const jobs = [], excludedUrls = [], failures = [];
  for (let n = 0; n < ids.length; n++) {
    if (n && delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const url = ROOT + '/en/post/' + ids[n];
    try {
      const post = parseKoworkDetail(await get(url), url);
      if (!post) throw new Error('Detail format changed');
      const lead = toJob(post, now);
      if (lead) jobs.push(lead);
      else excludedUrls.push(url);
    } catch (error) { failures.push(ids[n] + ': ' + txt(error?.message || error, 100)); }
  }
  return { jobs, excludedUrls, successfulRequests: 1,
    sourceStatus: [{ source: 'KOWORK', status: failures.length ? 'partial' : 'ok',
      count: jobs.length, url: HOME, checkedAt: now,
      detail: 'One public list with ' + listing.length + ' cards, ' + ids.length +
        ' limited detail checks. ' + jobs.length +
        ' profile-relevant leads. No full description copied; current opening status must be verified.',
      ...(failures.length ? { failures: failures.slice(0, 5) } : {}) }] };
}
