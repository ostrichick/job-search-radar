import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteJson } from './file-storage.mjs';
import { tourPriceStatus } from '../public/tours/price-status.js';
export { tourPriceStatus } from '../public/tours/price-status.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portalUrl = 'https://www.jbct.or.kr/portal';
const curatedPath = path.join(root, 'config', 'curated-tours.json');
const outputPath = path.join(root, 'public', 'tours.json');
const userAgent = 'DigitalNomadTours/1.0 (+https://github.com/ostrichick/job-search-radar)';

const decodeEntities = (value = '') => value
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

const stripHtml = (value = '') => decodeEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const toIsoDate = (value = '') => {
  const text = String(value).trim();
  const match = text.match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})/);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const todayIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

const targetSnippet = (description = '') => {
  const compact = String(description).replace(/\s+/g, ' ');
  const match = compact.match(/(?:참여\s*대상|모집\s*대상|참가\s*대상|교육\s*대상|대상)\s*[:：]?\s*([^。▶|📌📝✨💜🎁]{1,60})/);
  return (match?.[1] || '').split(/안내|문의|신청|일시|장소|비용|인원/)[0].trim();
};

export function classifyAudience(title = '', description = '') {
  const signal = `${title} ${targetSnippet(description)}`;
  if (/어린이\s*동반|유아\s*동반|초등\s*동반/.test(signal)) return '어린이 동반';
  if (/누구나|제한\s*없|일반인|관광객/.test(signal)) return '누구나';
  if (/성인/.test(signal)) return '성인';
  if (/가족/.test(signal)) return '가족';
  if (/초등/.test(signal) && /이상/.test(signal)) return '초등학생 이상';
  if (/청소년|중학생|고등학생|학생/.test(signal)) return '청소년·학생';
  if (/초등|어린이|유아|미취학/.test(signal)) return '어린이';
  if (/기관|단체/.test(signal)) return '기관·단체';
  return '대상 미표기';
}

export function adultsCanJoin(audience = '') {
  const text = String(audience);
  if (/어린이\s*동반/.test(text)) return false;
  if (/^(?:어린이|유아|청소년|기관)/.test(text)) return false;
  if (/(청소년|학생)/.test(text) && !/(성인|누구나|이상)/.test(text)) return false;
  if (/(초등|어린이|유아)/.test(text) && !/(이상|성인|누구나|가족)/.test(text)) return false;
  return true;
}

const childFocusedTitle = (title = '') =>
  /놀이터|어린이|유아|초등|청소년|학생|기관\s*단체/.test(title) && !/성인|누구나|가족/.test(title);

const categoryLabel = (className = '') => {
  if (className.includes('pfest_cate_edu')) return '체험';
  if (className.includes('pfest_cate_event')) return '축제·행사';
  return '';
};

export function parseTourList(html = '') {
  const items = [];
  const pattern = /<li class="swiper-slide pcal_item"([^>]*)>([\s\S]*?)<\/li>/g;
  for (const match of html.matchAll(pattern)) {
    const attrs = match[1];
    const block = match[2];
    const href = block.match(/href="([^"]+)"/)?.[1] || '';
    if (!href) continue;
    const category = categoryLabel(block.match(/class="pcal_cate ([^"]+)"/)?.[1] || '');
    if (!category) continue;
    items.push({
      detailUrl: new URL(decodeEntities(href), portalUrl).href,
      category,
      title: stripHtml(block.match(/<strong class="pcal_tit">([\s\S]*?)<\/strong>/)?.[1] || ''),
      dateLabel: stripHtml(block.match(/<span class="pcal_date">([\s\S]*?)<\/span>/)?.[1] || ''),
      placeLabel: stripHtml(block.match(/<span class="pcal_place">([\s\S]*?)<\/span>/)?.[1] || ''),
      image: block.match(/<img src="([^"]+)"/)?.[1] || '',
      startDate: attrs.match(/data-start="([^"]+)"/)?.[1] || '',
      endDate: attrs.match(/data-end="([^"]+)"/)?.[1] || ''
    });
  }
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.detailUrl)) return false;
    seen.add(item.detailUrl);
    return true;
  });
}

const infoField = (html, label) => stripHtml(
  html.match(new RegExp(`<dt>${label}<\\/dt>\\s*<dd>([\\s\\S]*?)<\\/dd>`))?.[1] || ''
).replace(/\s*주소복사\s*$/, '');

const REGION_NAMES = ['전주', '완주', '군산', '익산', '정읍', '남원', '김제', '진안', '무주', '장수', '임실', '순창', '고창', '부안'];

const regionFromAddress = (address = '', fallback = '') =>
  REGION_NAMES.find((name) => String(address).includes(name)) || fallback;

const hasPaidAmount = (description = '') =>
  /(?:입장료|참가비|수강료|체험비|이용료|관람료|참가\s*비용)[^0-9]{0,16}(?:\d{1,3}(?:,\d{3})+|\d{4,}|\d+\s*[만천])\s*원/.test(description);

export function parseTourDetail(html = '', fallback = {}) {
  const category = stripHtml(html.match(/class="evt_cate[^"]*">([\s\S]*?)<\/span>/)?.[1] || '') || fallback.category || '';
  const region = stripHtml(html.match(/class="evt_region">([\s\S]*?)<\/span>/)?.[1] || '');
  const title = stripHtml(html.match(/class="evt_view_title">([\s\S]*?)<\/h3>/)?.[1] || '') || fallback.title || '';
  const period = infoField(html, '기간');
  const duration = infoField(html, '소요시간');
  const venue = infoField(html, '장소');
  const price = infoField(html, '가격');
  const address = stripHtml(html.match(/class="evt_view_addr_value">([\s\S]*?)<\/span>/)?.[1] || '');
  const descriptionFull = stripHtml(html.match(/<div class="evt_view_editor[^"]*">([\s\S]*?)<\/div>/)?.[1] || '');
  const applyUrl = html.match(/class="evt_view_link[^"]*"[^>]*href="([^"]+)"/)?.[1]
    || html.match(/<a href="(https?:\/\/[^"]+)"[^>]*class="evt_view_link/)?.[1]
    || '';
  const imagePath = html.match(/class="evt_view_hero_img"[^>]*src="([^"]+)"/)?.[1] || fallback.image || '';
  const paidInDetails = hasPaidAmount(descriptionFull);
  const freeMarker = /class="evt_free"/.test(html) || /무료/.test(price);
  const priceStatus = paidInDetails && freeMarker ? 'unknown'
    : paidInDetails ? 'paid' : tourPriceStatus({ price, free: freeMarker });
  const audience = classifyAudience(title, descriptionFull);
  return {
    title,
    category,
    region: regionFromAddress(address, region),
    period,
    duration,
    venue,
    price,
    priceStatus,
    address,
    descriptionFull,
    description: descriptionFull.slice(0, 500),
    audience,
    openToAll: /누구나|제한\s*없|일반인|관광객/.test(descriptionFull) || /누구나|제한\s*없/.test(audience),
    free: priceStatus === 'free',
    applyUrl: /^https?:/i.test(applyUrl) ? applyUrl : '',
    image: imagePath ? new URL(imagePath, portalUrl).href : '',
    startDate: toIsoDate(period) || fallback.startDate || '',
    endDate: toIsoDate((period.split('~')[1] || period).trim()) || fallback.endDate || ''
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function mapWithLimit(items, limit, task) {
  const output = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      output[current] = await task(items[current], current);
    }
  });
  await Promise.all(workers);
  return output;
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

export function normalizeCurated(item) {
  const priceStatus = tourPriceStatus(item);
  const lastCheckedAt = item.lastCheckedAt || item.checkedAt || null;
  return {
    ...item,
    id: item.id || `curated-${Buffer.from(item.title || '').toString('base64url').slice(0, 24)}`,
    source: 'curated',
    priceStatus,
    priceText: item.priceText || item.price || (priceStatus === 'free' ? '무료' : '참가비 확인 필요'),
    free: priceStatus === 'free',
    openToAll: item.openToAll !== false,
    lastCheckedAt,
    checkedAt: lastCheckedAt,
    availabilityStatus: item.availabilityStatus || 'unverified'
  };
}

async function collectAutoItems(sourceStatus) {
  let listHtml;
  try {
    listHtml = await fetchText(portalUrl);
  } catch (error) {
    sourceStatus.push({ source: '전북문화포털', status: 'failed', count: 0, message: `목록을 불러오지 못했습니다: ${error.message}` });
    return [];
  }
  const candidates = parseTourList(listHtml);
  if (!candidates.length) {
    sourceStatus.push({ source: '전북문화포털', status: 'failed', count: 0, message: '목록 형식이 바뀌어 항목을 찾지 못했습니다.' });
    return [];
  }
  const today = todayIso();
  const active = candidates.filter((item) => !item.endDate || item.endDate >= today);
  let failed = 0;
  const details = await mapWithLimit(active, 5, async (candidate) => {
    try {
      const html = await fetchText(candidate.detailUrl);
      return { ...candidate, ...parseTourDetail(html, candidate), detailUrl: candidate.detailUrl };
    } catch (error) {
      failed += 1;
      return null;
    }
  });
  const items = details.filter((item) => item && adultsCanJoin(item.audience) && !childFocusedTitle(item.title)).map((item) => ({
    id: `jbct-${new URL(item.detailUrl).searchParams.get('id') || Buffer.from(item.detailUrl).toString('base64url').slice(0, 20)}`,
    source: 'jbct',
    sourceName: '전북문화포털',
    sourceUrl: item.detailUrl,
    applyUrl: item.applyUrl || item.detailUrl,
    title: item.title,
    host: '',
    category: item.category === '축제·행사' ? '축제·행사' : '체험',
    region: item.region || '',
    venue: item.venue,
    address: item.address,
    startDate: item.startDate,
    endDate: item.endDate,
    schedule: item.duration || item.period,
    price: item.priceStatus === 'free' ? '무료' : item.price || '참가비 확인 필요',
    priceStatus: item.priceStatus,
    priceText: item.priceStatus === 'free' ? '무료' : item.price || '참가비 확인 필요',
    audience: item.audience,
    openToAll: item.openToAll,
    foreignerNote: '참가 대상·국적 조건은 신청처에 확인 필요',
    reservation: '자세한 신청 방법은 원문 확인',
    language: '한국어 진행',
    description: item.description,
    image: item.image,
    free: item.priceStatus === 'free',
    lastCheckedAt: today,
    checkedAt: today,
    availabilityStatus: 'unverified'
  }));
  const status = failed === 0 ? 'ok' : items.length ? 'partial' : 'failed';
  sourceStatus.push({
    source: '전북문화포털',
    status,
    count: items.length,
    message: failed ? `${failed}개 상세 페이지를 확인하지 못했습니다.` : `${active.length}개 행사 중 성인 참여 가능 항목을 반영했습니다(가격 미상 포함).`
  });
  return items;
}

export async function collectTours({ previousFeed = null, output = outputPath, persist = true, autoCollector = collectAutoItems } = {}) {
  const sourceStatus = [];
  const curated = await readJson(curatedPath, { items: [] });
  const curatedItems = (curated.items || []).map(normalizeCurated);
  const autoItems = await autoCollector(sourceStatus);
  const previousItems = previousFeed?.items || [];
  const sourceUnavailable = sourceStatus.some((source) => ['failed', 'partial'].includes(source.status));
  const fallbackAuto = sourceUnavailable ? previousItems.filter((item) => item.source !== 'curated').map((item) => ({
    ...item,
    priceStatus: tourPriceStatus(item),
    priceText: item.priceText || item.price || '참가비 확인 필요',
    lastCheckedAt: item.lastCheckedAt || item.checkedAt || null,
    availabilityStatus: 'unverified',
    sourceVerificationState: 'source_error'
  })) : [];

  const seen = new Set();
  const items = [];
  for (const item of [...curatedItems, ...autoItems, ...fallbackAuto]) {
    const key = item.sourceUrl || item.id || item.title;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  items.sort((a, b) => {
    const left = a.startDate || '9999-12-31';
    const right = b.startDate || '9999-12-31';
    return left.localeCompare(right) || String(a.title).localeCompare(String(b.title), 'ko');
  });

  const feed = {
    updatedAt: new Date().toISOString(),
    checkedAt: todayIso(),
    locationReference: { label: '전북특별자치도 전주시 덕진구 산정동', lat: 35.84434, lon: 127.1736277 },
    policy: {
      freeOnly: false,
      adultsCanJoin: true,
      scope: '전주·전북 공공기관·지자체 프로그램 및 직접 확인한 체험',
      foreignerNote: '국적·참가 가능 여부와 예약 가능성은 원문 및 신청처에서 최종 확인합니다.'
    },
    sourceStatus,
    items
  };

  if (persist) {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await atomicWriteJson(output, feed);
  }
  return feed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const previous = await readJson(outputPath, null);
  const feed = await collectTours({ previousFeed: previous });
  console.log(`Tour feed: ${feed.items.length} items (${feed.sourceStatus.map((source) => `${source.source}:${source.status}`).join(', ')})`);
}
