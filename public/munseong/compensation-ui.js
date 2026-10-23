export function createCompensationUI({  }) {
function salaryLabel(job) {
  return job.salaryInfo?.display || job.salary || '';
}

function salarySummary(job) {
  const info = job.salaryInfo || {};
  const value = salaryLabel(job);
  const hasAmount = Number.isFinite(info.min) || Number.isFinite(info.max);
  const notes = [];
  if (info.confidence === 'regional_only') notes.push('지역 한정 금액 · 다른 지역은 확인 필요');
  else if (info.confidence === 'basis_only') notes.push('금액 미공개 · 지급 방식만 확인됨');
  else if (info.qualifier === 'maximum') notes.push('상한액');
  else if (info.qualifier === 'approximate') notes.push('대략적 금액');
  if (info.scope === 'geography_dependent') notes.push('지역·국가에 따라 실제 단가 변동');
  if (info.paymentBasis === 'per_task_equivalent') notes.push('건당 지급을 시간당으로 환산');
  if (job.salaryMetadataConflict) notes.push('원문과 채용보드 메타데이터 불일치');
  else if (job.salaryMetadataSuppressed) notes.push('채용보드 금액은 원문 미확인');
  for (const note of job.compensationNotes || []) notes.push(note);
  if (!value) notes.push('원문에서 확인 필요');
  return {
    value: value || '금액 미공개',
    note: [...new Set(notes)].join(' · '),
    hasAmount,
    period: info.period || '',
    confidence: info.confidence || 'none',
    paymentBasis: info.paymentBasis || '',
    limited: Boolean(value) && (!hasAmount || info.confidence === 'regional_only' || info.scope === 'geography_dependent' || job.salaryMetadataConflict || job.salaryMetadataSuppressed),
    unknown: !value
  };
}

function compensationMatches(job, filter) {
  if (!filter) return true;
  const summary = salarySummary(job);
  if (filter === 'amount') return summary.hasAmount;
  if (filter === 'hour') return summary.hasAmount && summary.period === 'hour';
  if (filter === 'salary') return summary.hasAmount && ['day', 'week', 'month', 'year'].includes(summary.period);
  if (filter === 'piece') return ['project', 'episode', 'set'].includes(summary.period)
    || ['per_task_equivalent', 'per_completed_set'].includes(summary.paymentBasis);
  if (filter === 'basis_only') return summary.confidence === 'basis_only';
  if (filter === 'undisclosed') return !summary.hasAmount;
  return true;
}


return { salaryLabel, salarySummary, compensationMatches };
}
