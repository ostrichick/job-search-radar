const ROOT = 'https://www.jeonju.go.kr';
const BOARD_PATH = '/planweb/board/list.9is?boardUid=ff8080818b5bc5cf018ba8a272b9631f&contentUid=ff8080818990c349018b041a87bd395c';
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

function absoluteUrl(href) {
  try { return new URL(href, ROOT).href; } catch { return ''; }
}

function typeFor(title) {
  if (/기간제|기간제근로자/.test(title)) return '기간제';
  if (/임기제/.test(title)) return '임기제';
  if (/계약직|계약\s*직/.test(title)) return '계약직';
  if (/정규직/.test(title)) return '정규직';
  return '공공기관 채용';
}

export function parseJeonjuPublicList(html, page = 1) {
  const rows = [];
  for (const match of String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = match[1];
    const titleMatch = row.match(/<td\b[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>[\s\S]*?<a\b[^>]*href="([^"]*view\.9is[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const title = decode(titleMatch[2]);
    if (!title || RESULT_NOTICE.test(title) || NON_JOB.test(title)) continue;
    const url = absoluteUrl(titleMatch[1]);
    const dataUid = (() => { try { return new URL(url).searchParams.get('dataUid') || ''; } catch { return ''; } })();
    if (!url || !dataUid) continue;
    const afterTitle = row.slice(titleMatch.index + titleMatch[0].length);
    const company = decode(afterTitle.match(/^\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i)?.[1] || '') || '전주시';
    const dates = [...row.matchAll(/<td\b[^>]*class="[^"]*\bdate\b[^"]*"[^>]*>([\s\S]*?)<\/td>/gi)].map((item) => decode(item[1]));
    rows.push({
      id: `jeonju-public:${dataUid}`,
      sourcePostingId: dataUid,
      title,
      company,
      url,
      postedAt: /^\d{4}-\d{2}-\d{2}$/.test(dates[0] || '') ? dates[0] : '',
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(dates[1] || '') ? dates[1] : '',
      page
    });
  }
  return rows;
}

export async function collectJeonjuPublic({ fetchText, normalizeJob, sourceCollection, pages = [1, 2] } = {}) {
  let rows = [];
  let successes = 0;
  let failures = 0;
  for (const page of pages) {
    try {
      const html = await fetchText(`${ROOT}${BOARD_PATH}&page=${page}`);
      rows.push(...parseJeonjuPublicList(html, page));
      successes++;
    } catch {
      failures++;
    }
  }
  if (!successes) throw new Error('전주시 공공기관 채용 게시판을 확인하지 못했습니다.');
  const seen = new Set();
  const jobs = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    jobs.push(normalizeJob({
      ...row,
      source: '전주시 공공기관',
      type: typeFor(row.title),
      location: '전북특별자치도 전주시',
      countryCode: 'KR',
      workplaceMode: 'onsite',
      remote: false,
      locationEvidenceLevel: 'source_text',
      sourceListingState: 'public_list',
      description: '전주시 공식 시험·채용 게시판의 공개 채용 공고입니다. 근무지, 자격요건, 급여와 모집 상태는 원문에서 확인하세요.',
      tags: ['전주시', '공공기관'],
      deadlineType: row.deadline ? 'fixed' : '',
      deadlineDate: row.deadline || '',
      deadlineLabel: row.deadline || ''
    }));
  }
  return sourceCollection(jobs, rows.length, {
    discoveredCount: rows.length,
    searchAttemptCount: pages.length,
    searchSuccessCount: successes,
    searchFailureCount: failures
  });
}
