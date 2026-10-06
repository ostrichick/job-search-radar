import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

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
const recommendationPolicyVersion = 2;
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
  return lower(value).replace(/[?#].*$/, '').replace(/\/$/, '');
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

function appendLimitedHistory(history = [], event, limit = verificationHistoryLimit) {
  const next = Array.isArray(history) ? [...history] : [];
  if (event) {
    const previous = next.at(-1);
    const sameEvent = previous
      && previous.event === event.event
      && previous.at === event.at
      && previous.fromStatus === event.fromStatus
      && previous.toStatus === event.toStatus;
    if (!sameEvent) next.push(event);
  }
  return next.slice(-limit);
}

function sourceContentSnapshot(job) {
  return {
    title: text(job.title),
    company: text(job.company),
    location: text(job.location),
    workAddress: text(job.workAddress),
    type: text(job.type),
    // Only source-provided salary metadata belongs in the original-source fingerprint.
    // Parsed/display salary is derived from the description and can change when parser policy changes.
    salary: text(job.salaryMetadataRaw || ''),
    experience: text(job.experience),
    education: text(job.education),
    deadlineType: text(job.deadlineType),
    deadlineDate: text(job.deadlineDate),
    description: stableSourceDescription(job.source, job._fullDescription || job.description),
    tags: Array.isArray(job.tags) ? job.tags.map(text).filter(Boolean).sort() : [],
    countryCode: text(job.countryCode),
    sourceListingState: text(job.sourceListingState)
  };
}

function sourceFieldFingerprints(job) {
  return Object.fromEntries(Object.entries(sourceContentSnapshot(job)).map(([key, value]) => [
    key,
    crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
  ]));
}

function contentFingerprint(job) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(sourceContentSnapshot(job)))
    .digest('hex')
    .slice(0, 20);
}

function changedSourceFields(previous, current) {
  if (previous.contentFingerprintVersion === contentFingerprintVersion
    && current.contentFingerprintVersion === contentFingerprintVersion
    && previous.sourceFieldFingerprints
    && current.sourceFieldFingerprints) {
    return Object.keys(current.sourceFieldFingerprints)
      .filter((key) => previous.sourceFieldFingerprints[key] !== current.sourceFieldFingerprints[key]);
  }
  const a = sourceContentSnapshot(previous);
  const b = sourceContentSnapshot(current);
  return Object.keys(b).filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
}

function rebaseLegacyContentHistory(history, job, nowIso, fingerprint) {
  if (job.contentFingerprintVersion !== contentFingerprintVersion) return { history, rebased: false, reclassified: false };
  const previousVersion = Number(job.previousContentFingerprintVersion || 0);
  if (previousVersion >= contentFingerprintVersion) return { history, rebased: false, reclassified: false };
  let reclassified = false;
  const migrated = (Array.isArray(history) ? history : []).map((event) => {
    if (event?.event !== 'content_changed') return event;
    const fields = Array.isArray(event.changedFields) ? event.changedFields : [];
    const salaryOnly = fields.length > 0 && fields.every((field) => field === 'salary');
    const remoteOkVolatile = job.source === 'Remote OK'
      && fields.length > 0
      && fields.every((field) => ['salary', 'description'].includes(field));
    if (!salaryOnly && !remoteOkVolatile) return event;
    reclassified = true;
    return {
      ...event,
      event: 'legacy_content_change_unverified',
      reason: `구형 원문 변경 기록 재분류: ${event.reason || '파생 표시값 또는 변동성 소스 텍스트 영향 가능'}`
    };
  });
  return {
    history: appendLimitedHistory(migrated, {
      at: nowIso,
      event: 'source_fingerprint_rebased',
      fromStatus: `v${previousVersion || 1}`,
      toStatus: `v${contentFingerprintVersion}`,
      fingerprint,
      reason: `원문 변경 판정 기준을 원시·구조화 소스 필드 기반 v${contentFingerprintVersion}로 재설정함. 파생 급여 표시와 Remote OK 변동성 anti-spam footer는 원문 변경에서 제외함.`
    }),
    rebased: true,
    reclassified
  };
}

function previousJobLookup(previousJobs = []) {
  const byId = new Map();
  const byUrl = new Map();
  for (const job of previousJobs || []) {
    for (const id of [job.id, ...(job.legacyIds || [])].filter(Boolean)) {
      if (!byId.has(id)) byId.set(id, job);
    }
    for (const url of [job.url, ...(job.alternateUrls || [])].filter(Boolean)) {
      const key = normalizedUrl(url);
      if (key && !byUrl.has(key)) byUrl.set(key, job);
    }
  }
  return { byId, byUrl };
}

function findPreviousJob(job, lookup) {
  for (const id of [job.id, ...(job.legacyIds || [])].filter(Boolean)) {
    if (lookup.byId.has(id)) return lookup.byId.get(id);
  }
  for (const url of [job.url, ...(job.alternateUrls || [])].filter(Boolean)) {
    const previous = lookup.byUrl.get(normalizedUrl(url));
    if (previous) return previous;
  }
  return null;
}

function reconcileVerificationHistory(jobs, previousJobs = [], now = Date.now()) {
  const lookup = previousJobLookup(previousJobs);
  const nowIso = new Date(now).toISOString();
  return jobs.map((job) => {
    const previous = findPreviousJob(job, lookup);
    const fingerprint = job.contentFingerprint || contentFingerprint(job);
    if (!previous) {
      return {
        ...job,
        contentFingerprint: fingerprint,
        firstSeenAt: job.firstSeenAt || nowIso,
        lastSeenAt: nowIso,
        lastVerifiedAt: nowIso,
        lastChangeKind: 'first_seen',
        lastChangeAt: nowIso,
        lastChangedFields: [],
        verificationHistory: appendLimitedHistory([], {
          at: nowIso,
          event: 'first_seen',
          toStatus: job.listingStatus,
          fingerprint,
          reason: '처음 수집됨'
        })
      };
    }

    job.previousContentFingerprintVersion = Number(previous.contentFingerprintVersion || 0);
    const sameFingerprintContract = Number(previous.contentFingerprintVersion || 0) === Number(job.contentFingerprintVersion || 0);
    const hadPreviousFingerprint = Boolean(previous.contentFingerprint) && sameFingerprintContract;
    const previousFingerprint = previous.contentFingerprint || '';
    const changedFields = hadPreviousFingerprint && previousFingerprint !== fingerprint
      ? changedSourceFields(previous, job)
      : [];
    const events = [];
    if (previous.listingStatus === 'archived_missing' && !['archived_missing', 'source_error'].includes(job.listingStatus)) {
      events.push({
        at: nowIso,
        event: 'reappeared',
        fromStatus: previous.listingStatus,
        toStatus: job.listingStatus,
        fingerprint,
        reason: '이전 수집에서 사라졌던 공고가 원천에 다시 나타남'
      });
    } else if (previous.listingStatus === 'source_error' && job.listingStatus !== 'source_error') {
      events.push({
        at: nowIso,
        event: 'source_recovered',
        fromStatus: previous.listingStatus,
        toStatus: job.listingStatus,
        fingerprint,
        reason: '이전 소스 확인 실패 후 원천 수집이 복구됨'
      });
    } else if (previous.listingStatus !== 'source_error' && job.listingStatus === 'source_error') {
      events.push({
        at: nowIso,
        event: 'source_failed',
        fromStatus: previous.listingStatus,
        toStatus: job.listingStatus,
        fingerprint,
        reason: '이번 수집에서 원천 소스를 확인하지 못해 이전 검증 공고를 보존함'
      });
    }
    if (changedFields.length) {
      events.push({
        at: nowIso,
        event: 'content_changed',
        fromStatus: previous.listingStatus,
        toStatus: job.listingStatus,
        fingerprint,
        previousFingerprint,
        changedFields,
        reason: `원문 주요 필드 변경: ${changedFields.join(', ')}`
      });
    }
    if (previous.paymentEvidenceFreshness
      && previous.paymentEvidenceFreshness !== job.paymentEvidenceFreshness) {
      events.push({
        at: nowIso,
        event: 'evidence_freshness_changed',
        fromStatus: previous.paymentEvidenceFreshness,
        toStatus: job.paymentEvidenceFreshness,
        fingerprint,
        reason: `지급 근거 최신성 변경: ${previous.paymentEvidenceFreshness} → ${job.paymentEvidenceFreshness}`
      });
    }
    if (previous.paymentEvidenceState
      && previous.paymentEvidenceState !== job.paymentEvidenceState) {
      events.push({
        at: nowIso,
        event: 'evidence_state_changed',
        fromStatus: previous.paymentEvidenceState,
        toStatus: job.paymentEvidenceState,
        fingerprint,
        reason: `지급 근거 상태 변경: ${previous.paymentEvidenceState} → ${job.paymentEvidenceState}`
      });
    }
    if (previous.listingStatus !== job.listingStatus
      && !events.some((event) => ['reappeared', 'source_recovered', 'source_failed'].includes(event.event))) {
      events.push({
        at: nowIso,
        event: 'status_changed',
        fromStatus: previous.listingStatus,
        toStatus: job.listingStatus,
        fingerprint,
        reason: `모집 상태 변경: ${previous.listingStatus || 'unknown'} → ${job.listingStatus}`
      });
    }

    let history = Array.isArray(previous.verificationHistory) ? previous.verificationHistory : [];
    const rebase = rebaseLegacyContentHistory(history, job, nowIso, fingerprint);
    history = rebase.history;
    for (const event of events) history = appendLimitedHistory(history, event);
    const lastHistoryAt = Date.parse(history.at(-1)?.at || '');
    if (!events.length
      && !rebase.rebased
      && !['source_error', 'archived_missing'].includes(job.listingStatus)
      && (!Number.isFinite(lastHistoryAt) || now - lastHistoryAt >= verificationCheckpointMs)) {
      history = appendLimitedHistory(history, {
        at: nowIso,
        event: 'verified_unchanged',
        fromStatus: job.listingStatus,
        toStatus: job.listingStatus,
        fingerprint,
        reason: '원문과 모집 상태의 의미 있는 변경 없이 재검증됨'
      });
    }

    const primaryEvent = events.find((event) => ['reappeared', 'source_recovered', 'source_failed', 'content_changed', 'status_changed', 'evidence_freshness_changed', 'evidence_state_changed'].includes(event.event));
    const historyEvent = primaryEvent || (rebase.rebased ? history.at(-1) : null);
    const verifiedCurrent = job.listingStatus !== 'source_error';
    return {
      ...job,
      previousContentFingerprintVersion: undefined,
      contentFingerprint: fingerprint,
      firstSeenAt: previous.firstSeenAt || previous.verifiedAt || previous.listingCheckedAt || nowIso,
      lastSeenAt: verifiedCurrent ? nowIso : (previous.lastSeenAt || previous.lastVerifiedAt || previous.verifiedAt || previous.listingCheckedAt || ''),
      lastVerifiedAt: verifiedCurrent ? nowIso : (previous.lastVerifiedAt || previous.verifiedAt || previous.listingCheckedAt || ''),
      sourceFailureCheckedAt: job.listingStatus === 'source_error' ? nowIso : '',
      missingSince: '',
      missingCheckedAt: '',
      previousListingStatus: previous.listingStatus || '',
      lastContentChangeAt: changedFields.length ? nowIso : (rebase.reclassified ? '' : (previous.lastContentChangeAt || '')),
      lastStateChangeAt: previous.listingStatus !== job.listingStatus ? nowIso : (previous.lastStateChangeAt || ''),
      lastChangeKind: historyEvent?.event || previous.lastChangeKind || 'verified_unchanged',
      lastChangeAt: historyEvent?.at || previous.lastChangeAt || previous.lastVerifiedAt || previous.verifiedAt || nowIso,
      lastChangedFields: changedFields.length ? changedFields : (rebase.reclassified ? [] : (previous.lastChangedFields || [])),
      verificationHistory: history
    };
  });
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
  const fullDescription = stableSourceDescription(raw.source, raw.description);
  const workplaceMode = normalizeWorkplaceMode(raw.workplaceMode, Boolean(raw.remote));
  const job = {
    id: raw.id,
    source: raw.source,
    title: text(raw.title),
    company: text(raw.company) || '회사 미상',
    location: text(raw.location) || '위치 미상',
    remote: workplaceMode === 'remote',
    workplaceMode,
    type: text(raw.type) || '미상',
    salary: text(raw.salary),
    url: raw.url,
    postedAt: raw.postedAt ? new Date(raw.postedAt).toISOString() : null,
    description: fullDescription.slice(0, 1200),
    _fullDescription: fullDescription,
    tags: Array.isArray(raw.tags) ? raw.tags.map(text).filter(Boolean).slice(0, 12) : [],
    countryCode: raw.countryCode || '',
    locationEvidenceLevel: raw.locationEvidenceLevel || '',
    sourceListingState: text(raw.sourceListingState),
    sourceCreatedAt: raw.sourceCreatedAt ? new Date(raw.sourceCreatedAt).toISOString() : null,
    sourceModifiedAt: raw.sourceModifiedAt ? new Date(raw.sourceModifiedAt).toISOString() : null,
    sourcePostingId: text(raw.sourcePostingId || raw.id),
    platform: text(raw.platform || raw.source),
    workAddress: text(raw.workAddress),
    workAddressEvidence: text(raw.workAddressEvidence),
    experience: text(raw.experience),
    education: text(raw.education),
    deadlineType: text(raw.deadlineType),
    deadlineDate: text(raw.deadlineDate),
    deadlineLabel: text(raw.deadlineLabel),
    deadlineCloseOnHire: Boolean(raw.deadlineCloseOnHire),
    verifiedAt: new Date().toISOString()
  };
  job.domesticRegion = domesticRegionFor(job);
  job.marketScopes = marketScopesFor(job);
  job.marketSegment = marketSegmentFor(job);
  job.category = classify(job);
  const eligibility = eligibilityFor(job);
  job.eligibility = eligibility.label;
  job.eligibilityCode = eligibility.code;
  job.eligibilityBasis = eligibility.basis || '';
  job.eligibilityReason = eligibility.reason || '';
  const quality = sourceMeta(job.source);
  const salaryMetadataRaw = text(raw.salary);
  const metadataSalaryInfo = extractSalary(salaryMetadataRaw, fullDescription);
  const descriptionSalaryInfo = extractSalary('', fullDescription);
  const intermediaryMetadata = raw.salaryProvenance === 'board_metadata' && !isOfficialKind(quality.kind);
  let salaryInfo = metadataSalaryInfo;
  let salaryProvenance = salaryMetadataRaw ? (raw.salaryProvenance || 'source_metadata') : 'none';
  let salaryMetadataSuppressed = false;
  let salaryMetadataConflict = false;
  if (intermediaryMetadata) {
    if (descriptionSalaryInfo.display) {
      salaryInfo = descriptionSalaryInfo;
      salaryProvenance = 'posting_text';
      salaryMetadataSuppressed = Boolean(salaryMetadataRaw);
      salaryMetadataConflict = Boolean(salaryMetadataRaw)
        && (metadataSalaryInfo.currency !== descriptionSalaryInfo.currency
          || metadataSalaryInfo.min !== descriptionSalaryInfo.min
          || metadataSalaryInfo.max !== descriptionSalaryInfo.max
          || metadataSalaryInfo.period !== descriptionSalaryInfo.period);
    } else {
      salaryInfo = {
        ...metadataSalaryInfo,
        display: '',
        confidence: salaryMetadataRaw ? 'metadata_unverified' : 'none'
      };
      salaryProvenance = salaryMetadataRaw ? 'board_metadata_unverified' : 'none';
      salaryMetadataSuppressed = Boolean(salaryMetadataRaw);
    }
  } else if (!salaryMetadataRaw && descriptionSalaryInfo.display) {
    salaryInfo = descriptionSalaryInfo;
    salaryProvenance = 'posting_text';
  }
  job.salaryInfo = salaryInfo;
  job.salary = salaryInfo.display || (intermediaryMetadata ? '' : salaryMetadataRaw);
  job.salaryProvenance = salaryProvenance;
  job.salaryMetadataRaw = salaryMetadataRaw;
  job.salaryMetadataSuppressed = salaryMetadataSuppressed;
  job.salaryMetadataConflict = salaryMetadataConflict;
  if (localDomesticBoardSources.has(job.source)) {
    job.workSchedule = text(raw.workSchedule) || extractLocalWorkSchedule(fullDescription, job.title);
    job.workPeriod = text(raw.workPeriod) || extractLocalWorkPeriod(fullDescription);
    job.preferredConditions = Array.isArray(raw.preferredConditions)
      ? raw.preferredConditions.map(text).filter(Boolean).slice(0, 5)
      : localPreferredConditions(fullDescription);
    job.compensationNotes = Array.isArray(raw.compensationNotes)
      ? [...new Set(raw.compensationNotes.map(text).filter(Boolean))].slice(0, 4)
      : localCompensationNotes(fullDescription, job.title);
  } else {
    job.workSchedule = '';
    job.workPeriod = '';
    job.preferredConditions = [];
    job.compensationNotes = [];
  }
  job.sourceKind = quality.kind;
  job.sourceCoverage = quality.coverage || 'unknown';
  job.sourceTrustLabel = quality.listingLabel;
  job.sourceOfficiality = isOfficialKind(quality.kind) ? 'official' : quality.kind === 'manual' ? 'manual' : 'intermediary';
  job.paymentStatus = quality.paymentStatus;
  job.paymentLabel = quality.paymentLabel;
  const paymentEvidence = derivePaymentEvidence(quality);
  job.paymentEvidenceState = paymentEvidence.state;
  job.paymentEvidenceLabel = paymentEvidence.label;
  job.paymentConfidence = paymentEvidence.confidence;
  job.paymentEvidenceFreshness = paymentEvidence.freshness;
  job.paymentEvidenceCheckedAt = paymentEvidence.checkedAt;
  job.paymentEvidenceNextReviewAt = paymentEvidence.nextReviewAt;
  job.paymentSummary = paymentEvidence.summary;
  job.paymentSignals = paymentEvidence.signals;
  job.sourceSummary = quality.summary;
  job.sourceEvidence = quality.evidence;
  job.sourceReviewAt = quality.reviewedAt || '';
  const listing = currentListingState(job);
  job.listingStatus = listing.code;
  job.listingLabel = listing.label;
  job.listingBasis = listing.basis || '';
  job.listingReason = listing.reason || '';
  job.listingVerification = listing.verification || '';
  job.listingCheckedAt = job.verifiedAt;
  job.listingEvidence = [{
    type: quality.kind === 'official_ats'
      ? 'official_ats_listing'
      : quality.kind === 'official_government'
        ? 'official_government_listing'
      : quality.kind === 'official_platform'
        ? 'official_platform_listing'
        : quality.kind === 'manual'
          ? 'manual_listing'
          : 'source_listing',
    label: quality.kind === 'official_ats'
      ? '공식 ATS 공고 원문'
      : quality.kind === 'official_government'
        ? '정부 공식 채용정보 원문'
      : quality.kind === 'official_platform'
        ? '공식 프로젝트 페이지'
        : quality.kind === 'manual'
          ? '직접 추가 원문'
          : '수집된 공고 원문',
    url: job.url,
    checkedAt: job.verifiedAt,
    sourceState: job.sourceListingState || '',
    sourceModifiedAt: job.sourceModifiedAt || ''
  }];
  job.stale = listing.stale;
  Object.assign(job, scoreJob(job));
  const titleLower = lower(job.title);
  const fitWarnings = [];
  const satisfiedRequirements = [];
  const verifiedCapabilities = new Set(profile.verifiedCapabilities || []);
  const userHasAiQualityExperience = ['ai_evaluation', 'data_annotation', 'quality_review', 'rubric_qa']
    .some((capability) => verifiedCapabilities.has(capability));
  const userHasKoreanTeachingExperience = verifiedCapabilities.has('korean_teaching');
  if (/\b(phd|doctorate|doctoral)\b|박사/.test(titleLower)) {
    fitWarnings.push('박사급 전문요건 확인');
    job.score = Math.min(job.score, 10);
  }
  if (/\b(legal|medical|clinical|pharma|life ?sciences?|patent)\b/.test(titleLower)) {
    fitWarnings.push('전문 분야 경력요건 확인');
    job.score = Math.min(job.score, 19);
  }
  const translationQualityContext = /\b(evaluator|rater|reviewer|annotator|annotation|quality)\b/.test(titleLower);
  const translationMandatoryContext = evidenceSnippet(fullDescription, 4000).match(
    /(?:looking for (?:candidates?|professionals?) with|must have|required|requirements?[^.]{0,80}|should have)[^.]{0,140}\b(?:translation background|translation experience|professional translation|translator experience)\b|\b(?:translation background|translation experience)\b[^.]{0,100}\b(?:required|mandatory|must|should)\b/i
  )?.[0] || '';
  const translationOptional = /\b(?:preferred|a plus|plus|advantage|nice to have|optional)\b/i.test(translationMandatoryContext)
    || /\b(?:translation background|translation experience)\b[^.]{0,100}\b(?:preferred|a plus|plus|advantage|nice to have|optional)\b/i.test(fullDescription);
  if (/\btranslator\b/.test(titleLower) && !translationQualityContext) {
    fitWarnings.push('번역 언어쌍·전문 번역 경험 확인');
    job.score = Math.min(job.score, 19);
  } else if (/\btranslation\b/.test(titleLower) && translationMandatoryContext && !translationOptional) {
    fitWarnings.push('번역 언어쌍·전문 번역 경험 확인');
    job.score = Math.min(job.score, 19);
  } else if (/\blinguist\b/.test(titleLower) && !/\b(evaluator|rater|annotator|annotation)\b/.test(titleLower)) {
    fitWarnings.push('전문 번역·언어 경력요건 확인');
    job.score = Math.min(job.score, 19);
  }
  if (/\bat least\s+1\s+year\b[\s\S]{0,100}\b(?:annotation|data labeling)\b|\b(?:annotation|data labeling)\b[\s\S]{0,100}\bat least\s+1\s+year\b/i.test(fullDescription)) {
    fitWarnings.push('어노테이션·데이터 라벨링 1년 이상 경력 요건 확인');
    job.score = Math.min(job.score, 19);
  }
  const transcriptionExperienceContext = fullDescription.match(/[^.]{0,120}\b(?:previous|prior)\b[^.]{0,120}\b(?:transcription|subtitling|speech annotation)\b[^.]{0,180}/i)?.[0] || '';
  const transcriptionExperienceOptional = /\b(?:preferred|advantage|a plus|plus|nice to have|optional)\b/i.test(transcriptionExperienceContext);
  if (transcriptionExperienceContext && !transcriptionExperienceOptional) {
    fitWarnings.push('전사·자막·음성 어노테이션 실무 경력 요건 확인');
    job.score = Math.min(job.score, 19);
  }
  const subjectMatterExperience = fullDescription.match(/\b(?:\d+\+?|at least\s+\d+|minimum(?:\s+of)?\s+\d+)\s+years?\b[^.]{0,80}\b(?:experience|professional background|industry background)\b[^.]{0,120}/i)?.[0] || '';
  if (/\bsubject matter expert\b/i.test(titleLower) && subjectMatterExperience) {
    fitWarnings.push(`분야 전문경력 요건 확인: ${evidenceSnippet(subjectMatterExperience, 90)}`);
    job.score = Math.min(job.score, 19);
  }
  if (/\b(?:living|lived|resid(?:e|ing)|based)\b[\s\S]{0,100}\b(?:at least|minimum of|for at least)\b[\s\S]{0,30}\b\d+\s*(?:years?|yrs?)\b/i.test(fullDescription)
    || /\b\d+\s*(?:years?|yrs?)\b[\s\S]{0,60}\b(?:living|resid(?:e|ing)|based)\b/i.test(fullDescription)
    || /\b(?:have\s+)?lived\b[\s\S]{0,80}\b(?:for\s+)?several\s+years\b/i.test(fullDescription)) {
    fitWarnings.push('장기 거주 요건 확인');
    job.score = Math.min(job.score, 19);
  }
  if (/\benglish\s*:?\s*c1\b|\bc1\s+(?:level\s+)?(?:or|and)\s+(?:above|higher)\b/i.test(fullDescription)) {
    fitWarnings.push('영어 C1 이상 요건 확인');
    job.score = Math.min(job.score, 19);
  }
  if (/\bvalid apple id\b/i.test(fullDescription) && /\bios device\b/i.test(fullDescription)) {
    fitWarnings.push('iOS 기기·Apple ID 요건 확인');
    job.score = Math.min(job.score, 19);
  }
  const hardExperienceContext = fullDescription.match(/.{0,120}\bwith experience in\s+(?:annotation|content review|quality assurance|data operations)(?:[^.]{0,140})/i)?.[0] || '';
  if (hardExperienceContext
    && !userHasAiQualityExperience
    && !/\b(?:preferred|a plus|plus|advantage|nice to have|optional)\b/i.test(hardExperienceContext)) {
    fitWarnings.push('관련 어노테이션·콘텐츠 검토·QA 실무 경험 요건 확인');
    job.score = Math.min(job.score, 19);
  } else if (hardExperienceContext && userHasAiQualityExperience) {
    satisfiedRequirements.push('필수 AI 평가·어노테이션·QA 경험: 검증된 경력과 일치');
  }
  const larpDataExperience = /\bprior,? tangible experience working in human data evaluation or annotation\b/i.test(fullDescription);
  const larpLanguageEducationExperience = /\bdemonstrable work or educational experience in linguistics, education\b/i.test(fullDescription);
  if (/\blanguage alignment\s*&\s*resource partner\b/i.test(titleLower)) {
    if (larpDataExperience && !userHasAiQualityExperience) {
      fitWarnings.push('휴먼 데이터 평가·어노테이션 실무 경험 요건 확인');
      job.score = Math.min(job.score, 19);
    }
    if (larpLanguageEducationExperience && !userHasKoreanTeachingExperience) {
      fitWarnings.push('언어·교육 관련 경력요건 확인');
      job.score = Math.min(job.score, 19);
    }
    if (larpDataExperience && larpLanguageEducationExperience && userHasAiQualityExperience && userHasKoreanTeachingExperience) {
      satisfiedRequirements.push('필수 데이터 평가·언어/교육 경험: 검증된 경력과 일치');
    }
  }
  const kraftonFoundationEvaluation = job.source === 'KRAFTON' && /Foundation Model Evaluation Engineer/i.test(job.title);
  if (kraftonFoundationEvaluation) {
    fitWarnings.push('딥러닝 관련 석·박사 또는 동등 연구경험 요건 확인');
    fitWarnings.push('AI 모델 평가·분석 또는 상위권 ML/NLP 논문 작성 경험 요건 확인');
    job.score = Math.min(job.score, 19);
  }
  if (!kraftonFoundationEvaluation && /\b(?:software|frontend|backend|full[- ]?stack|web|mobile)?\s*(?:engineer|developer)\b/i.test(titleLower)) {
    fitWarnings.push('개발 전문경력 요건 확인');
    job.score = Math.min(job.score, 19);
  }
  if (job.source === 'Channel Corp' && /^data analyst$/i.test(job.title)) {
    fitWarnings.push('데이터 분석 실무 1년 이상·SQL 분석 역량 요건 확인');
    job.score = Math.min(job.score, 19);
  }
  if (/\bcoding specialist\b/i.test(titleLower)) {
    fitWarnings.push('코딩 전문역량 요건 확인');
    job.score = Math.min(job.score, 19);
  }
  if (/\bvoice actor\b/i.test(titleLower)) {
    fitWarnings.push('전문 음성 연기·녹음 경력요건 확인');
    job.score = Math.min(job.score, 19);
  }
  if (/\b(?:mathematics|science|stem) specialist\b/i.test(titleLower)) {
    fitWarnings.push('수학·과학 전문 분야 요건 확인');
    job.score = Math.min(job.score, 19);
  }
  if (/\bandroid device\b/i.test(titleLower) || /\baccess to android devices?\b/i.test(fullDescription)) {
    fitWarnings.push('Android 기기 요건 확인');
    job.score = Math.min(job.score, 19);
  }
  if (/\b3d\s*&\s*lidar data annotation analyst\b/i.test(titleLower)
    && /\bexperience working in a fast-paced, scaled environment\b/i.test(fullDescription)
    && /\bexperience with image annotation genai workflows\b/i.test(fullDescription)) {
    fitWarnings.push('이미지 어노테이션·GenAI 워크플로우 실무 경험 요건 확인');
    job.score = Math.min(job.score, 19);
  }
  if (/\b(?:copywriter|copywriting|content writer|marketing writer)\b/i.test(titleLower)) {
    fitWarnings.push('전문 카피라이팅·콘텐츠 작성 경력요건 확인');
    job.score = Math.min(job.score, 19);
  }
  if (job.source === 'KRAFTON' && /Korean Localization Specialist/i.test(job.title) && /1\s*년\s*이상/.test(job.title)) {
    fitWarnings.push('게임 로컬라이제이션·번역·언어 품질 실무 1년 이상 경력 요건 확인');
    job.score = Math.min(job.score, 19);
  }
  const accessibilityRequirement = /\b(?:accessibility|a11y|wcag)\b[^.]{0,120}\b(?:specialist|expert|engineer|developer|consultant|auditor|tester|testing|experience|required|must)\b|\b(?:specialist|expert|engineer|developer|consultant|auditor|tester|testing|experience|required|must)\b[^.]{0,120}\b(?:accessibility|a11y|wcag)\b/i.test(fullDescription);
  if (/\b(?:accessibility|a11y|wcag)\b/i.test(titleLower) || accessibilityRequirement) {
    fitWarnings.push('접근성 전문경력·WCAG 실무요건 확인');
    job.score = Math.min(job.score, 19);
  }
  const structuredRoutineRequirements = [];
  if (localDomesticBoardSources.has(job.source)) {
    if (job.source === '고용24') structuredRoutineRequirements.push('공고 상세 자격·면허 요건 확인');
    const career = lower(job.experience);
    const education = lower(job.education);
    const title = lower(job.title);
    const mandatoryQualification = text(raw.mandatoryQualification) || localMandatoryQualification(fullDescription);
    const requiredCareer = career
      && !/관계없음|경력무관|신입(?:\s*가능)?|무관/.test(career)
      && /경력|최소\s*\d+|\d+\s*(?:년|개월)/.test(career);
    if (requiredCareer) {
      fitWarnings.push(`경력 요건 확인: ${evidenceSnippet(job.experience, 80)}`);
      job.score = Math.min(job.score, 19);
    }
    const licensedOrTechnicalTitle = /간호사|간호조무사|요양보호사|사회복지사|약사|의사|치위생사|물리치료사|작업치료사|용접|전기기사|산업기사|건축기사|토목기사|개발자|엔지니어|지게차운전원|헤어디자이너|트레이너|(?:학원\s*)?강사|설치기사/.test(title)
      || (/지게차/.test(title) && !/지게차\s*(?:시급|수당|우대|가능|별도)/.test(title));
    const managerialTitle = /팀장|본부장|부장급/.test(title);
    const entryLevelExplicit = /신입|초보\s*가능|초보가능|경력\s*무관/.test(`${career} ${fullDescription}`);
    const specialistTitle = licensedOrTechnicalTitle || (managerialTitle && !entryLevelExplicit);
    if (specialistTitle) {
      fitWarnings.push('전문 자격·기술 경력 요건 확인');
      job.score = Math.min(job.score, 19);
    }
    if (mandatoryQualification) {
      fitWarnings.push(`필수 자격·면허 확인: ${mandatoryQualification}`);
      job.score = Math.min(job.score, 19);
    }
    if (education && !/학력무관|무관/.test(education) && /대졸|석사|박사/.test(education)) {
      structuredRoutineRequirements.push(`학력 요건 확인: ${evidenceSnippet(job.education, 80)}`);
    }
  }
  job.fitWarnings = [...new Set(fitWarnings)];
  job.fitWarning = job.fitWarnings.join(' · ');
  const routineRequirements = [...structuredRoutineRequirements];
  if (job.source === 'KRAFTON' && /Data Program Manager/i.test(job.title)) {
    routineRequirements.push('ML 논문 이해·기초 데이터 분석 역량 확인');
  }
  if (job.source === 'Appier' && /AI Creative QC Reviewer/i.test(job.title)) {
    routineRequirements.push('영어 텍스트 기반 업무 커뮤니케이션 확인');
    routineRequirements.push('주 40시간 일정·검수 물량 준수 가능 여부 확인');
    routineRequirements.push('교육 기간 중 하이브리드 출근 가능 여부 확인');
  }
  if (job.source === 'Channel Corp' && /^Data Analyst$/i.test(job.title)) {
    routineRequirements.push('라이브 SQL 테스트 통과 필요');
  }
  if (job.source === 'TSMG' && /^Team Coordinator$/i.test(job.title)) {
    routineRequirements.push('영어 업무 커뮤니케이션 역량 확인');
    routineRequirements.push('온보딩·일정·현지 운영 대응 가능 여부 확인');
  }
  if (/\benglish proficiency\s*:?\s*(?:fluent|advanced)|\benglish\b[^.]{0,40}\b(?:b2|c1|c2)\b|\b(?:b2|c1|c2)\b[^.]{0,40}\benglish\b/i.test(fullDescription)) {
    routineRequirements.push('영어 요구 수준 확인');
  } else if (/\bstrong (?:level of )?written english\b|\bstrong written english\b/i.test(fullDescription)) {
    routineRequirements.push('영어 문서 이해·작성 능력 확인');
  }
  if (/\bverified korean language proficiency of c1 or c2\b|\bkorean\b[^.]{0,60}\bc1\s*(?:or|\/)\s*c2\b/i.test(fullDescription)) {
    routineRequirements.push('한국어 C1/C2 수준 확인');
  }
  if (/\b(?:microphone|headset)\b/i.test(fullDescription)
    && !job.fitWarnings.some((warning) => /iOS|기기/.test(warning))) {
    routineRequirements.push('마이크·헤드셋 등 작업 장비 확인');
  }
  if (/\b(?:laptop|personal computer|fast computer|computer|desktop|phone)\b/i.test(fullDescription)
    && !job.fitWarnings.some((warning) => /iOS|기기/.test(warning))) {
    routineRequirements.push('PC·노트북·휴대전화 등 작업 장비 확인');
  }
  if (/\bcompany-provisioned machine\b|\bcontrolled environment\b/i.test(fullDescription)) {
    routineRequirements.push('회사 제공 장비·통제 환경 사용 요건 확인');
  }
  if (/\bagree to (?:the )?(?:applicable )?participant and consent agreements?\b/i.test(fullDescription)) {
    routineRequirements.push('참여·데이터 제공 동의서 확인');
  }
  if (/\b(?:antivirus|anti-virus)\b/i.test(fullDescription)) {
    routineRequirements.push('안티바이러스·보안 소프트웨어 요건 확인');
  }
  if (/\bresident in korea\b|\bbased in korea\b|\bresid(?:e|ing) in south korea\b/i.test(fullDescription)) {
    routineRequirements.push('한국 거주 요건 확인');
  }
  if (/\bwork on freelance projects in korea without any legal issues\b|\blegally authorized to work as an independent contractor\b/i.test(fullDescription)) {
    routineRequirements.push('한국 내 프리랜서 활동 가능 여부 확인');
  }
  if (/\b(?:do not use|no)\b[^.]{0,60}\b(?:vpn|ip masking)\b|\bip masking programs?\b/i.test(fullDescription)) {
    routineRequirements.push('VPN·IP 마스킹 사용 금지');
  }
  if (/\b(?:at least|minimum of|up to)\s+\d+\s*(?:billable )?hours? per (?:day|week)\b|\b\d+\s*hours?\s+(?:to\s+\d+\s*hours?\s+)?per week\b/i.test(fullDescription)) {
    routineRequirements.push('주간·일일 시간 투입 요건 확인');
  }
  if (/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\s+(?:to|[-–—])\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\s+(?:pacific|eastern|central|mountain)\s+time\b/i.test(fullDescription)) {
    routineRequirements.push('고정 근무시간·시간대 요건 확인');
  }
  if (/\b(?:language certification tests?|required practice tasks?|certification is mandatory|required certifications?)\b/i.test(fullDescription)) {
    routineRequirements.push('자격 테스트·사전 과제 통과 필요');
  }
  if (/\b(?:required test|quality test|skills? assessment|short assessment)\b/i.test(fullDescription)) {
    routineRequirements.push('선발 테스트·평가 통과 필요');
  }
  if (/\b(?:must sign|mandatory to sign|sign and adhere to)\b[^.]{0,80}\b(?:nda|confidentiality agreement)\b|\bproject nda\b/i.test(fullDescription)) {
    routineRequirements.push('NDA·기밀유지 동의 필요');
  }
  if (/\bonly one\b[^.]{0,60}\b(?:rater|worker|evaluator)\b[^.]{0,60}\bper household\b/i.test(fullDescription)) {
    routineRequirements.push('가구당 참여 인원 제한 확인');
  }
  if (/\bmust be\s+18\+|\b18\+\s+years?\s+old\b|\bat least\s+18\s+years?\s+old\b|\brequires?\b[^.]{0,60}\b18\s+years?\s+or\s+older\b/i.test(fullDescription)) {
    routineRequirements.push('만 18세 이상 요건 확인');
  }
  job.requirementChecks = [
    ...job.fitWarnings.map((label) => ({ kind: 'hard', label })),
    ...[...new Set(routineRequirements)].map((label) => ({ kind: 'routine', label })),
    ...[...new Set(satisfiedRequirements)].map((label) => ({ kind: 'satisfied', label }))
  ];
  job.requirementsStatus = job.fitWarnings.length
    ? 'hard_check'
    : routineRequirements.length
      ? 'routine_check'
      : 'clear';
  job.requirementsLabel = job.requirementsStatus === 'hard_check'
    ? '하드요건 확인 필요'
    : job.requirementsStatus === 'routine_check'
      ? '일반 요건 확인 필요'
      : satisfiedRequirements.length
        ? '검증된 경력과 필수요건 일치'
        : '추가 하드요건 감지 없음';
  job.fitReasons = [
    ...(job.matchedKeywords?.length ? [`일치 키워드: ${job.matchedKeywords.slice(0, 4).join(', ')}`] : []),
    ...(job.category !== '기타' ? [`관심 분야: ${job.category}`] : []),
    ...(['korea', 'worldwide'].includes(job.eligibilityCode) ? [`지원 범위: ${job.eligibility}`] : []),
    ...(job.listingStatus === 'verified_open' ? ['공식 ATS에서 현재 모집 공고 확인'] : []),
    ...(job.listingStatus === 'official_listed' ? ['공식 프로젝트 플랫폼에 현재 게시 확인'] : []),
    ...(job.remote ? ['원격 공고'] : [])
  ].slice(0, 6);
  job.applyValueReasons = [
    ...(job.listingStatus === 'verified_open' ? ['공식 ATS 모집 확인'] : []),
    ...(job.listingStatus === 'official_listed' ? ['공식 프로젝트 게시 확인'] : []),
    ...(job.listingStatus === 'current_feed' ? ['현재 외부 피드에 게시'] : []),
    ...(job.eligibilityCode === 'korea' ? ['한국 지원 명시'] : []),
    ...(job.eligibilityCode === 'worldwide' ? ['Worldwide 지원'] : []),
    ...(job.remote ? ['원격'] : []),
    ...(job.salaryInfo?.display ? [`급여 ${job.salaryInfo.display}`] : []),
    ...(job.score >= 80 ? ['관심 업무와 강한 일치'] : job.score >= 40 ? ['관심 업무와 일치'] : [])
  ].slice(0, 5);
  job.decisionUnknowns = [
    ...(job.listingStatus === 'official_listed' ? ['실제 작업량·선발 가능성'] : []),
    ...(job.listingStatus === 'current_feed' ? ['고용주 공식 모집 상태'] : []),
    ...(job.eligibilityCode === 'unknown' ? ['지원 가능 국가'] : []),
    ...(!job.salaryInfo?.display ? ['급여·단가'] : []),
    ...(job.salaryMetadataConflict ? ['채용보드 급여 메타데이터와 원문 급여 불일치'] : []),
    ...(job.salaryMetadataSuppressed && !job.salaryMetadataConflict ? ['채용보드 급여 메타데이터 원문 미확인'] : []),
    ...(['caution_repeated', 'mixed_caution', 'caution_single'].includes(job.paymentEvidenceState) ? ['지급 평판 주의 신호'] : []),
    ...(job.paymentEvidenceState === 'evidence_expired' ? ['지급 신뢰 근거 만료'] : []),
    ...job.requirementChecks.filter((item) => item.kind !== 'satisfied').map((item) => item.label)
  ].slice(0, 5);
  if (job.stale) job.score = Math.max(0, job.score - 15);
  if (job.listingStatus === 'talent_pool') job.score = Math.max(0, job.score - 45);
  if (job.listingStatus === 'expired') job.score = 0;
  job.contentFingerprintVersion = contentFingerprintVersion;
  job.sourceFieldFingerprints = sourceFieldFingerprints(job);
  job.contentFingerprint = contentFingerprint(job);
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
  const { charset = '', ...fetchOptions } = options;
  const response = await fetch(url, {
    ...fetchOptions,
    headers: { 'User-Agent': 'DigitalNomadJobDashboard/0.2', Accept: 'text/html,application/rss+xml,application/xml,text/xml,*/*', ...(fetchOptions.headers ?? {}) }
  });
  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText} - ${url}`);
    error.status = response.status;
    throw error;
  }
  if (charset) return new TextDecoder(charset).decode(await response.arrayBuffer());
  return response.text();
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
  for (const searchSpec of searchUrls) {
    const spec = typeof searchSpec === 'string' ? { url: searchSpec } : searchSpec;
    const html = await fetchText(spec.url);
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
  if (!candidates.length) throw new Error(source + ' public search returned no posting ids');
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
    discoveredCount: candidates.length,
    detailAttemptCount: results.length,
    detailSuccessCount: results.filter((result) => result?.ok && result.value).length,
    localeEligibleCount: local.length,
    profileMatchedCount: matched.length,
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

async function collectIncruit(previousJobs = []) {
  const searchBase = 'https://job.incruit.com/jobdb_list/searchjob.asp?col=job&kw=';
  const candidates = [];
  const byId = new Map();
  for (const term of ['%EC%A0%84%EC%A3%BC', '%EC%99%84%EC%A3%BC']) {
    const html = await fetchText(searchBase + term, { charset: 'euc-kr', signal: AbortSignal.timeout(15000) });
    for (const candidate of incruitSearchCandidates(html).slice(0, 40)) {
      if (byId.has(candidate.id)) continue;
      byId.set(candidate.id, candidate);
      candidates.push(candidate);
    }
  }
  if (!candidates.length) throw new Error('인크루트 public search returned no verified Jeonju/Wanju posting ids');

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
  if (results.length >= 10 && successful.length < Math.ceil(results.length * 0.5) && rejected >= 5) {
    const error = localDetailError('detail_collapse', `인크루트 detail validation collapsed: ${successful.length}/${results.length} search-qualified postings passed cross-check`);
    error.sourceRun = {
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
  if (!successful.length) {
    const error = localDetailError('detail_collapse', '인크루트 public detail validation failed for all search-qualified postings');
    error.sourceRun = {
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
  const local = successful.filter(isJeonjuWanjuLocal);
  const matched = local.filter((job) => Number(job.score || 0) >= 10);
  return sourceCollection(matched, candidates.length, {
    discoveredCount: candidates.length,
    detailAttemptCount: results.length,
    detailSuccessCount: successful.length,
    detailFailureCount: rejected,
    detailRejectedCount: rejected,
    detailRejectionCounts,
    localeEligibleCount: local.length,
    profileMatchedCount: matched.length
  });
}

async function collectLeverBoard(site, source, company, { query = '', rowFilter = null } = {}) {
  const suffix = query ? `&${query}` : '';
  const rows = await fetchJson(`https://api.lever.co/v0/postings/${site}?mode=json${suffix}`);
  const collected = [];
  let profileMatchedCount = 0;
  for (const j of Array.isArray(rows) ? rows : []) {
    if (rowFilter && !rowFilter(j)) continue;
    const location = Array.isArray(j.categories?.allLocations) && j.categories.allLocations.length
      ? j.categories.allLocations.join(' / ')
      : j.categories?.location;
    const listText = (Array.isArray(j.lists) ? j.lists : [])
      .map((section) => [section?.text, text(section?.content)].filter(Boolean).join(': '))
      .filter(Boolean)
      .join('\n');
    const description = [j.descriptionPlain, j.descriptionBodyPlain, j.additionalPlain, listText]
      .filter(Boolean)
      .join('\n');
    const candidate = {
      id: `lever:${site}:${j.id}`,
      source,
      title: j.text,
      company,
      location,
      remote: j.workplaceType === 'remote',
      workplaceMode: j.workplaceType || '',
      type: j.categories?.commitment || j.workplaceType,
      salary: '',
      url: j.hostedUrl,
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      sourceListingState: 'published',
      sourceCreatedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      description,
      tags: [j.categories?.department, j.categories?.team, j.workplaceType].filter(Boolean),
      countryCode: j.country || '',
      locationEvidenceLevel: 'source_structured'
    };
    if (relevantToProfile(candidate)) {
      profileMatchedCount += 1;
      const normalized = normalizeJob(candidate);
      if (['korea', 'worldwide', 'unknown'].includes(normalized.eligibilityCode)) collected.push(normalized);
    }
  }
  return sourceCollection(collected, Array.isArray(rows) ? rows.length : 0, { profileMatchedCount });
}

async function collectWeloGlobal() {
  return collectLeverBoard('weloglobal', 'Welo Global', 'Welo Global');
}

async function collectRws() {
  return collectLeverBoard('rws', 'RWS TrainAI', 'RWS');
}

async function collectTsmg() {
  return collectLeverBoard('tsmg', 'TSMG', 'Terry Soot Management Group', {
    query: 'location=Remote%20in%20South%20Korea',
    rowFilter: (job) => (/\bkorean\b/i.test(job?.text || '')
      && /\b(?:transcription|quality control)\b/i.test(job?.text || ''))
      || /^Team Coordinator$/i.test(job?.text || '')
  });
}

async function collectElevenLabs() {
  const data = await fetchJson('https://api.ashbyhq.com/posting-api/job-board/elevenlabs');
  const rows = Array.isArray(data?.jobs) ? data.jobs : [];
  const collected = [];
  let localeEligibleCount = 0;
  let profileMatchedCount = 0;
  for (const j of rows) {
    if (j.isListed === false) continue;
    const locations = [j.location, ...(j.secondaryLocations || []).map((item) => item?.location)].filter(Boolean);
    if (!locations.some((location) => /\bkorea\b/i.test(location))) continue;
    localeEligibleCount += 1;
    if (!/\b(?:transcription|subtitling)\b/i.test(j.title || '')) continue;
    const description = j.descriptionPlain || j.descriptionHtml || '';
    const worldwide = /\b(?:executed globally|work globally|worldwide|anywhere in the world)\b/i.test(description);
    const candidate = {
      id: `ashby:elevenlabs:${j.id}`,
      source: 'ElevenLabs',
      title: j.title,
      company: 'ElevenLabs',
      location: worldwide ? 'World Wide - Remote' : 'Korea / Remote',
      remote: Boolean(j.isRemote) || /remote/i.test(j.workplaceType || ''),
      workplaceMode: j.workplaceType || '',
      type: j.employmentType || j.workplaceType || 'Freelance',
      salary: '',
      url: j.jobUrl || j.applyUrl,
      postedAt: j.publishedAt || null,
      sourceListingState: 'published',
      sourceCreatedAt: j.publishedAt || null,
      description,
      tags: ['Korean', 'Transcription', j.department, j.team, j.workplaceType, j.employmentType].filter(Boolean),
      countryCode: worldwide ? '' : 'KR'
    };
    profileMatchedCount += 1;
    collected.push(normalizeJob(candidate));
  }
  return sourceCollection(collected, rows.length, { localeEligibleCount, profileMatchedCount });
}

async function collectLilt() {
  const data = await fetchJson('https://api.ashbyhq.com/posting-api/job-board/lilt-production');
  const rows = Array.isArray(data?.jobs) ? data.jobs : [];
  const collected = [];
  let profileMatchedCount = 0;
  for (const j of rows) {
    if (j.isListed === false) continue;
    if (!/\b(?:korean|korea)\b/i.test(`${j.title || ''} ${j.location || ''}`)) continue;
    const candidate = {
      id: `ashby:lilt-production:${j.id}`,
      source: 'LILT Production',
      title: j.title,
      company: 'LILT',
      location: j.location || 'Remote',
      remote: Boolean(j.isRemote) || /remote/i.test(j.workplaceType || j.location || ''),
      workplaceMode: j.workplaceType || '',
      type: j.employmentType || j.workplaceType || 'Contract',
      salary: '',
      url: j.jobUrl || j.applyUrl,
      postedAt: j.publishedAt || null,
      sourceListingState: 'published',
      sourceCreatedAt: j.publishedAt || null,
      description: j.descriptionPlain || j.descriptionHtml || '',
      tags: [j.department, j.team, j.workplaceType, j.employmentType].filter(Boolean),
      countryCode: /\bkorea\b/i.test(j.location || '') ? 'KR' : ''
    };
    if (!candidate.title || !candidate.url || !relevantToProfile(candidate)) continue;
    profileMatchedCount += 1;
    const normalized = normalizeJob(candidate);
    if (['korea', 'worldwide', 'unknown'].includes(normalized.eligibilityCode)) collected.push(normalized);
  }
  return sourceCollection(collected, rows.length, { profileMatchedCount });
}

async function collectKrafton() {
  const data = await fetchJson('https://boards-api.greenhouse.io/v1/boards/krafton/jobs?content=true');
  const rows = Array.isArray(data?.jobs) ? data.jobs : [];
  const collected = [];
  let profileMatchedCount = 0;
  const relevantTitle = /\b(?:data program manager|foundation model evaluation engineer|korean localization specialist)\b/i;
  for (const j of rows) {
    if (!relevantTitle.test(j.title || '')) continue;
    const description = text(decodeHtmlEntities(j.content || ''));
    const metadata = Object.fromEntries((j.metadata || []).filter((item) => item?.name).map((item) => [item.name, item.value]));
    const candidate = {
      id: `greenhouse:krafton:${j.id}`,
      source: 'KRAFTON',
      title: j.title,
      company: 'KRAFTON',
      location: j.location?.name || 'Seoul, South Korea',
      remote: false,
      workplaceMode: 'onsite',
      type: metadata['Employment Type'] || '미상',
      salary: '',
      url: j.absolute_url,
      postedAt: j.first_published || null,
      sourceListingState: 'published',
      sourceCreatedAt: j.first_published || null,
      sourceModifiedAt: j.updated_at || null,
      description,
      tags: [metadata['Job Category - Data'], metadata['Job Category - Business & Service'], metadata.Sector, metadata['Employment Type']].filter(Boolean),
      countryCode: 'KR',
      locationEvidenceLevel: 'source_structured'
    };
    profileMatchedCount += 1;
    collected.push(normalizeJob(candidate));
  }
  return sourceCollection(collected, rows.length, { profileMatchedCount });
}

async function collectAppier() {
  const data = await fetchJson('https://boards-api.greenhouse.io/v1/boards/appier/jobs?content=true');
  const rows = Array.isArray(data?.jobs) ? data.jobs : [];
  const collected = [];
  let profileMatchedCount = 0;
  for (const j of rows) {
    if (!/\bAI Creative QC Reviewer,? Korea\b/i.test(j.title || '')) continue;
    const description = text(decodeHtmlEntities(j.content || ''));
    const candidate = {
      id: `greenhouse:appier:${j.id}`,
      source: 'Appier',
      title: j.title,
      company: 'Appier',
      location: j.location?.name || 'Seoul, South Korea',
      remote: true,
      workplaceMode: 'remote',
      type: /\bpart\s*time\b/i.test(j.title || '') ? 'Part Time' : 'Contract',
      salary: '',
      url: j.absolute_url,
      postedAt: j.first_published || null,
      sourceListingState: 'published',
      sourceCreatedAt: j.first_published || null,
      sourceModifiedAt: j.updated_at || null,
      description,
      tags: ['Korean', 'AI Creative QC', 'Quality Review', ...(j.departments || []).map((item) => item?.name)].filter(Boolean),
      countryCode: 'KR',
      locationEvidenceLevel: 'source_structured'
    };
    profileMatchedCount += 1;
    collected.push(normalizeJob(candidate));
  }
  return sourceCollection(collected, rows.length, { profileMatchedCount });
}

async function collectChannelCorp() {
  return collectLeverBoard('zoyi', 'Channel Corp', 'Channel Corp', {
    rowFilter: (job) => /^Data Analyst$/i.test(job?.text || '')
  });
}

function work24Candidate(row) {
  const address = text([row.basicAddr, row.detailAddr].filter(Boolean).join(' ')) || text(row.region);
  const deadline = work24Deadline(row.closeDt);
  const education = row.minEdubg && row.maxEdubg && row.minEdubg !== row.maxEdubg
    ? `${row.minEdubg} ~ ${row.maxEdubg}`
    : text(row.minEdubg || row.maxEdubg);
  const salary = text([row.salTpNm, row.sal].filter(Boolean).join(' '));
  const description = [
    row.career ? `경력: ${row.career}` : '',
    education ? `학력: ${education}` : '',
    row.holidayTpNm ? `근무일: ${row.holidayTpNm}` : ''
  ].filter(Boolean).join(' · ');
  const wantedAuthNo = text(row.wantedAuthNo);
  const url = `https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=${encodeURIComponent(wantedAuthNo)}&infoTypeCd=VALIDATION&infoTypeGroup=tb_workinfoworknet`;
  return normalizeJob({
    id: `work24:${wantedAuthNo}`,
    sourcePostingId: wantedAuthNo,
    platform: '고용24',
    source: '고용24',
    company: row.company,
    title: row.title,
    location: address,
    workAddress: address,
    remote: false,
    workplaceMode: 'onsite',
    type: work24EmploymentType(row.empTpCd),
    salary,
    salaryProvenance: 'source_metadata',
    url,
    postedAt: work24IsoDate(row.regDt),
    sourceListingState: `listed:${row.closeDt || 'open'}`,
    sourceModifiedAt: work24IsoDate(row.smodifyDtm),
    description,
    tags: [row.holidayTpNm, row.jobsCd, row.infoSvc].filter(Boolean),
    countryCode: 'KR',
    locationEvidenceLevel: 'source_structured',
    experience: row.career,
    education,
    deadlineType: deadline.type,
    deadlineDate: deadline.date,
    deadlineLabel: deadline.label
  });
}

function fallbackJobsForConfiguredSources(jobs, { work24Configured = false } = {}) {
  if (work24Configured) return jobs;
  return (jobs || []).filter((job) => job.source !== '고용24' && !(job.sources || []).includes('고용24'));
}

async function collectWork24(authKey) {
  if (!text(authKey)) throw new Error('WORK24_AUTH_KEY is required');
  const rowsById = new Map();
  const region = '52110|52111|52113|52710';
  for (let page = 1; page <= 10; page += 1) {
    const params = new URLSearchParams({
      authKey: text(authKey),
      callTp: 'L',
      returnType: 'XML',
      startPage: String(page),
      display: '100',
      region
    });
    const xml = await fetchText(`https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do?${params}`, {
      headers: { Accept: 'application/xml,text/xml,*/*' }
    });
    if (/인증키|authkey/i.test(xml) && /오류|error|유효|승인|인증/i.test(xml) && !/<wanted>/i.test(xml)) {
      throw new Error('고용24 API 인증 또는 승인 상태를 확인해야 합니다.');
    }
    const pageRows = parseWork24ListXml(xml);
    for (const row of pageRows) rowsById.set(row.wantedAuthNo, row);
    if (pageRows.length < 100) break;
  }
  const collected = [];
  for (const row of rowsById.values()) {
    const candidate = work24Candidate(row);
    const regionInfo = candidate.domesticRegion;
    if (!regionInfo || regionInfo.province !== '전북특별자치도') continue;
    if (!['전주시', '완주군'].includes(regionInfo.city)) continue;
    collected.push(candidate);
  }
  return sourceCollection(collected, rowsById.size, {
    localeEligibleCount: collected.length,
    profileMatchedCount: collected.filter((job) => job.category !== '기타' || job.score >= 20).length
  });
}

async function collectMeridial() {
  const data = await fetchJson('https://boards-api.greenhouse.io/v1/boards/agency/jobs?content=true');
  const rows = Array.isArray(data?.jobs) ? data.jobs : [];
  const collected = [];
  let localeEligibleCount = 0;
  let profileMatchedCount = 0;
  for (const j of rows) {
    if (!/\bkorean\b/i.test(j.title || '')) continue;
    localeEligibleCount += 1;
    const description = text(decodeHtmlEntities(j.content || ''));
    const location = j.location?.name || 'Remote';
    const candidate = {
      id: `greenhouse:agency:${j.id}`,
      source: 'Meridial',
      title: j.title,
      company: j.company_name || 'Meridial',
      location,
      remote: /\bremote\b/i.test(location) || /workplace type\s*:?\s*remote/i.test(description),
      workplaceMode: /\bhybrid\b/i.test(description) ? 'hybrid' : (/\bremote\b/i.test(location) || /workplace type\s*:?\s*remote/i.test(description) ? 'remote' : 'unknown'),
      type: /\b(?:freelance|independent contractor)\b/i.test(description) ? 'Freelance / Contract' : 'Contract',
      salary: '',
      url: j.absolute_url,
      postedAt: j.first_published || null,
      sourceListingState: 'published',
      sourceCreatedAt: j.first_published || null,
      sourceModifiedAt: j.updated_at || null,
      description,
      tags: ['Greenhouse', /freelance ai trainer project/i.test(j.title || '') ? 'Freelance AI Trainer' : 'AI'],
      countryCode: /\bsouth korea\b/i.test(location) ? 'KR' : ''
    };
    if (!candidate.title || !candidate.url || !relevantToProfile(candidate)) continue;
    profileMatchedCount += 1;
    const normalized = normalizeJob(candidate);
    if (['korea', 'worldwide', 'unknown'].includes(normalized.eligibilityCode)) collected.push(normalized);
  }
  return sourceCollection(collected, rows.length, { localeEligibleCount, profileMatchedCount });
}

function oneFormaTerms(post, taxonomy) {
  return (post?._embedded?.['wp:term'] ?? [])
    .flat()
    .filter((term) => term?.taxonomy === taxonomy)
    .map((term) => text(term.name))
    .filter(Boolean);
}

function oneFormaSupportsKorean(post) {
  const languages = oneFormaTerms(post, 'language');
  if (!languages.length || languages.some((language) => /korean|한국어/i.test(language))) return true;
  const countries = oneFormaTerms(post, 'country');
  const content = lower(post?.content?.rendered || post?.excerpt?.rendered);
  const koreaLocation = countries.some((country) => /south korea|korea republic/i.test(country));
  const localLanguageRequirement = /native or (?:a )?fluent speaker of the language of the location|fluent speaker of the language of the location|language of the location where you are located/.test(content);
  return koreaLocation && localLanguageRequirement;
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
    sourceListingState: post?.status || '',
    sourceCreatedAt: postedAt,
    sourceModifiedAt: post?.modified_gmt
      ? new Date(`${post.modified_gmt}Z`).toISOString()
      : post?.modified
        ? new Date(post.modified).toISOString()
        : null,
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
  let localeEligibleCount = 0;
  let profileMatchedCount = 0;
  for (const post of Array.isArray(rows) ? rows : []) {
    if (!oneFormaSupportsKorean(post)) continue;
    localeEligibleCount += 1;
    const candidate = oneFormaCandidate(post);
    if (!candidate.title || !candidate.url) continue;
    if (relevantToProfile(candidate)) {
      profileMatchedCount += 1;
      collected.push(normalizeJob(candidate));
    }
  }
  return sourceCollection(collected, Array.isArray(rows) ? rows.length : 0, { localeEligibleCount, profileMatchedCount });
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
  return sourceCollection(collected, blocks.length);
}

async function collectJobicy() {
  const data = await fetchJson('https://jobicy.com/api/v2/remote-jobs?count=200');
  const rows = data.jobs ?? [];
  const collected = rows.map((j) => ({
    id: `jobicy:${j.id}`,
    source: 'Jobicy',
    title: j.jobTitle,
    company: j.companyName,
    location: j.jobGeo,
    remote: true,
    type: Array.isArray(j.jobType) ? j.jobType.join(', ') : j.jobType,
    salary: j.salaryMin || j.salaryMax ? `${j.salaryCurrency ?? ''} ${j.salaryMin ?? ''}${j.salaryMax ? `–${j.salaryMax}` : ''} ${j.salaryPeriod ?? ''}` : '',
    salaryProvenance: 'board_metadata',
    url: j.url,
    postedAt: j.pubDate,
    description: j.jobDescription || j.jobExcerpt,
    tags: [...(j.jobIndustry ?? []), j.jobLevel].filter(Boolean)
  })).filter(relevantToProfile).map(normalizeJob);
  return sourceCollection(collected, rows.length);
}

async function collectRemoteOk() {
  const data = await fetchJson('https://remoteok.com/api');
  const rows = (Array.isArray(data) ? data : []).filter((j) => j?.position);
  const collected = rows.map((j) => ({
    id: `remoteok:${j.id}`,
    source: 'Remote OK',
    title: j.position,
    company: j.company,
    location: j.location || 'Remote',
    remote: true,
    type: 'Remote',
    salary: j.salary_min || j.salary_max ? `${j.salary_min ?? ''}${j.salary_max ? `–${j.salary_max}` : ''}` : '',
    salaryProvenance: 'board_metadata',
    url: j.url,
    postedAt: j.date || (j.epoch ? new Date(j.epoch * 1000).toISOString() : null),
    description: j.description,
    tags: j.tags
  })).filter(relevantToProfile).map(normalizeJob);
  return sourceCollection(collected, rows.length);
}

async function collectRemotive() {
  const data = await fetchJson('https://remotive.com/api/remote-jobs?limit=200');
  const rows = data.jobs ?? [];
  const collected = rows.map((j) => ({
    id: `remotive:${j.id}`,
    source: 'Remotive',
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location || 'Remote',
    remote: true,
    type: j.job_type,
    salary: j.salary,
    salaryProvenance: 'board_metadata',
    url: j.url,
    postedAt: j.publication_date,
    description: j.description,
    tags: [j.category]
  })).filter(relevantToProfile).map(normalizeJob);
  return sourceCollection(collected, rows.length);
}

async function collectArbeitnow() {
  const all = [];
  let rawCount = 0;
  for (let page = 1; page <= 3; page += 1) {
    const data = await fetchJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
    for (const j of data.data ?? []) {
      rawCount += 1;
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
  return sourceCollection(all, rawCount);
}

async function collectManual() {
  const items = JSON.parse(await fs.readFile(path.join(root, 'data/manual-jobs.json'), 'utf8'));
  const collected = items.map((j, index) => normalizeJob({ ...j, id: j.id || `manual:${index}`, source: j.source || '직접 추가' }));
  return sourceCollection(collected, items.length);
}

function dedupe(jobs) {
  const groups = new Map();
  for (const job of jobs) {
    const company = canonicalCompany(job.company);
    const title = canonicalDedupeTitle(job);
    const fallback = lower(job.url).replace(/[?#].*$/, '').replace(/\/$/, '');
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
    const sourceSpecificRelevant = previous.source !== 'OneForma'
      || previous.countryCode === 'KR'
      || (previous.tags || []).some((tag) => /korean|한국어/i.test(String(tag)));
    const preserveForGrace = sourceSpecificRelevant
      && relevantToProfile(previous)
      && (
        Number(previous.score || 0) > 0
        || isOfficialKind(previous.sourceKind)
        || previous.listingStatus === 'archived_missing'
      );
    if (!preserveForGrace) continue;
    const previousUrl = lower(previous.url).replace(/[?#].*$/, '').replace(/\/$/, '');
    const aliases = [previous.id, ...(previous.legacyIds || [])].filter(Boolean);
    if (aliases.some((id) => representedIds.has(id)) || (previousUrl && representedUrls.has(previousUrl))) continue;
    const missingSince = Date.parse(previous.missingSince || '') || now;
    if (now - missingSince > retentionMs) continue;
    const nowIso = new Date(now).toISOString();
    const wasMissing = previous.listingStatus === 'archived_missing';
    let verificationHistory = Array.isArray(previous.verificationHistory) ? previous.verificationHistory : [];
    if (!wasMissing) {
      verificationHistory = appendLimitedHistory(verificationHistory, {
        at: nowIso,
        event: 'disappeared',
        fromStatus: previous.listingStatus,
        toStatus: 'archived_missing',
        fingerprint: previous.contentFingerprint || contentFingerprint(previous),
        reason: (previous.sourceCoverage || sourceMeta(previous.source).coverage) === 'bounded_window'
          ? '제한된 수집 창에서 더 이상 보이지 않음. 종료로 확인된 것은 아님'
          : '정상 수집된 원천 목록에서 더 이상 보이지 않음. 종료로 확인된 것은 아님'
      });
    }
    const quality = sourceMeta(previous.source);
    const paymentEvidence = previous.paymentEvidenceFreshness
      ? null
      : derivePaymentEvidence(quality, now);
    const eligibilityCode = previous.eligibilityCode || legacyEligibilityMap[previous.eligibility] || 'unknown';
    const derivedEligibility = eligibilityFor(previous);
    const eligibilityBasis = previous.eligibilityBasis
      || (derivedEligibility.code === eligibilityCode ? derivedEligibility.basis : 'legacy_classification');
    const eligibilityReason = previous.eligibilityReason
      || (derivedEligibility.code === eligibilityCode
        ? derivedEligibility.reason
        : `이전 피드의 지원 범위 분류를 보존: ${previous.eligibility || eligibilityCode}`);
    const legacyRequirementChecks = Array.isArray(previous.requirementChecks)
      ? previous.requirementChecks
      : (previous.fitWarnings || (previous.fitWarning ? [previous.fitWarning] : []))
        .filter(Boolean)
        .map((label) => ({ kind: 'hard', label }));
    const requirementsStatus = ['clear', 'routine_check', 'hard_check'].includes(previous.requirementsStatus)
      ? previous.requirementsStatus
      : legacyRequirementChecks.some((item) => item.kind === 'hard')
        ? 'hard_check'
        : legacyRequirementChecks.some((item) => item.kind === 'routine')
          ? 'routine_check'
          : 'clear';
    const requirementsLabel = previous.requirementsLabel || (requirementsStatus === 'hard_check'
      ? '하드요건 확인 필요'
      : requirementsStatus === 'routine_check'
        ? '일반 요건 확인 필요'
        : '추가 하드요건 감지 없음');
    const preservedContentFingerprint = previous.contentFingerprint || contentFingerprint(previous);
    const carriedWorkplaceMode = normalizeWorkplaceMode(previous.workplaceMode, Boolean(previous.remote));
    const carriedRemote = carriedWorkplaceMode === 'remote';
    const recalculatedDomesticRegion = domesticRegionFor({ ...previous, remote: carriedRemote, workplaceMode: carriedWorkplaceMode });
    const carriedDomesticRegion = carriedWorkplaceMode === 'remote'
      ? null
      : recalculatedDomesticRegion
        ? { ...(previous.domesticRegion || {}), ...recalculatedDomesticRegion }
        : previous.domesticRegion || null;
    const carriedMarketScopes = marketScopesFor({ ...previous, remote: carriedRemote, workplaceMode: carriedWorkplaceMode, domesticRegion: carriedDomesticRegion });
    const carriedWorkAddressEvidence = legacyLocalWorkAddressEvidence(previous);
    carried.push({
      ...previous,
      ...(carriedWorkAddressEvidence ? { workAddressEvidence: carriedWorkAddressEvidence } : {}),
      remote: carriedRemote,
      domesticRegion: carriedDomesticRegion,
      marketScopes: carriedMarketScopes,
      marketSegment: carriedMarketScopes[0] || 'overseas_remote',
      workplaceMode: carriedWorkplaceMode,
      eligibilityCode,
      eligibility: previous.eligibility || ({ korea: '한국에서 지원 가능', worldwide: 'Worldwide', restricted: '특정 국가 제한', unknown: '확인 필요' }[eligibilityCode]),
      eligibilityBasis,
      eligibilityReason,
      requirementChecks: legacyRequirementChecks,
      requirementsStatus,
      requirementsLabel,
      contentFingerprint: preservedContentFingerprint,
      sourceKind: previous.sourceKind || quality.kind,
      sourceCoverage: previous.sourceCoverage || quality.coverage || 'unknown',
      sourceTrustLabel: previous.sourceTrustLabel || quality.listingLabel,
      sourceOfficiality: previous.sourceOfficiality || (isOfficialKind(quality.kind) ? 'official' : quality.kind === 'manual' ? 'manual' : 'intermediary'),
      paymentStatus: previous.paymentStatus || quality.paymentStatus,
      paymentLabel: previous.paymentLabel || quality.paymentLabel,
      paymentEvidenceState: previous.paymentEvidenceState || paymentEvidence?.state || 'insufficient',
      paymentEvidenceLabel: previous.paymentEvidenceLabel || paymentEvidence?.label || '근거 부족',
      paymentConfidence: previous.paymentConfidence || paymentEvidence?.confidence || 'low',
      paymentEvidenceFreshness: previous.paymentEvidenceFreshness || paymentEvidence?.freshness || 'insufficient',
      paymentEvidenceCheckedAt: previous.paymentEvidenceCheckedAt || paymentEvidence?.checkedAt || '',
      paymentEvidenceNextReviewAt: previous.paymentEvidenceNextReviewAt || paymentEvidence?.nextReviewAt || '',
      paymentSummary: previous.paymentSummary || paymentEvidence?.summary || quality.paymentSummary || '',
      paymentSignals: previous.paymentSignals || paymentEvidence?.signals || [],
      sourceSummary: previous.sourceSummary || quality.summary,
      sourceEvidence: previous.sourceEvidence || quality.evidence,
      sourceReviewAt: previous.sourceReviewAt || quality.reviewedAt || '',
      salaryInfo: previous.salaryInfo || extractSalary(previous.salary || '', previous.description || ''),
      listingStatus: 'archived_missing',
      listingLabel: '현재 피드에서 사라짐',
      listingBasis: 'missing_from_feed',
      listingReason: (previous.sourceCoverage || quality.coverage) === 'bounded_window'
        ? `현재 제한된 수집 창에서 보이지 않아 ${new Date(missingSince).toISOString()}부터 14일간 보존 중. 종료로 확인된 것은 아님`
        : `현재 수집 피드에서 사라져 ${new Date(missingSince).toISOString()}부터 14일간 상태 보존 중. 종료로 확인된 것은 아님`,
      listingVerification: 'historical_missing',
      listingCheckedAt: previous.listingCheckedAt || previous.verifiedAt || '',
      listingEvidence: previous.listingEvidence || [{ type: 'historical_listing', label: '마지막 확인 공고 원문', url: previous.url, checkedAt: previous.verifiedAt || '' }],
      firstSeenAt: previous.firstSeenAt || previous.verifiedAt || previous.listingCheckedAt || nowIso,
      lastSeenAt: previous.lastSeenAt || previous.verifiedAt || previous.listingCheckedAt || '',
      lastVerifiedAt: previous.lastVerifiedAt || previous.verifiedAt || previous.listingCheckedAt || '',
      previousListingStatus: previous.listingStatus || '',
      lastChangeKind: wasMissing ? (previous.lastChangeKind || 'disappeared') : 'disappeared',
      lastChangeAt: wasMissing ? (previous.lastChangeAt || previous.missingSince || nowIso) : nowIso,
      lastChangedFields: previous.lastChangedFields || [],
      verificationHistory,
      stale: true,
      score: 0,
      missingSince: new Date(missingSince).toISOString(),
      missingCheckedAt: nowIso
    });
  }
  return carried;
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
  return job.recommendationEligible !== false
    && Number(job.score || 0) >= 20
    && ['korea', 'worldwide'].includes(job.eligibilityCode)
    && job.requirementsStatus !== 'hard_check'
    && !['stale', 'source_error', 'archived_missing', 'talent_pool', 'expired'].includes(job.listingStatus);
}

function recommendationCollapseRisk(feed, baseline) {
  if (!baseline
    || baseline.recommendationPolicyVersion !== feed.recommendationPolicyVersion
    || !Array.isArray(baseline.jobs)) {
    return { guarded: false, collapse: false, baselineCount: 0, currentCount: 0, threshold: 0, unexplainedLosses: [], sourceCollapses: [] };
  }
  const baselineRecommended = baseline.jobs.filter(isDefaultRecommendation);
  const currentRecommended = (feed.jobs || []).filter(isDefaultRecommendation);
  const currentById = new Map();
  const currentByUrl = new Map();
  for (const job of feed.jobs || []) {
    for (const id of [job.id, ...(job.legacyIds || [])].filter(Boolean)) currentById.set(id, job);
    for (const url of [job.url, ...(job.alternateUrls || [])].filter(Boolean)) currentByUrl.set(normalizedUrl(url), job);
  }
  const findCurrent = (previous) => currentById.get(previous.id)
    || (previous.legacyIds || []).map((id) => currentById.get(id)).find(Boolean)
    || currentByUrl.get(normalizedUrl(previous.url))
    || (previous.alternateUrls || []).map((url) => currentByUrl.get(normalizedUrl(url))).find(Boolean)
    || null;
  const losses = baselineRecommended
    .map((previous) => ({ previous, current: findCurrent(previous) }))
    .filter(({ current }) => !isDefaultRecommendation(current || {}));
  const explained = ({ current }) => Boolean(current) && (
    ['source_error', 'talent_pool', 'expired', 'stale'].includes(current.listingStatus)
    || (current.listingStatus === 'archived_missing' && current.sourceCoverage === 'bounded_window')
    || ['degraded', 'unstable'].includes(current.sourceReliabilityState)
    || current.sourceQualityTier === 'weak'
    || (current.lastChangeKind === 'content_changed'
      && (current.requirementsStatus === 'hard_check'
        || current.eligibilityCode === 'restricted'
        || Number(current.score || 0) < 20))
  );
  const unexplainedLosses = losses.filter((item) => !explained(item));
  const threshold = baselineRecommended.length >= 5
    ? Math.max(3, Math.ceil(baselineRecommended.length * 0.5))
    : 1;
  const sourceCollapses = [];
  const baselineBySource = new Map();
  for (const job of baselineRecommended) {
    const source = job.source || 'unknown';
    if (!baselineBySource.has(source)) baselineBySource.set(source, []);
    baselineBySource.get(source).push(job);
  }
  for (const [source, sourceBaseline] of baselineBySource.entries()) {
    if (sourceBaseline.length < 5) continue;
    const sourceCurrent = currentRecommended.filter((job) => job.source === source);
    const sourceThreshold = Math.max(2, Math.ceil(sourceBaseline.length * 0.5));
    if (sourceCurrent.length >= sourceThreshold) continue;
    const sourceLosses = sourceBaseline
      .map((previous) => ({ previous, current: findCurrent(previous) }))
      .filter(({ current }) => !isDefaultRecommendation(current || {}));
    const sourceExplained = ({ current }) => Boolean(current) && (
      ['source_error', 'talent_pool', 'expired', 'stale'].includes(current.listingStatus)
      || ['degraded', 'unstable'].includes(current.sourceReliabilityState)
      || current.sourceQualityTier === 'weak'
      || (current.lastChangeKind === 'content_changed'
        && (current.requirementsStatus === 'hard_check'
          || current.eligibilityCode === 'restricted'
          || Number(current.score || 0) < 20))
    );
    const sourceUnexplainedLosses = sourceLosses.filter((item) => !sourceExplained(item));
    if (sourceUnexplainedLosses.length) {
      sourceCollapses.push({
        source,
        baselineCount: sourceBaseline.length,
        currentCount: sourceCurrent.length,
        threshold: sourceThreshold,
        unexplainedLosses: sourceUnexplainedLosses
      });
    }
  }
  return {
    guarded: baselineRecommended.length >= 5 || sourceCollapses.length > 0,
    collapse: (baselineRecommended.length >= 5
      && currentRecommended.length < threshold
      && unexplainedLosses.length > 0)
      || sourceCollapses.length > 0,
    baselineCount: baselineRecommended.length,
    currentCount: currentRecommended.length,
    threshold,
    unexplainedLosses,
    sourceCollapses
  };
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

function sourceQualityTier(meta, recentHistory, current) {
  const history = [...recentHistory, current].filter(Boolean).slice(-sourceMetricHistoryLimit);
  const attempts = history.length;
  const successes = history.filter((item) => item.ok).length;
  const successRate = attempts ? successes / attempts : 0;
  const consecutiveFailures = history.slice().reverse().findIndex((item) => item.ok);
  const failureStreak = consecutiveFailures === -1 ? attempts : consecutiveFailures;
  if (isOfficialKind(meta.kind)) return failureStreak >= 2 ? 'degraded' : 'strong';
  const qualityAttempts = history
    .filter((item) => item.ok && Number(item.matchedCount || 0) >= 3)
    .slice(-4);
  const noisyAttempts = qualityAttempts.filter((item) => {
    const matchedCount = Number(item.matchedCount || 0);
    const noiseCount = Number(item.duplicateCount || 0) + Number(item.lowQualityCount || 0);
    return matchedCount > 0 && noiseCount / matchedCount >= 0.8;
  });
  if ((attempts >= 4 && successRate < 0.75) || (qualityAttempts.length >= 3 && noisyAttempts.length >= 3)) return 'weak';
  return 'mixed';
}

function sourceReliabilityState(meta, history) {
  const attempts = history.length;
  const successes = history.filter((item) => item.ok).length;
  const successRate = attempts ? successes / attempts : 1;
  let consecutiveFailures = 0;
  for (const item of history.slice().reverse()) {
    if (item.ok) break;
    consecutiveFailures += 1;
  }
  if (consecutiveFailures >= 2) return 'degraded';
  if (attempts >= 4 && successRate < 0.75) return 'unstable';
  return isOfficialKind(meta.kind) ? 'reliable' : 'observed';
}

function buildSourceMetrics(sourceNames, sourceRuns, sourceStatus, dedupedJobs, keptJobs, previousSourceMetrics = {}, now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  const metrics = {};
  for (const source of sourceNames) {
    const meta = sourceMeta(source);
    const status = sourceStatus.find((item) => item.source === source) || { source, ok: false };
    const run = sourceRuns.get(source) || {};
    const rawCount = Number(run.rawCount || 0);
    const matchedCount = Number(run.matchedCount || status.count || 0);
    const uniqueMatchedCount = dedupedJobs.filter((job) => job.source === source || (job.sources || []).includes(source)).length;
    const keptCount = keptJobs.filter((job) => job.source === source || (job.sources || []).includes(source)).length;
    const recommendedCount = keptJobs.filter((job) =>
      (job.source === source || (job.sources || []).includes(source))
      && isDefaultRecommendation({ ...job, recommendationEligible: true })).length;
    const duplicateCount = Math.max(0, matchedCount - uniqueMatchedCount);
    const lowQualityCount = Math.max(0, uniqueMatchedCount - keptCount);
    const noiseCount = duplicateCount + lowQualityCount;
    const matchRate = rawCount ? matchedCount / rawCount : 0;
    const keptRate = matchedCount ? keptCount / matchedCount : 0;
    const duplicateRate = matchedCount ? duplicateCount / matchedCount : 0;
    const lowQualityRate = matchedCount ? lowQualityCount / matchedCount : 0;
    const noiseRate = matchedCount ? noiseCount / matchedCount : 0;
    const previous = previousSourceMetrics?.[source] || {};
    const previousHistory = Array.isArray(previous.history) ? previous.history : [];
    const historyEntry = {
      at: nowIso,
      ok: Boolean(status.ok),
      rawCount,
      discoveredCount: Number(run.discoveredCount ?? rawCount),
      detailAttemptCount: Number(run.detailAttemptCount || 0),
      detailSuccessCount: Number(run.detailSuccessCount || 0),
      matchedCount,
      keptCount,
      recommendedCount,
      duplicateCount,
      lowQualityCount,
      noiseCount,
      detailFailureCount: Number(run.detailFailureCount || 0),
      detailRejectedCount: Number(run.detailRejectedCount || 0),
      detailRejectionCounts: run.detailRejectionCounts && typeof run.detailRejectionCounts === 'object'
        ? { ...run.detailRejectionCounts }
        : {},
      workplaceUnverifiedCount: Number(run.workplaceUnverifiedCount || 0),
      accessRestrictedCount: Number(run.accessRestrictedCount || 0),
      listFallbackCount: Number(run.listFallbackCount || 0),
      detailRecoveredCount: Number(run.detailRecoveredCount || 0),
      continuityProbeCount: Number(run.continuityProbeCount || 0),
      continuityRecoveredCount: Number(run.continuityRecoveredCount || 0),
      continuityTerminalCount: Number(run.continuityTerminalCount || 0),
      continuityFailureCount: Number(run.continuityFailureCount || 0),
      discoveryCollapseSuspected: Boolean(run.discoveryCollapseSuspected),
      discoveryReferenceCount: Number(run.discoveryReferenceCount || 0),
      discoveryOverlapCount: Number(run.discoveryOverlapCount || 0),
      ...(status.error ? { error: String(status.error).slice(0, 240) } : {})
    };
    const history = appendLimitedHistory(previousHistory, historyEntry, sourceMetricHistoryLimit);
    const recentAttempts = history.length;
    const recentSuccesses = history.filter((item) => item.ok).length;
    let consecutiveFailures = 0;
    for (const item of history.slice().reverse()) {
      if (item.ok) break;
      consecutiveFailures += 1;
    }
    const currentForTier = { ...historyEntry, lowQualityRate, noiseRate };
    const qualityTier = sourceQualityTier(meta, history.slice(0, -1), currentForTier);
    const reliabilityState = sourceReliabilityState(meta, history);
    metrics[source] = {
      source,
      kind: meta.kind,
      officiality: isOfficialKind(meta.kind) ? 'official' : meta.kind === 'manual' ? 'manual' : 'intermediary',
      coverage: meta.coverage || 'unknown',
      evidenceRefreshability: meta.evidenceRefreshability || 'unknown',
      qualityTier,
      reliabilityState,
      lastAttemptAt: nowIso,
      lastSuccessAt: status.ok ? nowIso : (previous.lastSuccessAt || ''),
      lastFailureAt: status.ok ? (previous.lastFailureAt || '') : nowIso,
      consecutiveFailures,
      recentAttempts,
      recentSuccessRate: recentAttempts ? Math.round((recentSuccesses / recentAttempts) * 1000) / 1000 : 0,
      rawCount,
      discoveredCount: Number(run.discoveredCount ?? rawCount),
      detailAttemptCount: Number(run.detailAttemptCount || 0),
      detailSuccessCount: Number(run.detailSuccessCount || 0),
      detailSuccessRate: Number(run.detailAttemptCount || 0)
        ? Math.round((Number(run.detailSuccessCount || 0) / Number(run.detailAttemptCount || 0)) * 1000) / 1000
        : null,
      localeEligibleCount: Number(run.localeEligibleCount || 0),
      profileMatchedCount: Number(run.profileMatchedCount ?? matchedCount),
      detailFailureCount: Number(run.detailFailureCount || 0),
      detailRejectedCount: Number(run.detailRejectedCount || 0),
      detailRejectionCounts: run.detailRejectionCounts && typeof run.detailRejectionCounts === 'object'
        ? { ...run.detailRejectionCounts }
        : {},
      workplaceUnverifiedCount: Number(run.workplaceUnverifiedCount || 0),
      accessRestrictedCount: Number(run.accessRestrictedCount || 0),
      listFallbackCount: Number(run.listFallbackCount || 0),
      detailRecoveredCount: Number(run.detailRecoveredCount || 0),
      continuityProbeCount: Number(run.continuityProbeCount || 0),
      continuityRecoveredCount: Number(run.continuityRecoveredCount || 0),
      continuityTerminalCount: Number(run.continuityTerminalCount || 0),
      continuityFailureCount: Number(run.continuityFailureCount || 0),
      discoveryCollapseSuspected: Boolean(run.discoveryCollapseSuspected),
      discoveryReferenceCount: Number(run.discoveryReferenceCount || 0),
      discoveryOverlapCount: Number(run.discoveryOverlapCount || 0),
      matchedCount,
      keptCount,
      recommendedCount,
      duplicateCount,
      lowQualityCount,
      noiseCount,
      matchRate: Math.round(matchRate * 1000) / 1000,
      validJobRate: Math.round(keptRate * 1000) / 1000,
      keptRate: Math.round(keptRate * 1000) / 1000,
      duplicateRate: Math.round(duplicateRate * 1000) / 1000,
      lowQualityRate: Math.round(lowQualityRate * 1000) / 1000,
      noiseRate: Math.round(noiseRate * 1000) / 1000,
      history
    };
  }
  return metrics;
}

function applySourceMetricsToJobs(jobs, sourceMetrics = {}) {
  return jobs.map((job) => {
    const metric = sourceMetrics[job.source] || {};
    const sourceRecommendationGateReason = ['degraded', 'unstable'].includes(metric.reliabilityState)
      ? '반복 수집 실패로 소스 신뢰가 낮음'
      : metric.qualityTier === 'weak'
        ? '반복적으로 유효 공고 비율이 낮거나 중복·저품질 비율이 높은 소스'
        : '';
    const recommendationEligible = !sourceRecommendationGateReason
      && job.requirementsStatus !== 'hard_check';
    return {
      ...job,
      sourceQualityTier: metric.qualityTier || (isOfficialKind(job.sourceKind) ? 'strong' : 'mixed'),
      sourceReliabilityState: metric.reliabilityState || (isOfficialKind(job.sourceKind) ? 'reliable' : 'observed'),
      sourceRecentSuccessRate: metric.recentSuccessRate ?? null,
      sourceEvidenceRefreshability: metric.evidenceRefreshability || sourceMeta(job.source).evidenceRefreshability || 'unknown',
      sourceRecommendationGateReason,
      recommendationEligible
    };
  });
}

export async function collectJobs({ includeManual = true, persist = true, previousJobs = null, previousFeed = null } = {}) {
  const work24AuthKey = text(process.env.WORK24_AUTH_KEY || '');
  const sources = [
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
  let fallbackFeed = previousFeed && typeof previousFeed === 'object' ? previousFeed : null;
  let fallbackJobs = Array.isArray(previousJobs)
    ? previousJobs
    : Array.isArray(fallbackFeed?.jobs)
      ? fallbackFeed.jobs
      : [];
  if (!fallbackJobs.length) {
    try {
      const previous = JSON.parse(await fs.readFile(path.join(root, 'data/jobs.json'), 'utf8'));
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
  for (const [name, collector] of sources) {
    try {
      const result = await collector();
      const collected = Array.isArray(result) ? result : (result?.jobs || []);
      sourceRuns.set(name, {
        rawCount: Number(result?.rawCount ?? collected.length),
        discoveredCount: Number(result?.discoveredCount ?? result?.rawCount ?? collected.length),
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
      jobs.push(...collected);
      sourceStatus.push({
        source: name,
        ok: true,
        count: collected.length,
        rawCount: Number(result?.rawCount ?? collected.length),
        discoveredCount: Number(result?.discoveredCount ?? result?.rawCount ?? collected.length),
        ...(result?.detailAttemptCount ? { detailAttemptCount: Number(result.detailAttemptCount) } : {}),
        ...(result?.detailSuccessCount ? { detailSuccessCount: Number(result.detailSuccessCount) } : {}),
        ...(result?.detailFailureCount ? { detailFailureCount: Number(result.detailFailureCount) } : {}),
        ...(result?.detailRejectedCount ? { detailRejectedCount: Number(result.detailRejectedCount) } : {}),
        ...(result?.detailRejectionCounts && Object.keys(result.detailRejectionCounts).length
          ? { detailRejectionCounts: { ...result.detailRejectionCounts } }
          : {}),
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
      const preserved = fallbackJobs.filter((job) => job.source === name).map(markPreservedSourceFailure);
      jobs.push(...preserved);
      const failureRun = error?.sourceRun || {};
      sourceRuns.set(name, {
        rawCount: Number(failureRun.rawCount || 0),
        discoveredCount: Number(failureRun.discoveredCount || 0),
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
        ...(failureRun.discoveredCount ? { discoveredCount: Number(failureRun.discoveredCount) } : {}),
        ...(failureRun.detailAttemptCount ? { detailAttemptCount: Number(failureRun.detailAttemptCount) } : {}),
        ...(failureRun.detailSuccessCount ? { detailSuccessCount: Number(failureRun.detailSuccessCount) } : {}),
        ...(failureRun.detailFailureCount ? { detailFailureCount: Number(failureRun.detailFailureCount) } : {}),
        ...(failureRun.detailRejectedCount ? { detailRejectedCount: Number(failureRun.detailRejectedCount) } : {}),
        ...(failureRun.detailRejectionCounts && Object.keys(failureRun.detailRejectionCounts).length
          ? { detailRejectionCounts: { ...failureRun.detailRejectionCounts } }
          : {}),
        ...(failureRun.discoveryCollapseSuspected ? { discoveryCollapseSuspected: true } : {}),
        error: String(error.message ?? error)
      });
    }
  }
  // Use a collection-completion timestamp for lifecycle reconciliation. Individual
  // jobs are verified while network collection is in progress, so a start timestamp
  // would make lastVerifiedAt earlier than the job's own verifiedAt.
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
    await fs.mkdir(path.join(root, 'data'), { recursive: true });
    await fs.writeFile(path.join(root, 'data/jobs.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
  return payload;
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
  fallbackJobsForConfiguredSources,
  relevantToProfile,
  currentListingState,
  markPreservedSourceFailure,
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
  keepInFeed,
  isDefaultRecommendation,
  recommendationCollapseRisk,
  refreshTimeBasedEvidence
};
