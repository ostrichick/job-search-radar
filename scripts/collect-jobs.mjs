import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const profile = JSON.parse(await fs.readFile(path.join(root, 'config/search-profile.json'), 'utf8'));
const sourceQuality = JSON.parse(await fs.readFile(path.join(root, 'config/source-quality.json'), 'utf8'));

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

const sourceRank = { official_ats: 5, official_platform: 4, job_board: 3, aggregator: 2, manual: 1 };
const isOfficialKind = (kind) => ['official_ats', 'official_platform'].includes(kind);

function sourceMeta(source) {
  return sourceQuality[source] ?? {
    kind: 'aggregator',
    listingLabel: '공고 소스',
    paymentStatus: 'unknown',
    paymentLabel: '직접 확인 필요',
    summary: '현재 모집 상태와 지급 조건을 원문에서 확인해야 합니다.',
    evidence: []
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

function xmlTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1].trim()) : '';
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
  const raw = salaryContext(rawValue, description);
  if (!raw) return { raw: '', display: '', currency: '', min: null, max: null, period: '', confidence: 'none' };
  const currencyMatch = raw.match(/\b(USD|EUR|GBP|KRW|CAD|AUD|JPY|CHF|PLN|BRL|INR|SGD|HKD|AED|USDT)\b|([$€£₩¥])/i);
  const currency = currencyMatch
    ? ({ '$': 'USD', '€': 'EUR', '£': 'GBP', '₩': 'KRW', '¥': 'JPY' }[currencyMatch[0]] ?? currencyMatch[0].toUpperCase())
    : '';
  const periodMatch = raw.match(/(?:per\s*)?(hour|hr|hourly|day|daily|week|weekly|month|monthly|year|yearly|annual|annually|annum|project|episode)\b/i);
  const periodMap = { hr: 'hour', hourly: 'hour', daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year', annual: 'year', annually: 'year', annum: 'year' };
  const periodRaw = periodMatch?.[1]?.toLowerCase() ?? '';
  const period = periodMap[periodRaw] ?? periodRaw;
  const currencyToken = '(?:USD|EUR|GBP|KRW|CAD|AUD|JPY|CHF|PLN|BRL|INR|SGD|HKD|AED|USDT|[$€£₩¥])';
  const rangeMatch = raw.match(new RegExp(`${currencyToken}\\s*(\\d[\\d,.]*(?:\\.\\d+)?\\s*[kKmM]?)\\s*[-–—]\\s*(?:${currencyToken}\\s*)?(\\d[\\d,.]*(?:\\.\\d+)?\\s*[kKmM]?)`, 'i'))
    || raw.match(new RegExp(`(\\d[\\d,.]*(?:\\.\\d+)?\\s*[kKmM]?)\\s*[-–—]\\s*(\\d[\\d,.]*(?:\\.\\d+)?\\s*[kKmM]?)\\s*${currencyToken}`, 'i'));
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
  return { raw, display: periodLabel ? `${range}${periodLabel}` : `${range} · 주기 확인 필요`, currency, min, max, period, confidence: periodLabel ? 'parsed' : 'partial' };
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

function canonicalLocation(value) {
  const normalized = lower(value)
    .replace(/\b(remote|work from home|homeoffice)\b/g, '')
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || 'remote';
}

function stableJobId(job) {
  const scope = ['worldwide', 'korea'].includes(job.eligibilityCode)
    ? job.eligibilityCode
    : `${job.eligibilityCode || 'unknown'}:${canonicalLocation(job.location)}`;
  const key = `${canonicalCompany(job.company)}::${canonicalTitle(job.title)}::${scope}`;
  return `job:${crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)}`;
}

function currentListingState(job) {
  const meta = sourceMeta(job.source);
  const combined = lower(`${job.title} ${job._fullDescription || job.description}`);
  const title = lower(job.title);
  const lead = lower(job._fullDescription || job.description).slice(0, 700);
  if (/applications?(?: and assessments?)? (?:are )?closed|no longer accepting applications|position has been filled/.test(combined)) {
    return { code: 'expired', label: '종료 확인됨', stale: true };
  }
  const deadline = combined.match(/(?:application deadline|applications close|apply by)\s*:?[ ]*([a-z]+\s+\d{1,2}(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2})/i);
  if (deadline) {
    let rawDate = deadline[1];
    if (!/\d{4}/.test(rawDate)) rawDate = `${rawDate} ${new Date().getFullYear()}`;
    const closeAt = Date.parse(rawDate);
    if (Number.isFinite(closeAt) && closeAt < Date.now()) return { code: 'expired', label: '종료 확인됨', stale: true };
  }
  const explicitPool = /not an active job opening|not an immediate (?:job|position|opening)|인재 파이프라인|즉시 시작되는 포지션이 아닙니다/.test(lead);
  const poolTitle = /talent pool|talent network|ai trainers network|future opportunities|pipeline of talent/.test(title);
  if (explicitPool || poolTitle) {
    return { code: 'talent_pool', label: '인재풀·즉시 모집 아님', stale: false };
  }
  const ageDays = job.postedAt ? Math.floor((Date.now() - Date.parse(job.postedAt)) / 86400000) : null;
  if (isOfficialKind(meta.kind)) return { code: 'verified_open', label: '모집 확인됨', stale: false };
  if (meta.kind === 'manual') return { code: 'manual', label: '직접 확인 필요', stale: false };
  if (ageDays !== null && ageDays > 45) return { code: 'stale', label: '오래된 공고', stale: true };
  return { code: 'current_feed', label: '현재 피드', stale: false };
}

function markPreservedSourceFailure(job) {
  return {
    ...job,
    listingStatus: 'source_error',
    listingLabel: '소스 확인 실패',
    stale: true,
    score: Math.max(0, Number(job.score || 0) - 20)
  };
}

function relevantToProfile(job) {
  const title = lower(job.title);
  const haystack = lower([job.title, job.description, job.tags?.join(' ')].join(' '));
  if (foreignLanguageRe.test(title) && !/korean|한국어/.test(title)) return false;
  if (/bilingual/.test(title) && /korean|한국어/.test(title) && foreignLanguageRe.test(title.replace(/korean|한국어/g, ''))) return false;
  if (/korean|한국어/.test(haystack)) return true;
  if (['data annotation', 'language quality', 'content moderation', 'ai response evaluation'].some((term) => hasPhrase(haystack, term))) return true;
  const broadOnly = new Set(['linguist', 'localization', 'copy editor', 'content editor', 'proofreader']);
  if (profile.includeKeywords.some((keyword) => !broadOnly.has(keyword.toLowerCase()) && hasPhrase(title, keyword))) return true;
  return ['AI 평가·어노테이션', '한국어·언어', '조사·데이터', '교육 운영', '커뮤니티·운영', '채용 보조', '오디오·음성', '시험 감독', 'GIS·지도'].includes(classify(job));
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
  const rules = [
    ['AI 평가·어노테이션', ['ai trainer', 'ai response', 'ai data specialist', 'generative ai analyst', 'data annotator', 'data annotation', 'response evaluator', 'search evaluator', 'search engine evaluator', 'internet safety evaluator', 'ads quality rater', 'quality rater', 'quality assurance reviewer', 'ai quality assurance', 'legal annotator', 'audio evaluation', 'speech evaluation', 'speech annotator', 'transcription quality reviewer', 'data rater', 'data labeling']],
    ['한국어·언어', ['korean', '한국어', 'linguist', 'proofreader', 'proofreading', 'copy editor', 'content editor', 'localization', 'language quality']],
    ['조사·데이터', ['data entry', 'data researcher', 'web researcher', 'research assistant', 'market research', 'product catalog', 'catalog specialist', 'catalog coordinator', 'administrative assistant']],
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
  const description = lower(job._fullDescription || job.description);
  const explicitLocationRestriction = description.match(/(?:must|should|currently)\s+(?:reside|live|be based|be located)\s+(?:in|within)\s+([^.;\n]{2,80})|(?:candidates?|applicants?)\s+(?:must|should)\s+(?:be\s+)?(?:based|located|resident)\s+(?:in|within)\s+([^.;\n]{2,80})|\blocation\s*:\s*([^.;\n]{2,80})/i);
  const restrictionText = lower(explicitLocationRestriction?.slice(1).find(Boolean) || '');
  if (job.countryCode === 'KR' || /south korea|republic of korea|\bkorea\b|seoul|한국/.test(location) || /south korea|republic of korea|\bkorea\b|seoul|한국/.test(restrictionText)) {
    return { code: 'korea', label: '한국에서 지원 가능' };
  }
  if (restrictionText) return { code: 'restricted', label: '특정 국가 제한' };
  if (/\b(anywhere in|within)\s+[a-z]/.test(location)) return { code: 'restricted', label: '특정 국가 제한' };
  if (/\b(worldwide|remote, worldwide|anywhere in the world|work from anywhere|globally)\b/.test(location)) {
    return { code: 'worldwide', label: 'Worldwide' };
  }
  const restricted = /\b(usa|united states|us only|canada|uk|united kingdom|europe|eu|emea|apac|latam|mena|north america|south america|germany|france|australia|singapore|japan|india|philippines|mexico|brazil|spain|italy|netherlands|poland|romania)\b/;
  if (restricted.test(location)) {
    return { code: 'restricted', label: '특정 국가 제한' };
  }
  if (job.remote) {
    const genericRemote = /^(?:remote(?:\s+job)?|home\s*office|homeoffice|remoto|anywhere|location independent|work from home|wfh|unknown|not specified|n\/?a|위치 미상)$/i;
    if (genericRemote.test(location.trim())) return { code: 'unknown', label: '확인 필요' };
    return { code: 'restricted', label: '특정 국가 제한' };
  }
  return { code: 'restricted', label: '특정 국가 제한' };
}

function scoreJob(job) {
  const haystack = lower([job.title, job.company, job.description, job.location, job.tags?.join(' ')].join(' '));
  const title = lower(job.title);
  const matched = profile.includeKeywords.filter((keyword) => hasPhrase(haystack, keyword));
  const titleMatched = profile.includeKeywords.filter((keyword) => hasPhrase(title, keyword));
  const bodyMatched = matched.filter((keyword) => !titleMatched.includes(keyword));
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
  if (!titleMatched.length && !bodyMatched.length && job.category === '기타') score = Math.min(score, 5);
  return { score: Math.max(0, Math.min(100, score)), matchedKeywords: [...titleMatched, ...bodyMatched].slice(0, 8), excluded };
}

function normalizeJob(raw) {
  const fullDescription = text(raw.description);
  const job = {
    id: raw.id,
    source: raw.source,
    title: text(raw.title),
    company: text(raw.company) || '회사 미상',
    location: text(raw.location) || '위치 미상',
    remote: Boolean(raw.remote),
    type: text(raw.type) || '미상',
    salary: text(raw.salary),
    url: raw.url,
    postedAt: raw.postedAt ? new Date(raw.postedAt).toISOString() : null,
    description: fullDescription.slice(0, 1200),
    _fullDescription: fullDescription,
    tags: Array.isArray(raw.tags) ? raw.tags.map(text).filter(Boolean).slice(0, 12) : [],
    countryCode: raw.countryCode || '',
    verifiedAt: new Date().toISOString()
  };
  job.category = classify(job);
  const eligibility = eligibilityFor(job);
  job.eligibility = eligibility.label;
  job.eligibilityCode = eligibility.code;
  job.salaryInfo = extractSalary(job.salary, fullDescription);
  if (!job.salary && job.salaryInfo.confidence === 'parsed') job.salary = job.salaryInfo.display;
  const quality = sourceMeta(job.source);
  job.sourceKind = quality.kind;
  job.sourceTrustLabel = quality.listingLabel;
  job.paymentStatus = quality.paymentStatus;
  job.paymentLabel = quality.paymentLabel;
  job.sourceSummary = quality.summary;
  job.sourceEvidence = quality.evidence;
  job.sourceReviewAt = quality.reviewedAt || '';
  const listing = currentListingState(job);
  job.listingStatus = listing.code;
  job.listingLabel = listing.label;
  job.stale = listing.stale;
  Object.assign(job, scoreJob(job));
  const titleLower = lower(job.title);
  if (/\b(phd|doctorate|doctoral)\b|박사/.test(titleLower)) {
    job.fitWarning = '박사급 전문요건 확인';
    job.score = Math.min(job.score, 10);
  } else if (/\b(legal|medical|clinical|pharma|life ?sciences?|patent)\b/.test(titleLower)) {
    job.fitWarning = '전문 분야 경력요건 확인';
    job.score = Math.min(job.score, 19);
  } else if (/\b(translator|translation)\b/.test(titleLower)) {
    job.fitWarning = '번역 언어쌍·전문 번역 경험 확인';
    job.score = Math.min(job.score, 19);
  } else if (/\blinguist\b/.test(titleLower) && !/\b(evaluator|rater|annotator|annotation)\b/.test(titleLower)) {
    job.fitWarning = '전문 번역·언어 경력요건 확인';
    job.score = Math.min(job.score, 19);
  } else if (/\bat least\s+1\s+year\b[\s\S]{0,100}\b(?:annotation|data labeling)\b|\b(?:annotation|data labeling)\b[\s\S]{0,100}\bat least\s+1\s+year\b/i.test(fullDescription)) {
    job.fitWarning = '어노테이션·데이터 라벨링 1년 이상 경력 요건 확인';
    job.score = Math.min(job.score, 19);
  } else if (/\bprevious\s+(?:transcription|speech annotation)(?:\s+or\s+(?:transcription|speech annotation))?\s+experience\b|\bprevious\s+transcription\s+or\s+speech annotation\s+experience\b/i.test(fullDescription)) {
    job.fitWarning = '전사·음성 어노테이션 실무 경력 요건 확인';
    job.score = Math.min(job.score, 19);
  } else if (/\b(?:living|lived|resid(?:e|ing)|based)\b[\s\S]{0,100}\b(?:at least|minimum of|for at least)\b[\s\S]{0,30}\b\d+\s*(?:years?|yrs?)\b/i.test(fullDescription)
    || /\b\d+\s*(?:years?|yrs?)\b[\s\S]{0,60}\b(?:living|resid(?:e|ing)|based)\b/i.test(fullDescription)) {
    job.fitWarning = '장기 거주 요건 확인';
    job.score = Math.min(job.score, 19);
  } else {
    job.fitWarning = '';
  }
  if (job.stale) job.score = Math.max(0, job.score - 15);
  if (job.listingStatus === 'talent_pool') job.score = Math.max(0, job.score - 45);
  if (job.listingStatus === 'expired') job.score = 0;
  delete job._fullDescription;
  return job;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'User-Agent': 'DigitalNomadJobDashboard/0.1', Accept: 'application/json', ...(options.headers ?? {}) }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} - ${url}`);
  return response.json();
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'User-Agent': 'DigitalNomadJobDashboard/0.2', Accept: 'text/html,application/rss+xml,application/xml,text/xml,*/*', ...(options.headers ?? {}) }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} - ${url}`);
  return response.text();
}

async function collectLeverBoard(site, source, company) {
  const rows = await fetchJson(`https://api.lever.co/v0/postings/${site}?mode=json`);
  const collected = [];
  for (const j of Array.isArray(rows) ? rows : []) {
    const location = Array.isArray(j.categories?.allLocations) && j.categories.allLocations.length
      ? j.categories.allLocations.join(' / ')
      : j.categories?.location;
    const description = [j.descriptionPlain, j.descriptionBodyPlain, j.additionalPlain]
      .filter(Boolean)
      .join('\n');
    const candidate = {
      id: `lever:${site}:${j.id}`,
      source,
      title: j.text,
      company,
      location,
      remote: j.workplaceType === 'remote',
      type: j.categories?.commitment || j.workplaceType,
      salary: '',
      url: j.hostedUrl,
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      description,
      tags: [j.categories?.department, j.categories?.team, j.workplaceType].filter(Boolean),
      countryCode: j.country || ''
    };
    if (relevantToProfile(candidate)) {
      const normalized = normalizeJob(candidate);
      if (['korea', 'worldwide', 'unknown'].includes(normalized.eligibilityCode)) collected.push(normalized);
    }
  }
  return collected;
}

async function collectWeloGlobal() {
  return collectLeverBoard('weloglobal', 'Welo Global', 'Welo Global');
}

async function collectRws() {
  return collectLeverBoard('rws', 'RWS TrainAI', 'RWS');
}

function oneFormaTerms(post, taxonomy) {
  return (post?._embedded?.['wp:term'] ?? [])
    .flat()
    .filter((term) => term?.taxonomy === taxonomy)
    .map((term) => text(term.name))
    .filter(Boolean);
}

function oneFormaCandidate(post) {
  const countries = oneFormaTerms(post, 'country');
  const languages = oneFormaTerms(post, 'language');
  const types = oneFormaTerms(post, 'job_type');
  const jobTags = oneFormaTerms(post, 'job_tag');
  const domains = oneFormaTerms(post, 'domain');
  const worldwide = jobTags.some((tag) => /worldwide/i.test(tag));
  const koreaEligible = countries.some((country) => /south korea|korea republic/i.test(country));
  const remote = worldwide
    || jobTags.some((tag) => /remote/i.test(tag))
    || countries.some((country) => /^remote$/i.test(country))
    || /\bremote\b|work from home/i.test(text(post?.content?.rendered));
  const location = worldwide
    ? 'Worldwide'
    : koreaEligible
      ? (countries.length > 1 ? `South Korea + ${countries.length - 1}개 국가` : 'South Korea')
      : countries.slice(0, 3).join(' / ') || (remote ? 'Remote' : '위치 미상');
  const postedAt = post?.date_gmt
    ? new Date(`${post.date_gmt}Z`).toISOString()
    : post?.date
      ? new Date(post.date).toISOString()
      : null;
  return {
    id: `oneforma:${post?.id}`,
    source: 'OneForma',
    title: text(post?.title?.rendered),
    company: 'OneForma',
    location,
    remote,
    type: types.join(', ') || 'Project',
    salary: '',
    url: post?.link,
    postedAt,
    description: text(post?.content?.rendered || post?.excerpt?.rendered),
    tags: [
      ...languages.filter((language) => /korean/i.test(language)),
      ...jobTags,
      ...domains,
      ...types,
      ...languages
    ].slice(0, 80),
    countryCode: worldwide ? '' : (koreaEligible ? 'KR' : '')
  };
}

async function collectOneForma() {
  const rows = await fetchJson('https://www.oneforma.com/wp-json/wp/v2/job?per_page=100&_embed=1');
  const collected = [];
  for (const post of Array.isArray(rows) ? rows : []) {
    const candidate = oneFormaCandidate(post);
    if (!candidate.title || !candidate.url) continue;
    if (relevantToProfile(candidate)) collected.push(normalizeJob(candidate));
  }
  return collected;
}

async function collectWeWorkRemotely() {
  const xml = await fetchText('https://weworkremotely.com/remote-jobs.rss');
  const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  const collected = [];
  for (const block of blocks) {
    const combinedTitle = text(xmlTag(block, 'title'));
    const separator = combinedTitle.indexOf(':');
    const company = separator > 0 ? combinedTitle.slice(0, separator).trim() : '회사 미상';
    const title = separator > 0 ? combinedTitle.slice(separator + 1).trim() : combinedTitle;
    const description = xmlTag(block, 'description');
    const candidate = {
      id: `wwr:${crypto.createHash('sha1').update(xmlTag(block, 'link')).digest('hex').slice(0, 16)}`,
      source: 'We Work Remotely',
      title,
      company,
      location: 'Remote',
      remote: true,
      type: 'Remote',
      salary: '',
      url: xmlTag(block, 'link'),
      postedAt: xmlTag(block, 'pubDate'),
      description,
      tags: ['remote']
    };
    if (relevantToProfile(candidate)) collected.push(normalizeJob(candidate));
  }
  return collected;
}

async function collectJobicy() {
  const data = await fetchJson('https://jobicy.com/api/v2/remote-jobs?count=200');
  return (data.jobs ?? []).map((j) => ({
    id: `jobicy:${j.id}`,
    source: 'Jobicy',
    title: j.jobTitle,
    company: j.companyName,
    location: j.jobGeo,
    remote: true,
    type: Array.isArray(j.jobType) ? j.jobType.join(', ') : j.jobType,
    salary: j.salaryMin || j.salaryMax ? `${j.salaryCurrency ?? ''} ${j.salaryMin ?? ''}${j.salaryMax ? `–${j.salaryMax}` : ''} ${j.salaryPeriod ?? ''}` : '',
    url: j.url,
    postedAt: j.pubDate,
    description: j.jobExcerpt || j.jobDescription,
    tags: [...(j.jobIndustry ?? []), j.jobLevel].filter(Boolean)
  })).filter(relevantToProfile).map(normalizeJob);
}

async function collectRemoteOk() {
  const data = await fetchJson('https://remoteok.com/api');
  return (Array.isArray(data) ? data : []).filter((j) => j?.position).map((j) => ({
    id: `remoteok:${j.id}`,
    source: 'Remote OK',
    title: j.position,
    company: j.company,
    location: j.location || 'Remote',
    remote: true,
    type: 'Remote',
    salary: j.salary_min || j.salary_max ? `${j.salary_min ?? ''}${j.salary_max ? `–${j.salary_max}` : ''}` : '',
    url: j.url,
    postedAt: j.date || (j.epoch ? new Date(j.epoch * 1000).toISOString() : null),
    description: j.description,
    tags: j.tags
  })).filter(relevantToProfile).map(normalizeJob);
}

async function collectRemotive() {
  const data = await fetchJson('https://remotive.com/api/remote-jobs?limit=200');
  return (data.jobs ?? []).map((j) => ({
    id: `remotive:${j.id}`,
    source: 'Remotive',
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location || 'Remote',
    remote: true,
    type: j.job_type,
    salary: j.salary,
    url: j.url,
    postedAt: j.publication_date,
    description: j.description,
    tags: [j.category]
  })).filter(relevantToProfile).map(normalizeJob);
}

async function collectArbeitnow() {
  const all = [];
  for (let page = 1; page <= 3; page += 1) {
    const data = await fetchJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
    for (const j of data.data ?? []) {
      const candidate = {
        id: `arbeitnow:${j.slug}`,
        source: 'Arbeitnow',
        title: j.title,
        company: j.company_name,
        location: j.location,
        remote: Boolean(j.remote),
        type: Array.isArray(j.job_types) ? j.job_types.join(', ') : '',
        salary: '',
        url: j.url,
        postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
        description: j.description,
        tags: j.tags
      };
      if (relevantToProfile(candidate)) all.push(normalizeJob(candidate));
    }
    if (!data.links?.next) break;
  }
  return all;
}

async function collectManual() {
  const items = JSON.parse(await fs.readFile(path.join(root, 'data/manual-jobs.json'), 'utf8'));
  return items.map((j, index) => normalizeJob({ ...j, id: j.id || `manual:${index}`, source: j.source || '직접 추가' }));
}

function dedupe(jobs) {
  const groups = new Map();
  for (const job of jobs) {
    const company = canonicalCompany(job.company);
    const title = canonicalTitle(job.title);
    const fallback = lower(job.url).replace(/[?#].*$/, '').replace(/\/$/, '');
    const baseKey = company && company !== '회사 미상' && title ? `${company}::${title}` : fallback;
    const clusters = groups.get(baseKey) ?? [];
    const compatible = clusters.find((cluster) => {
      const current = cluster[0];
      if (current.url === job.url) return true;
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
  return merged;
}

function carryForwardLegacyIds(jobs, previousJobs = []) {
  const previousByRawId = new Map();
  for (const previous of previousJobs || []) {
    for (const rawId of previous.legacyIds || []) {
      if (!rawId) continue;
      const matches = previousByRawId.get(rawId) ?? [];
      matches.push(previous);
      previousByRawId.set(rawId, matches);
    }
  }
  return jobs.map((job) => {
    const aliases = new Set(job.legacyIds || []);
    for (const rawId of job.legacyIds || []) {
      for (const previous of previousByRawId.get(rawId) || []) {
        if (previous.id) aliases.add(previous.id);
        for (const previousLegacyId of previous.legacyIds || []) aliases.add(previousLegacyId);
      }
    }
    aliases.delete(job.id);
    return { ...job, legacyIds: [...aliases] };
  });
}

function carryRecentlyMissing(jobs, previousJobs = [], now = Date.now()) {
  const representedIds = new Set();
  const representedUrls = new Set();
  for (const job of jobs) {
    representedIds.add(job.id);
    for (const id of job.legacyIds || []) representedIds.add(id);
    for (const url of [job.url, ...(job.alternateUrls || [])]) {
      if (url) representedUrls.add(lower(url).replace(/[?#].*$/, '').replace(/\/$/, ''));
    }
  }
  const carried = [...jobs];
  const retentionMs = 14 * 86400000;
  const legacyEligibilityMap = {
    '한국 명시': 'korea',
    '한국에서 지원 가능': 'korea',
    'Worldwide': 'worldwide',
    '지역 제한 가능': 'restricted',
    '특정 국가 제한': 'restricted',
    '확인 필요': 'unknown',
    '현지 근무/확인 필요': 'restricted'
  };
  for (const previous of previousJobs || []) {
    const preserveForGrace = Number(previous.score || 0) > 0
      || isOfficialKind(previous.sourceKind)
      || previous.listingStatus === 'archived_missing';
    if (!preserveForGrace) continue;
    const previousUrl = lower(previous.url).replace(/[?#].*$/, '').replace(/\/$/, '');
    const aliases = [previous.id, ...(previous.legacyIds || [])].filter(Boolean);
    if (aliases.some((id) => representedIds.has(id)) || (previousUrl && representedUrls.has(previousUrl))) continue;
    const missingSince = Date.parse(previous.missingSince || '') || now;
    if (now - missingSince > retentionMs) continue;
    const quality = sourceMeta(previous.source);
    const eligibilityCode = previous.eligibilityCode || legacyEligibilityMap[previous.eligibility] || 'unknown';
    carried.push({
      ...previous,
      eligibilityCode,
      eligibility: previous.eligibility || ({ korea: '한국에서 지원 가능', worldwide: 'Worldwide', restricted: '특정 국가 제한', unknown: '확인 필요' }[eligibilityCode]),
      sourceKind: previous.sourceKind || quality.kind,
      sourceTrustLabel: previous.sourceTrustLabel || quality.listingLabel,
      paymentStatus: previous.paymentStatus || quality.paymentStatus,
      paymentLabel: previous.paymentLabel || quality.paymentLabel,
      sourceSummary: previous.sourceSummary || quality.summary,
      sourceEvidence: previous.sourceEvidence || quality.evidence,
      salaryInfo: previous.salaryInfo || extractSalary(previous.salary || '', previous.description || ''),
      listingStatus: 'archived_missing',
      listingLabel: '현재 피드에서 사라짐',
      stale: true,
      score: 0,
      missingSince: new Date(missingSince).toISOString()
    });
  }
  return carried;
}

export async function collectJobs({ includeManual = true, persist = true, previousJobs = null } = {}) {
  const sources = [
    ['Welo Global', collectWeloGlobal],
    ['RWS TrainAI', collectRws],
    ['OneForma', collectOneForma],
    ['We Work Remotely', collectWeWorkRemotely],
    ['Jobicy', collectJobicy],
    ['Remote OK', collectRemoteOk],
    ['Remotive', collectRemotive],
    ['Arbeitnow', collectArbeitnow]
  ];
  if (includeManual) sources.push(['직접 추가', collectManual]);
  let fallbackJobs = Array.isArray(previousJobs) ? previousJobs : [];
  if (!fallbackJobs.length && persist) {
    try {
      const previous = JSON.parse(await fs.readFile(path.join(root, 'data/jobs.json'), 'utf8'));
      fallbackJobs = Array.isArray(previous.jobs) ? previous.jobs : [];
    } catch {
      fallbackJobs = [];
    }
  }
  const jobs = [];
  const sourceStatus = [];
  for (const [name, collector] of sources) {
    try {
      const collected = await collector();
      jobs.push(...collected);
      sourceStatus.push({ source: name, ok: true, count: collected.length });
    } catch (error) {
      const preserved = fallbackJobs.filter((job) => job.source === name).map(markPreservedSourceFailure);
      jobs.push(...preserved);
      sourceStatus.push({ source: name, ok: false, count: 0, preserved: preserved.length, error: String(error.message ?? error) });
    }
  }
  const uniqueJobs = carryRecentlyMissing(carryForwardLegacyIds(dedupe(jobs), fallbackJobs), fallbackJobs)
    .sort((a, b) => (b.score - a.score) || ((Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0)));
  const payload = { updatedAt: new Date().toISOString(), sourceStatus, jobs: uniqueJobs };
  if (persist) await fs.writeFile(path.join(root, 'data/jobs.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const payload = await collectJobs();
  console.log(JSON.stringify({ updatedAt: payload.updatedAt, sourceStatus: payload.sourceStatus, jobs: payload.jobs.length }, null, 2));
}

export { eligibilityFor, extractSalary, relevantToProfile, currentListingState, markPreservedSourceFailure, normalizeJob, dedupe, carryForwardLegacyIds, carryRecentlyMissing, canonicalCompany, canonicalTitle, oneFormaCandidate };
