import { koreaCategory, koreaProvince, commuteRegion } from './collect-korea.mjs';
import { excludeQualificationReason, safePublicUrl } from './rules.mjs';

// Opt-in public, first-party ATS boards already referenced by the user's existing
// job-search-radar collector. This is a supplemental sample of employers, NOT an
// exhaustive index of Korean job boards.
const ATS = [
  { source: 'KRAFTON', board: 'krafton', company: 'KRAFTON' },
  { source: 'Appier', board: 'appier', company: 'Appier' },
];

const ROLE = /\bmarketing\b|brand(?:ing)?|campaign|advertis|social\s*media|content\s*(?:creat|mark|strateg|manager)|localiz|translat|interpre|spanish|latam|\bads\b|디지털\s*마케팅|마케팅|광고|홍보|브랜드|번역|통역|콘텐츠|스페인어/i;
const KOREA = /\bkorea\b|\bseoul\b|\bseongnam\b|\bpangyo\b|\bbusan\b|\bincheon\b|\bdaegu\b|\bdaejeon\b|\bgyeonggi\b|\bjeonju\b|\bjeonbuk\b|한국|서울|성남|판교|부산|인천|대구|대전|경기|전주/i;
const MAX_POSTING_AGE_MS = 90 * 86400_000;

function isStale(value, now) {
  if (!value) return false;
  const posted = Date.parse(String(value));
  const current = Date.parse(now);
  return Number.isFinite(posted) && Number.isFinite(current) && current - posted > MAX_POSTING_AGE_MS;
}

function plain(text) {
  return String(text || '').replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|lt|gt);/gi, (v) => ({ '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>' }[v.toLowerCase()] ?? v)).replace(/\s+/g, ' ').trim();
}

export function normalizeAtsJob(row, board, { now = new Date().toISOString(), onExcluded = () => {} } = {}) {
  if (!row?.id || !ROLE.test(row.title || '')) return null;
  const location = String(row?.location?.name || '').trim();
  // Without an explicitly named Korean location, a remote role cannot be
  // claimed to accept applicants living in South Korea.
  if (!KOREA.test(location)) return null;
  let url;
  try {
    url = new URL(row.absolute_url);
    if (url.protocol !== 'https:' || !/(?:^|\.)greenhouse\.io$|(?:^|\.)greenhouse\.com$/i.test(url.hostname)) return null;
  } catch { return null; }
  const safeUrl = safePublicUrl(url.href);
  if (excludeQualificationReason({ title: row.title, description: row.content }) || isStale(row.first_published, now)) {
    if (safeUrl) onExcluded(safeUrl);
    return null;
  }
  const description = plain(row.content || '');
  const remote = /\bremote\b|재택|원격/i.test(location) || /\bremote\b|재택|원격/i.test(row.title || '');
  // A Seoul office location alone does not prove daily on-site attendance.
  // Keep it in the geographic offline research tab, but leave work mode open.
  const workplaceMode = remote ? 'remote' : 'unknown';
  const meta = Array.isArray(row.metadata) ? row.metadata.filter(x => x?.name).map(x => `${x.name}: ${x.value ?? ''}`).join(' · ') : '';
  const category = koreaCategory(row.title);
  return {
    id: `greenhouse:${board.board}:${row.id}`,
    title: String(row.title).trim(), company: board.company,
    source: `${board.source} (공식 채용)`, sourceKind: 'official_ats', url: url.href,
    market: remote ? 'online' : 'offline', workplaceMode, category,
    location, province: koreaProvince(location), commuteClass: commuteRegion(location),
    postedAt: String(row.first_published || '').slice(0, 10),
    deadline: '', pay: '', description: description.slice(0, 2500),
    eligibility: '지원자격 확인 필요', languageRequirements: '공고 원문 확인 필요',
    verifiedAt: now,
    evidenceNote: `회사 공식 Greenhouse 채용목록 · ${meta.slice(0, 350) || '지원자격은 원문 확인 필요'}`,
  };
}

export async function collectKoreanAtsJobs({ fetchImpl = fetch, now = new Date().toISOString(), timeoutMs = 15000 } = {}) {
  const jobs = [];
  const sourceStatus = [];
  const excludedUrls = new Set();
  for (const board of ATS) {
    try {
      const url = `https://boards-api.greenhouse.io/v1/boards/${board.board}/jobs?content=true`;
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data?.jobs)) throw new Error('Missing jobs array');
      const relevant = data.jobs.map((row) => normalizeAtsJob(row, board, {
        now, onExcluded: (url) => excludedUrls.add(url),
      })).filter(Boolean);
      jobs.push(...relevant);
      sourceStatus.push({ source: board.source, status: 'ok', count: relevant.length,
        detail: `회사 공식 Greenhouse 목록 ${data.jobs.length}건 확인, 한국 근무지·관련 직무·최근 90일 기준 ${relevant.length}건 보존` });
    } catch (error) {
      sourceStatus.push({ source: board.source, status: 'error', count: 0, detail: String(error.message || error).slice(0, 160) });
    }
  }
  return { jobs, sourceStatus, excludedUrls: [...excludedUrls] };
}
