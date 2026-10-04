import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const profile = JSON.parse(await fs.readFile(path.join(root, 'config/search-profile.json'), 'utf8'));
const sourceQuality = JSON.parse(await fs.readFile(path.join(root, 'config/source-quality.json'), 'utf8'));
const paymentEvidencePolicy = JSON.parse(await fs.readFile(path.join(root, 'config/payment-evidence-policy.json'), 'utf8'));

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
const dayMs = 86400000;
const verificationHistoryLimit = 24;
const sourceMetricHistoryLimit = 24;
const verificationCheckpointMs = 7 * dayMs;
const contentFingerprintVersion = 2;
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

const provinceMatchers = [
  ['서울특별시', /서울|\bseoul\b/i],
  ['부산광역시', /부산|\bbusan\b/i],
  ['대구광역시', /대구|\bdaegu\b/i],
  ['인천광역시', /인천|\bincheon\b/i],
  ['광주광역시', /광주|\bgwangju\b/i],
  ['대전광역시', /대전|\bdaejeon\b/i],
  ['울산광역시', /울산|\bulsan\b/i],
  ['세종특별자치시', /세종|\bsejong\b/i],
  ['경기도', /경기도|\bgyeonggi(?:-do)?\b/i],
  ['강원특별자치도', /강원|\bgangwon(?:-do)?\b/i],
  ['충청북도', /충북|충청북도|\bchungcheongbuk(?:-do)?\b|\bchungbuk\b/i],
  ['충청남도', /충남|충청남도|\bchungcheongnam(?:-do)?\b|\bchungnam\b/i],
  ['전북특별자치도', /전북|전라북도|전북특별자치도|\bjeollabuk(?:-do)?\b|\bjeonbuk\b/i],
  ['전라남도', /전남|전라남도|\bjeollanam(?:-do)?\b|\bjeonnam\b/i],
  ['경상북도', /경북|경상북도|\bgyeongsangbuk(?:-do)?\b|\bgyeongbuk\b/i],
  ['경상남도', /경남|경상남도|\bgyeongsangnam(?:-do)?\b|\bgyeongnam\b/i],
  ['제주특별자치도', /제주|\bjeju(?:-do)?\b/i]
];

const regionCentroids = {
  '서울특별시': { lat: 37.5666791, lon: 126.9782914, precision: 'city', coordinateSource: 'OpenStreetMap Nominatim', coordinateCheckedAt: '2026-10-04' },
  '전북특별자치도|전주시|덕진구|산정동': { ...defaultLocationReference }
};

function domesticRegionFor(job) {
  const location = text(job.location);
  const lowerLocation = lower(location);
  const multiCountry = /\+\s*\d+\s*개\s*국가|\bworld\s*wide\b|\bworldwide\b|\bremote\s*-\s*europe\b|\b(?:china|japan|united states|canada|united kingdom|singapore|germany|france|brazil|india)\b/.test(lowerLocation.replace(/south korea|republic of korea/g, ''));
  const koreaSpecific = job.countryCode === 'KR'
    || /south korea|republic of korea|대한민국|한국|\bkorea\b|서울|\bseoul\b|부산|\bbusan\b|전주|\bjeonju\b/.test(lowerLocation);
  if (!koreaSpecific || multiCountry) return null;

  const province = provinceMatchers.find(([, pattern]) => pattern.test(location))?.[0]
    || (/\bseoul\b/i.test(location) ? '서울특별시' : '');
  const koreanUnits = [...location.matchAll(/([가-힣]{2,}(?:시|군|구|동))/g)].map((match) => match[1]);
  let city = koreanUnits.find((unit) => /시$/.test(unit) && !/특별시$|광역시$|자치시$/.test(unit)) || '';
  let district = koreanUnits.find((unit) => /군$|구$/.test(unit)) || '';
  let neighborhood = koreanUnits.find((unit) => /동$/.test(unit)) || '';
  if (!city && /\bjeonju\b/i.test(location)) city = '전주시';
  if (!district && /\bdeokjin(?:-gu)?\b/i.test(location)) district = '덕진구';
  if (!district && /\bwansan(?:-gu)?\b/i.test(location)) district = '완산구';
  if (!neighborhood && /\bsanjeong(?:-dong)?\b/i.test(location)) neighborhood = '산정동';

  const locality = [city, district].filter(Boolean).join(' ');
  const centroidKey = [province, city, district, neighborhood].filter(Boolean).join('|');
  const centroid = regionCentroids[centroidKey] || (!city && !district && !neighborhood ? regionCentroids[province] : null);
  const precision = neighborhood ? 'neighborhood' : district ? 'district' : city ? 'city' : province ? 'province' : 'country';
  return {
    country: '대한민국',
    province,
    city,
    district,
    neighborhood,
    locality,
    label: [province, locality, neighborhood].filter(Boolean).join(' ') || location,
    precision,
    evidenceLevel: 'source_location_text',
    ...(centroid ? {
      lat: centroid.lat,
      lon: centroid.lon,
      coordinatePrecision: centroid.precision,
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
  const domesticRegion = job.domesticRegion || domesticRegionFor(job);
  const scopes = [];
  if (job.remote || !domesticRegion) scopes.push('overseas_remote');
  if (domesticRegion) scopes.push('domestic');
  return [...new Set(scopes)];
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
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
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
    type: text(job.type),
    // Only source-provided salary metadata belongs in the original-source fingerprint.
    // Parsed/display salary is derived from the description and can change when parser policy changes.
    salary: text(job.salaryMetadataRaw || ''),
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
      reason: '원문 변경 판정 기준을 원시 소스 필드 기반 v2로 재설정함. 파생 급여 표시와 Remote OK 변동성 anti-spam footer는 원문 변경에서 제외함.'
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
  const regionalPay = text(description).match(/for candidates located in (.{1,140}?)(?:,?\s+the\s+)?(?:starting base pay|base pay|pay)[^.]{0,100}(?:ranges? from\s+)?([$€£₩¥]\s*\d[\d,.]*(?:\.\d+)?)\s*(?:to|[-–—])\s*([$€£₩¥]?\s*\d[\d,.]*(?:\.\d+)?)\s*(?:per\s+|\/)(hour|hr|day|week|month|year).{0,260}(?:outside|other locations?|elsewhere).{0,180}(?:may|can|could|will)?\s*(?:fall outside|vary|differ)/i);
  if (!text(rawValue) && regionalPay) {
    const scoped = extractSalary(`${regionalPay[2]} to ${regionalPay[3]} per ${regionalPay[4]}`);
    return {
      ...scoped,
      raw: regionalPay[0],
      display: `미국 일부 주 기준 ${scoped.display} · 기타 지역 단가 확인`,
      confidence: 'regional_only',
      scope: 'regional_only',
      scopeLabel: text(regionalPay[1])
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

function canonicalLocation(value) {
  const normalized = lower(value)
    .replace(/\b(remote|work from home|homeoffice)\b/g, '')
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || 'remote';
}

function domesticLocationKey(job) {
  if (!(job.marketScopes || marketScopesFor(job)).includes('domestic')) return '';
  if (job.remote && !/\b(?:hybrid|onsite|on-site)\b/i.test(job.workplaceMode || '')) return '';
  const region = job.domesticRegion || domesticRegionFor(job);
  return [region?.province, region?.city, region?.district, region?.neighborhood]
    .filter(Boolean)
    .join('|') || canonicalLocation(job.location);
}

function stableJobId(job) {
  const scope = domesticLocationKey(job)
    ? `domestic:${domesticLocationKey(job)}`
    : ['worldwide', 'korea'].includes(job.eligibilityCode)
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
  if (ageDays !== null && ageDays > 45) return { code: 'stale', label: '오래된 공고', stale: true, reason: `게시 후 ${ageDays}일 경과한 비공식 피드 공고`, basis: 'age', verification: 'intermediary' };
  return { code: 'current_feed', label: '집계·채용보드 현재 피드', stale: false, reason: '현재 채용 보드·집계 피드에 존재하지만 고용주의 공식 모집 상태는 별도 확인 필요', basis: 'board_feed', verification: 'intermediary' };
}

function markPreservedSourceFailure(job) {
  return {
    ...job,
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
    ['AI 평가·어노테이션', ['ai trainer', 'ai response', 'ai data specialist', 'generative ai analyst', 'foundation model evaluation engineer', 'model evaluation', 'data annotator', 'data annotation', 'response evaluator', 'search evaluator', 'search engine evaluator', 'internet safety evaluator', 'ads quality rater', 'quality rater', 'quality assurance reviewer', 'ai quality assurance', 'legal annotator', 'audio evaluation', 'speech evaluation', 'speech annotator', 'transcription quality reviewer', 'data rater', 'data labeling']],
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
  const job = {
    id: raw.id,
    source: raw.source,
    title: text(raw.title),
    company: text(raw.company) || '회사 미상',
    location: text(raw.location) || '위치 미상',
    remote: Boolean(raw.remote),
    workplaceMode: text(raw.workplaceMode) || (raw.remote ? 'remote' : 'unknown'),
    type: text(raw.type) || '미상',
    salary: text(raw.salary),
    url: raw.url,
    postedAt: raw.postedAt ? new Date(raw.postedAt).toISOString() : null,
    description: fullDescription.slice(0, 1200),
    _fullDescription: fullDescription,
    tags: Array.isArray(raw.tags) ? raw.tags.map(text).filter(Boolean).slice(0, 12) : [],
    countryCode: raw.countryCode || '',
    sourceListingState: text(raw.sourceListingState),
    sourceCreatedAt: raw.sourceCreatedAt ? new Date(raw.sourceCreatedAt).toISOString() : null,
    sourceModifiedAt: raw.sourceModifiedAt ? new Date(raw.sourceModifiedAt).toISOString() : null,
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
      : quality.kind === 'official_platform'
        ? 'official_platform_listing'
        : quality.kind === 'manual'
          ? 'manual_listing'
          : 'source_listing',
    label: quality.kind === 'official_ats'
      ? '공식 ATS 공고 원문'
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
  job.fitWarnings = [...new Set(fitWarnings)];
  job.fitWarning = job.fitWarnings.join(' · ');
  const routineRequirements = [];
  if (job.source === 'KRAFTON' && /Data Program Manager/i.test(job.title)) {
    routineRequirements.push('ML 논문 이해·기초 데이터 분석 역량 확인');
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
  const response = await fetch(url, {
    ...options,
    headers: { 'User-Agent': 'DigitalNomadJobDashboard/0.2', Accept: 'text/html,application/rss+xml,application/xml,text/xml,*/*', ...(options.headers ?? {}) }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} - ${url}`);
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
      countryCode: j.country || ''
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
    rowFilter: (job) => /\bkorean\b/i.test(job?.text || '')
      && /\b(?:transcription|quality control)\b/i.test(job?.text || '')
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
      countryCode: 'KR'
    };
    profileMatchedCount += 1;
    collected.push(normalizeJob(candidate));
  }
  return sourceCollection(collected, rows.length, { profileMatchedCount });
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
    const title = canonicalTitle(job.title);
    const fallback = lower(job.url).replace(/[?#].*$/, '').replace(/\/$/, '');
    const baseKey = company && company !== '회사 미상' && title ? `${company}::${title}` : fallback;
    const clusters = groups.get(baseKey) ?? [];
    const compatible = clusters.find((cluster) => {
      const current = cluster[0];
      if (current.url === job.url) return true;
      if (domesticLocationKey(current) || domesticLocationKey(job)) {
        return Boolean(domesticLocationKey(current)) === Boolean(domesticLocationKey(job))
          && domesticLocationKey(current) === domesticLocationKey(job);
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
    carried.push({
      ...previous,
      domesticRegion: previous.domesticRegion || domesticRegionFor(previous),
      marketScopes: previous.marketScopes || marketScopesFor(previous),
      marketSegment: previous.marketSegment || marketSegmentFor(previous),
      workplaceMode: previous.workplaceMode || (previous.remote ? 'remote' : 'unknown'),
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
    || ['source_error', 'archived_missing'].includes(job.listingStatus);
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
    return { guarded: false, collapse: false, baselineCount: 0, currentCount: 0, threshold: 0, unexplainedLosses: [] };
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
  return {
    guarded: baselineRecommended.length >= 5,
    collapse: baselineRecommended.length >= 5
      && currentRecommended.length < threshold
      && unexplainedLosses.length > 0,
    baselineCount: baselineRecommended.length,
    currentCount: currentRecommended.length,
    threshold,
    unexplainedLosses
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
      matchedCount,
      keptCount,
      recommendedCount,
      duplicateCount,
      lowQualityCount,
      noiseCount,
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
      localeEligibleCount: Number(run.localeEligibleCount || 0),
      profileMatchedCount: Number(run.profileMatchedCount ?? matchedCount),
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
  const sources = [
    ['Welo Global', collectWeloGlobal],
    ['RWS TrainAI', collectRws],
    ['TSMG', collectTsmg],
    ['ElevenLabs', collectElevenLabs],
    ['KRAFTON', collectKrafton],
    ['LILT Production', collectLilt],
    ['Meridial', collectMeridial],
    ['OneForma', collectOneForma],
    ['We Work Remotely', collectWeWorkRemotely],
    ['Jobicy', collectJobicy],
    ['Remote OK', collectRemoteOk],
    ['Remotive', collectRemotive],
    ['Arbeitnow', collectArbeitnow]
  ];
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
  const now = Date.now();
  const jobs = [];
  const sourceStatus = [];
  const sourceRuns = new Map();
  for (const [name, collector] of sources) {
    try {
      const result = await collector();
      const collected = Array.isArray(result) ? result : (result?.jobs || []);
      sourceRuns.set(name, {
        rawCount: Number(result?.rawCount ?? collected.length),
        matchedCount: Number(result?.matchedCount ?? collected.length),
        localeEligibleCount: Number(result?.localeEligibleCount || 0),
        profileMatchedCount: Number(result?.profileMatchedCount ?? collected.length)
      });
      jobs.push(...collected);
      sourceStatus.push({
        source: name,
        ok: true,
        count: collected.length,
        rawCount: Number(result?.rawCount ?? collected.length)
      });
    } catch (error) {
      const preserved = fallbackJobs.filter((job) => job.source === name).map(markPreservedSourceFailure);
      jobs.push(...preserved);
      sourceRuns.set(name, { rawCount: 0, matchedCount: 0, localeEligibleCount: 0, profileMatchedCount: 0 });
      sourceStatus.push({ source: name, ok: false, count: 0, preserved: preserved.length, error: String(error.message ?? error) });
    }
  }
  const deduped = carryForwardLegacyIds(dedupe(jobs), fallbackJobs);
  const reconciled = reconcileVerificationHistory(deduped, fallbackJobs, now);
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
    applySourceMetricsToJobs(carryRecentlyMissing(currentJobs, fallbackJobs, now), sourceMetrics),
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
  if (persist) await fs.writeFile(path.join(root, 'data/jobs.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const payload = await collectJobs();
  console.log(JSON.stringify({ updatedAt: payload.updatedAt, sourceStatus: payload.sourceStatus, jobs: payload.jobs.length }, null, 2));
}

export {
  defaultLocationReference,
  domesticRegionFor,
  marketScopesFor,
  marketSegmentFor,
  eligibilityFor,
  extractSalary,
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
