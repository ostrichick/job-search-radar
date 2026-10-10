import { createJobNormalizer } from './normalize-job.mjs';
import { createSourceAdapters } from './source-adapters.mjs';
import { createVerificationHistory } from './verification-history.mjs';
import { createMissingJobRules } from './missing-jobs.mjs';
import { createRecommendationGuard } from './recommendation-guard.mjs';
import { createSourceMetrics } from './source-metrics.mjs';
import { fetchJson, fetchText, runSources } from './network.mjs';
import { atomicWriteJson, withFileLock, singleFlight } from './file-storage.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isDefaultRecommendation as recommendationRule } from '../public/recommendation-rules.js';
import { incruitJeonbukRssUrl, parseIncruitJeonbukRss } from './incruit-rss.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const profile = JSON.parse(await fs.readFile(path.join(root, 'config/search-profile.json'), 'utf8'));
const sourceQuality = JSON.parse(await fs.readFile(path.join(root, 'config/source-quality.json'), 'utf8'));
const paymentEvidencePolicy = JSON.parse(await fs.readFile(path.join(root, 'config/payment-evidence-policy.json'), 'utf8'));
const koreaAdmin = JSON.parse(await fs.readFile(path.join(root, 'config/korea-admin-regions.json'), 'utf8'));

function repairMojibake(value) {
  const raw = String(value ?? '');
  if (!/[ÃÂØÙ]|â[\u0080-\u00bf]/.test(raw)) return raw;
  try {
    const repaired = Buffer.from(raw, 'latin1').toString('utf8');
    return repaired.includes('�') ? raw : repaired;
  } catch {
    return raw;
  }
}

const text = (value) => repairMojibake(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const lower = (value) => text(value).toLowerCase();
const foreignLanguageRe = /\b(english|spanish|portuguese|romanian|japanese|polish|german|french|italian|dutch|finnish|hebrew|arabic|farsi|persian|urdu|hindi|bengali|marathi|tamil|telugu|vietnamese|thai|malay|indonesian|swedish|norwegian|danish|greek|latvian|lithuanian|estonian|slovak|slovenian|croatian|czech|hungarian|russian|ukrainian|turkish|serbian|bulgarian|albanian|kazakh|khmer|javanese|kannada|mandarin|cantonese|chinese|filipino|tagalog|icelandic|catalan)\b/i;

const sourceRank = { official_ats: 5, official_government: 5, official_platform: 4, job_board: 3, aggregator: 2, manual: 1 };
const isOfficialKind = (kind) => ['official_ats', 'official_government', 'official_platform'].includes(kind);
const dayMs = 86400000;
const verificationHistoryLimit = 24;
const sourceMetricHistoryLimit = 24;
const verificationCheckpointMs = 7 * dayMs;
const contentFingerprintVersion = 3;
const recommendationPolicyVersion = 3;
const defaultLocationReference = Object.freeze({
  id: 'kr-jeonbuk-jeonju-deokjin-sanjeong',
  label: '전북특별자치도 전주시 덕진구 산정동',
  province: '전북특별자치도',
  city: '전주시',
  district: '덕진구',
  neighborhood: '산정동',
  lat: 35.84434,
  lon: 127.1736277,
  precision: 'neighborhood',
  coordinateSource: 'OpenStreetMap Nominatim',
  coordinateCheckedAt: '2026-10-04',
  distanceMethod: 'haversine_straight_line'
});

const domesticProvinceOptions = koreaAdmin.provinces.map((item) => item.name);

function locationHasAlias(location, alias) {
  const target = lower(alias);
  if (!target) return false;
  if (/[가-힣]/.test(target)) return lower(location).includes(target);
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s,_-]+');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(lower(location));
}

function matchingProvince(location) {
  const matches = [];
  for (const item of koreaAdmin.provinces) {
    for (const alias of item.aliases || []) {
      if (locationHasAlias(location, alias)) matches.push({ name: item.name, alias, length: lower(alias).length });
    }
  }
  matches.sort((a, b) => b.length - a.length);
  return matches[0]?.name || '';
}

function matchingAdminRegion(location, province = '') {
  const matches = [];
  for (const region of koreaAdmin.regions) {
    if (province && region.province !== province) continue;
    for (const alias of region.aliases || []) {
      if (!locationHasAlias(location, alias)) continue;
      const specificity = region.district ? 2 : region.city ? 1 : 0;
      matches.push({ region, alias, score: lower(alias).length * 10 + specificity });
    }
  }
  matches.sort((a, b) => b.score - a.score);
  if (!matches.length) return null;
  if (!province && matches[1]?.score === matches[0].score) {
    const a = matches[0].region;
    const b = matches[1].region;
    if (`${a.province}|${a.city}|${a.district}` !== `${b.province}|${b.city}|${b.district}`) return null;
  }
  return matches[0].region;
}

function parentForKoreanAdmin(city, district, province = '') {
  const candidates = koreaAdmin.regions.filter((region) => {
    if (province && region.province !== province) return false;
    if (city && region.city !== city) return false;
    if (district && region.district !== district) return false;
    return Boolean(city || district);
  });
  const unique = new Map(candidates.map((region) => [`${region.province}|${region.city}|${region.district}`, region]));
  return unique.size === 1 ? [...unique.values()][0] : null;
}

const regionCentroids = {
  '서울특별시': { lat: 37.5666791, lon: 126.9782914, precision: 'city', coordinateSource: 'OpenStreetMap Nominatim', coordinateCheckedAt: '2026-10-04' },
  '서울특별시|강남구': { lat: 37.5177, lon: 127.0473, precision: 'district', coordinateSource: 'OpenStreetMap Nominatim', coordinateCheckedAt: '2026-10-04' },
  '전북특별자치도|전주시|덕진구': {
    lat: 35.8294, lon: 127.1342, precision: 'district', label: '전북특별자치도 전주시 덕진구',
    coordinateSource: 'OpenStreetMap Nominatim', coordinateCheckedAt: '2026-10-05'
  },
  '전북특별자치도|전주시|완산구': {
    lat: 35.8122, lon: 127.1197, precision: 'district', label: '전북특별자치도 전주시 완산구',
    coordinateSource: 'OpenStreetMap Nominatim', coordinateCheckedAt: '2026-10-05'
  },
  '전북특별자치도|완주군': {
    lat: 35.9039, lon: 127.1622, precision: 'city', label: '전북특별자치도 완주군',
    coordinateSource: 'OpenStreetMap Nominatim', coordinateCheckedAt: '2026-10-05'
  },
  '전북특별자치도|전주시|덕진구|산정동': { ...defaultLocationReference }
};

function normalizeWorkplaceMode(value, remoteFallback = false) {
  const mode = lower(value);
  if (/\bhybrid\b|하이브리드/.test(mode)) return 'hybrid';
  if (/\bremote\b|work from home|\bwfh\b|재택/.test(mode)) return 'remote';
  if (/\bonsite\b|\bon-site\b|\bon site\b|office-based|출근|오피스/.test(mode)) return 'onsite';
  return remoteFallback ? 'remote' : 'unknown';
}

function domesticRegionFor(job) {
  const workplaceMode = normalizeWorkplaceMode(job.workplaceMode, Boolean(job.remote));
  // A remote job can be eligible for people in Korea without having a Korean
  // commute/workplace location. Keep that support geography in eligibility*
  // fields and reserve domesticRegion for an actual onsite/hybrid workplace.
  if (workplaceMode === 'remote') return null;

  const location = text(job.workAddress || job.location);
  const lowerLocation = lower(location);
  const multiCountry = /\+\s*\d+\s*개\s*국가|\bworld\s*wide\b|\bworldwide\b|\bremote\s*-\s*europe\b|\b(?:china|japan|united states|canada|united kingdom|singapore|germany|france|brazil|india)\b/.test(lowerLocation.replace(/south korea|republic of korea/g, ''));
  const matchedProvince = matchingProvince(location);
  const matchedAdminRegion = matchingAdminRegion(location, matchedProvince);
  const koreaSpecific = job.countryCode === 'KR'
    || /south korea|republic of korea|대한민국|한국|\bkorea\b/.test(lowerLocation)
    || Boolean(matchedProvince || matchedAdminRegion);
  if (!koreaSpecific || multiCountry) return null;

  let province = matchedProvince;
  const koreanUnits = [...location.matchAll(/([가-힣0-9]{2,}(?:시|군|구|읍|면|동(?:\d+가)?))/g)].map((match) => match[1]);
  let city = koreanUnits.find((unit) => /시$/.test(unit) && !/특별시$|광역시$|자치시$/.test(unit)) || '';
  let district = koreanUnits.find((unit) => /군$|구$/.test(unit)) || '';
  let neighborhood = koreanUnits.find((unit) => /읍$|면$|동(?:\d+가)?$/.test(unit)) || '';
  let aliasDerived = Boolean(province && !/[가-힣]/.test(location));
  const adminAlias = matchedAdminRegion || matchingAdminRegion(location, province);
  if (adminAlias) {
    if (!city && adminAlias.city) city = adminAlias.city;
    if (!district && adminAlias.district) district = adminAlias.district;
    province ||= adminAlias.province;
    if (!adminAlias.district && city && district === city) district = '';
    if (!/[가-힣]/.test(location)) aliasDerived = true;
  }
  const directParent = parentForKoreanAdmin(city, district, province);
  if (directParent) {
    province ||= directParent.province;
    city ||= directParent.city;
    district ||= directParent.district;
  }
  if (!neighborhood && /\bsanjeong(?:-dong)?\b/i.test(location)) neighborhood = '산정동';
  if (neighborhood === '산정동' && !district) {
    district = '덕진구';
    city ||= '전주시';
    province ||= '전북특별자치도';
    aliasDerived = true;
  }

  const locality = [city, district].filter(Boolean).join(' ');
  const centroidKeys = [
    [province, city, district, neighborhood],
    [province, city, district],
    [province, city],
    [province, district],
    [province]
  ].map((parts) => parts.filter(Boolean).join('|')).filter(Boolean);
  const centroid = centroidKeys.map((key) => regionCentroids[key]).find(Boolean) || null;
  const metropolitanProvince = province && /(?:특별시|광역시|특별자치시)$/.test(province);
  const addressLike = job.locationEvidenceLevel === 'source_structured' && (
    /[가-힣0-9·.-]+(?:대로|로|길)\s*\d+(?:-\d+)?/.test(location)
    || /(?:읍|면|동|가|리)\s*\d+(?:-\d+)?/.test(location)
  );
  const precision = addressLike ? 'address' : neighborhood ? 'neighborhood' : district ? 'district' : city || metropolitanProvince ? 'city' : province ? 'province' : 'country';
  const hasKoreanAdminText = /[가-힣]{2,}(?:시|군|구|동)|서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청|전북|전라|경상|제주/.test(location);
  const countryText = /south korea|republic of korea|대한민국|\bkorea\b|한국/i.test(location);
  const genericLocation = !location || /^(?:위치 미상|unknown|not specified|n\/?a)$/i.test(location);
  const evidenceLevel = job.locationEvidenceLevel === 'source_structured'
    ? 'source_structured'
    : aliasDerived
    ? 'derived_alias'
    : hasKoreanAdminText || countryText
      ? 'source_text'
      : job.countryCode === 'KR'
        ? 'country_code'
        : 'source_text';
  return {
    country: '대한민국',
    province,
    city,
    district,
    neighborhood,
    locality,
    label: [province, locality, neighborhood].filter(Boolean).join(' ') || (genericLocation || countryText ? '대한민국' : location),
    precision,
    evidenceLevel,
    ...(job.workAddress ? { sourceAddress: text(job.workAddress) } : {}),
    ...(centroid ? {
      lat: centroid.lat,
      lon: centroid.lon,
      coordinatePrecision: centroid.precision,
      coordinateLabel: centroid.label || [province, city, district, neighborhood].filter(Boolean).join(' '),
      coordinateSource: centroid.coordinateSource,
      coordinateCheckedAt: centroid.coordinateCheckedAt
    } : {})
  };
}

function marketSegmentFor(job) {
  const scopes = marketScopesFor(job);
  return scopes[0] || 'overseas_remote';
}

function marketScopesFor(job) {
  const workplaceMode = normalizeWorkplaceMode(job.workplaceMode, Boolean(job.remote));
  if (workplaceMode === 'remote') return ['overseas_remote'];

  const domesticRegion = job.domesticRegion || domesticRegionFor(job);
  return domesticRegion ? ['domestic'] : ['overseas_remote'];
}

function sourceMeta(source) {
  return sourceQuality[source] ?? {
    kind: 'aggregator',
    coverage: 'bounded_window',
    evidenceRefreshability: 'unknown',
    listingLabel: '공고 소스',
    paymentStatus: 'unknown',
    paymentLabel: '직접 확인 필요',
    paymentEvidenceState: 'insufficient',
    paymentEvidenceLabel: '근거 부족',
    paymentConfidence: 'low',
    paymentSummary: '공개 지급 평판 근거가 충분하지 않습니다.',
    paymentSignals: [],
    summary: '현재 모집 상태와 지급 조건을 원문에서 확인해야 합니다.',
    evidence: []
  };
}

function normalizedUrl(value) {
  const raw = text(value);
  try {
    const url = new URL(raw);
    const path = url.pathname.toLowerCase().replace(/\/$/, '');
    const base = `${url.origin.toLowerCase()}${path}`;
    // These are proven source-native posting IDs, not tracking parameters.
    // Only preserve identifier-bearing query keys for supported known routes.
    const postingRoutes = [
      ['job.incruit.com', '/jobdb_info/jobpost.asp', 'job', /^\d+$/],
      ['www.saramin.co.kr', '/zf_user/jobs/view', 'rec_idx', /^\d+$/],
      ['www.alba.co.kr', '/job/detail', 'adid', /^\d+$/],
      ['www.work24.go.kr', '/wk/a/b/1500/empdetailauthview.do', 'wantedAuthNo', /^[A-Za-z0-9]+$/]
    ];
    for (const [host, route, key, validId] of postingRoutes) {
      if (url.hostname.toLowerCase() !== host || path !== route) continue;
      const postingId = url.searchParams.get(key);
      if (validId.test(postingId || '')) return `${base}?${key.toLowerCase()}=${postingId}`;
    }
    return base;
  } catch {
    return lower(value).replace(/[?#].*$/, '').replace(/\/$/, '');
  }
}

function stableSourceDescription(source, value) {
  const normalized = text(value);
  if (source === 'Remote OK') {
    return normalized.replace(/\s*Please mention the word\b[\s\S]*$/i, '').trim();
  }
  return normalized;
}

function decodeHtmlEntities(value) {
  return String(value ?? '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function evidenceSnippet(value, max = 120) {
  const cleaned = text(value);
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function enrichPaymentSignal(signal, now = Date.now()) {
  const checkedAtRaw = signal?.checkedAt || signal?.observedAt || '';
  const checkedAt = Date.parse(checkedAtRaw);
  const sourceReferenceRaw = signal?.type === 'review_aggregate'
    ? (signal?.latestSourceAt || checkedAtRaw)
    : signal?.type === 'community_report'
      ? (signal?.publishedAt || '')
      : checkedAtRaw;
  const sourceReferenceAt = Date.parse(sourceReferenceRaw);
  const maxAgeDays = Number(signal?.maxAgeDays
    ?? paymentEvidencePolicy.signalMaxAgeDays?.[signal?.type]
    ?? paymentEvidencePolicy.defaultMaxAgeDays
    ?? 90);
  const ageDays = Number.isFinite(sourceReferenceAt) ? Math.max(0, Math.floor((now - sourceReferenceAt) / dayMs)) : null;
  const checkedAgeDays = Number.isFinite(checkedAt) ? Math.max(0, Math.floor((now - checkedAt) / dayMs)) : null;
  const expiresAt = Number.isFinite(sourceReferenceAt)
    ? new Date(sourceReferenceAt + maxAgeDays * dayMs).toISOString()
    : '';
  const agingRatio = Number(paymentEvidencePolicy.agingThresholdRatio ?? 0.75);
  const freshness = ageDays === null
    ? 'unknown'
    : ageDays > maxAgeDays
      ? 'expired'
      : ageDays >= Math.floor(maxAgeDays * agingRatio)
        ? 'aging'
        : 'fresh';
  return {
    ...signal,
    checkedAt: checkedAtRaw,
    freshnessReferenceAt: sourceReferenceRaw,
    maxAgeDays,
    ageDays,
    checkedAgeDays,
    expiresAt,
    freshness
  };
}

function derivePaymentEvidence(meta, now = Date.now()) {
  if (meta.paymentStatus === 'not_payer') {
    return {
      state: 'not_applicable',
      label: '지급 주체 아님',
      confidence: 'not_applicable',
      freshness: 'not_applicable',
      checkedAt: meta.reviewedAt || '',
      nextReviewAt: '',
      summary: meta.paymentSummary || '',
      signals: []
    };
  }

  const signals = (Array.isArray(meta.paymentSignals) ? meta.paymentSignals : [])
    .map((signal) => enrichPaymentSignal(signal, now));
  const current = signals.filter((signal) => !['expired', 'unknown'].includes(signal.freshness));
  const expiredCount = signals.filter((signal) => signal.freshness === 'expired').length;
  const hasRepeatedMixed = current.some((signal) => signal.direction === 'mixed' && signal.recurrence === 'repeated');
  const hasRepeatedCaution = current.some((signal) => signal.direction === 'caution' && signal.recurrence === 'repeated');
  const hasSingleCaution = current.some((signal) => signal.direction === 'caution' && signal.recurrence === 'single');
  const hasPolicy = current.some((signal) => signal.type === 'official_policy');
  let state = 'insufficient';
  let label = '근거 부족';
  let confidence = 'low';
  if (!current.length && signals.length) {
    state = 'evidence_expired';
    label = '근거 만료·재검토 필요';
  } else if (hasRepeatedMixed) {
    state = 'mixed_caution';
    label = '상반된 신호·반복 주의';
    confidence = 'moderate';
  } else if (hasRepeatedCaution) {
    state = 'caution_repeated';
    label = '반복 주의 신호';
    confidence = 'moderate';
  } else if (hasSingleCaution) {
    state = 'caution_single';
    label = '단일 주의 사례';
    confidence = 'low';
  } else if (hasPolicy) {
    state = 'policy_only';
    label = '공식 지급 정책 확인';
    confidence = 'low';
  }

  const freshness = !signals.length
    ? 'insufficient'
    : !current.length
      ? 'expired'
      : expiredCount
        ? 'mixed_age'
        : current.some((signal) => signal.freshness === 'aging')
          ? 'aging'
          : 'fresh';
  const futureExpiries = current.map((signal) => Date.parse(signal.expiresAt)).filter(Number.isFinite);
  const nextReviewAt = futureExpiries.length ? new Date(Math.min(...futureExpiries)).toISOString() : '';
  const summary = state === 'evidence_expired'
    ? '기존 지급 평판 근거의 유효기간이 지나 현재 신뢰 신호로 사용하지 않습니다. 최신 근거 재검토가 필요합니다.'
    : (meta.paymentSummary || '');
  return {
    state,
    label,
    confidence,
    freshness,
    checkedAt: meta.reviewedAt || '',
    nextReviewAt,
    summary,
    signals
  };
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function decodeHtml(value) {
  return decodeXml(String(value ?? ''))
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function htmlPlainText(value) {
  return text(
    decodeHtml(String(value ?? '')
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?\s*>/gi, ' ')
      .replace(/<\/p>|<\/li>|<\/div>|<\/tr>/gi, ' '))
  );
}

function jsonLdJobPostings(html) {
  const postings = [];
  for (const match of String(html ?? '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1]).trim());
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      for (const item of queue) {
        if (!item || typeof item !== 'object') continue;
        if (item['@type'] === 'JobPosting') postings.push(item);
        if (Array.isArray(item['@graph'])) postings.push(...item['@graph'].filter((entry) => entry?.['@type'] === 'JobPosting'));
      }
    } catch {
      // Ignore unrelated or malformed structured-data blocks; detail parsing fails closed below if no JobPosting remains.
    }
  }
  return postings;
}

function nextDataJson(html) {
  const match = String(html ?? '').match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(decodeHtml(match[1]).trim());
  } catch {
    return null;
  }
}

function uniqueIds(html, regex, limit = 40) {
  const values = [];
  const seen = new Set();
  for (const match of String(html ?? '').matchAll(regex)) {
    const id = text(match[1]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    values.push(id);
    if (values.length >= limit) break;
  }
  return values;
}

async function mapLimit(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { ok: true, value: await mapper(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function schemaEmploymentType(value) {
  const labels = {
    FULL_TIME: '정규직',
    PART_TIME: '아르바이트',
    CONTRACTOR: '계약직',
    TEMPORARY: '파견·임시직',
    INTERN: '인턴',
    FREELANCER: '프리랜서',
    FREE_LANCER: '프리랜서',
    OTHER: '기타'
  };
  return (Array.isArray(value) ? value : [value]).map((item) => labels[text(item)] || text(item)).filter(Boolean).join(', ') || '미상';
}

function schemaAddress(posting) {
  const address = Array.isArray(posting?.jobLocation) ? posting.jobLocation[0]?.address : posting?.jobLocation?.address;
  if (!address || typeof address !== 'object') return '';
  const street = text(decodeHtml(address.streetAddress));
  const region = text(decodeHtml(address.addressRegion));
  const locality = text(decodeHtml(address.addressLocality));
  if (street && ((region && street.includes(region)) || (locality && street.includes(locality)))) return street;
  return [region, locality, street].filter(Boolean).join(' ');
}

function schemaSalaryRaw(posting) {
  const salary = posting?.baseSalary;
  const value = salary?.value?.value ?? salary?.value;
  if (!Number.isFinite(Number(value))) return '';
  const period = ({ HOUR: '시급', DAY: '일급', WEEK: '주급', MONTH: '월급', YEAR: '연봉' })[text(salary?.value?.unitText).toUpperCase()];
  if (!period) return '';
  return `${period} ${Number(value).toLocaleString('en-US')}원`;
}

function fixedDeadline(value) {
  const raw = text(value);
  if (!raw) return { type: '', date: '', label: '' };
  const date = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
  return date ? { type: 'fixed', date, label: raw } : { type: 'unknown', date: '', label: raw };
}

const localDomesticBoardSources = new Set(['고용24', '알바몬', '알바천국', '잡코리아', '사람인', '인크루트']);

function xmlTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1].trim()) : '';
}

function xmlBlocks(value, tag) {
  return [...String(value ?? '').matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi'))]
    .map((match) => match[1]);
}

function work24IsoDate(value) {
  const raw = text(value);
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length < 8) return null;
  const datePart = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  const timePart = digits.length >= 14
    ? `T${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}+09:00`
    : 'T00:00:00+09:00';
  const parsed = new Date(`${datePart}${timePart}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function work24Deadline(value) {
  const raw = text(value);
  if (!raw) return { type: '', date: '', label: '' };
  if (/채용시|상시|수시/.test(raw)) return { type: 'rolling', date: '', label: raw };
  const digits = raw.replace(/[^0-9]/g, '');
  const date = digits.length >= 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : '';
  const valid = date && !Number.isNaN(Date.parse(`${date}T00:00:00+09:00`));
  return {
    type: valid ? 'fixed' : 'unknown',
    date: valid ? date : '',
    label: raw
  };
}

const work24EmploymentType = (code) => ({
  '10': '기간의 정함이 없는 근로계약',
  '11': '기간의 정함이 없는 근로계약(시간선택제)',
  '20': '기간의 정함이 있는 근로계약',
  '21': '기간의 정함이 있는 근로계약(시간선택제)',
  Y: '대체인력채용'
})[text(code)] || (text(code) ? `고용형태 코드 ${text(code)}` : '미상');

function parseWork24ListXml(xml) {
  const blocks = xmlBlocks(xml, 'wanted');
  return blocks.map((block) => ({
    wantedAuthNo: xmlTag(block, 'wantedAuthNo'),
    company: xmlTag(block, 'company'),
    title: xmlTag(block, 'title'),
    salTpNm: xmlTag(block, 'salTpNm'),
    sal: xmlTag(block, 'sal'),
    minSal: xmlTag(block, 'minSal'),
    maxSal: xmlTag(block, 'maxSal'),
    region: xmlTag(block, 'region'),
    holidayTpNm: xmlTag(block, 'holidayTpNm'),
    minEdubg: xmlTag(block, 'minEdubg'),
    maxEdubg: xmlTag(block, 'maxEdubg'),
    career: xmlTag(block, 'career'),
    regDt: xmlTag(block, 'regDt'),
    closeDt: xmlTag(block, 'closeDt'),
    infoSvc: xmlTag(block, 'infoSvc'),
    wantedInfoUrl: xmlTag(block, 'wantedInfoUrl'),
    zipCd: xmlTag(block, 'zipCd'),
    strtnmCd: xmlTag(block, 'strtnmCd'),
    basicAddr: xmlTag(block, 'basicAddr'),
    detailAddr: xmlTag(block, 'detailAddr'),
    empTpCd: xmlTag(block, 'empTpCd'),
    jobsCd: xmlTag(block, 'jobsCd'),
    smodifyDtm: xmlTag(block, 'smodifyDtm')
  })).filter((row) => row.wantedAuthNo && row.title);
}

function parseAmount(value) {
  let raw = String(value ?? '').trim().toLowerCase();
  if (/^\d+,\d{1,2}\s*[km]$/i.test(raw)) raw = raw.replace(',', '.');
  else raw = raw.replace(/,/g, '');
  const match = raw.match(/(\d+(?:\.\d+)?)\s*([km])?/i);
  if (!match) return null;
  const multiplier = match[2] === 'k' ? 1000 : match[2] === 'm' ? 1000000 : 1;
  return Math.round(Number(match[1]) * multiplier * 100) / 100;
}

function salaryContext(rawValue, description) {
  const explicit = text(rawValue);
  if (explicit) return explicit;
  const desc = text(description);
  const labelled = desc.match(/\b(?:pay rate|pay|rate|salary|compensation|remuneration|hourly rate|base salary)\b\s*:?\s*([^;\n]{1,100})/i);
  if (labelled) {
    const candidate = labelled[0];
    const expenseLike = /\b(?:you|employee|candidate)\s+(?:pay|contribute)\b|\bpay\b[^.;\n]{0,40}\byourself\b|\bout[- ]of[- ]pocket\b/i.test(candidate);
    const hasMoney = /(?:USD|EUR|GBP|KRW|CAD|AUD|JPY|CHF|PLN|BRL|INR|SGD|HKD|AED|USDT|[$€£₩¥])\s*\d|\d[\d,.]*(?:\.\d+)?\s*(?:USD|EUR|GBP|KRW|CAD|AUD|JPY|CHF|PLN|BRL|INR|SGD|HKD|AED|USDT)\b/i.test(candidate);
    const hasRate = /\d[\d,.]*(?:\.\d+)?\s*[km]?\s*(?:[-–—]\s*\d[\d,.]*(?:\.\d+)?\s*[km]?)?\s*(?:\/|per\s+|an?\s+)(?:hour|hr|day|week|month|year|annum|project)\b/i.test(candidate);
    const hasCompactRange = /\b\d+(?:[.,]\d+)?\s*[km]\s*[-–—]\s*\d+(?:[.,]\d+)?\s*[km]\b/i.test(candidate);
    if (!expenseLike && (hasMoney || hasRate || hasCompactRange)) return candidate;
  }
  const inline = desc.match(/(?:USD|EUR|GBP|KRW|CAD|AUD|JPY|CHF|PLN|BRL|INR|SGD|HKD|AED|USDT|[$€£₩¥])\s*\d[\d,.]*(?:\.\d+)?(?:\s*[-–—]\s*(?:USD|EUR|GBP|KRW|CAD|AUD|JPY|CHF|PLN|BRL|INR|SGD|HKD|AED|USDT|[$€£₩¥])?\s*\d[\d,.]*(?:\.\d+)?)?\s*(?:\/|per\s+|an?\s+)(?:hour|hr|day|week|month|year|annum|project)\b/i);
  return inline?.[0] || '';
}

function extractSalary(rawValue, description = '') {
  const koreanPayText = text([rawValue, description].filter(Boolean).join(' '));
  const koreanPay = koreanPayText.match(/(?:급여\s*:?\s*)?(시급|일급|주급|월급|연봉)\s*:?\s*(\d[\d,]*(?:\.\d+)?)\s*(만)?\s*원(?:\s*(?:[-~–—]|부터|~)\s*(\d[\d,]*(?:\.\d+)?)\s*(만)?\s*원)?\s*(이상|이하)?/);
  if (koreanPay) {
    const min = parseAmount(koreanPay[2]) * (koreanPay[3] ? 10000 : 1);
    const secondRaw = parseAmount(koreanPay[4]);
    const second = Number.isFinite(secondRaw) ? secondRaw * (koreanPay[5] ? 10000 : 1) : null;
    const max = Number.isFinite(second) ? Math.max(min, second) : min;
    const low = Number.isFinite(second) ? Math.min(min, second) : min;
    const period = ({ 시급: 'hour', 일급: 'day', 주급: 'week', 월급: 'month', 연봉: 'year' })[koreanPay[1]];
    const symbol = '₩';
    const fmt = (value) => Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
    const range = max !== low ? `${symbol}${fmt(low)}–${symbol}${fmt(max)}` : `${symbol}${fmt(low)}`;
    const qualifier = koreanPay[6] === '이상' ? 'minimum' : koreanPay[6] === '이하' ? 'maximum' : '';
    const qualifierLabel = qualifier === 'minimum' ? '최소 ' : qualifier === 'maximum' ? '최대 ' : '';
    const display = `${qualifierLabel}${range}${({ hour: '/시간', day: '/일', week: '/주', month: '/월', year: '/년' })[period]}`;
    return {
      raw: koreanPay[0],
      display,
      currency: 'KRW',
      min: low,
      max,
      period,
      confidence: 'parsed',
      qualifier,
      paymentBasis: '',
      scope: ''
    };
  }
  const regionalPay = text(description).match(/for candidates located in (.{1,140}?)(?:,?\s+the\s+)?(?:starting base pay|base pay|pay)[^.]{0,100}(?:ranges? from\s+)?([$€£₩¥]\s*\d[\d,.]*(?:\.\d+)?)\s*(?:to|[-–—])\s*([$€£₩¥]?\s*\d[\d,.]*(?:\.\d+)?)\s*(?:per\s+|\/)(hour|hr|day|week|month|year).{0,260}(?:outside|other locations?|elsewhere).{0,180}(?:may|can|could|will)?\s*(?:fall outside|vary|differ)/i);
  if (!text(rawValue) && regionalPay) {
    const scoped = extractSalary(`${regionalPay[2]} to ${regionalPay[3]} per ${regionalPay[4]}`);
    const scopeLabel = text(regionalPay[1]);
    const usStates = /california|new york|washington|colorado/i.test(scopeLabel);
    return {
      ...scoped,
      raw: regionalPay[0],
      display: `${usStates ? '미국 일부 주' : scopeLabel || '특정 지역'} 기준 ${scoped.display} · 기타 지역 단가 확인`,
      confidence: 'regional_only',
      scope: 'regional_only',
      scopeLabel
    };
  }
  const raw = salaryContext(rawValue, description);
  if (!raw) {
    const desc = lower(description);
    if (/\bfixed hourly rate\b|\bcompensation\b[^.]{0,80}\bfixed hourly\b/.test(desc)) {
      return { raw: '', display: '금액 비공개 · 시간당 고정 단가', currency: '', min: null, max: null, period: 'hour', confidence: 'basis_only', paymentBasis: 'fixed_hourly' };
    }
    if (/\bpaid per completed set\b|\bcompensation\b[^.]{0,100}\bper completed set\b/.test(desc)) {
      return { raw: '', display: '금액 비공개 · 완료 세트당 지급', currency: '', min: null, max: null, period: 'set', confidence: 'basis_only', paymentBasis: 'per_completed_set' };
    }
    if (/\bpaid per (?:job|task|item)\b/.test(desc)) {
      return { raw: '', display: '금액 비공개 · 건별 지급', currency: '', min: null, max: null, period: 'task', confidence: 'basis_only', paymentBasis: 'per_task' };
    }
    if (/\btask[- ]based compensation\b/.test(desc)) {
      return { raw: '', display: '금액 비공개 · 건별 지급', currency: '', min: null, max: null, period: 'task', confidence: 'basis_only', paymentBasis: 'per_task' };
    }
    return { raw: '', display: '', currency: '', min: null, max: null, period: '', confidence: 'none', paymentBasis: '' };
  }
  const normalizedRaw = lower(raw);
  const normalizedDescription = lower(description);
  const isMaximum = /\bup to\b/.test(normalizedRaw);
  const moneyToken = '(?:USD|EUR|GBP|KRW|CAD|AUD|JPY|CHF|PLN|BRL|INR|SGD|HKD|AED|USDT|[$€£₩¥])';
  const isApproximate = new RegExp(`\\b(?:approximately|approx\\.?|about|around)\\b(?=[^0-9$€£₩¥]{0,16}${moneyToken}?\\s*\\d)`, 'i').test(raw);
  const isPerTaskApproximation = /\bpaid per (?:job|task|item)\b/.test(normalizedRaw);
  const geographyDependent = /\b(?:exact rate|pay rate|rate|rates|compensation)\b[^.]{0,160}\b(?:determined|vary|varies|differ|different)\b[^.]{0,120}\b(?:geographic location|country|location)\b/i.test(normalizedDescription)
    || /\brates?\s+(?:vary|varies|differ)\s+(?:by|per)\s+(?:country|location)\b/i.test(normalizedDescription);
  const currencyMatch = raw.match(/\b(USD|EUR|GBP|KRW|CAD|AUD|JPY|CHF|PLN|BRL|INR|SGD|HKD|AED|USDT)\b|([$€£₩¥])/i);
  const currency = currencyMatch
    ? ({ '$': 'USD', '€': 'EUR', '£': 'GBP', '₩': 'KRW', '¥': 'JPY' }[currencyMatch[0]] ?? currencyMatch[0].toUpperCase())
    : '';
  const periodMatch = raw.match(/(?:per\s*)?(hour|hr|hourly|day|daily|week|weekly|month|monthly|year|yearly|annual|annually|annum|project|episode)\b/i);
  const periodMap = { hr: 'hour', hourly: 'hour', daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year', annual: 'year', annually: 'year', annum: 'year' };
  const periodRaw = periodMatch?.[1]?.toLowerCase() ?? '';
  const period = periodMap[periodRaw] ?? periodRaw;
  const currencyToken = '(?:USD|EUR|GBP|KRW|CAD|AUD|JPY|CHF|PLN|BRL|INR|SGD|HKD|AED|USDT|[$€£₩¥])';
  const rangeMatch = raw.match(new RegExp(`${currencyToken}\\s*(\\d[\\d,.]*(?:\\.\\d+)?\\s*[kKmM]?)\\s*(?:[-–—]|to)\\s*(?:${currencyToken}\\s*)?(\\d[\\d,.]*(?:\\.\\d+)?\\s*[kKmM]?)`, 'i'))
    || raw.match(new RegExp(`(\\d[\\d,.]*(?:\\.\\d+)?\\s*[kKmM]?)\\s*(?:[-–—]|to)\\s*(\\d[\\d,.]*(?:\\.\\d+)?\\s*[kKmM]?)\\s*${currencyToken}`, 'i'));
  let numbers = [];
  if (rangeMatch) {
    let first = parseAmount(rangeMatch[1]);
    let second = parseAmount(rangeMatch[2]);
    const firstSuffix = rangeMatch[1].match(/([km])\s*$/i)?.[1]?.toLowerCase();
    const secondSuffix = rangeMatch[2].match(/([km])\s*$/i)?.[1]?.toLowerCase();
    if (!firstSuffix && secondSuffix && Number.isFinite(first) && first < 1000) first *= secondSuffix === 'm' ? 1000000 : 1000;
    if (!secondSuffix && firstSuffix && Number.isFinite(second) && second < 1000) second *= firstSuffix === 'm' ? 1000000 : 1000;
    numbers = [first, second].filter((value) => Number.isFinite(value));
  } else if (currency) {
    const moneyMatches = [...raw.matchAll(new RegExp(`(?:${currencyToken}\\s*)?(\\d[\\d,.]*(?:\\.\\d+)?\\s*[kKmM]?)(?:\\s*${currencyToken})?`, 'gi'))]
      .filter((match) => new RegExp(currencyToken, 'i').test(match[0]))
      .map((match) => parseAmount(match[1]))
      .filter((value) => Number.isFinite(value));
    numbers = moneyMatches.slice(0, 2);
  }
  const min = numbers.length ? Math.min(...numbers.slice(0, 2)) : null;
  const max = numbers.length > 1 ? Math.max(...numbers.slice(0, 2)) : min;
  if (!currency || min === null) {
    const suffix = !currency ? ' · 통화/주기 확인 필요' : ' · 형식 확인 필요';
    return { raw, display: `${raw}${suffix}`, currency, min, max, period, confidence: 'raw' };
  }
  const suspicious = (period === 'hour' && max > 1000) || (period === 'year' && max < 1000);
  if (suspicious) {
    return { raw, display: `${raw} · 단위 확인 필요`, currency, min, max, period, confidence: 'suspicious' };
  }
  const symbol = { USD: '$', EUR: '€', GBP: '£', KRW: '₩', JPY: '¥', CAD: 'CAD ', AUD: 'AUD ', CHF: 'CHF ', PLN: 'PLN ', BRL: 'BRL ', INR: 'INR ', SGD: 'SGD ', HKD: 'HKD ', AED: 'AED ', USDT: 'USDT ' }[currency] ?? `${currency} `;
  const fmt = (value) => Number.isInteger(value) ? value.toLocaleString('en-US') : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const range = max !== null && max !== min ? `${symbol}${fmt(min)}–${symbol}${fmt(max)}` : `${symbol}${fmt(min)}`;
  const periodLabel = { hour: '/시간', day: '/일', week: '/주', month: '/월', year: '/년', project: '/프로젝트', episode: '/에피소드' }[period] ?? '';
  let display = periodLabel ? `${range}${periodLabel}` : `${range} · 주기 확인 필요`;
  if (isMaximum) display = `최대 ${display}`;
  else if (isApproximate) display = `약 ${display}`;
  if (isPerTaskApproximation && period === 'hour') display += ' · 건당 지급 환산';
  return {
    raw,
    display,
    currency,
    min,
    max,
    period,
    confidence: periodLabel ? 'parsed' : 'partial',
    qualifier: isMaximum ? 'maximum' : isApproximate ? 'approximate' : '',
    paymentBasis: isPerTaskApproximation ? 'per_task_equivalent' : '',
    scope: geographyDependent ? 'geography_dependent' : ''
  };
}

function canonicalCompany(value) {
  return lower(value)
    .replace(/\b(incorporated|inc\.?|llc|ltd\.?|limited|corp\.?|corporation|gmbh|plc)\b/g, '')
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalTitle(value) {
  return lower(value)
    .replace(/\[(?:remote|remote\s*&\s*online|work from home)[^\]]*\]/g, '')
    .replace(/\((?:remote|work from home)\)/g, '')
    .replace(/\bremote\b/g, '')
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function localDetailError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function koreanVisibleDeadline(value) {
  const plain = text(value);
  if (/(?:모집마감|마감일)\s*[:：]?\s*(?:상시모집|상시채용)|상시(?:모집|채용)/.test(plain)) {
    return { type: 'rolling', date: '', label: '상시채용' };
  }
  const fixed = plain.match(/(?:모집마감|마감일)\s*(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!fixed) return null;
  const date = [fixed[1], fixed[2].padStart(2, '0'), fixed[3].padStart(2, '0')].join('-');
  return { type: 'fixed', date, label: date };
}

function htmlClassValue(html, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(html || '').match(new RegExp(`<[^>]+class=["'][^"']*${escaped}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'));
  return match ? htmlPlainText(match[1]) : '';
}

function albaLegacyDefinition(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(html || '').match(new RegExp(`<dt[^>]*>\\s*${escaped}\\s*<\\/dt>\\s*<dd[^>]*>([\\s\\S]*?)<\\/dd>`, 'i'));
  return match ? htmlPlainText(match[1]) : '';
}

function salaryPostingFromKorean(label, amountText) {
  const unit = ({ 시급: 'HOUR', 일급: 'DAY', 주급: 'WEEK', 월급: 'MONTH', 연봉: 'YEAR' })[text(label)];
  const amount = Number(text(amountText).replace(/[^0-9.]/g, ''));
  if (!unit || !Number.isFinite(amount) || amount <= 0) return null;
  return {
    '@type': 'MonetaryAmount',
    currency: 'KRW',
    value: { '@type': 'QuantitativeValue', value: amount, unitText: unit }
  };
}

function albaLegacyJobPosting(html) {
  const company = htmlClassValue(html, 'detail-primary__company');
  const title = htmlClassValue(html, 'detail-primary__title');
  const address = htmlClassValue(html, 'workplace-addr__text')
    || text(decodeHtml(String(html || '').match(/<input[^>]+id=["']strContents["'][^>]+value=["']([^"']+)["']/i)?.[1] || ''));
  if (!company || !title || !address) return null;
  const summaryPairs = [...String(html || '').matchAll(/<dt[^>]+class=["'][^"']*detail-summary__title[^"']*["'][^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]+class=["'][^"']*detail-summary__data[^"']*["'][^>]*>([\s\S]*?)<\/dd>/gi)]
    .map((match) => [htmlPlainText(match[1]), htmlPlainText(match[2])]);
  const pay = summaryPairs.find(([label]) => /^(?:시급|일급|주급|월급|연봉)$/.test(label));
  const education = albaLegacyDefinition(html, '학력');
  const experience = albaLegacyDefinition(html, '경력');
  const employmentType = /아르바이트|알바/.test(title) ? 'PART_TIME' : '';
  return {
    '@type': 'JobPosting',
    title,
    hiringOrganization: { '@type': 'Organization', name: company },
    jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', streetAddress: address } },
    ...(pay ? { baseSalary: salaryPostingFromKorean(pay[0], pay[1]) } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(education ? { educationRequirements: education } : {}),
    ...(experience ? { experienceRequirements: experience } : {}),
    description: [title, company, education && `학력 ${education}`, experience && `경력 ${experience}`].filter(Boolean).join(' · '),
    _fallbackFormat: 'alba_legacy_html'
  };
}

function localAddressText(value) {
  const raw = text(value);
  return /(?:전북특별자치도|전라북도|전북)?\s*전주시(?:\s|$)|(?:전북특별자치도|전라북도|전북)?\s*완주군(?:\s|$)/.test(raw);
}

function exactSingleLocalListLocation(value) {
  const raw = text(value);
  if (!raw || /외\s*\d+|전국|재택|원격/.test(raw)) return false;
  return /^(?:전북특별자치도|전라북도|전북)\s+(?:전주시|완주군)(?:\s+(?:완산구|덕진구|[가-힣0-9]+(?:읍|면|동(?:\d+가)?)))?$/.test(raw);
}

function localMunicipality(value) {
  const raw = text(value);
  const jeonju = /(?:전북특별자치도|전라북도|전북)?\s*전주시(?:\s|$)/.test(raw);
  const wanju = /(?:전북특별자치도|전라북도|전북)?\s*완주군(?:\s|$)/.test(raw);
  if (jeonju === wanju) return '';
  return jeonju ? '전주시' : '완주군';
}

function detailContradictsListLocation(plainText) {
  return /근무지(?:역|주소|장소)?[^.\n]{0,80}(?:상이|협의|변경|배정)|근무지\s*및\s*근무조[^.\n]{0,80}상이|전국\s*(?:채용|모집|근무|지역|대상)|재택근무|원격근무/.test(plainText);
}

function albamonListCandidates(html) {
  const nextData = nextDataJson(html);
  const root = nextData?.props?.pageProps?.dehydratedState?.queries?.[0]?.state?.data;
  if (!root) return [];
  const rows = [];
  const visitedArrays = new Set();
  const walk = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      if (value.length && value[0] && typeof value[0] === 'object' && 'recruitNo' in value[0] && 'workplaceAddress' in value[0]) {
        if (!visitedArrays.has(value)) {
          visitedArrays.add(value);
          rows.push(...value);
        }
        return;
      }
      for (const item of value) walk(item);
      return;
    }
    for (const item of Object.values(value)) walk(item);
  };
  walk(root);
  const candidates = [];
  const seen = new Set();
  const seenRoleAtAddress = new Set();
  for (const row of rows) {
    const id = text(row?.recruitNo);
    const title = text(row?.recruitTitle);
    const company = text(row?.companyName);
    const workAddress = text(row?.workplaceAddress);
    if (!id || seen.has(id) || !localAddressText(workAddress)) continue;
    if (/전국\s*(?:채용|모집|근무|지역|대상)|전국채용|재택근무|원격근무/.test(title)) continue;
    const roleKey = [canonicalLocalCompany(company), canonicalTitle(title), canonicalDomesticAddress(workAddress)].join('::');
    if (roleKey && seenRoleAtAddress.has(roleKey)) continue;
    seen.add(id);
    if (roleKey) seenRoleAtAddress.add(roleKey);
    const payLabel = text(row?.payType?.description);
    const pay = text(row?.pay);
    candidates.push({
      id,
      title,
      company,
      workAddress,
      listLocation: text(row?.workplaceArea),
      salaryRaw: payLabel && pay ? `${payLabel} ${pay}` : '',
      deadlineLabel: text(row?.closingDateWithDDay || row?.closingDate),
      postedAt: text(row?.postedDate),
      evidence: 'embedded_list'
    });
  }
  return candidates;
}

function albaRegionListCandidates(html) {
  const candidates = [];
  const seen = new Set();
  for (const part of String(html || '').split(/data-imid=["']/i).slice(1)) {
    const id = text(part.match(/^(\d+)/)?.[1]);
    if (!id || seen.has(id)) continue;
    const detailId = text(part.match(/\/job\/Detail\?[^"'<>]*?adid=(\d+)/i)?.[1]);
    if (detailId !== id) continue;
    const location = htmlPlainText(
      part.match(/<span[^>]+class=["'][^"']*job-list__area[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]
      || part.match(/<(?:p|span)[^>]+class=["'][^"']*(?:goods-banner__local|\blocal\b)[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|span)>/i)?.[1]
      || part.match(/<td[^>]+class=["'][^"']*\blocal\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1]
      || ''
    );
    if (!/^(?:전북특별자치도|전라북도|전북)\s+(?:전주시|완주군)(?:\s|$)/.test(location)) continue;
    const title = htmlPlainText(
      part.match(/<span[^>]+class=["'][^"']*job-list__subject[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]
      || part.match(/<p[^>]+class=["'][^"']*goods-banner__title[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]
      || part.match(/<span[^>]+class=["'][^"']*\btitle\b[^"']*["'][^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i)?.[1]
      || ''
    );
    if (/전국\s*(?:채용|모집|근무|지역|대상)|전국채용|재택근무|원격근무/.test(title)) continue;
    const companyHtml = part.match(/<span[^>]+class=["'][^"']*job-list__company[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*<\/span>/i)?.[1]
      || part.match(/<p[^>]+class=["'][^"']*goods-banner__company[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]
      || part.match(/<span[^>]+class=["'][^"']*\bcompany\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]
      || '';
    let company = htmlPlainText(String(companyHtml).replace(/<span[^>]+class=["'][^"']*job-list__area[^"']*["'][^>]*>[\s\S]*?<\/span>/i, ''));
    if (location && company.endsWith(location)) company = company.slice(0, -location.length).trim();
    const payLabel = htmlPlainText(part.match(/<span[^>]+class=["'][^"']*payIcon[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
    const payAmount = htmlPlainText(
      part.match(/<(?:strong|span)[^>]+class=["'][^"']*(?:job-list__number|\bnumber\b)[^"']*["'][^>]*>([\s\S]*?)<\/(?:strong|span)>/i)?.[1]
      || ''
    );
    const deadlineLabel = htmlPlainText(part.match(/<span[^>]+class=["'][^"']*job-list__deadline[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
    const postedAt = text(part.match(/<div[^>]+class=["'][^"']*job-list__col\s+regDate[^"']*["'][^>]*>\s*(20\d{2}\.\d{2}\.\d{2})/i)?.[1] || '');
    seen.add(id);
    candidates.push({
      id,
      title,
      company,
      listLocation: location,
      salaryRaw: payLabel && payAmount ? payLabel + ' ' + payAmount + '원' : '',
      deadlineLabel,
      postedAt,
      evidence: 'public_list'
    });
  }
  return candidates;
}

function albaSearchListCandidates(html) {
  const candidates = [];
  const seen = new Set();
  const listText = (value) => htmlPlainText(String(value || '').replace(/<\/?em\b[^>]*>/gi, ''));
  for (const match of String(html || '').matchAll(/<li[^>]+class=["'][^"']*job-list__row[^"']*["'][^>]+data-imid=["'](\d+)["'][^>]*>([\s\S]*?)<\/li>/gi)) {
    const id = text(match[1]);
    const part = match[2];
    if (!id || seen.has(id)) continue;
    const detailId = text(part.match(/\/job\/Detail\?[^"'<>]*?adid=(\d+)/i)?.[1]);
    if (detailId !== id) continue;
    const location = listText(part.match(/<span[^>]+class=["'][^"']*job-list__area[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
    if (!/^(?:전북특별자치도|전라북도|전북)\s+(?:전주시|완주군)(?:\s|$)/.test(location)) continue;
    const title = listText(part.match(/<span[^>]+class=["'][^"']*job-list__subject[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
    if (!title || /전국\s*(?:채용|모집|근무|지역|대상)|전국채용|재택근무|원격근무/.test(title)) continue;
    const companyHtml = part.match(/<span[^>]+class=["'][^"']*job-list__company[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*<\/span>/i)?.[1] || '';
    let company = listText(companyHtml);
    if (location && company.endsWith(location)) company = company.slice(0, -location.length).trim();
    const payLabel = htmlPlainText(part.match(/<span[^>]+class=["'][^"']*payIcon[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
    const payAmount = htmlPlainText(part.match(/<strong[^>]+class=["'][^"']*job-list__number[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i)?.[1] || '');
    const deadlineLabel = htmlPlainText(part.match(/<span[^>]+class=["'][^"']*job-list__deadline[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
    const postedAt = text(part.match(/<div[^>]+class=["'][^"']*job-list__col\s+regDate[^"']*["'][^>]*>\s*(20\d{2}\.\d{2}\.\d{2})/i)?.[1] || '');
    if (!company) continue;
    seen.add(id);
    candidates.push({
      id,
      title,
      company,
      listLocation: location,
      salaryRaw: payLabel && payAmount ? payLabel + ' ' + payAmount + '원' : '',
      deadlineLabel,
      postedAt,
      evidence: 'public_search_list'
    });
  }
  return candidates;
}

function jobKoreaSearchCandidates(html) {
  const candidates = [];
  const seen = new Set();
  for (const part of String(html || '').split('data-sentry-component="CardJob"').slice(1)) {
    const id = text(part.match(/\/Recruit\/GI_Read\/(\d+)/i)?.[1]);
    if (!id || seen.has(id)) continue;
    const title = htmlPlainText(part.match(/data-sentry-component="Title"[\s\S]{0,1200}?<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
    const location = htmlPlainText(part.match(/emoji--basicemoji-place2[\s\S]{0,1000}?<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
    if (!exactSingleLocalListLocation(location)) continue;
    if (/전국\s*(?:채용|모집|근무|지역|대상)|전국채용|재택근무|원격근무/.test(title)) continue;
    seen.add(id);
    candidates.push({ id, title, listLocation: location, evidence: 'search_card' });
  }
  return candidates;
}

function saraminAreaListCandidates(html) {
  const raw = String(html || '');
  const starts = [...raw.matchAll(/<div\s+id=["']rec-(\d+)["']\s+class=["'][^"']*\blist_item\b[^"']*["'][^>]*>/gi)];
  const candidates = [];
  const seen = new Set();
  for (let index = 0; index < starts.length; index += 1) {
    const id = text(starts[index][1]);
    if (!id || seen.has(id)) continue;
    const from = starts[index].index;
    const to = index + 1 < starts.length ? starts[index + 1].index : raw.length;
    const block = raw.slice(from, to);
    const title = htmlPlainText(
      block.match(/class=["']job_tit["'][\s\S]{0,1500}?<a[^>]+title=["']([^"']+)["']/i)?.[1]
      || block.match(/class=["']job_tit["'][\s\S]{0,1500}?<span[^>]*>([\s\S]*?)<\/span>/i)?.[1]
      || ''
    );
    const rawCompany = htmlPlainText(
      block.match(/class=["'][^"']*\bcompany_nm\b[^"']*["'][\s\S]{0,1200}?<a[^>]+class=["'][^"']*\bstr_tit\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1]
      || ''
    );
    const company = text(rawCompany.replace(/관심기업\s*등록/g, ' ').replace(title, ' ')) || rawCompany;
    const listLocation = htmlPlainText(block.match(/class=["']work_place["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
    const careerType = htmlPlainText(block.match(/class=["']career["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
    const education = htmlPlainText(block.match(/class=["']education["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
    const deadlineLabel = htmlPlainText(block.match(/class=["']date["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
    if (!title || !localAddressText(listLocation)) continue;
    if (/전국\s*(?:채용|모집|근무|지역|대상)|전국채용|재택근무|원격근무/.test(`${title} ${listLocation}`)) continue;
    seen.add(id);
    candidates.push({
      id,
      title,
      company,
      listLocation,
      careerType,
      education,
      deadlineLabel,
      evidence: 'public_area_list'
    });
  }
  return candidates;
}

function incruitSearchCandidates(html) {
  const raw = String(html || '');
  const candidates = [];
  const seen = new Set();
  for (const match of raw.matchAll(/<ul[^>]+class=["'][^"']*\bc_row\b[^"']*["'][^>]+jobno=["'](\d+)["'][^>]*>([\s\S]*?)<\/ul>/gi)) {
    const id = text(match[1]);
    const block = match[2];
    if (!/^\d+$/.test(id) || seen.has(id)) continue;
    if (!new RegExp(`id=["']JobList_${id}["']`, 'i').test(block)) continue;
    const detailMatch = block.match(new RegExp(`<a[^>]+href=["'](?:https:\\/\\/job\\.incruit\\.com)?\\/jobdb_info\\/jobpost\\.asp\\?job=${id}(?:&[^"']*)?["'][^>]*>([\\s\\S]*?)<\\/a>`, 'i'));
    if (!detailMatch) continue;
    const title = htmlPlainText(detailMatch[1]);
    const company = htmlPlainText(block.match(/<a[^>]+class=["'][^"']*\bcpname\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1] || '');
    const metaBlock = block.match(/<div[^>]+class=["'][^"']*\bcl_md\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
    const meta = [...metaBlock.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)].map((item) => htmlPlainText(item[1]));
    const listLocation = meta[0] || '';
    if (!title || !company || !exactSingleLocalListLocation(listLocation)) continue;
    if (/전국|재택|원격|\bremote\b/i.test(`${title} ${listLocation}`)) continue;
    const deadlineLabel = htmlPlainText(
      block.match(/<div[^>]+class=["'][^"']*\bcell_last\b[^"']*["'][^>]*>[\s\S]{0,900}?<div[^>]+class=["'][^"']*\bcl_btm\b[^"']*["'][^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i)?.[1]
      || ''
    );
    seen.add(id);
    candidates.push({
      id,
      title,
      company,
      listLocation,
      careerType: meta[1] || '',
      education: meta[2] || '',
      employmentType: meta[3] || '',
      deadlineLabel,
      evidence: 'public_search_list'
    });
  }
  return candidates;
}

function canonicalLocalCompany(value) {
  const normalized = lower(value)
    .replace(/㈜|\((?:주|유)\)|주식회사|유한회사/g, ' ')
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^쿠팡\s*cls$/.test(normalized) || /쿠팡로지스틱스서비스/.test(normalized)) return '쿠팡로지스틱스서비스';
  return normalized;
}

function canonicalDedupeTitle(job) {
  let title = canonicalTitle(job?.title);
  if (!localDomesticBoardSources.has(job?.source) || !domesticLocationKey(job)) return title;
  title = title
    .replace(/\s+(?:전북(?:특별자치도)?\s+)?전주시\s+[가-힣0-9]+(?:구|읍|면|동|가)$/g, '')
    .replace(/\s+전주시(?:덕진구|완산구)$/g, '')
    .replace(/\s+완주군\s+[가-힣0-9]+(?:읍|면|동|가)$/g, '')
    .trim();
  return title || canonicalTitle(job?.title);
}

function canonicalLocation(value) {
  const normalized = lower(value)
    .replace(/\b(remote|work from home|homeoffice)\b/g, '')
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || 'remote';
}

function canonicalDomesticAddress(value) {
  const normalized = text(value)
    .replace(/^\s*\d{5}\s+/, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const road = normalized.match(/([가-힣0-9·.-]+(?:대로|로|길)\s*\d+(?:-\d+)?)/);
  const lot = normalized.match(/([가-힣0-9·.-]+(?:읍|면|동|가|리)\s*\d+(?:-\d+)?)/);
  return lower(road?.[1] || lot?.[1] || '').replace(/\s+/g, '');
}

function localCrossPlatformDuplicateKey(job) {
  if (!localDomesticBoardSources.has(job?.source)) return '';
  const region = job.domesticRegion || domesticRegionFor(job);
  if (region?.precision !== 'address') return '';
  const address = canonicalDomesticAddress(job.workAddress || job.location);
  const company = canonicalLocalCompany(job.company);
  const salary = job.salaryInfo || {};
  const salaryKey = salary.currency && Number.isFinite(Number(salary.min)) && salary.period
    ? [salary.currency, Number(salary.min), Number(salary.max ?? salary.min), salary.period].join(':')
    : '';
  const category = text(job.category);
  if (!address || !company || !salaryKey || !category || category === '기타') return '';
  return [company, address, category, salaryKey].join('::');
}

function localCrossPlatformGroupKey(job) {
  if (!localDomesticBoardSources.has(job?.source)) return '';
  const region = job.domesticRegion || domesticRegionFor(job);
  if (region?.precision !== 'address') return '';
  const address = canonicalDomesticAddress(job.workAddress || job.location);
  const company = canonicalLocalCompany(job.company);
  const category = text(job.category);
  if (!address || !company || !category || category === '기타') return '';
  return [company, address, category].join('::');
}

function localRoleKeywords(job) {
  const title = lower(job?.title);
  const keywords = [
    '사무', '운영', '물류', '현장', '행정', '인사', '총무', '원무', '자료입력', '전산입력',
    '고객', '상담', '안내', '리셉션', '카페', '바리스타', '매장', '판매', '캐셔', '계산',
    '포장', '생산', '조립', '검사', '배송', '배달', '기사', '주방', '서빙'
  ];
  return new Set(keywords.filter((keyword) => title.includes(keyword)));
}

function canonicalLocalRoleTitle(job) {
  return canonicalDedupeTitle(job)
    .replace(/(?:채용|모집(?:합니다)?|구합니다|구함|직원|사원|정직원)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function localRoleTitleIgnoringExperience(job) {
  return canonicalLocalRoleTitle(job)
    .replace(/(?:신입\s*[\/·&+]\s*경력|신입|경력(?:직)?|경력무관)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function localCrossPlatformDuplicateCompatible(a, b) {
  const regionA = a.domesticRegion || domesticRegionFor(a);
  const regionB = b.domesticRegion || domesticRegionFor(b);
  if (regionA?.precision === 'address' && regionB?.precision === 'address') {
    const addressA = canonicalDomesticAddress(a.workAddress || a.location);
    const addressB = canonicalDomesticAddress(b.workAddress || b.location);
    const companyA = canonicalLocalCompany(a.company);
    const companyB = canonicalLocalCompany(b.company);
    const categoryA = text(a.category);
    const categoryB = text(b.category);
    if (addressA && addressA === addressB && companyA && companyA === companyB && categoryA && categoryA === categoryB && categoryA !== '기타') {
      const roleA = canonicalLocalRoleTitle(a);
      const roleB = canonicalLocalRoleTitle(b);
      if (roleA && roleA === roleB) return true;
      const relaxedRoleA = localRoleTitleIgnoringExperience(a);
      const relaxedRoleB = localRoleTitleIgnoringExperience(b);
      const sameFixedDeadline = a.deadlineType === 'fixed'
        && b.deadlineType === 'fixed'
        && a.deadlineDate
        && a.deadlineDate === b.deadlineDate;
      if (relaxedRoleA && relaxedRoleA === relaxedRoleB && sameFixedDeadline && text(a.type) === text(b.type)) return true;
    }
  }
  const keyA = localCrossPlatformDuplicateKey(a);
  const keyB = localCrossPlatformDuplicateKey(b);
  if (!keyA || keyA !== keyB) return false;
  if (canonicalDedupeTitle(a) === canonicalDedupeTitle(b)) return true;
  const aKeywords = localRoleKeywords(a);
  const bKeywords = localRoleKeywords(b);
  let overlap = 0;
  for (const keyword of aKeywords) {
    if (bKeywords.has(keyword)) overlap += 1;
  }
  return overlap >= 2;
}

function domesticLocationKey(job) {
  if (!(job.marketScopes || marketScopesFor(job)).includes('domestic')) return '';
  if (job.remote && !/\b(?:hybrid|onsite|on-site)\b/i.test(job.workplaceMode || '')) return '';
  const region = job.domesticRegion || domesticRegionFor(job);
  const admin = [region?.province, region?.city, region?.district, region?.neighborhood].filter(Boolean);
  const addressKey = region?.precision === 'address' ? canonicalDomesticAddress(job.workAddress || job.location) : '';
  return [...admin, addressKey].filter(Boolean).join('|') || canonicalLocation(job.location);
}

function stableJobId(job) {
  const scope = domesticLocationKey(job)
    ? `domestic:${domesticLocationKey(job)}`
    : ['worldwide', 'korea'].includes(job.eligibilityCode)
      ? job.eligibilityCode
    : `${job.eligibilityCode || 'unknown'}:${canonicalLocation(job.location)}`;
  const key = `${canonicalCompany(job.company)}::${canonicalDedupeTitle(job)}::${scope}`;
  return `job:${crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)}`;
}

function currentListingState(job) {
  const meta = sourceMeta(job.source);
  const combined = lower(`${job.title} ${job._fullDescription || job.description}`);
  const title = lower(job.title);
  const lead = lower(job._fullDescription || job.description).slice(0, 700);
  if (job.deadlineType === 'fixed' && job.deadlineDate) {
    const closeAt = Date.parse(`${job.deadlineDate}T23:59:59+09:00`);
    if (Number.isFinite(closeAt) && closeAt < Date.now()) {
      return {
        code: 'expired', label: '종료 확인됨', stale: true,
        reason: `명시된 지원 마감일이 지남: ${job.deadlineDate}`,
        basis: 'structured_deadline', verification: 'closed'
      };
    }
  }
  if (/applications?(?: and assessments?)? (?:are )?closed|no longer accepting applications|position has been filled/.test(combined)) {
    return { code: 'expired', label: '종료 확인됨', stale: true, reason: '공고 본문에 모집 종료 문구가 확인됨', basis: 'closed_text', verification: 'closed' };
  }
  const deadline = combined.match(/(?:application deadline|applications close|apply by)\s*:?[ ]*([a-z]+\s+\d{1,2}(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2})/i);
  if (deadline) {
    let rawDate = deadline[1];
    if (!/\d{4}/.test(rawDate)) rawDate = `${rawDate} ${new Date().getFullYear()}`;
    const closeAt = Date.parse(rawDate);
    if (Number.isFinite(closeAt) && closeAt < Date.now()) {
      return { code: 'expired', label: '종료 확인됨', stale: true, reason: `명시된 지원 마감일이 지남: ${deadline[1]}`, basis: 'deadline', verification: 'closed' };
    }
  }
  const explicitPool = /not an active job opening|not an immediate (?:job|position|opening)|인재 파이프라인|즉시 시작되는 포지션이 아닙니다/.test(lead);
  const poolTitle = /talent pool|talent network|ai trainers network|future opportunities|pipeline of talent/.test(title);
  const liltProjectPool = job.source === 'LILT Production'
    && /\bai training contributor\b/.test(title)
    && /become eligible for applied ai projects/.test(combined)
    && /work availability fluctuates with project demand/.test(combined);
  if (explicitPool || poolTitle || liltProjectPool) {
    return {
      code: 'talent_pool',
      label: '인재풀·즉시 모집 아님',
      stale: false,
      reason: liltProjectPool
        ? '평가·온보딩 후 향후 Applied AI 프로젝트 참여 자격을 얻는 구조이며 작업량이 프로젝트 수요에 따라 변동됨'
        : explicitPool
          ? '본문 앞부분에 즉시 채용이 아님을 명시'
          : '제목이 인재풀·향후 기회 모집임',
      basis: liltProjectPool ? 'project_pool' : explicitPool ? 'pool_lead' : 'pool_title',
      verification: 'talent_pool'
    };
  }
  const ageDays = job.postedAt ? Math.floor((Date.now() - Date.parse(job.postedAt)) / 86400000) : null;
  if (meta.kind === 'official_ats') {
    return {
      code: 'verified_open',
      label: '공식 ATS 모집 확인',
      stale: false,
      reason: '회사 공식 ATS의 현재 공개 공고 API에서 해당 공고가 직접 확인됨',
      basis: 'official_ats_feed',
      verification: 'direct_open'
    };
  }
  if (meta.kind === 'official_government') {
    return {
      code: 'official_listed',
      label: job.source === '고용24' ? '고용24 모집 확인' : '공식 채용정보 게시 확인',
      stale: false,
      reason: '정부 공식 채용정보 API의 현재 목록에서 해당 공고를 확인함',
      basis: 'official_government_feed',
      verification: 'official_listed'
    };
  }
  if (meta.kind === 'official_platform') {
    return {
      code: 'official_listed',
      label: '공식 프로젝트 게시 확인',
      stale: false,
      reason: '공식 프로젝트 플랫폼의 공개 API에서 게시 상태를 확인함. 실제 작업량·선발 가능성은 별도 확인 필요',
      basis: 'official_platform_feed',
      verification: 'official_listed'
    };
  }
  if (meta.kind === 'manual') return { code: 'manual', label: '직접 확인 필요', stale: false, reason: '사용자가 직접 추가한 공고라 자동 모집 확인 근거가 없음', basis: 'manual', verification: 'manual' };
  if (job.source === '인크루트' && ['public_rss', 'public_rss_cached_detail'].includes(job.sourceListingState)) {
    const cached = job.sourceListingState === 'public_rss_cached_detail';
    return {
      code: 'current_feed', label: cached ? 'RSS 확인·상세는 이전 기록' : '공개 RSS 목록 확인', stale: false,
      reason: cached
        ? '이번 공개 RSS에서 공고 ID와 단일 전주·완주 근무지 표기를 확인함. 근무지 상세·경력·학력 정보는 이전 상세 확인 당시 기록이며 변경 여부와 현재 모집 상태는 원문 재확인 필요'
        : '인크루트가 공개한 전북 RSS의 공고 ID와 단일 전주·완주 근무지 표기를 확인함. 상세 본문과 고용주 모집 상태는 별도 확인 필요',
      basis: 'public_rss_list', verification: 'intermediary'
    };
  }
  if (localDomesticBoardSources.has(job.source) && ['public_list', 'public_list_cached_detail'].includes(job.sourceListingState)) {
    return {
      code: 'current_feed',
      label: job.sourceListingState === 'public_list_cached_detail' ? '공개 목록 확인·상세 일부 이전값' : '공개 목록 공고 확인',
      stale: false,
      reason: job.sourceListingState === 'public_list_cached_detail'
        ? '이번 수집에서 공개 검색·지역 목록에 해당 공고가 확인됐고, 상세 접근 제한으로 근무지·경력 등 일부 필드는 마지막 상세 확인값을 유지함'
        : '이번 수집에서 공개 검색·지역 목록에 해당 공고가 확인됐지만 상세 페이지는 접근 제한으로 확인하지 못함',
      basis: job.sourceListingState === 'public_list_cached_detail' ? 'public_search_list_cached_detail' : 'public_search_list',
      verification: 'intermediary'
    };
  }
  if (localDomesticBoardSources.has(job.source) && job.sourceListingState === 'public_detail') {
    return {
      code: 'current_feed',
      label: '공개 상세 공고 확인',
      stale: false,
      reason: '이번 수집에서 공개 검색 결과와 상세 공고 페이지를 직접 확인함',
      basis: 'public_search_and_detail',
      verification: 'intermediary'
    };
  }
  if (ageDays !== null && ageDays > 45) return { code: 'stale', label: '오래된 공고', stale: true, reason: `게시 후 ${ageDays}일 경과한 비공식 피드 공고`, basis: 'age', verification: 'intermediary' };
  return { code: 'current_feed', label: '집계·채용보드 현재 피드', stale: false, reason: '현재 채용 보드·집계 피드에 존재하지만 고용주의 공식 모집 상태는 별도 확인 필요', basis: 'board_feed', verification: 'intermediary' };
}

function legacyLocalWorkAddressEvidence(job) {
  if (job?.workAddressEvidence) return job.workAddressEvidence;
  if (!['알바몬', '알바천국', '잡코리아', '사람인'].includes(job?.source)) return '';
  if (job?.sourceListingState !== 'public_detail' || !job?.workAddress) return '';
  if (job?.domesticRegion?.evidenceLevel !== 'source_structured') return '';
  if (!['address', 'exact'].includes(job?.domesticRegion?.precision)) return '';
  return 'detail_structured';
}

function markPreservedSourceFailure(job) {
  const migratedWorkAddressEvidence = legacyLocalWorkAddressEvidence(job);
  return {
    ...job,
    ...(migratedWorkAddressEvidence ? { workAddressEvidence: migratedWorkAddressEvidence } : {}),
    listingStatus: 'source_error',
    listingLabel: '소스 확인 실패',
    listingReason: '이번 수집에서 원천 소스를 확인하지 못해 이전 공고를 보존함',
    listingBasis: 'source_error',
    listingVerification: 'source_error',
    stale: true,
    // An outage is not new evidence of weaker role fit. Apply the legacy
    // caution only on the first outage, not again on every scheduled retry.
    score: job.listingStatus === 'source_error'
      ? Number(job.score || 0)
      : Math.max(0, Number(job.score || 0) - 20)
  };
}

function preservePartialIncruitFallback(previousJobs = [], collected = [], searchFailureCount = 0) {
  return preservePartialLocalSearch('인크루트', previousJobs, collected, searchFailureCount);
}

function preservePartialLocalSearch(source, previousJobs = [], collected = [], incompleteCount = 0) {
  if (!incompleteCount) return [];
  const seenPostingIds = new Set(collected.map((job) => text(job.sourcePostingId)).filter(Boolean));
  return previousJobs
    .filter((job) => job.source === source
      && /^\d+$/.test(text(job.sourcePostingId))
      && !seenPostingIds.has(text(job.sourcePostingId))
      && !['archived_missing', 'expired', 'talent_pool'].includes(job.listingStatus))
    .map(markPreservedSourceFailure);
}

function relevantToProfile(job) {
  const title = lower(job.title);
  const haystack = lower([job.title, job.description, job.tags?.join(' ')].join(' '));
  if (foreignLanguageRe.test(title) && !/korean|한국어/.test(title)) return false;
  if (/bilingual/.test(title) && /korean|한국어/.test(title) && foreignLanguageRe.test(title.replace(/korean|한국어/g, ''))) return false;
  if (/korean|한국어/.test(haystack)) return true;
  if (['data annotation', 'language quality', 'content moderation', 'ai response evaluation'].some((term) => hasPhrase(haystack, term))) return true;
  if (/\b(?:office|administrative|operations) assistant\b/.test(title)
    && /\b(?:data entry|bookkeeping|billing|reporting|database maintenance)\b/.test(haystack)) return true;
  const broadOnly = new Set(['linguist', 'localization', 'copy editor', 'content editor', 'proofreader']);
  if (profile.includeKeywords.some((keyword) => !broadOnly.has(keyword.toLowerCase()) && hasPhrase(title, keyword))) return true;
  return ['AI 평가·어노테이션', '한국어·언어', '조사·데이터', '교육 운영', '커뮤니티·운영', '채용 보조', '오디오·음성', '시험 감독', 'GIS·지도', '사무·운영', '일반·파트타임'].includes(classify(job));
}

function hasPhrase(haystack, phrase) {
  const target = lower(phrase);
  if (!target) return false;
  if (/[^a-z0-9 _-]/i.test(target) || /[가-힣]/.test(target)) return haystack.includes(target);
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
}

function classify(job) {
  const title = lower(job.title);
  if (job.source === 'Channel Corp' && /\bdata analyst\b/i.test(title)) return '조사·데이터';
  if (job.source === 'TSMG' && /^team coordinator$/i.test(title)) return '커뮤니티·운영';
  if (localDomesticBoardSources.has(job.source) && /(?:사무(?:담당|직|원|보조)?|행정|총무|운영(?:지원|관리|담당)|(?:센터|프로그램|공간)\s*운영|자료입력|전산입력|접수|원무|고객(?:관리|응대|상담|센터)|cs\b|인바운드|매장관리|컨시어지|프론트|예약관리|서류검토|검수|모니터링|콘텐츠\s*(?:검수|리뷰))/.test(title)) {
    return '사무·운영';
  }
  if (localDomesticBoardSources.has(job.source) && /(?:매장(?:운영|보조)|카페|바리스타|판매(?:원|보조)?|계산원|안내(?:원|보조)?|홀(?:서빙|직원)|주방(?:보조|직원)?|포장(?:원|보조)?|미화|카트|하우스키핑|식음료|f&b|파트타임|(?:직원\s*[/·&]\s*)?파트(?:\s|모집|$)|아르바이트|스태프)/.test(title)) {
    return '일반·파트타임';
  }
  const rules = [
    ['AI 평가·어노테이션', ['ai trainer', 'ai response', 'ai data specialist', 'generative ai analyst', 'ai creative qc reviewer', 'foundation model evaluation engineer', 'model evaluation', 'data annotator', 'data annotation', 'response evaluator', 'search evaluator', 'search engine evaluator', 'internet safety evaluator', 'ads quality rater', 'quality rater', 'quality assurance reviewer', 'ai quality assurance', 'legal annotator', 'audio evaluation', 'speech evaluation', 'speech annotator', 'transcription quality reviewer', 'data rater', 'data labeling']],
    ['한국어·언어', ['korean', '한국어', 'linguist', 'proofreader', 'proofreading', 'copy editor', 'content editor', 'localization', 'language quality']],
    ['조사·데이터', ['data entry', 'data researcher', 'data program manager', 'web researcher', 'research assistant', 'market research', 'product catalog', 'catalog specialist', 'catalog coordinator', 'administrative assistant']],
    ['교육 운영', ['course operations', 'learning operations', 'education operations', 'class manager', 'training coordinator', 'learning coordinator', 'education coordinator']],
    ['커뮤니티·운영', ['content moderator', 'community moderator', 'community manager', 'event assistant', 'event coordinator', 'webinar coordinator']],
    ['채용 보조', ['candidate sourcing', 'talent sourcing', 'sourcer', 'recruiting coordinator', 'recruitment coordinator', 'talent coordinator']],
    ['오디오·음성', ['audio editor', 'podcast editor', 'voice actor', 'voice recording', 'narration', 'voice over', 'voiceover']],
    ['시험 감독', ['proctor', 'exam proctor', 'invigilator']],
    ['GIS·지도', ['gis', 'geospatial', 'mapping editor', 'mapping specialist', 'map editor']]
  ];
  const match = rules.find(([, words]) => words.some((word) => hasPhrase(title, word)));
  return match?.[0] ?? '기타';
}

function eligibilityFor(job) {
  const location = lower(job.location);
  const locationRaw = evidenceSnippet(job.location || '위치 미상');
  const description = lower(job._fullDescription || job.description);
  const explicitLocationRestriction = description.match(/(?:must|should|currently)\s+(?:reside|live|be based|be located)\s+(?:in|within)\s+([^.;\n]{2,80})|(?:candidates?|applicants?)\s+(?:must|should)\s+(?:be\s+)?(?:based|located|resident)\s+(?:in|within)\s+([^.;\n]{2,80})|\blocation\s*:\s*([^.;\n]{2,80})/i);
  const rawRestrictionText = lower(explicitLocationRestriction?.slice(1).find(Boolean) || '');
  const restrictionText = /^remote\b/.test(rawRestrictionText)
    && /\b(?:engagement|employment|job type|schedule|hours|compensation|pay|salary|requirements?)\s*:/.test(rawRestrictionText)
    ? ''
    : rawRestrictionText;
  if (job.countryCode === 'KR') {
    return { code: 'korea', label: '한국에서 지원 가능', basis: 'country_code', reason: '원천 데이터의 국가 코드가 KR로 명시됨' };
  }
  if (/south korea|republic of korea|\bkorea\b|seoul|한국/.test(location)) {
    return { code: 'korea', label: '한국에서 지원 가능', basis: 'location', reason: `공고 위치에 한국이 명시됨: ${locationRaw}` };
  }
  if (/south korea|republic of korea|\bkorea\b|seoul|한국/.test(restrictionText)) {
    return { code: 'korea', label: '한국에서 지원 가능', basis: 'restriction_text', reason: `거주·근무 제한 문구에 한국이 명시됨: ${evidenceSnippet(restrictionText)}` };
  }
  if (restrictionText) return { code: 'restricted', label: '특정 국가 제한', basis: 'restriction_text', reason: `거주·근무 제한 문구가 있음: ${evidenceSnippet(restrictionText)}` };
  if (/\b(anywhere in|within)\s+[a-z]/.test(location)) return { code: 'restricted', label: '특정 국가 제한', basis: 'location', reason: `특정 지역 범위가 명시됨: ${locationRaw}` };
  if (/\b(worldwide|world\s+wide|remote, worldwide|anywhere in the world|work from anywhere|globally)\b/.test(location)) {
    return { code: 'worldwide', label: 'Worldwide', basis: 'location', reason: `Worldwide/전 세계 지원 범위가 명시됨: ${locationRaw}` };
  }
  const restricted = /\b(usa|united states|us only|canada|uk|united kingdom|europe|eu|emea|apac|latam|mena|north america|south america|germany|france|australia|singapore|japan|india|philippines|mexico|brazil|spain|italy|netherlands|poland|romania)\b/;
  if (restricted.test(location)) {
    return { code: 'restricted', label: '특정 국가 제한', basis: 'location', reason: `특정 국가·지역 위치가 명시됨: ${locationRaw}` };
  }
  if (job.remote) {
    const genericRemote = /^(?:remote(?:\s+job)?|home\s*office|homeoffice|remoto|anywhere|location independent|work from home|wfh|unknown|not specified|n\/?a|위치 미상)$/i;
    if (genericRemote.test(location.trim())) return { code: 'unknown', label: '확인 필요', basis: 'remote_unspecified', reason: '원격 표기만 있고 지원 가능한 국가 범위가 명시되지 않음' };
    return { code: 'restricted', label: '특정 국가 제한', basis: 'location', reason: `원격이지만 위치가 특정 지역으로 표시됨: ${locationRaw}` };
  }
  return { code: 'restricted', label: '특정 국가 제한', basis: 'onsite_location', reason: `원격이 아닌 특정 위치 공고: ${locationRaw}` };
}

function scoreJob(job) {
  const haystack = lower([job.title, job.company, job.description, job.location, job.tags?.join(' ')].join(' '));
  const title = lower(job.title);
  const matched = profile.includeKeywords.filter((keyword) => hasPhrase(haystack, keyword));
  const titleMatched = profile.includeKeywords.filter((keyword) => hasPhrase(title, keyword));
  const bodyMatched = matched.filter((keyword) => !titleMatched.includes(keyword));
  const localBoard = localDomesticBoardSources.has(job.source);
  const roleMatched = localBoard ? titleMatched : matched;
  const roleFitEvidence = roleMatched.length > 0
    || (!localBoard && job.category !== '기타');
  const roleFitBasis = roleMatched.length > 0
    ? localBoard ? 'title_keyword_match' : 'keyword_match'
    : roleFitEvidence
      ? 'target_category'
      : 'none';
  const excluded = profile.excludeKeywords.some((keyword) => hasPhrase(haystack, keyword));
  let score = 0;
  for (const keyword of titleMatched) {
    if (keyword.toLowerCase() === 'korean' || keyword === '한국어') {
      score += 45;
    } else {
      score += 20;
    }
  }
  const strongBodyTerms = new Set(['korean', '한국어', 'language quality', 'data entry', 'content moderator', 'community moderator', 'proofreader']);
  score += bodyMatched.filter((keyword) => strongBodyTerms.has(keyword.toLowerCase()) || strongBodyTerms.has(keyword)).length * 3;
  score += profile.preferredKeywords.filter((keyword) => hasPhrase(title, keyword)).length * 2;
  if (job.category !== '기타') score += 10;
  if (isOfficialKind(job.sourceKind)) score += 8;
  if (job.remote) score += 3;
  if (job.eligibilityCode === 'worldwide') score += 8;
  if (job.eligibilityCode === 'korea') score += 18;
  if (job.eligibilityCode === 'unknown') score -= 3;
  if (job.eligibilityCode === 'restricted') score -= 20;
  if (/\blinguist\s*[-–—:]/i.test(job.title) && !/korean|한국어/i.test(job.title)) score -= 45;
  if (foreignLanguageRe.test(job.title) && !/korean|한국어/i.test(job.title)) score -= 55;
  if (/\b(linguist|translator|translation|patent|pharma|life ?sciences?)\b/i.test(job.title) && !/\b(evaluator|rater|annotator|annotation|ai trainer|ai data|quality rater)\b/i.test(job.title)) score -= 70;
  if (/\b(legal|medical|clinical|pharma|life ?sciences?)\b/i.test(job.title)) score -= 35;
  if (/\b(engineer|developer|scientist|architect|consultant)\b/i.test(job.title) && !/korean|한국어/i.test(haystack)) score -= 28;
  if (/\b(senior|sr\.?|director|head|principal|staff|vice president|vp)\b/i.test(job.title)) score -= 12;
  const ageDays = job.postedAt ? Math.floor((Date.now() - Date.parse(job.postedAt)) / 86400000) : null;
  if (!isOfficialKind(job.sourceKind)) {
    if (ageDays !== null && ageDays > 30) score -= 8;
    else if (ageDays !== null && ageDays > 14) score -= 3;
  }
  if (excluded) score -= 40;
  if (!roleMatched.length && job.category === '기타') score = Math.min(score, 5);
  if (!roleFitEvidence) score = Math.min(score, 15);
  return {
    score: Math.max(0, Math.min(100, score)),
    matchedKeywords: (localBoard ? titleMatched : [...titleMatched, ...bodyMatched]).slice(0, 8),
    roleFitEvidence,
    roleFitBasis,
    excluded
  };
}

function sourceCollection(jobs, rawCount, extra = {}) {
  return {
    jobs,
    rawCount: Number(rawCount || 0),
    matchedCount: jobs.length,
    ...extra
  };
}

function localPlatformSalary(source, posting, plainText) {
  if (source !== '잡코리아') return schemaSalaryRaw(posting);
  const match = plainText.match(/(?:^|\s)급여\s+(시급|일급|주급|월급|연봉)\s+([0-9][0-9,]*(?:\.\d+)?)\s*(만)?\s*원?(?:\s*[-~–—]\s*([0-9][0-9,]*(?:\.\d+)?)\s*(만)?\s*원)?/);
  if (!match) return '';
  const sharedTenThousand = Boolean(match[5]) && !match[3];
  const first = Number(match[2].replace(/,/g, '')) * ((match[3] || sharedTenThousand) ? 10000 : 1);
  const second = match[4] ? Number(match[4].replace(/,/g, '')) * (match[5] ? 10000 : 1) : null;
  return Number.isFinite(second)
    ? match[1] + ' ' + first.toLocaleString('en-US') + '원~' + second.toLocaleString('en-US') + '원'
    : match[1] + ' ' + first.toLocaleString('en-US') + '원';
}

function localPlatformDeadline(source, posting, plainText) {
  const visible = koreanVisibleDeadline(plainText);
  if (visible) return visible;
  return fixedDeadline(posting?.validThrough);
}

function deadlineFromListHint(hint) {
  const raw = text(hint?.deadlineLabel);
  if (!raw) return null;
  if (/상시(?:모집|채용)/.test(raw)) return { type: 'rolling', date: '', label: '상시채용' };
  if (/채용시/.test(raw)) return { type: 'rolling', date: '', label: '채용시까지' };
  const match = raw.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!match) return null;
  const date = [match[1], match[2].padStart(2, '0'), match[3].padStart(2, '0')].join('-');
  return { type: 'fixed', date, label: date };
}

function cleanQualificationText(value) {
  let normalized = text(value);
  normalized = normalized.split(/\s+(?:로그인\s+하고|TOP\b|궁금해요|AI추천공고|비슷한\s+조건의)/)[0].trim();
  if (/^(?:채용\s*상세요강|지원자격|상세요강)$/.test(normalized)) return '';
  return normalized;
}

function localPreferredConditions(value) {
  const plain = text(value);
  if (!plain) return [];
  const match = plain.match(/(?:우대조건|우대사항)\s*[:：]?\s*(.{1,220}?)(?=\s+(?:근무조건|근무기간|근무요일|근무시간|근무일시|근무지역|휴게시간|복리후생|접수기간|접수방법|지원방법|모집직종|모집조건|모집마감|업직종|고용형태|급여)\s*[:：]?|\s+로그인\s+하고|$)/);
  if (!match) return [];
  const protectedParentheticalCommas = match[1].replace(/\(([^)]*)\)/g, (_, inside) => `(${inside.replace(/,/g, '/')})`);
  return [...new Set(protectedParentheticalCommas
    .split(/\s*,\s*|\s*·\s*/)
    .map((item) => text(item)
      .replace(/\([^)]*$/, '')
      .replace(/^[^()]*\)\s*/, '')
      .trim())
    .filter((item) => item && item.length <= 60))]
    .slice(0, 5);
}

function localMandatoryQualification(value) {
  const plain = text(value);
  if (!plain) return '';
  const block = plain.match(/(?:필수조건|필수사항|자격요건|자격조건)\s*[:：]?\s*(.{1,220}?)(?=\s+(?:우대조건|우대사항|근무조건|근무기간|근무요일|근무시간|복리후생|접수기간|지원방법|모집직종|급여)\s*[:：]?|$)/)?.[1] || '';
  if (block
    && /(?:자격증|자격\s*소지|면허|운전면허|면허증)/.test(block)
    && !/(?:우대|선호|있으면\s*좋)/.test(block)) {
    return evidenceSnippet(block, 110);
  }
  const explicit = plain.match(/(?:필수|반드시)[^\n.;]{0,55}(?:자격증|면허|운전면허)|(?:자격증|면허|운전면허)[^\n.;]{0,55}(?:필수|반드시\s*필요)/)?.[0] || '';
  return explicit && !/(?:우대|선호)/.test(explicit) ? evidenceSnippet(explicit, 110) : '';
}

function extractLocalWorkSchedule(value, title = '') {
  const plain = text(value);
  const combinedIndex = plain.search(/근무일시\s*[:：]?/);
  const combinedRaw = combinedIndex >= 0 ? plain.slice(combinedIndex, combinedIndex + 180) : '';
  const genericTimeIndex = plain.search(/근무시간\s*[:：]?/);
  const genericTimeRaw = genericTimeIndex >= 0 ? plain.slice(genericTimeIndex, genericTimeIndex + 180) : '';
  const sourceBlock = combinedRaw || genericTimeRaw;
  const explicitDay = text(plain.match(/근무요일\s*[:：]?\s*((?:주\s*\d+\s*일|요일협의|(?:월|화|수|목|금|토|일)(?:\s*[~～\-–—,]\s*(?:월|화|수|목|금|토|일))*요일?)(?:\s*\([^)]{0,100}\))?)/)?.[1]);
  const explicitTime = text(plain.match(/근무시간\s*[:：]?\s*((?:시간협의|(?:[01]?\d|2[0-3])(?::\d{2}|시)\s*[~～\-–—]\s*(?:[01]?\d|2[0-3])(?::\d{2}|시))(?:\s*\([^)]{0,120}\))?)/)?.[1]);
  const dayRaw = explicitDay || text(sourceBlock.match(/주\s*\d+\s*일(?:\s*\([^)]{0,80}\))?|(?:월|화|수|목|금|토|일)(?:\s*[~～\-–—,]\s*(?:월|화|수|목|금|토|일))*요일?/)?.[0]);
  const timeRaw = explicitTime || text(sourceBlock.match(/(?:[01]?\d|2[0-3])(?::\d{2}|시)\s*[~～\-–—]\s*(?:[01]?\d|2[0-3])(?::\d{2}|시)/)?.[0]);
  const titleDay = text(title).match(/주\s*\d+\s*일/)?.[0] || '';
  const day = text((dayRaw || titleDay).split('(')[0]);
  const timePrimary = text(timeRaw.split('(')[0]);
  const concreteTime = timeRaw.match(/(?:[01]?\d|2[0-3])(?::\d{2}|시)\s*[~～\-–—]\s*(?:[01]?\d|2[0-3])(?::\d{2}|시)/)?.[0] || '';
  const time = timePrimary === '시간협의' && concreteTime
    ? `${concreteTime} (시간협의)`
    : timePrimary;
  const qualifiers = [];
  const combined = [dayRaw, timeRaw].filter(Boolean).join(' ');
  if (/로테이션|교대/.test(combined)) qualifiers.push('로테이션');
  const timeCount = (combined.match(/(?:[01]?\d|2[0-3])(?::\d{2}|시)\s*[~～\-–—]\s*(?:[01]?\d|2[0-3])(?::\d{2}|시)/g) || []).length;
  if (timeCount > 1 && !qualifiers.includes('로테이션')) qualifiers.push('복수 시간대');
  return [...new Set([day, time, ...qualifiers].filter(Boolean))].join(' · ');
}

function extractLocalWorkPeriod(value) {
  const plain = text(value);
  const raw = plain.match(/근무기간\s*[:：]?\s*(\d+\s*(?:일|주|개월|년)(?:\s*[~～\-–—]\s*\d+\s*(?:일|주|개월|년))?\s*(?:이상|이하)?|협의)/)?.[1] || '';
  return text(raw).replace(/\s+/g, '');
}

function localSalaryContext(value) {
  const plain = text(value);
  if (!plain) return '';
  return text(plain.match(/(?:급여|급여조건)\s*[:：]?\s*(.{1,120}?)(?=\s+(?:근무기간|근무요일|근무시간|근무일시|근무지역|업직종|고용형태|복리후생|우대(?:사항|조건)|모집조건|모집마감|지원자격|학력|경력|접수기간)\s*[:：]?|$)/)?.[1]);
}

function localCompensationNotes(value, title = '') {
  const plain = `${text(title)} ${text(value)}`;
  const notes = [];
  const productionPay = plain.match(/생산직\s*급여\s*[:：]?\s*(기본급(?:여)?\s*약?\s*[0-9,.]+\s*만원[^,.;]{0,35},?\s*잔업\/특근\s*포함\s*[0-9,.]+\s*[~～\-–—]\s*[0-9,.]+\s*만원)/)?.[1] || '';
  if (productionPay) notes.push(`생산직 ${text(productionPay)}`);
  const forkliftPay = plain.match(/지게차\s*시급\s*[:：]?\s*([0-9][0-9,]*\s*원)/)?.[1] || '';
  if (forkliftPay) notes.push(`지게차 시급 ${text(forkliftPay)}`);
  if (/면접\s*후\s*결정/.test(plain)) notes.push('급여 면접 후 결정');
  else if (/급여[^\n.;]{0,35}(?:협의|면접\s*시\s*추가협의)|(?:면접\s*시\s*)?급여\s*협의/.test(plain)) notes.push('급여 추가 협의 가능');
  if (/주휴수당/.test(plain)) notes.push('주휴수당');
  if (/식비\s*\(식사\)\s*지원|(?:조식|중식|석식)\s*제공/.test(plain)) notes.push('식사 지원');
  if (/성과급/.test(plain)) notes.push('성과급');
  if (/인센티브(?:제)?/.test(plain)) notes.push('인센티브');
  if (/정기보너스/.test(plain)) notes.push('보너스');
  if (/수습(?:기간)?/.test(plain)) notes.push('수습기간 조건 확인');
  return [...new Set(notes)].slice(0, 5);
}

function moreSpecificQualification(primary, body) {
  const sourceValue = cleanQualificationText(primary);
  const bodyValue = cleanQualificationText(body);
  if (!bodyValue) return sourceValue;
  if (!sourceValue) return bodyValue;
  if (bodyValue.startsWith(sourceValue)) {
    const suffix = bodyValue.slice(sourceValue.length).trim();
    if (!/^(?:무관|\(?\d+\s*(?:년|개월)|이상|이하|고졸|초대졸|대졸|석사|박사)/.test(suffix)) return sourceValue;
  }
  const sourceGeneric = /^(?:경력|신입|신입·경력|신입\/경력|학력무관|무관)$/.test(sourceValue);
  const bodySpecific = /\d+\s*(?:년|개월)|이상|이하|고졸|초대졸|대졸|석사|박사|경력무관/.test(bodyValue);
  return sourceGeneric && bodySpecific ? bodyValue : sourceValue;
}

function saraminHtmlJobPosting(html, listHint = {}) {
  const rawHtml = String(html || '');
  const plain = htmlPlainText(rawHtml);
  const title = htmlPlainText(rawHtml.match(/<h1[^>]+class=["'][^"']*\btit_job\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] || listHint.title || '');
  const company = text(decodeHtml(
    rawHtml.match(/<a[^>]+class=["'][^"']*\bcompany\b[^"']*["'][^>]+title=["']([^"']+)["']/i)?.[1]
    || listHint.company
    || ''
  ));
  const addressMatches = [...plain.matchAll(/근무지위치\s+(?:\(\d{5}\)\s*)?(.{1,180}?)(?=\s+지도\s*보기)/g)]
    .map((match) => text(match[1]))
    .filter(localAddressText);
  const workAddress = addressMatches.at(-1) || '';
  const experience = cleanQualificationText(
    plain.match(/핵심\s*정보\s+경력\s+(.{1,100}?)(?=\s+학력\s+)/)?.[1]
    || text(listHint.careerType).split('·')[0]
  );
  const education = cleanQualificationText(
    plain.match(/핵심\s*정보[\s\S]{0,220}?학력\s+(.{1,100}?)(?=\s+근무형태\s+)/)?.[1]
    || listHint.education
  );
  const employmentRaw = text(
    plain.match(/핵심\s*정보[\s\S]{0,320}?근무형태\s+(.{1,120}?)(?=\s+(?:수습기간|자격요건|우대사항|급여|출퇴근\s*시간|근무일수|근무지역|조회수)(?:\s|$))/)?.[1]
    || text(listHint.careerType).split('·').slice(1).join(' · ')
  );
  const typeTokens = [...employmentRaw.matchAll(/정규직|(?:기간제[·\s]*)?계약직|아르바이트|인턴|프리랜서|파견(?:·임시직)?|임시직/g)]
    .map((match) => match[0].replace(/^기간제[·\s]*/, '').replace(/^파견(?:·임시직)?$/, '파견·임시직'));
  const employmentType = [...new Set(typeTokens)].join(', ') || text(employmentRaw).split(/\s+수습기간/)[0] || '미상';
  const salaryContext = text(plain.match(/급여\s+(.{1,120}?)(?=\s+(?:출퇴근\s*시간|근무형태\s*상세보기|근무일수|근무지역|조회수)(?:\s|$))/)?.[1] || '');
  const salaryRaw = /(?:시급|일급|주급|월급|연봉)\s*\d/.test(salaryContext) ? salaryContext : '';
  const dayRaw = text(plain.match(/근무일수\s+(.{1,100}?)(?=\s+(?:근무지역|최저임금|조회수|공유하기)(?:\s|$))/)?.[1] || '');
  const timeRaw = text(plain.match(/출퇴근\s*시간\s+(.{1,100}?)(?=\s+(?:근무지역|근무일수|최저임금|조회수)(?:\s|$))/)?.[1] || '');
  const detailStart = plain.indexOf('상세요강');
  const detailEnd = detailStart >= 0 ? plain.indexOf('근무지위치', detailStart) : -1;
  const description = detailStart >= 0
    ? text(plain.slice(detailStart + '상세요강'.length, detailEnd > detailStart ? detailEnd : detailStart + 5000))
    : title;
  const preferredBlock = text(
    description.match(/\[우대사항\]\s*(.{1,500}?)(?=\s*\[(?:근무조건|전형절차|복리후생|지원방법)\]|$)/)?.[1]
    || ''
  );
  const preferredConditions = preferredBlock
    ? [...new Set(preferredBlock.split(/\s+-\s+|\s*•\s*/)
      .map((item) => text(item).replace(/^[-•]\s*/, ''))
      .filter((item) => item && item.length <= 80))].slice(0, 5)
    : [];
  const detailedSchedule = text(
    description.match(/근무요일\s*\/\s*시간\s*[:：]?\s*(.{1,120}?)(?=\s+(?:[-•]\s*)?근무지역\s*[:：]?|\s+(?:[-•]\s*)?급여\s*[:：]?|\s+전형절차|$)/)?.[1]
    || ''
  );
  const workPeriod = text(employmentRaw.match(/\d+\s*(?:개월|년)(?:\s*(?:이상|이하))?/)?.[0] || '').replace(/\s+/g, '');
  const startedAt = plain.match(/시작일\s+(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/) || null;
  const datePosted = startedAt
    ? `${startedAt[1]}-${startedAt[2].padStart(2, '0')}-${startedAt[3].padStart(2, '0')}`
    : '';
  const decisionText = [
    description,
    dayRaw ? `근무요일: ${dayRaw}` : '',
    timeRaw ? `근무시간: ${timeRaw}` : '',
    salaryContext ? `급여 ${salaryContext}` : '',
    plain.match(/수습기간\s+.{1,40}?(?=\s+(?:자격요건|우대사항|급여|출퇴근|근무일수|근무지역))/)?.[0] || ''
  ].filter(Boolean).join(' ');
  return {
    '@type': 'JobPosting',
    title,
    hiringOrganization: { '@type': 'Organization', name: company },
    ...(workAddress ? { jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', streetAddress: workAddress } } } : {}),
    employmentType,
    experienceRequirements: experience,
    educationRequirements: education,
    description,
    datePosted,
    _salaryRaw: salaryRaw,
    _salaryContext: salaryContext,
    _workSchedule: detailedSchedule || [dayRaw, timeRaw].filter(Boolean).join(' · '),
    _workPeriod: workPeriod,
    _preferredConditions: preferredConditions,
    _decisionText: decisionText,
    _workAddressEvidence: 'detail_html'
  };
}

function listHintJobPosting(hint) {
  if (!hint?.title || !hint?.company || !hint?.workAddress) return null;
  const salaryMatch = text(hint.salaryRaw).match(/^(시급|일급|주급|월급|연봉)\s+([0-9][0-9,.]*)\s*원?/);
  return {
    '@type': 'JobPosting',
    title: hint.title,
    hiringOrganization: { '@type': 'Organization', name: hint.company },
    jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', streetAddress: hint.workAddress } },
    ...(salaryMatch ? { baseSalary: salaryPostingFromKorean(salaryMatch[1], salaryMatch[2]) } : {}),
    ...(hint.postedAt && !Number.isNaN(Date.parse(hint.postedAt)) ? { datePosted: hint.postedAt } : {}),
    description: hint.title,
    _fallbackFormat: 'public_list_embedded'
  };
}

function previousAlbaJobForCandidate(previousJobs, sourcePostingId) {
  const rawId = '알바천국:' + sourcePostingId;
  return (previousJobs || []).find((job) =>
    (job?.source === '알바천국' || (job?.sources || []).includes('알바천국'))
    && (job?.sourcePostingId === sourcePostingId || (job?.legacyIds || []).includes(rawId))
    && job?.workAddress
    && isJeonjuWanjuLocal(job)
  ) || null;
}

function albaPublicListFallbackCandidate(sourcePostingId, url, hint = {}, previousJob = null) {
  const title = text(hint.title);
  const company = text(hint.company);
  const workAddress = text(previousJob?.workAddress);
  if (!previousJob || !title || !company || !localAddressText(workAddress)) return null;
  if (/전국\s*(?:채용|모집|근무|지역|대상)|전국채용|재택근무|원격근무/.test(title)) return null;
  const listDeadline = deadlineFromListHint(hint) || { type: '', date: '', label: '' };
  const rawPostedAt = text(hint.postedAt);
  const postedAt = /^20\d{2}\.\d{2}\.\d{2}$/.test(rawPostedAt) ? rawPostedAt.replace(/\./g, '-') : rawPostedAt;
  const normalized = normalizeJob({
    id: '알바천국:' + sourcePostingId,
    sourcePostingId,
    platform: '알바천국',
    source: '알바천국',
    company,
    title,
    location: workAddress,
    workAddress,
    remote: false,
    workplaceMode: 'onsite',
    type: text(previousJob.type) || '미상',
    salary: text(hint.salaryRaw) || text(previousJob.salaryMetadataRaw || previousJob.salary),
    salaryProvenance: hint.salaryRaw ? 'source_list' : (previousJob.salaryProvenance || 'none'),
    url,
    postedAt: postedAt && !Number.isNaN(Date.parse(postedAt)) ? postedAt : previousJob.postedAt,
    sourceListingState: 'public_list_cached_detail',
    description: previousJob._fullDescription || previousJob.description || title,
    tags: previousJob.tags || [],
    countryCode: 'KR',
    locationEvidenceLevel: 'source_structured',
    workAddressEvidence: previousJob.workAddressEvidence || 'detail_structured',
    experience: previousJob.experience || '',
    education: previousJob.education || '',
    deadlineType: listDeadline.type || previousJob.deadlineType || '',
    deadlineDate: listDeadline.date || previousJob.deadlineDate || '',
    deadlineLabel: listDeadline.label || previousJob.deadlineLabel || ''
  });
  normalized.sourceListLocation = text(hint.listLocation);
  normalized.workAddressVerifiedAt = previousJob.lastVerifiedAt || previousJob.verifiedAt || previousJob.listingCheckedAt || '';
  normalized._listFallback = true;
  return normalized;
}

function canonicalUrlFromHtml(html) {
  const tag = String(html || '').match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i)?.[0]
    || String(html || '').match(/<link\b[^>]*\bhref=["'][^"']+["'][^>]*\brel=["']canonical["'][^>]*>/i)?.[0]
    || '';
  return text(decodeHtml(tag.match(/\bhref=["']([^"']+)["']/i)?.[1] || ''));
}

function incruitDetailUrlMatches(value, sourcePostingId) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'https:'
      && parsed.hostname === 'job.incruit.com'
      && parsed.pathname.toLowerCase() === '/jobdb_info/jobpost.asp'
      && parsed.searchParams.get('job') === text(sourcePostingId)
      && [...parsed.searchParams.keys()].every((key) => key === 'job');
  } catch {
    return false;
  }
}

function incruitPostingIdentifier(posting) {
  const identifier = Array.isArray(posting?.identifier) ? posting.identifier[0] : posting?.identifier;
  return text(identifier?.value);
}

function structuredLocalBoardCandidate(source, sourcePostingId, url, html, listHint = {}) {
  const rawHtml = String(html || '');
  if (
    source === '알바천국'
    && rawHtml.length < 5000
    && /요청하신 공고 열람은 로그인이 필요한 서비스입니다|location\.href\s*=\s*['\"][^'\"]*(?:AdultCert|LoginGate)\.asp/i.test(rawHtml)
  ) {
    throw localDetailError('access_restricted', source + ' detail requires login or age verification: ' + sourcePostingId);
  }
  const plainText = htmlPlainText(rawHtml);
  const detailPosting = jsonLdJobPostings(html)[0] || null;
  const posting = detailPosting
    || (source === '알바천국' ? albaLegacyJobPosting(html) : null)
    || (source === '사람인' ? saraminHtmlJobPosting(html, listHint) : null)
    || (source === '알바몬' ? listHintJobPosting(listHint) : null);
  if (!posting) throw localDetailError('detail_structure', source + ' detail missing supported JobPosting structure: ' + sourcePostingId);
  if (source === '인크루트') {
    const expectedId = text(sourcePostingId);
    const detailId = incruitPostingIdentifier(posting);
    const canonicalUrl = canonicalUrlFromHtml(rawHtml);
    const listLocation = text(listHint?.listLocation);
    const detailAddress = schemaAddress(posting);
    const searchMunicipality = localMunicipality(listLocation);
    const detailMunicipality = localMunicipality(detailAddress);
    if (!/^\d+$/.test(expectedId)) throw localDetailError('posting_id_invalid', `Incruit posting id must be numeric: ${expectedId}`);
    if (detailId !== expectedId) throw localDetailError('posting_id_mismatch', `Incruit detail posting id mismatch: expected ${expectedId}, got ${detailId || 'missing'}`);
    if (!incruitDetailUrlMatches(url, expectedId) || !canonicalUrl || !incruitDetailUrlMatches(canonicalUrl, expectedId)) {
      throw localDetailError('detail_url_mismatch', `Incruit detail/canonical URL mismatch for posting ${expectedId}`);
    }
    if (!exactSingleLocalListLocation(listLocation) || !searchMunicipality) {
      throw localDetailError('search_location_unverified', `Incruit search row lacks one exact Jeonju/Wanju workplace: ${expectedId}`);
    }
    if (!detailAddress || !detailMunicipality || detailMunicipality !== searchMunicipality) {
      throw localDetailError('workplace_mismatch', `Incruit search/detail workplace mismatch for ${expectedId}: ${listLocation || 'missing'} <> ${detailAddress || 'missing'}`);
    }
    const postingText = `${text(listHint?.title)} ${listLocation} ${text(decodeHtml(posting?.title))} ${htmlPlainText(posting?.description || '')}`;
    if (/전국|재택|원격|\bremote\b/i.test(postingText)) {
      throw localDetailError('workplace_mode_rejected', `Incruit nationwide/remote posting rejected: ${expectedId}`);
    }
  }
  const nextData = source === '알바몬' ? nextDataJson(html) : null;
  const albamonView = nextData?.props?.pageProps?.data?.viewData || null;
  const albamonDetailText = source === '알바몬' ? htmlPlainText(albamonView?.content || '') : '';
  const decisionText = source === '사람인' && posting?._decisionText
    ? text(posting._decisionText)
    : source === '인크루트'
      ? htmlPlainText(posting?.description || '')
    : [plainText, albamonDetailText].filter(Boolean).join(' ');
  let workAddress = schemaAddress(posting);
  let workAddressEvidence = source === '인크루트'
    ? 'detail_crosschecked'
    : text(posting?._workAddressEvidence) || (posting?._fallbackFormat === 'alba_legacy_html'
    ? 'detail_html'
    : posting?._fallbackFormat === 'public_list_embedded'
      ? 'embedded_list'
      : 'detail_structured');
  if (source !== '인크루트' && !workAddress && listHint?.workAddress && localAddressText(listHint.workAddress)) {
    workAddress = text(listHint.workAddress);
    workAddressEvidence = 'embedded_list';
  }
  if (source !== '인크루트' && !workAddress && exactSingleLocalListLocation(listHint?.listLocation) && !detailContradictsListLocation(plainText)) {
    workAddress = text(listHint.listLocation);
    workAddressEvidence = 'search_card';
  }
  if (!workAddress) throw localDetailError('workplace_unverified', source + ' detail missing verifiable workplace address: ' + sourcePostingId);
  const deadline = localPlatformDeadline(source, posting, plainText);
  const deadlineCloseOnHire = source === '잡코리아' && /closeOnHire[^a-zA-Z]{0,12}true/.test(rawHtml);
  const listDeadline = deadlineFromListHint(listHint);
  const finalDeadline = deadline.type ? deadline : (listDeadline || deadline);
  const bodyExperience = cleanQualificationText(plainText.match(/(?:지원자격\s*)?경력\s+(.{1,65}?)(?=\s학력|\s접수기간|\s급여|\s근무지역|\s로그인|\sTOP\b|$)/)?.[1]);
  const bodyEducation = cleanQualificationText(plainText.match(/학력\s+(.{1,65}?)(?=\s접수기간|\s급여|\s근무지역|\s우대|\s스킬|\s로그인|\sTOP\b|$)/)?.[1]);
  const experience = moreSpecificQualification(decodeHtml(posting.experienceRequirements), bodyExperience);
  const education = moreSpecificQualification(decodeHtml(posting.educationRequirements), bodyEducation);
  const description = htmlPlainText(posting.description || '') || text(listHint?.title);
  const title = text(decodeHtml(posting.title || listHint?.title));
  const remote = /재택근무|재택\b|원격근무|원격\b/.test(title + ' ' + description);
  const candidate = {
    id: source.toLowerCase() + ':' + sourcePostingId,
    sourcePostingId,
    platform: source,
    source,
    company: text(decodeHtml(albamonView?.companyName || posting?.hiringOrganization?.name || listHint?.company)) || '회사 미상',
    title,
    location: workAddress,
    workAddress,
    remote,
    workplaceMode: remote ? 'remote' : 'onsite',
    type: schemaEmploymentType(posting.employmentType),
    salary: source === '사람인'
      ? text(posting?._salaryRaw)
      : localPlatformSalary(source, posting, plainText) || text(listHint?.salaryRaw),
    salaryProvenance: 'source_structured',
    url,
    postedAt: posting.datePosted || (listHint?.postedAt && !Number.isNaN(Date.parse(listHint.postedAt)) ? listHint.postedAt : null),
    sourceListingState: 'public_detail',
    description,
    tags: [],
    countryCode: 'KR',
    locationEvidenceLevel: 'source_structured',
    workAddressEvidence,
    experience,
    education,
    deadlineType: finalDeadline.type,
    deadlineDate: finalDeadline.date,
    deadlineLabel: finalDeadline.label,
    workSchedule: source === '사람인' && posting?._workSchedule
      ? text(posting._workSchedule)
      : extractLocalWorkSchedule(decisionText, title),
    workPeriod: source === '사람인' && posting?._workPeriod
      ? text(posting._workPeriod)
      : extractLocalWorkPeriod(decisionText),
    preferredConditions: source === '사람인' && Array.isArray(posting?._preferredConditions)
      ? posting._preferredConditions
      : localPreferredConditions(decisionText),
    compensationNotes: localCompensationNotes(source === '사람인'
      ? `${decisionText} 급여 ${text(posting?._salaryContext)}`
      : `${description} ${albamonDetailText} 급여 ${localSalaryContext(plainText)}`, title),
    mandatoryQualification: localMandatoryQualification(decisionText),
    deadlineCloseOnHire
  };
  const normalized = normalizeJob(candidate);
  normalized._detailRecovered = Boolean(posting?._fallbackFormat);
  normalized._detailRecoveryKind = posting?._fallbackFormat || '';
  return normalized;
}

function isJeonjuWanjuLocal(job) {
  const textEvidence = `${job?.title || ''} ${job?._fullDescription || job?.description || ''}`;
  if (job?.remote || job?.workplaceMode === 'remote') return false;
  if (/전국\s*(?:채용|모집|근무|지역|대상)|전국채용/.test(textEvidence)) return false;
  return job?.domesticRegion?.province === '전북특별자치도'
    && ['전주시', '완주군'].includes(job?.domesticRegion?.city);
}

function localContinuityCandidates(source, discoveredCandidates = [], previousJobs = [], limit = 12) {
  const discoveredIds = new Set((discoveredCandidates || []).map((candidate) => text(candidate?.id)).filter(Boolean));
  return (previousJobs || [])
    .filter((job) => job?.source === source)
    .filter((job) => job?.sourcePostingId && !discoveredIds.has(text(job.sourcePostingId)))
    .filter((job) => isJeonjuWanjuLocal(job))
    .filter((job) => !['expired', 'talent_pool'].includes(job.listingStatus))
    .sort((a, b) => (Date.parse(b.lastVerifiedAt || b.verifiedAt || '') || 0) - (Date.parse(a.lastVerifiedAt || a.verifiedAt || '') || 0))
    .slice(0, Math.max(0, limit));
}

function localDiscoveryCollapseState(source, discoveredCandidates = [], previousJobs = []) {
  const previousActive = (previousJobs || [])
    .filter((job) => job?.source === source)
    .filter((job) => isJeonjuWanjuLocal(job))
    .filter((job) => !['archived_missing', 'expired', 'talent_pool'].includes(job.listingStatus));
  const previousIds = new Set(previousActive.map((job) => text(job.sourcePostingId)).filter(Boolean));
  const discoveredIds = new Set((discoveredCandidates || []).map((candidate) => text(candidate?.id)).filter(Boolean));
  const referenceCount = previousActive.length;
  const discoveredCount = discoveredIds.size;
  const overlapCount = [...previousIds].filter((id) => discoveredIds.has(id)).length;
  const ratio = referenceCount ? discoveredCount / referenceCount : null;
  const overlapRatio = referenceCount ? overlapCount / referenceCount : null;
  return {
    suspected: referenceCount >= 10
      && discoveredCount > 0
      && (
        discoveredCount < Math.ceil(referenceCount * 0.5)
        || overlapCount < Math.ceil(referenceCount * 0.5)
      ),
    referenceCount,
    discoveredCount,
    overlapCount,
    ratio,
    overlapRatio
  };
}

function markLocalTerminalPosting(previousJob, status) {
  const nowIso = new Date().toISOString();
  return {
    ...previousJob,
    listingStatus: 'expired',
    listingLabel: '공개 상세 공고 종료/삭제 확인',
    listingReason: `직전 공고 상세 URL을 다시 확인했지만 HTTP ${status} 응답으로 더 이상 공개되지 않음`,
    listingBasis: 'detail_http_terminal',
    listingVerification: 'intermediary',
    listingCheckedAt: nowIso,
    sourceListingState: 'public_detail_terminal',
    stale: true,
    score: 0,
    recommendationEligible: false,
    _continuityTerminal: true
  };
}

async function collectStructuredLocalBoard({ source, searchUrls, idRegex, detailUrl, perSearchLimit = 30, previousJobs = [] }) {
  const candidates = [];
  const candidateIndexes = new Map();
  const saraminPartialSearch = source === '사람인';
  const searchFailureScopes = [];
  const searchFailureReasons = {};
  let searchSuccessCount = 0;
  for (const [index, searchSpec] of searchUrls.entries()) {
    const spec = typeof searchSpec === 'string' ? { url: searchSpec } : searchSpec;
    let html;
    try {
      html = await fetchText(spec.url);
    } catch (error) {
      if (!saraminPartialSearch) throw error;
      const scope = ['전주', '완주'][index] || '지역 ' + (index + 1);
      searchFailureScopes.push(scope);
      searchFailureReasons[scope] = incruitSearchFailureCode(error);
      continue;
    }
    searchSuccessCount += 1;
    const discovered = typeof spec.discover === 'function'
      ? spec.discover(html).slice(0, spec.limit || perSearchLimit)
      : uniqueIds(html, idRegex, spec.limit || perSearchLimit).map((id) => ({ id }));
    for (const candidate of discovered) {
      const id = text(candidate?.id);
      if (!id) continue;
      if (candidateIndexes.has(id)) {
        const index = candidateIndexes.get(id);
        candidates[index] = {
          ...candidates[index],
          ...Object.fromEntries(Object.entries(candidate || {}).filter(([, value]) => value !== '' && value !== null && value !== undefined)),
          id
        };
        continue;
      }
      candidateIndexes.set(id, candidates.length);
      candidates.push({ ...candidate, id });
    }
  }
  const searchRun = saraminPartialSearch ? {
    searchAttemptCount: searchUrls.length,
    searchSuccessCount,
    searchFailureCount: searchFailureScopes.length,
    searchFailureScopes,
    searchFailureReasons
  } : {};
  if (!candidates.length) {
    const error = new Error(source + ' public search returned no posting ids');
    if (saraminPartialSearch) error.sourceRun = searchRun;
    throw error;
  }
  const results = await mapLimit(candidates, 4, async (candidate) => {
    const url = detailUrl(candidate.id);
    try {
      const html = await fetchText(url);
      return structuredLocalBoardCandidate(source, candidate.id, url, html, candidate);
    } catch (error) {
      if (source === '알바천국' && error?.code === 'access_restricted') {
        const previousJob = previousAlbaJobForCandidate(previousJobs, candidate.id);
        const fallback = albaPublicListFallbackCandidate(candidate.id, url, candidate, previousJob);
        if (fallback) return fallback;
      }
      throw error;
    }
  });
  const successful = results.filter((result) => result?.ok && result.value).map((result) => result.value);
  const collapseState = localDiscoveryCollapseState(source, candidates, previousJobs);
  const discoveredDetailFailureCount = results.filter((result) => !result?.ok).length;
  if (results.length >= 10
    && successful.length < Math.ceil(results.length * 0.5)
    && discoveredDetailFailureCount >= 5) {
    const error = localDetailError(
      'detail_collapse',
      `${source} detail parsing collapsed: ${successful.length}/${results.length} discovered postings parsed successfully (previous local reference ${collapseState.referenceCount})`
    );
    error.sourceRun = {
      ...searchRun,
      rawCount: candidates.length,
      discoveredCount: candidates.length,
      detailAttemptCount: results.length,
      detailSuccessCount: successful.length,
      detailFailureCount: discoveredDetailFailureCount,
      discoveryCollapseSuspected: collapseState.suspected,
      discoveryReferenceCount: collapseState.referenceCount,
      discoveryOverlapCount: collapseState.overlapCount
    };
    throw error;
  }
  if (!successful.length) throw new Error(source + ' public detail parsing failed for all discovered postings');
  const continuityCandidates = localContinuityCandidates(source, candidates, previousJobs, collapseState.suspected ? 60 : 12);
  const continuityResults = await mapLimit(continuityCandidates, 3, async (previousJob) => {
    const id = text(previousJob.sourcePostingId);
    const url = detailUrl(id);
    const html = await fetchText(url);
    const recovered = structuredLocalBoardCandidate(source, id, url, html);
    recovered._continuityRecovered = true;
    return recovered;
  });
  const continuityTerminal = continuityResults
    .map((result, index) => ({ result, previousJob: continuityCandidates[index] }))
    .filter(({ result }) => !result?.ok && [404, 410].includes(Number(result?.error?.status || 0)))
    .map(({ result, previousJob }) => markLocalTerminalPosting(previousJob, Number(result.error.status)));
  const continuityFailureCount = continuityResults.filter((result) =>
    !result?.ok && ![404, 410].includes(Number(result?.error?.status || 0))).length;
  if (collapseState.suspected
    && continuityCandidates.length >= 3
    && continuityFailureCount >= Math.max(3, Math.ceil(continuityCandidates.length * 0.5))) {
    const error = localDetailError(
      'discovery_collapse',
      `${source} search discovery collapsed from ${collapseState.referenceCount} previous local postings to ${collapseState.discoveredCount}, and ${continuityFailureCount}/${continuityCandidates.length} direct continuity checks also failed`
    );
    error.sourceRun = {
      ...searchRun,
      rawCount: candidates.length + continuityCandidates.length,
      discoveredCount: candidates.length,
      detailAttemptCount: results.length,
      detailSuccessCount: successful.length,
      detailFailureCount: discoveredDetailFailureCount,
      continuityProbeCount: continuityCandidates.length,
      continuityRecoveredCount: continuityResults.filter((result) => result?.ok && result.value).length,
      continuityFailureCount,
      discoveryCollapseSuspected: true,
      discoveryReferenceCount: collapseState.referenceCount,
      discoveryOverlapCount: collapseState.overlapCount
    };
    throw error;
  }
  const continuityRecovered = continuityResults
    .filter((result) => result?.ok && result.value && isJeonjuWanjuLocal(result.value))
    .map((result) => result.value);
  const successfulIds = new Set(successful.map((job) => `${job.source}:${job.sourcePostingId}`));
  for (const recovered of continuityRecovered) {
    const key = `${recovered.source}:${recovered.sourcePostingId}`;
    if (!successfulIds.has(key)) {
      successful.push(recovered);
      successfulIds.add(key);
    }
  }
  for (const terminal of continuityTerminal) {
    const key = `${terminal.source}:${terminal.sourcePostingId}`;
    if (!successfulIds.has(key)) {
      successful.push(terminal);
      successfulIds.add(key);
    }
  }
  const detailRecoveredCount = successful.filter((job) => job._detailRecovered).length;
  const listFallbackCount = successful.filter((job) => job._listFallback).length;
  const continuityRecoveredCount = successful.filter((job) => job._continuityRecovered).length;
  const continuityTerminalCount = successful.filter((job) => job._continuityTerminal).length;
  for (const job of successful) {
    delete job._detailRecovered;
    delete job._detailRecoveryKind;
    delete job._listFallback;
    delete job._continuityRecovered;
    delete job._continuityTerminal;
  }
  const local = successful.filter(isJeonjuWanjuLocal);
  const matched = local.filter((job) => Number(job.score || 0) >= 10);
  const terminal = local.filter((job) => job.listingStatus === 'expired');
  const workplaceUnverifiedCount = results.filter((result) => !result?.ok && result?.error?.code === 'workplace_unverified').length;
  const accessRestrictedCount = results.filter((result) => !result?.ok && result?.error?.code === 'access_restricted').length;
  const detailFailureCount = results.filter((result) => !result?.ok
    && !['workplace_unverified', 'access_restricted'].includes(result?.error?.code)).length;
  return sourceCollection([...matched, ...terminal.filter((job) => !matched.includes(job))], candidates.length + continuityCandidates.length, {
    ...searchRun,
    discoveredCount: candidates.length,
    detailAttemptCount: results.length,
    detailSuccessCount: results.filter((result) => result?.ok && result.value).length,
    localeEligibleCount: local.length,
    profileMatchedCount: matched.filter((job) => job.roleFitEvidence).length,
    detailFailureCount,
    workplaceUnverifiedCount,
    accessRestrictedCount,
    listFallbackCount,
    detailRecoveredCount,
    continuityProbeCount: continuityCandidates.length,
    continuityRecoveredCount,
    continuityTerminalCount,
    continuityFailureCount,
    discoveryCollapseSuspected: collapseState.suspected,
    discoveryReferenceCount: collapseState.referenceCount,
    discoveryOverlapCount: collapseState.overlapCount
  });
}

const albamonSearchPages = Object.freeze([1, 2, 3, 4, 5, 6]);

async function collectAlbamon(previousJobs = []) {
  return collectStructuredLocalBoard({
    source: '알바몬',
    searchUrls: albamonSearchPages.map((page) => ({
      url: 'https://www.albamon.com/jobs/area/home?areas=M000&page=' + page,
      discover: albamonListCandidates,
      limit: 40
    })),
    idRegex: /\/jobs\/detail\/(\d+)/gi,
    detailUrl: (id) => 'https://www.albamon.com/jobs/detail/' + id,
    perSearchLimit: 48,
    previousJobs
  });
}

async function collectAlba(previousJobs = []) {
  return collectStructuredLocalBoard({
    source: '알바천국',
    searchUrls: [
      {
        url: 'https://www.alba.co.kr/search/Search?wsSrchWord=%EC%A0%84%EC%A3%BC',
        discover: albaSearchListCandidates,
        limit: 40
      },
      {
        url: 'https://www.alba.co.kr/search/Search?wsSrchWord=%EC%99%84%EC%A3%BC',
        discover: albaSearchListCandidates,
        limit: 40
      },
      {
        url: 'https://www.alba.co.kr/job/area/MainLocal?viewtype=L&sidocd=063',
        discover: albaRegionListCandidates,
        limit: 40
      }
    ],
    idRegex: /\/job\/Detail\?[^"'<>]*?\badid=(\d+)/gi,
    detailUrl: (id) => 'https://www.alba.co.kr/job/Detail?adid=' + id,
    perSearchLimit: 28,
    previousJobs
  });
}

async function collectJobKorea(previousJobs = []) {
  return collectStructuredLocalBoard({
    source: '잡코리아',
    searchUrls: ['%EC%A0%84%EC%A3%BC', '%EC%99%84%EC%A3%BC'].flatMap((term) => [
      { url: 'https://www.jobkorea.co.kr/Search/?stext=' + term, discover: jobKoreaSearchCandidates, limit: 30 },
      { url: 'https://www.jobkorea.co.kr/Search/?stext=' + term + '&Page_No=2', discover: jobKoreaSearchCandidates, limit: 30 },
      { url: 'https://www.jobkorea.co.kr/Search/?stext=' + term + '&Page_No=3', discover: jobKoreaSearchCandidates, limit: 30 }
    ]),
    idRegex: /\/Recruit\/GI_Read\/(\d+)/gi,
    detailUrl: (id) => 'https://www.jobkorea.co.kr/Recruit/GI_Read/' + id,
    perSearchLimit: 24,
    previousJobs
  });
}

async function collectSaramin(previousJobs = []) {
  const base = 'https://www.saramin.co.kr/zf_user/jobs/list/domestic?page=1&page_count=50&sort=RD&type=domestic&is_param=1&loc_cd=';
  return collectStructuredLocalBoard({
    source: '사람인',
    searchUrls: [
      { url: base + '113130%2C113140', discover: saraminAreaListCandidates, limit: 30 },
      { url: base + '113080', discover: saraminAreaListCandidates, limit: 30 }
    ],
    idRegex: /id=["']rec-(\d+)/gi,
    detailUrl: (id) => 'https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=' + id,
    perSearchLimit: 30,
    previousJobs
  });
}

function transientIncruitSearchFailure(error) {
  return !error?.status && ['TypeError', 'TimeoutError', 'AbortError'].includes(String(error?.name || ''));
}

function preserveFailedSourceJobs(source, previousJobs = []) {
  return previousJobs
    .filter((job) => job.source === source
      && (source !== '인크루트'
        || !['expired', 'archived_missing', 'talent_pool'].includes(job.listingStatus)))
    .map(markPreservedSourceFailure);
}

// Only stable, non-sensitive failure categories enter the public feed. Never
// serialize raw network exceptions, response bodies, or request headers.
function incruitSearchFailureCode(error) {
  const status = Number(error?.status);
  if (Number.isInteger(status) && status >= 400) {
    if (status === 403) return 'http_forbidden';
    if (status === 429) return 'http_rate_limited';
    if (status >= 500) return 'http_server_error';
    return 'http_client_error';
  }
  if (['TimeoutError', 'AbortError'].includes(String(error?.name || ''))) return 'timeout';
  // Node's fetch may wrap several IPv4/IPv6 failures in an AggregateError.
  // Inspect bounded error codes only; never persist potentially sensitive messages.
  const causeCodes = [
    error?.cause?.code,
    error?.code,
    ...(Array.isArray(error?.cause?.errors) ? error.cause.errors.slice(0, 4).map((item) => item?.code) : [])
  ].filter(Boolean).map((code) => String(code).toUpperCase());
  const dnsCodes = ['ENOTFOUND', 'EAI_AGAIN', 'ENODATA'];
  const timeoutCodes = ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'];
  const connectionCodes = ['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_SOCKET'];
  if (causeCodes.some((code) => ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT'].includes(code))) return 'tls_error';
  if (causeCodes.length && causeCodes.every((code) => dnsCodes.includes(code))) return 'dns_error';
  if (causeCodes.length && causeCodes.every((code) => timeoutCodes.includes(code))) return 'timeout';
  if (causeCodes.some((code) => [...dnsCodes, ...timeoutCodes, ...connectionCodes].includes(code))) return 'network_error';
  if (String(error?.name || '') === 'TypeError') return 'network_error';
  return 'other_error';
}

async function fetchIncruitSearchText(url) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetchText(url, { charset: 'euc-kr', signal: AbortSignal.timeout(15000) });
    } catch (error) {
      lastError = error;
      if (attempt > 0 || !transientIncruitSearchFailure(error)) throw error;
    }
  }
  throw lastError;
}

function incruitRssListJob(candidate, previousJob = null) {
  const cached = previousJob
    && ['public_detail', 'public_rss_cached_detail'].includes(previousJob.sourceListingState)
    && previousJob.workAddress
    && localMunicipality(previousJob.workAddress) === localMunicipality(candidate.listLocation);
  return normalizeJob({
    ...(cached ? {
      description: previousJob.description,
      type: previousJob.type,
      salary: previousJob.salaryMetadataRaw || '',
      experience: previousJob.experience,
      education: previousJob.education,
      location: previousJob.workAddress,
      workAddress: previousJob.workAddress,
      workAddressEvidence: 'historical_detail',
      lastDetailVerifiedAt: previousJob.lastDetailVerifiedAt || previousJob.lastVerifiedAt || previousJob.verifiedAt,
      deadlineType: previousJob.deadlineType,
      deadlineDate: previousJob.deadlineDate,
      deadlineLabel: previousJob.deadlineLabel
    } : {}),
    id: 'incruit:' + candidate.id,
    sourcePostingId: candidate.id,
    source: '인크루트',
    platform: '인크루트',
    title: candidate.title,
    company: candidate.company,
    location: cached ? previousJob.workAddress : candidate.listLocation,
    workplaceMode: 'unknown',
    countryCode: 'KR',
    url: candidate.url,
    postedAt: candidate.postedAt,
    deadlineType: candidate.deadlineType,
    deadlineDate: candidate.deadlineDate,
    deadlineLabel: candidate.deadlineLabel,
    description: cached ? previousJob.description : candidate.title,
    sourceListingState: cached ? 'public_rss_cached_detail' : 'public_rss',
    locationEvidenceLevel: cached ? 'source_text' : 'source_list',
    deadlineType: candidate.deadlineType === 'fixed' || candidate.deadlineType === 'rolling'
      ? candidate.deadlineType : (cached ? previousJob.deadlineType : candidate.deadlineType),
    deadlineDate: candidate.deadlineType === 'fixed'
      ? candidate.deadlineDate : (candidate.deadlineType === 'rolling' ? '' : (cached ? previousJob.deadlineDate : candidate.deadlineDate)),
    deadlineLabel: candidate.deadlineLabel || (cached ? previousJob.deadlineLabel : '')
  });
}

async function collectIncruit(previousJobs = []) {
  const searchBase = 'https://job.incruit.com/jobdb_list/searchjob.asp?col=job&kw=';
  const candidates = [];
  const byId = new Map();
  const searchTargets = [
    { term: '%EC%A0%84%EC%A3%BC', label: '전주' },
    { term: '%EC%99%84%EC%A3%BC', label: '완주' }
  ];
  let searchSuccessCount = 0;
  const searchFailureScopes = [];
  const searchFailureReasons = {};
  // Publisher-advertised bounded RSS: one request, not a search substitute.
  // Require one explicit local workplace; province-wide/multi-site items are excluded.
  let rssCandidates = [];
  let rssItemCount = 0;
  let rssStatus = 'failed';
  let rssFailureCode = '';
  try {
    const rssXml = await fetchText(incruitJeonbukRssUrl, { signal: AbortSignal.timeout(10000) });
    const rss = parseIncruitJeonbukRss(rssXml);
    rssCandidates = rss.candidates;
    rssItemCount = rss.itemCount;
    rssStatus = 'ok';
  } catch (error) {
    rssFailureCode = incruitSearchFailureCode(error);
  }
  for (const target of searchTargets) {
    try {
      const html = await fetchIncruitSearchText(searchBase + target.term);
      searchSuccessCount += 1;
      for (const candidate of incruitSearchCandidates(html).slice(0, 40)) {
        if (byId.has(candidate.id)) continue;
        byId.set(candidate.id, candidate);
        candidates.push(candidate);
      }
    } catch (error) {
      searchFailureScopes.push(target.label);
      searchFailureReasons[target.label] = incruitSearchFailureCode(error);
    }
  }
  const searchRun = {
    searchAttemptCount: searchTargets.length,
    searchSuccessCount,
    searchFailureCount: searchFailureScopes.length,
    searchFailureScopes,
    searchFailureReasons,
    rssStatus,
    rssItemCount,
    rssFailureCode
  };
  if (!candidates.length && !rssCandidates.length) {
    const error = new Error(searchFailureScopes.length
      ? `인크루트 public search incomplete (${searchFailureScopes.join(', ')} 검색 실패) and returned no verified Jeonju/Wanju posting ids`
      : '인크루트 public search returned no verified Jeonju/Wanju posting ids');
    error.sourceRun = searchRun;
    throw error;
  }

  const results = await mapLimit(candidates, 4, async (candidate) => {
    const url = 'https://job.incruit.com/jobdb_info/jobpost.asp?job=' + candidate.id;
    const html = await fetchText(url, { charset: 'euc-kr', signal: AbortSignal.timeout(15000) });
    return structuredLocalBoardCandidate('인크루트', candidate.id, url, html, candidate);
  });
  const successful = results.filter((result) => result?.ok && result.value).map((result) => result.value);
  const detailRejectionCounts = results.reduce((counts, result) => {
    if (result?.ok) return counts;
    const code = text(result?.error?.code) || 'detail_error';
    counts[code] = Number(counts[code] || 0) + 1;
    return counts;
  }, {});
  const rejected = results.length - successful.length;
  const detailCollapseSuspected = results.length > 0 && (
    successful.length === 0
    || (results.length >= 10 && successful.length < Math.ceil(results.length * 0.5) && rejected >= 5)
  );
  if (!rssCandidates.length && detailCollapseSuspected) {
    const error = localDetailError('detail_collapse', `인크루트 detail validation collapsed: ${successful.length}/${results.length} search-qualified postings passed cross-check`);
    error.sourceRun = {
      ...searchRun,
      rawCount: candidates.length,
      discoveredCount: candidates.length,
      detailAttemptCount: results.length,
      detailSuccessCount: successful.length,
      detailFailureCount: rejected,
      detailRejectedCount: rejected,
      detailRejectionCounts
    };
    throw error;
  }
  if (!successful.length && !rssCandidates.length) {
    const error = localDetailError('detail_collapse', '인크루트 public detail validation failed for all search-qualified postings');
    error.sourceRun = {
      ...searchRun,
      rawCount: candidates.length,
      discoveredCount: candidates.length,
      detailAttemptCount: results.length,
      detailSuccessCount: 0,
      detailFailureCount: rejected,
      detailRejectedCount: rejected,
      detailRejectionCounts
    };
    throw error;
  }
  const detailIds = new Set(successful.map((job) => text(job.sourcePostingId)));
  const previousById = new Map(previousJobs
    .filter((job) => job.source === '인크루트' && /^\d+$/.test(text(job.sourcePostingId)))
    .map((job) => [text(job.sourcePostingId), job]));
  const rssOnly = rssCandidates.filter((candidate) => !detailIds.has(candidate.id))
    .map((candidate) => incruitRssListJob(candidate, previousById.get(candidate.id))).filter(isJeonjuWanjuLocal);
  const local = [...successful, ...rssOnly].filter(isJeonjuWanjuLocal);
  const matched = local.filter((job) => Number(job.score || 0) >= 10);
  return sourceCollection(matched, candidates.length + rssItemCount, {
    ...searchRun,
    discoveredCount: candidates.length + rssCandidates.length,
    rssListOnlyCount: rssOnly.length,
    detailCollapseSuspected,
    detailAttemptCount: results.length,
    detailSuccessCount: successful.length,
    detailFailureCount: rejected,
    detailRejectedCount: rejected,
    detailRejectionCounts,
    localeEligibleCount: local.length,
    profileMatchedCount: matched.filter((job) => job.roleFitEvidence).length
  });
}

async function collectManual() {
  let items = [];
  try {
    items = JSON.parse(await fs.readFile(path.join(root, 'data/manual-jobs.json'), 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (!Array.isArray(items)) throw new Error('data/manual-jobs.json must contain a JSON array');
  const collected = items.map((j, index) => normalizeJob({ ...j, id: j.id || `manual:${index}`, source: j.source || '직접 추가' }));
  return sourceCollection(collected, items.length);
}

function dedupe(jobs) {
  const groups = new Map();
  for (const job of jobs) {
    const company = canonicalCompany(job.company);
    const title = canonicalDedupeTitle(job);
    const fallback = normalizedUrl(job.url);
    const baseKey = company && company !== '회사 미상' && title ? `${company}::${title}` : fallback;
    const clusters = groups.get(baseKey) ?? [];
    const compatible = clusters.find((cluster) => {
      const current = cluster[0];
      const currentDomesticKey = domesticLocationKey(current);
      const jobDomesticKey = domesticLocationKey(job);
      if (currentDomesticKey && jobDomesticKey && currentDomesticKey !== jobDomesticKey) return false;
      if (current.url === job.url) return true;
      if (currentDomesticKey || jobDomesticKey) {
        return Boolean(currentDomesticKey) === Boolean(jobDomesticKey)
          && currentDomesticKey === jobDomesticKey;
      }
      if (isOfficialKind(current.sourceKind) && isOfficialKind(job.sourceKind)) {
        return current.eligibilityCode === job.eligibilityCode && canonicalLocation(current.location) === canonicalLocation(job.location);
      }
      if (current.eligibilityCode === job.eligibilityCode) {
        if (['korea', 'worldwide'].includes(current.eligibilityCode)) return true;
        const a = canonicalLocation(current.location);
        const b = canonicalLocation(job.location);
        if (a === b) return true;
        if (current.eligibilityCode === 'unknown' && (a === 'remote' || b === 'remote')) return true;
        return false;
      }
      if (current.eligibilityCode === 'unknown' || job.eligibilityCode === 'unknown') {
        const a = canonicalLocation(current.location);
        const b = canonicalLocation(job.location);
        return a === b || a === 'remote' || b === 'remote';
      }
      if (isOfficialKind(current.sourceKind) || isOfficialKind(job.sourceKind)) {
        const official = isOfficialKind(current.sourceKind) ? current : job;
        const other = official === current ? job : current;
        return !isOfficialKind(other.sourceKind) && (official.eligibilityCode === 'worldwide' || other.eligibilityCode === 'unknown');
      }
      return false;
    });
    if (compatible) compatible.push(job);
    else clusters.push([job]);
    groups.set(baseKey, clusters);
  }

  const merged = [];
  for (const clusters of groups.values()) {
    for (const cluster of clusters) {
      cluster.sort((a, b) => {
        const rank = (sourceRank[b.sourceKind] ?? 0) - (sourceRank[a.sourceKind] ?? 0);
        if (rank) return rank;
        const scoreDiff = b.score - a.score;
        if (scoreDiff) return scoreDiff;
        return (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0);
      });
      const primary = { ...cluster[0] };
      primary.legacyIds = [...new Set(cluster.map((job) => job.id))];
      primary.sources = [...new Set(cluster.map((job) => job.source))];
      primary.alternateUrls = [...new Set(cluster.map((job) => job.url).filter((url) => url && url !== primary.url))];
      primary.duplicateCount = cluster.length;
      primary.id = stableJobId(primary);
      if (cluster.some((job) => job.listingStatus === 'verified_open')) {
        primary.listingStatus = 'verified_open';
        primary.listingLabel = '모집 확인됨';
        primary.stale = false;
      }
      merged.push(primary);
    }
  }
  const crossPlatformGroups = new Map();
  const passthrough = [];
  for (const job of merged) {
    const key = localCrossPlatformGroupKey(job);
    if (!key) {
      passthrough.push(job);
      continue;
    }
    const group = crossPlatformGroups.get(key) ?? [];
    group.push(job);
    crossPlatformGroups.set(key, group);
  }
  for (const group of crossPlatformGroups.values()) {
    const compatibleClusters = [];
    for (const job of group) {
      const cluster = compatibleClusters.find((candidate) => localCrossPlatformDuplicateCompatible(candidate[0], job));
      if (cluster) cluster.push(job);
      else compatibleClusters.push([job]);
    }
    for (const cluster of compatibleClusters) {
      const representedSources = new Set(cluster.flatMap((job) => job.sources?.length ? job.sources : [job.source]));
      if (cluster.length < 2 || representedSources.size < 2) {
        passthrough.push(...cluster);
        continue;
      }
      cluster.sort((a, b) => {
        const rank = (sourceRank[b.sourceKind] ?? 0) - (sourceRank[a.sourceKind] ?? 0);
        if (rank) return rank;
        const scoreDiff = b.score - a.score;
        if (scoreDiff) return scoreDiff;
        return (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0);
      });
      const primary = { ...cluster[0] };
      const aliases = new Set(cluster.flatMap((job) => [job.id, ...(job.legacyIds || [])]).filter(Boolean));
      primary.sources = [...new Set(cluster.flatMap((job) => job.sources?.length ? job.sources : [job.source]))];
      primary.alternateUrls = [...new Set(cluster.flatMap((job) => [job.url, ...(job.alternateUrls || [])]).filter((url) => url && url !== primary.url))];
      primary.duplicateCount = cluster.reduce((sum, job) => sum + Math.max(1, Number(job.duplicateCount || 1)), 0);
      primary.id = stableJobId(primary);
      aliases.delete(primary.id);
      primary.legacyIds = [...aliases];
      passthrough.push(primary);
    }
  }
  return passthrough;
}

function keepInFeed(job) {
  return (Number(job.score || 0) >= 10 || isOfficialKind(job.sourceKind))
    || job.sourceKind === 'manual'
    || ['source_error', 'archived_missing'].includes(job.listingStatus)
    || (localDomesticBoardSources.has(job.source)
      && job.listingStatus === 'expired'
      && job.listingBasis === 'detail_http_terminal');
}

function isDefaultRecommendation(job) {
  return recommendationRule(job, recommendationPolicyVersion);
}

function refreshTimeBasedEvidence(jobs, now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  return jobs.map((job) => {
    const quality = sourceMeta(job.source);
    const paymentEvidence = derivePaymentEvidence(quality, now);
    const previousFreshness = job.paymentEvidenceFreshness || '';
    const previousState = job.paymentEvidenceState || '';
    let verificationHistory = Array.isArray(job.verificationHistory) ? job.verificationHistory : [];
    if (previousFreshness && previousFreshness !== paymentEvidence.freshness) {
      verificationHistory = appendLimitedHistory(verificationHistory, {
        at: nowIso,
        event: 'evidence_freshness_changed',
        fromStatus: previousFreshness,
        toStatus: paymentEvidence.freshness,
        fingerprint: job.contentFingerprint || contentFingerprint(job),
        reason: `지급 근거 최신성 변경: ${previousFreshness} → ${paymentEvidence.freshness}`
      });
    }
    if (previousState && previousState !== paymentEvidence.state) {
      verificationHistory = appendLimitedHistory(verificationHistory, {
        at: nowIso,
        event: 'evidence_state_changed',
        fromStatus: previousState,
        toStatus: paymentEvidence.state,
        fingerprint: job.contentFingerprint || contentFingerprint(job),
        reason: `지급 근거 상태 변경: ${previousState} → ${paymentEvidence.state}`
      });
    }
    return {
      ...job,
      paymentStatus: quality.paymentStatus,
      paymentLabel: quality.paymentLabel,
      paymentEvidenceState: paymentEvidence.state,
      paymentEvidenceLabel: paymentEvidence.label,
      paymentConfidence: paymentEvidence.confidence,
      paymentEvidenceFreshness: paymentEvidence.freshness,
      paymentEvidenceCheckedAt: paymentEvidence.checkedAt,
      paymentEvidenceNextReviewAt: paymentEvidence.nextReviewAt,
      paymentSummary: paymentEvidence.summary,
      paymentSignals: paymentEvidence.signals,
      verificationHistory
    };
  });
}

function collectionGapsFor({ work24Configured = false } = {}) {
  return [
    ...(!work24Configured ? [{
      source: '고용24',
      status: 'not_configured',
      label: '공식 API 미연결',
      reason: 'WORK24_AUTH_KEY가 설정되지 않아 현재 수집 실행에서 제외됨',
      alternative: '공식 OPEN-API 인증키를 설정하면 자동 수집 가능',
      markets: ['domestic']
    }] : []),
    {
      source: 'LinkedIn',
      status: 'manual_import',
      label: '자동 수집 안 함',
      reason: '로그인 기반 직접 크롤링 대신 공식 Job Alert 경로를 사용',
      alternative: '공식 Job Alert 내보내기 JSON을 상태/알림 가져오기로 병합',
      markets: ['overseas_remote', 'domestic']
    },
    {
      source: 'Indeed',
      status: 'manual_only',
      label: '자동 수집 안 함',
      reason: '직접 크롤링 대신 공식 Job Alert 또는 수동 입력을 사용',
      alternative: '실제 Job Alert 샘플 확보 전에는 공고 직접 추가 사용',
      markets: ['overseas_remote', 'domestic']
    },
    {
      source: '잡플래닛',
      status: 'access_restricted',
      label: '공개 접근 제한',
      reason: '무로그인 공개 검색이 Cloudflare challenge로 제한됨',
      alternative: '연결된 원출처 공고를 우선 사용하거나 공고 직접 추가',
      markets: ['domestic']
    }
  ];
}

const { appendLimitedHistory, sourceContentSnapshot, sourceFieldFingerprints, contentFingerprint, changedSourceFields, rebaseLegacyContentHistory, previousJobLookup, findPreviousJob, reconcileVerificationHistory } = createVerificationHistory({ text, stableSourceDescription, normalizedUrl, verificationHistoryLimit, contentFingerprintVersion, verificationCheckpointMs });
const { normalizeJob } = createJobNormalizer({ stableSourceDescription, normalizeWorkplaceMode, text, classify, domesticRegionFor, marketScopesFor, marketSegmentFor, eligibilityFor, sourceMeta, extractSalary, isOfficialKind, derivePaymentEvidence, currentListingState, lower, profile, evidenceSnippet, extractLocalWorkPeriod, extractLocalWorkSchedule, localCompensationNotes, localMandatoryQualification, localPreferredConditions, scoreJob, contentFingerprintVersion, sourceFieldFingerprints, contentFingerprint, localDomesticBoardSources });
const { collectLeverBoard, collectWeloGlobal, collectRws, collectTsmg, collectElevenLabs, collectLilt, collectKrafton, collectAppier, collectChannelCorp, work24Candidate, fallbackJobsForConfiguredSources, collectWork24, collectMeridial, oneFormaTerms, oneFormaSupportsKorean, oneFormaCandidate, collectOneForma, collectWeWorkRemotely, collectJobicy, collectRemoteOk, collectRemotive, collectArbeitnow } = createSourceAdapters({ fetchJson, fetchText, text, lower, decodeHtmlEntities, normalizeJob, relevantToProfile, sourceCollection, work24Deadline, work24EmploymentType, work24IsoDate, parseWork24ListXml, xmlTag });

const { carryForwardLegacyIds, carryRecentlyMissing } = createMissingJobRules({ normalizedUrl, relevantToProfile, isOfficialKind, appendLimitedHistory, contentFingerprint, sourceMeta, derivePaymentEvidence, eligibilityFor, normalizeWorkplaceMode, domesticRegionFor, marketScopesFor, legacyLocalWorkAddressEvidence, extractSalary });
const { recommendationCollapseRisk } = createRecommendationGuard({ isDefaultRecommendation, normalizedUrl });
const { sourceQualityTier, sourceReliabilityState, buildSourceMetrics, applySourceMetricsToJobs } = createSourceMetrics({ sourceMetricHistoryLimit, sourceMeta, isOfficialKind, isDefaultRecommendation, appendLimitedHistory });

async function collectJobsOnce({ includeManual = true, persist = true, previousJobs = null, previousFeed = null, networkOptions = {}, outputPath = path.join(root, 'data/jobs.json'), sourceAdapters = null } = {}) {
  const work24AuthKey = text(process.env.WORK24_AUTH_KEY || '');
  let sources = [
    ['Welo Global', collectWeloGlobal],
    ['RWS TrainAI', collectRws],
    ['TSMG', collectTsmg],
    ['ElevenLabs', collectElevenLabs],
    ['KRAFTON', collectKrafton],
    ['Appier', collectAppier],
    ['Channel Corp', collectChannelCorp],
    ['LILT Production', collectLilt],
    ['Meridial', collectMeridial],
    ['OneForma', collectOneForma],
    ['알바몬', () => collectAlbamon(fallbackJobs)],
    ['알바천국', () => collectAlba(fallbackJobs)],
    ['잡코리아', () => collectJobKorea(fallbackJobs)],
    ['사람인', () => collectSaramin(fallbackJobs)],
    ['인크루트', () => collectIncruit(fallbackJobs)],
    ['We Work Remotely', collectWeWorkRemotely],
    ['Jobicy', collectJobicy],
    ['Remote OK', collectRemoteOk],
    ['Remotive', collectRemotive],
    ['Arbeitnow', collectArbeitnow]
  ];
  if (work24AuthKey) sources.unshift(['고용24', () => collectWork24(work24AuthKey)]);
  if (includeManual) sources.push(['직접 추가', collectManual]);
  if (sourceAdapters) sources = sourceAdapters;
  let fallbackFeed = previousFeed && typeof previousFeed === 'object' ? previousFeed : null;
  let fallbackJobs = Array.isArray(previousJobs)
    ? previousJobs
    : Array.isArray(fallbackFeed?.jobs)
      ? fallbackFeed.jobs
      : [];
  if (!fallbackJobs.length) {
    try {
      const previous = JSON.parse(await fs.readFile(outputPath, 'utf8'));
      fallbackJobs = Array.isArray(previous.jobs) ? previous.jobs : [];
      fallbackFeed = fallbackFeed || previous;
    } catch {
      if (persist) fallbackJobs = [];
    }
  }
  const previousSourceMetrics = fallbackFeed?.sourceMetrics || {};
  const carryFallbackJobs = fallbackJobsForConfiguredSources(fallbackJobs, { work24Configured: Boolean(work24AuthKey) });
  const jobs = [];
  const sourceStatus = [];
  const sourceRuns = new Map();
  const sourceResults = await runSources(sources, networkOptions);
  for (const [index, [name]] of sources.entries()) {
    const outcome = sourceResults[index];
    try {
      if (outcome.error) throw outcome.error;
      const result = outcome.result;
      const collected = Array.isArray(result) ? result : (result?.jobs || []);
      sourceRuns.set(name, {
        rawCount: Number(result?.rawCount ?? collected.length),
        discoveredCount: Number(result?.discoveredCount ?? result?.rawCount ?? collected.length),
        searchAttemptCount: Number(result?.searchAttemptCount || 0),
        searchSuccessCount: Number(result?.searchSuccessCount || 0),
        searchFailureCount: Number(result?.searchFailureCount || 0),
        searchFailureScopes: Array.isArray(result?.searchFailureScopes) ? [...result.searchFailureScopes] : [],
        searchFailureReasons: result?.searchFailureReasons && typeof result.searchFailureReasons === 'object'
          ? { ...result.searchFailureReasons } : {},
        rssStatus: result?.rssStatus || '',
        rssItemCount: Number(result?.rssItemCount || 0),
        rssListOnlyCount: Number(result?.rssListOnlyCount || 0),
        detailCollapseSuspected: Boolean(result?.detailCollapseSuspected),
        rssFailureCode: result?.rssFailureCode || '',
        detailAttemptCount: Number(result?.detailAttemptCount || 0),
        detailSuccessCount: Number(result?.detailSuccessCount || 0),
        matchedCount: Number(result?.matchedCount ?? collected.length),
        localeEligibleCount: Number(result?.localeEligibleCount || 0),
        profileMatchedCount: Number(result?.profileMatchedCount ?? collected.length),
        detailFailureCount: Number(result?.detailFailureCount || 0),
        detailRejectedCount: Number(result?.detailRejectedCount || 0),
        detailRejectionCounts: result?.detailRejectionCounts && typeof result.detailRejectionCounts === 'object'
          ? { ...result.detailRejectionCounts }
          : {},
        workplaceUnverifiedCount: Number(result?.workplaceUnverifiedCount || 0),
        accessRestrictedCount: Number(result?.accessRestrictedCount || 0),
        listFallbackCount: Number(result?.listFallbackCount || 0),
        detailRecoveredCount: Number(result?.detailRecoveredCount || 0),
        continuityProbeCount: Number(result?.continuityProbeCount || 0),
        continuityRecoveredCount: Number(result?.continuityRecoveredCount || 0),
        continuityTerminalCount: Number(result?.continuityTerminalCount || 0),
        continuityFailureCount: Number(result?.continuityFailureCount || 0),
        discoveryCollapseSuspected: Boolean(result?.discoveryCollapseSuspected),
        discoveryReferenceCount: Number(result?.discoveryReferenceCount || 0),
        discoveryOverlapCount: Number(result?.discoveryOverlapCount || 0)
      });
      // Keep previously verified posts from a failed search region as
      // unverified, never as "disappeared", while retaining newly verified posts.
      const preservedPartial = name === '인크루트'
        ? preservePartialIncruitFallback(fallbackJobs, collected,
          Number(result?.searchFailureCount || 0) + (result?.detailCollapseSuspected ? 1 : 0))
        : name === '사람인'
          ? preservePartialLocalSearch(name, fallbackJobs, collected, result?.searchFailureCount)
          : [];
      jobs.push(...collected, ...preservedPartial);
      sourceStatus.push({
        source: name,
        ok: true,
        count: collected.length,
        ...(preservedPartial.length ? { preserved: preservedPartial.length } : {}),
        rawCount: Number(result?.rawCount ?? collected.length),
        discoveredCount: Number(result?.discoveredCount ?? result?.rawCount ?? collected.length),
        ...(result?.searchAttemptCount ? { searchAttemptCount: Number(result.searchAttemptCount) } : {}),
        ...(result?.searchSuccessCount ? { searchSuccessCount: Number(result.searchSuccessCount) } : {}),
        ...(result?.searchFailureCount ? { searchFailureCount: Number(result.searchFailureCount) } : {}),
        ...(Array.isArray(result?.searchFailureScopes) && result.searchFailureScopes.length
          ? { searchFailureScopes: [...result.searchFailureScopes] }
          : {}),
        ...(result?.searchFailureReasons && Object.keys(result.searchFailureReasons).length
          ? { searchFailureReasons: { ...result.searchFailureReasons } } : {}),
        ...(name === '인크루트' ? {
          rssStatus: result?.rssStatus || 'failed',
          rssItemCount: Number(result?.rssItemCount || 0),
          rssListOnlyCount: Number(result?.rssListOnlyCount || 0),
          ...(result?.rssFailureCode ? { rssFailureCode: result.rssFailureCode } : {})
        } : {}),
        ...(result?.detailAttemptCount ? { detailAttemptCount: Number(result.detailAttemptCount) } : {}),
        ...(result?.detailSuccessCount ? { detailSuccessCount: Number(result.detailSuccessCount) } : {}),
        ...(result?.detailFailureCount ? { detailFailureCount: Number(result.detailFailureCount) } : {}),
        ...(result?.detailRejectedCount ? { detailRejectedCount: Number(result.detailRejectedCount) } : {}),
        ...(result?.detailRejectionCounts && Object.keys(result.detailRejectionCounts).length
          ? { detailRejectionCounts: { ...result.detailRejectionCounts } }
          : {}),
        ...(result?.detailCollapseSuspected ? { detailCollapseSuspected: true } : {}),
        ...(result?.workplaceUnverifiedCount ? { workplaceUnverifiedCount: Number(result.workplaceUnverifiedCount) } : {}),
        ...(result?.accessRestrictedCount ? { accessRestrictedCount: Number(result.accessRestrictedCount) } : {}),
        ...(result?.listFallbackCount ? { listFallbackCount: Number(result.listFallbackCount) } : {}),
        ...(result?.detailRecoveredCount ? { detailRecoveredCount: Number(result.detailRecoveredCount) } : {}),
        ...(result?.continuityProbeCount ? { continuityProbeCount: Number(result.continuityProbeCount) } : {}),
        ...(result?.continuityRecoveredCount ? { continuityRecoveredCount: Number(result.continuityRecoveredCount) } : {}),
        ...(result?.continuityTerminalCount ? { continuityTerminalCount: Number(result.continuityTerminalCount) } : {}),
        ...(result?.continuityFailureCount ? { continuityFailureCount: Number(result.continuityFailureCount) } : {}),
        ...(result?.discoveryCollapseSuspected ? { discoveryCollapseSuspected: true } : {}),
        ...(result?.discoveryReferenceCount ? { discoveryReferenceCount: Number(result.discoveryReferenceCount) } : {}),
        ...(result?.discoveryOverlapCount ? { discoveryOverlapCount: Number(result.discoveryOverlapCount) } : {})
      });
    } catch (error) {
      // A failed Incruit fetch cannot reverse an already confirmed expiry or
      // turn an archived/pool row into a fresh "source failed" opening.
      const preserved = preserveFailedSourceJobs(name, fallbackJobs);
      jobs.push(...preserved);
      const failureRun = error?.sourceRun || {};
      sourceRuns.set(name, {
        rawCount: Number(failureRun.rawCount || 0),
        discoveredCount: Number(failureRun.discoveredCount || 0),
        searchAttemptCount: Number(failureRun.searchAttemptCount || 0),
        searchSuccessCount: Number(failureRun.searchSuccessCount || 0),
        searchFailureCount: Number(failureRun.searchFailureCount || 0),
        searchFailureScopes: Array.isArray(failureRun.searchFailureScopes) ? [...failureRun.searchFailureScopes] : [],
        searchFailureReasons: failureRun.searchFailureReasons && typeof failureRun.searchFailureReasons === 'object'
          ? { ...failureRun.searchFailureReasons } : {},
        rssStatus: failureRun.rssStatus || '',
        rssItemCount: Number(failureRun.rssItemCount || 0),
        rssListOnlyCount: Number(failureRun.rssListOnlyCount || 0),
        detailCollapseSuspected: Boolean(failureRun.detailCollapseSuspected),
        rssFailureCode: failureRun.rssFailureCode || '',
        detailAttemptCount: Number(failureRun.detailAttemptCount || 0),
        detailSuccessCount: Number(failureRun.detailSuccessCount || 0),
        matchedCount: 0,
        localeEligibleCount: 0,
        profileMatchedCount: 0,
        detailFailureCount: Number(failureRun.detailFailureCount || 0),
        detailRejectedCount: Number(failureRun.detailRejectedCount || 0),
        detailRejectionCounts: failureRun.detailRejectionCounts && typeof failureRun.detailRejectionCounts === 'object'
          ? { ...failureRun.detailRejectionCounts }
          : {},
        continuityProbeCount: Number(failureRun.continuityProbeCount || 0),
        continuityRecoveredCount: Number(failureRun.continuityRecoveredCount || 0),
        continuityFailureCount: Number(failureRun.continuityFailureCount || 0),
        discoveryCollapseSuspected: Boolean(failureRun.discoveryCollapseSuspected),
        discoveryReferenceCount: Number(failureRun.discoveryReferenceCount || 0),
        discoveryOverlapCount: Number(failureRun.discoveryOverlapCount || 0)
      });
      sourceStatus.push({
        source: name,
        ok: false,
        count: 0,
        preserved: preserved.length,
        ...(failureRun.searchAttemptCount ? { searchAttemptCount: Number(failureRun.searchAttemptCount) } : {}),
        ...(failureRun.searchSuccessCount ? { searchSuccessCount: Number(failureRun.searchSuccessCount) } : {}),
        ...(failureRun.searchFailureCount ? { searchFailureCount: Number(failureRun.searchFailureCount) } : {}),
        ...(Array.isArray(failureRun.searchFailureScopes) && failureRun.searchFailureScopes.length
          ? { searchFailureScopes: [...failureRun.searchFailureScopes] }
          : {}),
        ...(failureRun.searchFailureReasons && Object.keys(failureRun.searchFailureReasons).length
          ? { searchFailureReasons: { ...failureRun.searchFailureReasons } } : {}),
        ...(name === '인크루트' ? {
          rssStatus: failureRun.rssStatus || 'failed',
          rssItemCount: Number(failureRun.rssItemCount || 0),
          ...(failureRun.rssFailureCode ? { rssFailureCode: failureRun.rssFailureCode } : {})
        } : {}),
        ...(failureRun.discoveredCount ? { discoveredCount: Number(failureRun.discoveredCount) } : {}),
        ...(failureRun.detailAttemptCount ? { detailAttemptCount: Number(failureRun.detailAttemptCount) } : {}),
        ...(failureRun.detailSuccessCount ? { detailSuccessCount: Number(failureRun.detailSuccessCount) } : {}),
        ...(failureRun.detailFailureCount ? { detailFailureCount: Number(failureRun.detailFailureCount) } : {}),
        ...(failureRun.detailRejectedCount ? { detailRejectedCount: Number(failureRun.detailRejectedCount) } : {}),
        ...(failureRun.detailRejectionCounts && Object.keys(failureRun.detailRejectionCounts).length
          ? { detailRejectionCounts: { ...failureRun.detailRejectionCounts } }
          : {}),
        ...(failureRun.detailCollapseSuspected ? { detailCollapseSuspected: true } : {}),
        ...(failureRun.discoveryCollapseSuspected ? { discoveryCollapseSuspected: true } : {}),
        error: String(error.message ?? error)
      });
    }
  }
  // Use a collection-completion timestamp for lifecycle reconciliation. Individual
  // jobs are verified while network collection is in progress, so a start timestamp
  // would make lastVerifiedAt earlier than the job's own verifiedAt.
  for (const [index, status] of sourceStatus.entries()) {
    status.durationMs = sourceResults[index].durationMs;
    status.timedOut = sourceResults[index].timedOut;
  }
  const now = Date.now();
  const deduped = carryForwardLegacyIds(dedupe(jobs), carryFallbackJobs);
  const reconciled = reconcileVerificationHistory(deduped, carryFallbackJobs, now);
  const keptCurrent = reconciled.filter(keepInFeed);
  const sourceNames = sources.map(([name]) => name);
  const sourceMetrics = buildSourceMetrics(
    sourceNames,
    sourceRuns,
    sourceStatus,
    reconciled,
    keptCurrent,
    previousSourceMetrics,
    now
  );
  let currentJobs = applySourceMetricsToJobs(keptCurrent, sourceMetrics);
  for (const source of sourceNames) {
    const metric = sourceMetrics[source];
    if (!metric) continue;
    metric.recommendedCount = currentJobs.filter((job) =>
      (job.source === source || (job.sources || []).includes(source))
      && isDefaultRecommendation(job)).length;
  }
  const uniqueJobs = refreshTimeBasedEvidence(
    applySourceMetricsToJobs(carryRecentlyMissing(currentJobs, carryFallbackJobs, now), sourceMetrics),
    now
  )
    .sort((a, b) => (b.score - a.score) || ((Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0)));
  const enrichedSourceStatus = sourceStatus.map((status) => ({
    ...status,
    qualityTier: sourceMetrics[status.source]?.qualityTier || 'unknown',
    kept: sourceMetrics[status.source]?.keptCount || 0,
    recommended: sourceMetrics[status.source]?.recommendedCount || 0
  }));
  const payload = {
    updatedAt: new Date(now).toISOString(),
    locationReference: defaultLocationReference,
    domesticProvinceOptions,
    collectionGaps: collectionGapsFor({ work24Configured: Boolean(work24AuthKey) }),
    sourceStatus: enrichedSourceStatus,
    sourceMetrics,
    recommendationPolicyVersion,
    recommendationSummary: {
      count: uniqueJobs.filter(isDefaultRecommendation).length,
      baselineCount: fallbackFeed?.recommendationPolicyVersion === recommendationPolicyVersion
        ? Number(fallbackFeed?.recommendationSummary?.count || 0)
        : null,
      minExpected: fallbackFeed?.recommendationPolicyVersion === recommendationPolicyVersion
        ? Math.max(3, Math.ceil(Number(fallbackFeed?.recommendationSummary?.count || 0) * 0.5))
        : 1,
      hardRequirementCount: uniqueJobs.filter((job) => isDefaultRecommendation(job) && job.requirementsStatus === 'hard_check').length
    },
    jobs: uniqueJobs
  };
  const collapseRisk = recommendationCollapseRisk(payload, fallbackFeed);
  payload.recommendationSummary.collapseGuarded = collapseRisk.guarded;
  payload.recommendationSummary.sourceCollapseCount = collapseRisk.sourceCollapses.length;
  if (collapseRisk.collapse) {
    const sources = collapseRisk.sourceCollapses.map((item) => item.source).join(', ');
    const error = new Error(
      `recommendation collapse guard blocked this refresh: ${collapseRisk.currentCount}/${collapseRisk.baselineCount} recommendations${sources ? `; source collapse: ${sources}` : ''}`
    );
    error.code = 'recommendation_collapse';
    error.collapseRisk = collapseRisk;
    throw error;
  }
  if (persist) {
    await atomicWriteJson(outputPath, payload);
  }
  return payload;
}

const identity = new WeakMap();
let nextIdentity = 0;
const contentKeys = new WeakMap();
function contentKey(value) {
  if (value == null) return '';
  if (!contentKeys.has(value)) contentKeys.set(value, crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'));
  return contentKeys.get(value);
}
function objectIdentity(value) {
  if (!value || typeof value !== 'object') return String(value);
  if (!identity.has(value)) identity.set(value, ++nextIdentity);
  return identity.get(value);
}
export function collectJobs(options = {}) {
  const outputPath = options.outputPath || path.join(root, 'data/jobs.json');
  const key = JSON.stringify([options.includeManual ?? true, options.persist ?? true, outputPath, options.networkOptions || {}, contentKey(options.previousJobs), contentKey(options.previousFeed), objectIdentity(options.sourceAdapters)]);
  return singleFlight(key, () => options.persist === false
    ? collectJobsOnce(options)
    : withFileLock(outputPath, () => collectJobsOnce({ ...options, outputPath })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const payload = await collectJobs();
  console.log(JSON.stringify({ updatedAt: payload.updatedAt, sourceStatus: payload.sourceStatus, jobs: payload.jobs.length }, null, 2));
}

export {
  defaultLocationReference,
  domesticProvinceOptions,
  domesticRegionFor,
  marketScopesFor,
  marketSegmentFor,
  eligibilityFor,
  extractSalary,
  albamonSearchPages,
  albamonListCandidates,
  albaRegionListCandidates,
  albaSearchListCandidates,
  jobKoreaSearchCandidates,
  saraminAreaListCandidates,
  saraminHtmlJobPosting,
  incruitSearchCandidates,
  fetchIncruitSearchText,
  incruitSearchFailureCode,
  collectIncruit,
  localCrossPlatformDuplicateKey,
  structuredLocalBoardCandidate,
  collectStructuredLocalBoard,
  isJeonjuWanjuLocal,
  localContinuityCandidates,
  localDiscoveryCollapseState,
  localPreferredConditions,
  localMandatoryQualification,
  extractLocalWorkSchedule,
  extractLocalWorkPeriod,
  localCompensationNotes,
  parseWork24ListXml,
  work24Candidate,
  collectManual,
  fallbackJobsForConfiguredSources,
  relevantToProfile,
  currentListingState,
  normalizedUrl,
  markPreservedSourceFailure,
  preservePartialIncruitFallback,
  preservePartialLocalSearch,
  collectSaramin,
  preserveFailedSourceJobs,
  normalizeJob,
  dedupe,
  carryForwardLegacyIds,
  carryRecentlyMissing,
  canonicalCompany,
  canonicalTitle,
  oneFormaCandidate,
  oneFormaSupportsKorean,
  enrichPaymentSignal,
  derivePaymentEvidence,
  contentFingerprint,
  reconcileVerificationHistory,
  buildSourceMetrics,
  applySourceMetricsToJobs,
  collectionGapsFor,
  keepInFeed,
  isDefaultRecommendation,
  recommendationCollapseRisk,
  refreshTimeBasedEvidence
};
