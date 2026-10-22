// Nationwide Korea job discovery through the official Work24 open API.
import { excludeQualificationReason } from './rules.mjs';
// API specifications: https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do
// This adapter deliberately does not pretend a job was verified without a key.
const ENDPOINT = 'https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do';
const SEARCHES = ['스페인어', '중남미', '해외마케팅', '마케팅', '광고', '번역', '통역', 'SNS', '콘텐츠'];
const OFFICIAL_DETAIL = 'https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do';
const TOPIC = /스페인어|중남미|남미|라틴아메리카|마케팅|마케터|광고|번역|통역|현지화|로컬라이제이션|콘텐츠|SNS|소셜미디어|디지털\s*마케팅|유튜브|수출마케팅|홍보|브랜드|Spanish|LATAM|localiz|translator|interpreter|marketing/i;

function stripXml(value) {
  return String(value ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (entity) => {
      const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
      if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
      if (entity.startsWith('&#')) {
        const hex = /^&#x/i.test(entity);
        const number = Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
        if (Number.isInteger(number) && number >= 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)) return String.fromCodePoint(number);
      }
      return entity;
    }).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tag(xml, name) {
  const match = String(xml).match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? stripXml(match[1]) : '';
}

function validJobUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    if (!/(?:^|\.)work24\.go\.kr$|(?:^|\.)work\.go\.kr$/i.test(url.hostname)) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function koreaCategory(value) {
  const s = String(value || '');
  if (/통역|interpreter|interpreting/i.test(s)) return 'interpreting';
  if (/번역|현지화|로컬라이제이션|translat|localiz|subtitl/i.test(s)) return 'translation';
  if (/광고|ads\b|advertis/i.test(s)) return 'advertising';
  if (/콘텐츠|SNS|social\s*media|유튜브|영상|creator/i.test(s)) return 'content';
  if (/마케팅|마케터|홍보|브랜드|수출|market/i.test(s)) return 'marketing';
  return 'other';
}

const REGIONS = [
  ['서울특별시', /서울|Seoul/i], ['경기도', /경기|Gyeonggi/i],
  ['인천광역시', /인천|Incheon/i], ['부산광역시', /부산|Busan/i],
  ['대구광역시', /대구|Daegu/i], ['대전광역시', /대전|Daejeon/i],
  ['광주광역시', /광주|Gwangju/i], ['울산광역시', /울산|Ulsan/i],
  ['세종특별자치시', /세종|Sejong/i], ['전북특별자치도', /전북|전라북도|Jeonbuk/i],
  ['전라남도', /전남|전라남도|Jeonnam/i], ['충청남도', /충남|충청남도|Chungnam/i],
  ['충청북도', /충북|충청북도|Chungbuk/i], ['경상북도', /경북|경상북도|Gyeongbuk/i],
  ['경상남도', /경남|경상남도|Gyeongnam/i], ['강원특별자치도', /강원|Gangwon/i],
  ['제주특별자치도', /제주|Jeju/i],
];

export function koreaProvince(location) {
  const s = String(location || '');
  if (/전주|완주|익산|김제|군산|정읍|남원|부안|고창|무주|진안|장수|순창|임실/i.test(s) && !/경기도|서울|인천|광주광역시/.test(s)) return '전북특별자치도';
  const match = REGIONS.find(([, re]) => re.test(s));
  return match?.[0] || '';
}

export function commuteRegion(location) {
  const s = String(location || '').trim();
  // A province-wide location does not prove the job is commutable.
  if (/전주|완주|Jeonju|Wanju/i.test(s)) return 'nearby';
  if (/익산|김제|Iksan|Gimje/i.test(s)) return 'expanded';
  if (!koreaProvince(s)) return 'unknown';
  // Jeonbuk alone cannot be labeled near Jeonju.
  if (koreaProvince(s) === '전북특별자치도' && !/시|군|구|동|읍|면/.test(s)) return 'unknown';
  return 'relocation';
}

function apiDate(value) {
  const s = String(value || '').trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}-\d{2}-\d{2}$/.test(s) && Number(s.slice(0, 2)) < 50) return `20${s}`;
  return '';
}

export function parseWork24Xml(xml, { now = new Date().toISOString() } = {}) {
  if (!/<wantedRoot(?:\s[^>]*)?>/i.test(xml) || !/<\/wantedRoot>/i.test(xml)) throw new Error('Work24 response is not a wantedRoot XML document');
  const entries = [...xml.matchAll(/<wanted(?:\s[^>]*)?>([\s\S]*?)<\/wanted>/gi)];
  return entries.flatMap((match) => {
    const raw = match[1];
    const identifier = tag(raw, 'wantedAuthNo');
    const title = tag(raw, 'title');
    const location = tag(raw, 'basicAddr') || tag(raw, 'region') || tag(raw, 'strtnmCd');
    const company = tag(raw, 'company');
    const infoSvc = tag(raw, 'infoSvc');
    // The official Work24 integration guide requires a link to the new detail URL.
    // Old API fields can still point to retired work.go.kr redirect pages.
    const officialDetail = new URL(OFFICIAL_DETAIL);
    officialDetail.searchParams.set('wantedAuthNo', identifier);
    officialDetail.searchParams.set('infoTypeCd', 'VALIDATION');
    officialDetail.searchParams.set('infoTypeGroup', 'tb_workinfoworknet');
    const url = (!infoSvc || infoSvc === 'VALIDATION')
      ? officialDetail.href
      : validJobUrl(tag(raw, 'wantedInfoUrl')) || validJobUrl(tag(raw, 'wantedMobileInfoUrl'));
    const roleDetails = `${title} ${tag(raw, 'indTpNm')}`;
    if (!identifier || !title || !url || !TOPIC.test(roleDetails) ||
      excludeQualificationReason({ title, description: roleDetails })) return [];
    const workplaceMode = /재택|원격근무|리모트|remote\s*work/i.test(title) ? 'remote' : 'unknown';
    const category = koreaCategory(title);
    const pay = [tag(raw, 'salTpNm'), tag(raw, 'sal')].filter(Boolean).join(' ');
    const job = {
      id: `work24:${identifier}`, title, company: company || '회사명 미표시', source: '고용24',
      url, description: roleDetails, location, province: koreaProvince(location),
      commuteClass: commuteRegion(location), workplaceMode,
      market: workplaceMode === 'remote' ? 'online' : 'offline', category,
      postedAt: apiDate(tag(raw, 'regDt')), deadline: apiDate(tag(raw, 'closeDt')),
      pay, languageRequirements: '원문 확인 필요', eligibility: '확인 필요',
      verifiedAt: now, sourceKind: 'official_government',
      evidenceNote: '정보출처: 고용노동부 고용24(www.work24.go.kr). 목록 API 근거이며 직무·근무형태 및 한국어 요건은 원문 확인 필요.',
    };
    return [job];
  });
}

export async function collectKoreanJobs({ authKey = process.env.WORK24_AUTH_KEY, fetchImpl = fetch,
  searches = SEARCHES, timeoutMs = 12000, pageSize = 100, now = new Date().toISOString() } = {}) {
  if (!authKey) return {
    jobs: [], sourceStatus: [{ source: '고용24', status: 'not_configured', detail: 'WORK24_AUTH_KEY 미설정: 전국 채용정보 자동 수집 대기', count: 0 }],
  };
  const collected = new Map();
  const failures = [];
  let success = 0;
  // Keep API use bounded and sequential; avoid excessive authentication requests.
  for (const keyword of searches) {
    const params = new URLSearchParams({ authKey, callTp: 'L', returnType: 'XML', startPage: '1', display: String(Math.min(100, Math.max(1, pageSize))), keyword, sortOrderBy: 'DESC' });
    try {
      const response = await fetchImpl(`${ENDPOINT}?${params.toString()}`, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const xml = await response.text();
      for (const job of parseWork24Xml(xml, { now })) collected.set(job.id, job);
      success++;
    } catch (error) {
      failures.push({ keyword, reason: String(error.message || error).slice(0, 150) });
    }
  }
  return {
    jobs: [...collected.values()],
    sourceStatus: [{ source: '고용24', status: failures.length ? (success ? 'partial' : 'error') : 'ok', count: collected.size,
      detail: `${success}/${searches.length}개 검색어 응답 검증${failures.length ? `, 실패 ${failures.length}` : ''}. 페이지당 최대 ${Math.min(100, pageSize)}건; 전국 전체 공고를 완전 탐색한 결과는 아님.`,
      failures: failures.map(({ keyword }) => keyword),
    }],
  };
}
