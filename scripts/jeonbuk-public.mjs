const ROOT = 'https://www.1577-0365.or.kr';
const LIST_PATH = '/pro/orginfo';
const RESULT_NOTICE = /합격자|서류전형|면접심사|면접시험|시행계획|등록요령|최종합격|결과\s*발표|채용\s*결과/i;
const NON_JOB = /사업자\s*모집|선임직\s*이사|비상임\s*이사|입주\s*기업|수탁\s*기관|위탁\s*모집/i;

function decode(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/\s+/g, ' ').trim();
}
function absoluteUrl(href) { try { return new URL(href, ROOT).href; } catch { return ''; } }
function isoFromLabel(label) {
  const match = String(label || '').match(/(\d{4})[-.]\s*(\d{1,2})[-.]\s*(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
}
function field(body, label, stops = []) {
  const start = body.indexOf(label);
  if (start < 0) return '';
  const trailing = body.slice(start + label.length);
  const ends = stops.map((stop) => trailing.indexOf(stop)).filter((index) => index >= 0);
  return decode(trailing.slice(0, ends.length ? Math.min(...ends) : 180).trim()).slice(0, 180);
}

export function parseJeonbukPublicList(html, offset = 0) {
  const rows = [];
  for (const match of String(html).matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const row = match[1];
    if (!row.includes('view_orginfo')) continue;
    const link = row.match(/href=['"]([^'"]*view_orginfo\/(\d+)[^'"]*)['"]/i);
    if (!link) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((item) => decode(item[1]));
    const agency = cells[1] || '';
    const titleAnchor = row.match(/<a\b[^>]*href=['"][^'"]*view_orginfo[^'"]*['"][^>]*>([\s\S]*?)<\/a>/i);
    const title = decode(titleAnchor?.[1] || '');
    if (!agency || !title || RESULT_NOTICE.test(title) || NON_JOB.test(title)) continue;
    const url = absoluteUrl(link[1]);
    const id = link[2];
    if (!url || !id) continue;
    rows.push({
      id: `jeonbuk-public:${id}`, sourcePostingId: id, title, company: agency, url,
      salary: cells[3] || '', deadline: isoFromLabel(cells[4] || ''), offset
    });
  }
  return rows;
}

export function parseJeonbukPublicDetail(html) {
  const body = decode(String(html).replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ''));
  const posted = body.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] || '';
  return {
    location: field(body, '근무지역', ['근무기간', '접수기간', '첨부파일1', '학력', '경력', '모집인원']),
    employment: field(body, '고용형태', ['모집인원', '급여조건', '학력', '경력', '근무지역']),
    category: field(body, '모집직종', ['담당업무', '고용형태', '모집인원', '급여조건', '학력']),
    period: field(body, '근무기간', ['접수기간', '첨부파일1', '첨부파일2', '학력']),
    postedAt: posted
  };
}

export async function collectJeonbukPublic({ fetchText, normalizeJob, sourceCollection, offsets = [0, 7, 14] } = {}) {
  let rows = [];
  let listSuccesses = 0;
  let listFailures = 0;
  for (const offset of offsets) {
    try {
      rows.push(...parseJeonbukPublicList(await fetchText(`${ROOT}${LIST_PATH}?offset=${offset}&findvalue=&search=&ismine=n`), offset));
      listSuccesses++;
    } catch {
      listFailures++;
    }
  }
  if (!listSuccesses) throw new Error('전북 공공기관 채용정보를 확인하지 못했습니다.');
  const seen = new Set();
  const jobs = [];
  let detailFailures = 0;
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    let detail = {};
    try { detail = parseJeonbukPublicDetail(await fetchText(row.url)); } catch { detailFailures++; }
    const location = /전주/.test(detail.location) ? detail.location : '전북특별자치도 전주시';
    if (!/전주/.test(`${detail.location} ${row.company} ${row.title}`)) continue;
    jobs.push(normalizeJob({
      ...row,
      source: '전북 공공기관',
      type: (detail.employment || '공공기관 채용').replace(/계약지/g, '계약직'),
      location,
      countryCode: 'KR',
      workplaceMode: 'onsite',
      remote: false,
      locationEvidenceLevel: 'source_structured',
      sourceListingState: 'public_detail',
      description: [
        '전북 공공기관 채용정보의 공개 채용 공고입니다.',
        detail.category ? `모집직종: ${detail.category}.` : '',
        detail.employment ? `고용형태: ${detail.employment}.` : '',
        detail.period ? `근무기간: ${detail.period}.` : '',
        '자격·급여·근무지와 모집 상태는 원문에서 확인하세요.'
      ].filter(Boolean).join(' '),
      tags: ['전주시', '공공기관', '전북'],
      postedAt: detail.postedAt || '',
      deadlineType: row.deadline ? 'fixed' : '',
      deadlineDate: row.deadline || '',
      deadlineLabel: row.deadline || ''
    }));
  }
  return sourceCollection(jobs, rows.length, {
    discoveredCount: rows.length,
    searchAttemptCount: offsets.length,
    searchSuccessCount: listSuccesses,
    searchFailureCount: listFailures,
    detailAttemptCount: rows.length,
    detailSuccessCount: rows.length - detailFailures,
    detailFailureCount: detailFailures
  });
}
