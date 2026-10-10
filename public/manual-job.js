export function createManualJobRules({  }) {
function manualJobRecord({
  id = `manual:${crypto.randomUUID()}`,
  source = '직접 추가',
  title = '',
  company = '',
  location = '',
  url = '',
  remote = false,
  description = '',
  market = 'overseas_remote',
  sourceSummary = '',
  listingEvidenceLabel = '직접 추가 원문'
} = {}) {
  const manualMarket = remote ? 'overseas_remote' : market;
  const checkedAt = new Date().toISOString();
  return {
    id,
    source: String(source || '직접 추가').trim() || '직접 추가',
    title: String(title || '').trim(),
    company: String(company || '').trim() || '회사 미상',
    location: String(location || '').trim() || '위치 미상',
    remote: Boolean(remote),
    workplaceMode: remote ? 'remote' : 'unknown',
    type: remote ? 'Remote' : '미상',
    salary: '',
    url: String(url || '').trim(),
    postedAt: '',
    description: String(description || '').trim(),
    tags: [],
    matchedKeywords: [],
    roleFitEvidence: false,
    roleFitBasis: 'none',
    recommendationEligible: false,
    roleRecommendationGateReason: '사용자가 직접 추가한 추적 공고',
    category: '직접 추가',
    eligibility: '확인 필요',
    eligibilityCode: 'unknown',
    eligibilityBasis: 'manual',
    eligibilityReason: '직접 추가 공고라 지원 가능한 국가 범위를 자동 검증하지 않음',
    listingStatus: 'manual',
    listingLabel: '직접 확인 필요',
    listingBasis: 'manual',
    listingReason: '사용자가 직접 추가한 공고라 원문에서 현재 모집 여부를 확인해야 함',
    listingVerification: 'manual',
    sourceKind: 'manual',
    sourceCoverage: 'manual',
    sourceTrustLabel: '사용자 직접 추가',
    sourceOfficiality: 'manual',
    paymentStatus: 'unknown',
    paymentLabel: '직접 확인 필요',
    paymentEvidenceState: 'insufficient',
    paymentEvidenceLabel: '근거 부족',
    paymentConfidence: 'low',
    paymentEvidenceFreshness: 'insufficient',
    paymentEvidenceCheckedAt: '',
    paymentEvidenceNextReviewAt: '',
    paymentSummary: '직접 추가 공고라 구조화된 공개 지급 평판 근거가 없습니다.',
    paymentSignals: [],
    sourceSummary: sourceSummary || '사용자가 직접 추가한 공고입니다. 원문에서 현재 모집과 지급 조건을 확인하세요.',
    sourceEvidence: [],
    salaryInfo: { raw: '', display: '', confidence: 'none' },
    verifiedAt: checkedAt,
    listingCheckedAt: checkedAt,
    listingEvidence: [{ type: 'manual_listing', label: listingEvidenceLabel, url: String(url || '').trim(), checkedAt }],
    fitReasons: ['사용자가 직접 검토 대상으로 추가함'],
    fitWarnings: [],
    fitWarning: '',
    requirementChecks: [],
    requirementsStatus: 'clear',
    requirementsLabel: '추가 필수조건 감지 없음',
    applyValueReasons: ['사용자가 직접 검토 대상으로 추가함'],
    decisionUnknowns: ['현재 모집 여부', '지원 가능 국가', '급여·단가', '지급 신뢰 근거'],
    score: 50,
    marketScopes: [manualMarket],
    marketSegment: manualMarket,
    ...(manualMarket === 'domestic' ? {
      domesticRegion: {
        country: '대한민국', province: '', city: '', district: '', locality: '', neighborhood: '',
        label: String(location || '').trim(), precision: 'country', evidenceLevel: 'manual_location'
      }
    } : {}),
    manual: true
  };
}


return { manualJobRecord };
}
