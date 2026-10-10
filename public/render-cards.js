export function createCardRenderer({ $, activeMarketJobs, captureJobCardFocus, distanceSummary, domesticLocalityMatches, effectivePaymentEvidence, eligibilityDisplayLabel, escapeHtml, filteredJobs, formatDate, formatDeadline, friendlyUiText, hideWithUndo, isBroadActiveView, jobMarketScopes, listingDisplayLabel, openDetails, paymentFreshnessLabel, persist, qualityClass, renderActiveFilters, renderCollectionCoverage, renderStats, renderVerificationBadges, requirementsDisplayLabel, restoreJobCardFocus, roleFitEvidenceFor, salarySummary, setHidden, setJobState, showStorageStatus, snapshotJob, syncStoredState, updateBatchUI, workplaceModeLabel, state, storage, renderCache }) {
let renderWaiting = false;
function render() {
  if (storage.pending) {
    if (!renderWaiting) {
      renderWaiting = true;
      storage.flush().catch(() => {}).finally(() => { renderWaiting = false; syncStoredState(); render(); });
    }
    return;
  }
  renderCache.begin();
  try {
  const focusSnapshot = captureJobCardFocus();
  const jobs = filteredJobs();
  renderStats(jobs);
  renderActiveFilters();
  renderCollectionCoverage();
  const visibleJobs = jobs.slice(0, state.visibleLimit);
  const activeTotal = activeMarketJobs().length;
  $('resultCount').textContent = jobs.length > visibleJobs.length ? `${jobs.length}개 중 ${visibleJobs.length}개 표시` : `${jobs.length}개 공고`;
  $('scopeCount').textContent = `· 숨김 제외 활성 전체 ${activeTotal}개`;
  $('showAllActive').hidden = isBroadActiveView();
  $('empty').hidden = jobs.length > 0;
  if (!jobs.length && !state.loadError) {
    const province = state.marketTab === 'domestic' ? $('domesticProvince').value : '';
    const locality = state.marketTab === 'domestic' ? $('domesticLocality').value : '';
    const neighborhood = state.marketTab === 'domestic' ? $('domesticNeighborhood').value : '';
    const regionLabel = [province, locality, neighborhood].filter(Boolean).join(' ');
    const hasRegionJobs = state.marketTab === 'domestic' && province
      ? state.jobs.some((job) => jobMarketScopes(job).includes('domestic')
        && job.domesticRegion?.province === province
        && domesticLocalityMatches(job.domesticRegion, locality)
        && (!neighborhood || job.domesticRegion?.neighborhood === neighborhood))
      : true;
    $('emptyMessage').textContent = regionLabel && !hasRegionJobs
      ? `현재 연결된 공식 소스에서 ${regionLabel} 공고를 확인하지 못했습니다. 지역 조건을 넓히거나 나중에 다시 확인해 주세요.`
      : '현재 필터에 맞는 공고가 없습니다. 필터를 초기화하거나 조건을 넓혀보세요.';
  }
  $('loadMore').hidden = visibleJobs.length >= jobs.length;
  const container = $('jobs');
  container.replaceChildren();
  const template = $('jobTemplate');
  for (const job of visibleJobs) {
    const node = template.content.cloneNode(true);
    node.querySelector('.job-card').dataset.jobId = job.id;
    node.querySelector('.source').textContent = job.source;
    if ((job.sources || []).length > 1) node.querySelector('.source').textContent = `${job.source} +${job.sources.length - 1}`;
    node.querySelector('.score').textContent = job.manual
      ? '직접 추가'
      : roleFitEvidenceFor(job)
        ? `검토 우선순위 ${job.score}`
        : `시장 탐색 후보 · 우선순위 ${job.score}`;
    if (!job.manual) {
      node.querySelector('.score').title = roleFitEvidenceFor(job)
        ? '합격 가능성이 아니라 먼저 확인할 순서를 위한 점수입니다.'
        : '지역·출처 조건은 맞지만 관심 업무와 직접 일치하는 근거가 부족한 일반 시장 후보입니다.';
    }
    const selection = node.querySelector('.job-select');
    selection.checked = state.selectedIds.has(job.id);
    selection.setAttribute('aria-label', `${job.title} 선택`);
    selection.addEventListener('change', () => {
      selection.checked ? state.selectedIds.add(job.id) : state.selectedIds.delete(job.id);
      updateBatchUI(visibleJobs);
    });
    const listingBadge = node.querySelector('.listing-badge');
    listingBadge.textContent = listingDisplayLabel(job);
    listingBadge.className = `listing-badge ${qualityClass('listing', job.listingStatus)}`;
    listingBadge.dataset.state = job.listingStatus || '';
    const trustBadge = node.querySelector('.trust-badge');
    trustBadge.textContent = job.sourceTrustLabel || job.source;
    trustBadge.className = `trust-badge ${qualityClass('trust', job.sourceKind)}`;
    const eligibilityBadge = node.querySelector('.eligibility-badge');
    eligibilityBadge.textContent = eligibilityDisplayLabel(job);
    eligibilityBadge.className = `eligibility-badge ${qualityClass('eligibility', job.eligibilityCode)}`;
    const paymentBadge = node.querySelector('.payment-badge');
    const payment = effectivePaymentEvidence(job);
    paymentBadge.textContent = payment.label || job.paymentLabel || '지급 근거 확인 필요';
    paymentBadge.className = `payment-badge ${qualityClass('payment', payment.state)}`;
    paymentBadge.dataset.state = payment.state;
    paymentBadge.dataset.freshness = payment.freshness || '';
    paymentBadge.title = `${paymentFreshnessLabel(job)}${payment.nextReviewAt ? ` · 재검토 기준 ${new Date(payment.nextReviewAt).toLocaleDateString('ko-KR')}` : ''}`;
    const requirementsBadge = node.querySelector('.requirements-badge');
    requirementsBadge.textContent = requirementsDisplayLabel(job);
    requirementsBadge.className = `requirements-badge ${qualityClass('requirements', job.requirementsStatus || 'clear')}`;
    requirementsBadge.dataset.state = job.requirementsStatus || 'clear';
    renderVerificationBadges(node.querySelector('.verification-badges'), job);
    const valueLine = node.querySelector('.decision-value');
    valueLine.textContent = `지금 볼 이유 · ${(job.applyValueReasons || []).slice(0, 3).map(friendlyUiText).join(' · ') || '추가 근거 확인 필요'}`;
    const unknownLine = node.querySelector('.decision-unknown');
    unknownLine.textContent = `미확인 · ${(job.decisionUnknowns || []).slice(0, 3).map(friendlyUiText).join(' · ') || '주요 미확인 항목 없음'}`;
    node.querySelector('.title').textContent = job.title;
    node.querySelector('.company').textContent = job.company;
    const compensation = salarySummary(job);
    const compensationNode = node.querySelector('.compensation');
    compensationNode.classList.toggle('unknown', compensation.unknown);
    compensationNode.classList.toggle('limited', compensation.limited);
    node.querySelector('.compensation-value').textContent = compensation.value;
    node.querySelector('.compensation-note').textContent = compensation.note;
    const distance = distanceSummary(job);
    const distanceNode = node.querySelector('.distance-summary');
    distanceNode.hidden = !distance || state.marketTab !== 'domestic';
    if (distance && state.marketTab === 'domestic') {
      distanceNode.classList.toggle('unknown', distance.kind === 'unknown');
      distanceNode.classList.toggle('remote', distance.kind === 'remote');
      node.querySelector('.distance-value').textContent = distance.value;
      node.querySelector('.distance-note').textContent = distance.note;
    }
    const meta = [
      job.location,
      state.marketTab === 'domestic' ? workplaceModeLabel(job) : '',
      job.type,
      state.marketTab === 'domestic' && job.workSchedule ? `근무 ${job.workSchedule}` : '',
      state.marketTab === 'domestic' && job.workPeriod ? `기간 ${job.workPeriod}` : '',
      state.marketTab === 'domestic' && (job.preferredConditions || []).length ? `우대 ${job.preferredConditions.slice(0, 2).join(', ')}` : '',
      job.category
    ].filter(Boolean);
    node.querySelector('.meta').innerHTML = meta.map((v) => `<span>${escapeHtml(v)}</span>`).join('');
    node.querySelector('.description').textContent = job.description || '상세 설명 없음';
    const tagValues = [...new Set([...(state.newIds.has(job.id) ? ['신규'] : []), ...(job.duplicateCount > 1 ? [`중복 ${job.duplicateCount}개 통합`] : []), ...(job.fitWarning ? [friendlyUiText(job.fitWarning)] : []), ...(job.matchedKeywords || []), ...(job.tags || [])])].slice(0, 6);
    node.querySelector('.tags').innerHTML = tagValues.map((v) => `<span class="tag">${escapeHtml(v)}</span>`).join('');
    node.querySelector('.posted').textContent = [formatDate(job.postedAt), formatDeadline(job)].filter(Boolean).join(' · ');
    const apply = node.querySelector('.apply');
    apply.href = job.url;
    apply.addEventListener('click', () => {
      if (storage.readOnly) return;
      state.reviewedIds.add(job.id);
      state.newIds.delete(job.id);
      persist();
      renderStats();
      if ($('statusFilter').value === 'unreviewed' || $('statusFilter').value === 'new') render();
    });

    const favorite = node.querySelector('.favorite');
    favorite.textContent = state.favorites.has(job.id) ? '★' : '☆';
    favorite.setAttribute('aria-label', state.favorites.has(job.id) ? `${job.title} 관심 해제` : `${job.title} 관심 등록`);
    favorite.classList.toggle('active', state.favorites.has(job.id));
    favorite.addEventListener('click', () => {
      state.newIds.delete(job.id);
      state.favorites.has(job.id) ? state.favorites.delete(job.id) : state.favorites.add(job.id);
      if (state.favorites.has(job.id)) snapshotJob(job.id);
      persist(); render();
    });

    const jobState = node.querySelector('.job-state');
    jobState.value = state.jobStates[job.id] || '';
    jobState.setAttribute('aria-label', `${job.title} 지원 상태`);
    jobState.addEventListener('change', () => setJobState(job.id, jobState.value));
    const dismiss = node.querySelector('.dismiss');
    if (state.hiddenIds.has(job.id)) {
      dismiss.textContent = '↶';
      dismiss.title = '숨김 해제';
      dismiss.setAttribute('aria-label', `${job.title} 숨김 해제`);
      dismiss.addEventListener('click', () => setHidden(job.id, false));
    } else {
      dismiss.textContent = '×';
      dismiss.title = '숨기기';
      dismiss.setAttribute('aria-label', `${job.title} 숨기기`);
      dismiss.addEventListener('click', () => hideWithUndo(job));
    }
    node.querySelector('.details').addEventListener('click', () => openDetails(job));
    container.appendChild(node);
  }
  updateBatchUI(visibleJobs);
  restoreJobCardFocus(focusSnapshot);
  showStorageStatus();
  } finally { renderCache.end(); }
}


return { render };
}
