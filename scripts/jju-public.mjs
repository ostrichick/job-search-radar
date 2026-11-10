const ROOT = 'https://jj.ac.kr';
const LIST_URL = `${ROOT}/jj/community/notice07.do?mode=list&article.offset=0&articleLimit=10`;
const RESULT_NOTICE = /합격자|서류전형|면접심사|면접시험|발표|결과/i;

function decode(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/\s+/g, ' ').trim();
}
function iso(value) {
  const match = String(value || '').match(/(\d{4})[-.]\s*(\d{1,2})[-.]\s*(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
}

export function parseJjuPublicList(html) {
  const rows = [];
  const seen = new Set();
  for (const match of String(html).matchAll(/<a\b[^>]*class="[^"]*\bb-title\b[^"]*"[^>]*data-article-no="(\d+)"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const id = match[1];
    if (!id || seen.has(id)) continue;
    const rawTitle = decode(match[3]);
    if (/\[접수마감\]/i.test(rawTitle)) continue;
    const title = rawTitle.replace(/^\[(?:접수중|접수마감|공지)\]\s*/i, '');
    if (!title || RESULT_NOTICE.test(title)) continue;
    const url = new URL(match[2].replace(/&amp;/g, '&'), LIST_URL).href;
    const rowStart = String(html).lastIndexOf('<tr', match.index);
    const row = rowStart >= 0 ? String(html).slice(rowStart, match.index + match[0].length + 900) : match[0];
    const dates = [...row.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((item) => item[1]);
    const author = decode(row.match(/<td[^>]*>([^<]*(?:지원실|센터|처|실|학과|대학)[^<]*)<\/td>/i)?.[1] || '');
    seen.add(id);
    rows.push({
      id: `jju:${id}`, sourcePostingId: id, title, company: '전주대학교',
      department: author, type: /전임교원|강사|교원/.test(title) ? '교원' : /계약직|기간제/.test(title) ? '계약직' : '공공기관 채용',
      url, postedAt: dates[0] || ''
    });
  }
  return rows;
}

export function parseJjuPublicDetail(html) {
  const body = decode(String(html).replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ''));
  const postedAt = iso(body.match(/작성일\s*:\s*(\d{4}-\d{2}-\d{2})/)?.[1] || '');
  const period = body.match(/(?:온라인\s*)?접수기간\s*:?\s*(\d{4}[.\-]\s*\d{1,2}[.\-]\s*\d{1,2})[^\d]{1,20}(\d{4}[.\-]\s*\d{1,2}[.\-]\s*\d{1,2})/);
  return { postedAt, deadline: period ? iso(period[2]) : '' };
}

export async function collectJjuPublic({ fetchText, normalizeJob, sourceCollection } = {}) {
  const rows = parseJjuPublicList(await fetchText(LIST_URL));
  const jobs = [];
  let detailFailures = 0;
  for (const row of rows) {
    let detail = {};
    try { detail = parseJjuPublicDetail(await fetchText(row.url)); } catch { detailFailures++; }
    jobs.push(normalizeJob({
      ...row,
      source: '전주대학교',
      location: '전북특별자치도 전주시 완산구 천잠로 303',
      workAddress: '전북특별자치도 전주시 완산구 천잠로 303',
      countryCode: 'KR',
      workplaceMode: 'onsite',
      remote: false,
      locationEvidenceLevel: 'source_structured',
      sourceListingState: 'public_detail',
      description: '전주대학교 채용 게시판의 공개 채용 공고입니다. 자격·급여·근무지와 모집 상태는 원문에서 확인하세요.',
      tags: ['전주시', '공공기관', '전주대학교'],
      postedAt: detail.postedAt || row.postedAt,
      deadlineType: detail.deadline ? 'fixed' : '',
      deadlineDate: detail.deadline || '',
      deadlineLabel: detail.deadline || ''
    }));
  }
  return sourceCollection(jobs, rows.length, {
    discoveredCount: rows.length,
    detailAttemptCount: rows.length,
    detailSuccessCount: rows.length - detailFailures,
    detailFailureCount: detailFailures
  });
}
