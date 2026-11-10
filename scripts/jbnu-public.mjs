const ROOT = 'https://www.jbnu.ac.kr';
const LIST_URL = `${ROOT}/web/news/notice/sub03.do`;
const RESULT_NOTICE = /합격자|서류전형|면접심사|면접시험|시행계획|발표|결과/i;
const NON_JOB = /대학원생\s*모집|학생\s*모집/i;

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

export function parseJbnuPublicList(html) {
  const rows = [];
  for (const match of String(html).matchAll(/<tr class="tr-normal">([\s\S]*?)<\/tr>/gi)) {
    const row = match[1];
    const id = row.match(/pf_DetailMove\(['"](\d+)['"]\)/i)?.[1]
      || row.match(/\/web\/Board\/(\d+)\/detailView\.do/i)?.[1];
    if (!id) continue;
    const title = decode(row.match(/<a\b[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i)?.[1] || '');
    if (!title || RESULT_NOTICE.test(title) || NON_JOB.test(title)) continue;
    const status = decode(row.match(/<div class="tag-type-02[^"]*">([\s\S]*?)<\/div>/i)?.[1] || '');
    if (status && status !== '진행') continue;
    const category = decode(row.match(/<div class="tag-type-01">([\s\S]*?)<\/div>/i)?.[1] || '');
    const writer = decode(row.match(/<p class="brd-writer">([\s\S]*?)<\/p>/i)?.[1] || '');
    const postedAt = iso(row.match(/<ul class="etc-list">[\s\S]*?<li>(\d{4}-\d{2}-\d{2})<\/li>/i)?.[1] || '');
    rows.push({
      id: `jbnu:${id}`, sourcePostingId: id, title, company: '전북대학교',
      department: writer, type: category || '공공기관 채용',
      url: `${ROOT}/web/Board/${id}/detailView.do`, postedAt
    });
  }
  return rows;
}

export function parseJbnuPublicDetail(html) {
  const body = decode(String(html).replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ''));
  const range = body.match(/진행\s+(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
  const deadline = range ? range[2] : '';
  const contact = body.match(/접수기간\s*:?\s*([\d.\s~()-]+)/)?.[1] || '';
  return { deadline, contact: decode(contact) };
}

export async function collectJbnuPublic({ fetchText, normalizeJob, sourceCollection } = {}) {
  const listHtml = await fetchText(LIST_URL);
  const rows = parseJbnuPublicList(listHtml);
  const jobs = [];
  let detailFailures = 0;
  for (const row of rows) {
    let detail = {};
    try { detail = parseJbnuPublicDetail(await fetchText(row.url)); } catch { detailFailures++; }
    jobs.push(normalizeJob({
      ...row,
      source: '전북대학교',
      location: '전북특별자치도 전주시 덕진구 백제대로 567',
      workAddress: '전북특별자치도 전주시 덕진구 백제대로 567',
      countryCode: 'KR',
      workplaceMode: 'onsite',
      remote: false,
      locationEvidenceLevel: 'source_structured',
      sourceListingState: 'public_detail',
      description: '전북대학교 교내채용 게시판의 공개 채용 공고입니다. 자격·급여·근무지와 모집 상태는 원문에서 확인하세요.',
      tags: ['전주시', '공공기관', '전북대학교'],
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
