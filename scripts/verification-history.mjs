import crypto from 'node:crypto';
export function createVerificationHistory({ text, stableSourceDescription, normalizedUrl, verificationHistoryLimit, contentFingerprintVersion, verificationCheckpointMs }) {
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
    const previousIncruitRss = previous.source === '인크루트'
      && ['public_rss', 'public_rss_cached_detail'].includes(previous.sourceListingState);
    const currentIncruitRss = job.source === '인크루트'
      && ['public_rss', 'public_rss_cached_detail'].includes(job.sourceListingState);
    const verificationScopeChanged = previous.source === '인크루트' && job.source === '인크루트'
      && previousIncruitRss !== currentIncruitRss;
    // RSS cannot verify detailed fields, so losing or regaining access to a
    // detail page is not evidence that the employer edited the job content.
    const changedFields = !verificationScopeChanged && hadPreviousFingerprint && previousFingerprint !== fingerprint
      ? changedSourceFields(previous, job)
      : [];
    const events = [];
    if (verificationScopeChanged) {
      events.push({
        at: nowIso,
        event: 'verification_scope_changed',
        fromStatus: previous.sourceListingState || '',
        toStatus: job.sourceListingState || '',
        fingerprint,
        reason: currentIncruitRss
          ? '상세 페이지 검증에서 공개 RSS 목록 확인으로 근거 범위가 축소됨. 원문 변경으로 판정하지 않음'
          : 'RSS 목록 확인에서 상세 페이지 교차 검증으로 근거 범위가 확대됨'
      });
    }
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
        event: currentIncruitRss ? 'rss_list_seen' : 'verified_unchanged',
        fromStatus: job.listingStatus,
        toStatus: job.listingStatus,
        fingerprint,
        reason: currentIncruitRss
          ? '공개 RSS 목록에 동일 공고가 재표시됨. 상세 페이지를 재검증한 것은 아님'
          : '원문과 모집 상태의 의미 있는 변경 없이 재검증됨'
      });
    }

    const primaryEvent = ['reappeared', 'source_recovered', 'source_failed', 'verification_scope_changed', 'content_changed', 'status_changed', 'evidence_freshness_changed', 'evidence_state_changed']
      .map((kind) => events.find((event) => event.event === kind)).find(Boolean);
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


return { appendLimitedHistory, sourceContentSnapshot, sourceFieldFingerprints, contentFingerprint, changedSourceFields, rebaseLegacyContentHistory, previousJobLookup, findPreviousJob, reconcileVerificationHistory };
}
