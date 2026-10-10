import { test, expect } from '@playwright/test';

function job(overrides = {}) {
  const now = '2026-10-04T06:00:00.000Z';
  return {
    id: 'job:default',
    source: 'RWS TrainAI',
    title: 'AI Data Specialist - Korean',
    company: 'RWS',
    location: 'South Korea',
    remote: true,
    type: 'Freelance',
    salary: '$10/시간',
    url: 'https://example.com/job/default',
    postedAt: '2026-10-03T00:00:00.000Z',
    description: 'Evaluate Korean AI data and follow project guidelines.',
    tags: ['Korean', 'AI'],
    category: 'AI 평가·어노테이션',
    eligibility: '한국에서 지원 가능',
    eligibilityCode: 'korea',
    eligibilityBasis: 'location',
    eligibilityReason: '공고 위치에 한국이 명시됨: South Korea',
    salaryInfo: { raw: '$10/hour', display: '$10/시간', currency: 'USD', min: 10, max: 10, period: 'hour', confidence: 'parsed' },
    sourceKind: 'official_ats',
    sourceCoverage: 'current_catalog',
    sourceEvidenceRefreshability: 'direct_api',
    sourceQualityTier: 'strong',
    sourceReliabilityState: 'reliable',
    sourceRecentSuccessRate: 1,
    recommendationEligible: true,
    roleFitEvidence: true,
    roleFitBasis: 'keyword_match',
    sourceTrustLabel: '공식 직접 채용',
    sourceOfficiality: 'official',
    sourceSummary: '공식 ATS의 현재 공개 공고입니다.',
    sourceEvidence: [{ type: 'official_source', label: '공식 채용', url: 'https://example.com/source' }],
    sourceReviewAt: '2026-10-04',
    paymentStatus: 'caution',
    paymentLabel: '지급 후기 주의',
    paymentEvidenceState: 'caution_repeated',
    paymentEvidenceLabel: '반복 주의 신호',
    paymentConfidence: 'moderate',
    paymentSummary: '공개 리뷰 집계에 반복 주의 신호가 있습니다.',
    paymentEvidenceFreshness: 'fresh',
    paymentEvidenceCheckedAt: '2026-10-04',
    paymentEvidenceNextReviewAt: '2027-01-30T00:00:00.000Z',
    paymentSignals: [{ type: 'review_aggregate', direction: 'caution', recurrence: 'repeated', checkedAt: '2026-10-04', latestSourceAt: '2026-10-02', freshness: 'fresh', maxAgeDays: 120, expiresAt: '2027-01-30T00:00:00.000Z', label: '리뷰 집계', url: 'https://example.com/reviews' }],
    listingStatus: 'verified_open',
    listingLabel: '모집 확인됨',
    listingBasis: 'official_feed',
    listingVerification: 'direct_open',
    listingReason: '공식 ATS의 현재 공개 목록에서 수집됨',
    listingCheckedAt: now,
    listingEvidence: [{ type: 'official_listing', label: '공식 공고 원문', url: 'https://example.com/job/default', checkedAt: now }],
    verifiedAt: now,
    contentFingerprint: 'fixture-fingerprint',
    firstSeenAt: '2026-10-01T06:00:00.000Z',
    lastSeenAt: now,
    lastVerifiedAt: now,
    lastChangeKind: 'verified_unchanged',
    lastChangeAt: now,
    lastChangedFields: [],
    verificationHistory: [{ at: now, event: 'verified_unchanged', fromStatus: 'verified_open', toStatus: 'verified_open', reason: '변경 없이 재검증됨' }],
    stale: false,
    score: 90,
    marketScopes: ['overseas_remote'],
    marketSegment: 'overseas_remote',
    matchedKeywords: ['korean', 'ai data specialist'],
    fitReasons: ['일치 키워드: korean, ai data specialist', '지원 범위: 한국에서 지원 가능'],
    fitWarnings: [],
    fitWarning: '',
    requirementChecks: [],
    requirementsStatus: 'clear',
    requirementsLabel: '추가 하드요건 감지 없음',
    applyValueReasons: ['공식 ATS 모집 확인', '한국 지원 명시', '원격', '급여 $10/시간'],
    decisionUnknowns: ['지급 평판 주의 신호'],
    legacyIds: ['raw:default'],
    sources: ['RWS TrainAI'],
    alternateUrls: [],
    duplicateCount: 1,
    ...overrides
  };
}

function feed(jobs) {
  return {
    updatedAt: '2026-10-04T06:00:00.000Z',
    domesticProvinceOptions: ['서울특별시', '전남광주통합특별시', '부산광역시', '대구광역시', '인천광역시', '대전광역시', '울산광역시', '세종특별자치시', '경기도', '충청북도', '충청남도', '경상북도', '경상남도', '제주특별자치도', '강원특별자치도', '전북특별자치도'],
    locationReference: {
      id: 'kr-jeonbuk-jeonju-deokjin-sanjeong',
      label: '전북특별자치도 전주시 덕진구 산정동',
      province: '전북특별자치도', city: '전주시', district: '덕진구', neighborhood: '산정동',
      lat: 35.84434, lon: 127.1736277, precision: 'neighborhood', coordinateSource: 'OpenStreetMap Nominatim', distanceMethod: 'haversine_straight_line'
    },
    recommendationPolicyVersion: 3,
    sourceStatus: [{ source: 'RWS TrainAI', ok: true, count: jobs.length, qualityTier: 'strong', kept: jobs.length, recommended: jobs.filter((item) => item.recommendationEligible !== false && item.roleFitEvidence === true).length }],
    sourceMetrics: {
      'RWS TrainAI': {
        source: 'RWS TrainAI', kind: 'official_ats', officiality: 'official', coverage: 'current_catalog',
        evidenceRefreshability: 'direct_api', qualityTier: 'strong', reliabilityState: 'reliable',
        recentSuccessRate: 1, matchedCount: jobs.length, keptCount: jobs.length, recommendedCount: jobs.filter((item) => item.recommendationEligible !== false && item.roleFitEvidence === true).length,
        validJobRate: 1, keptRate: 1, duplicateRate: 0, lowQualityRate: 0,
        history: [{ at: '2026-10-04T06:00:00.000Z', ok: true, rawCount: jobs.length, matchedCount: jobs.length, keptCount: jobs.length }]
      }
    },
    recommendationSummary: { count: jobs.filter((item) => item.recommendationEligible !== false && item.roleFitEvidence === true && item.score >= 20 && item.requirementsStatus !== 'hard_check').length, minExpected: 5, hardRequirementCount: 0 },
    jobs
  };
}

function legacyDomesticFilterDefaults(sort = 'distance') {
  return {
    query: '', source: '', category: '', remote: '', eligibility: '',
    domesticProvince: '', domesticLocality: '',
    compensationFilter: '', ageFilter: '', listingFilter: 'active',
    sourceKindFilter: '', paymentFilter: '', requirementsFilter: '',
    minScore: '20', sort, statusFilter: 'active'
  };
}

function reserializedLegacyDomesticFilterDefaults(sort = 'distance') {
  return { ...legacyDomesticFilterDefaults(sort), domesticNeighborhood: '' };
}

const defaultJobs = [
  job(),
  job({
    id: 'job:oneforma',
    source: 'OneForma',
    title: 'Multilingual AI Quality Assurance Reviewer',
    company: 'OneForma',
    url: 'https://example.com/job/oneforma',
    sourceKind: 'official_platform',
    sourceTrustLabel: '공식 프로젝트 플랫폼',
    listingStatus: 'official_listed',
    listingLabel: '공식 프로젝트 게시 확인',
    listingVerification: 'official_listed',
    listingBasis: 'official_platform_feed',
    listingReason: '공식 프로젝트 플랫폼의 공개 API에서 게시 상태를 확인함',
    listingEvidence: [{ type: 'official_platform_listing', label: '공식 프로젝트 페이지', url: 'https://example.com/job/oneforma' }],
    requirementChecks: [{ kind: 'routine', label: '작업 장비 확인' }],
    requirementsStatus: 'routine_check',
    requirementsLabel: '일반 요건 확인 필요',
    applyValueReasons: ['공식 프로젝트 게시 확인', '한국 지원 명시'],
    decisionUnknowns: ['실제 작업량·선발 가능성', '작업 장비 확인'],
    score: 82,
    legacyIds: ['raw:oneforma'],
    sources: ['OneForma']
  }),
  job({
    id: 'job:worldwide',
    source: 'Remotive',
    title: 'Korean Content Reviewer',
    company: 'Example Co',
    location: 'Worldwide',
    url: 'https://example.com/job/worldwide',
    sourceKind: 'job_board',
    sourceTrustLabel: '공개 공고 피드',
    sourceOfficiality: 'intermediary',
    paymentStatus: 'not_payer',
    paymentLabel: '지급 주체 아님',
    paymentEvidenceState: 'not_applicable',
    paymentEvidenceLabel: '지급 주체 아님',
    paymentSignals: [],
    paymentEvidenceFreshness: 'not_applicable',
    eligibility: 'Worldwide',
    eligibilityCode: 'worldwide',
    eligibilityReason: 'Worldwide 지원 범위가 명시됨',
    listingStatus: 'current_feed',
    listingLabel: '현재 피드',
    listingReason: '현재 채용 보드 피드에 존재함',
    listingVerification: 'intermediary',
    sourceCoverage: 'bounded_window',
    requirementChecks: [{ kind: 'hard', label: '전문 경력 확인' }],
    requirementsStatus: 'hard_check',
    requirementsLabel: '하드요건 확인 필요',
    applyValueReasons: ['현재 외부 피드에 게시', 'Worldwide 지원'],
    decisionUnknowns: ['고용주 공식 모집 상태', '전문 경력 확인'],
    score: 55,
    legacyIds: ['raw:worldwide'],
    sources: ['Remotive']
  })
];

const domesticJobs = [
  job({
    id: 'job:jeonju-onsite', source: 'KRAFTON', company: '전주 데이터랩', title: 'Korean AI Data Reviewer - Jeonju',
    location: '전북특별자치도 전주시 덕진구 산정동', remote: false, workplaceMode: 'onsite', type: 'Contract',
    url: 'https://example.com/job/jeonju-onsite', eligibilityCode: 'korea', eligibility: '한국에서 지원 가능', score: 75,
    marketScopes: ['domestic'], marketSegment: 'domestic',
    domesticRegion: { country: '대한민국', province: '전북특별자치도', city: '전주시', district: '덕진구', neighborhood: '산정동', locality: '전주시 덕진구', label: '전북특별자치도 전주시 덕진구 산정동', evidenceLevel: 'source_location_text', lat: 35.84434, lon: 127.1736277, coordinatePrecision: 'neighborhood', coordinateSource: 'OpenStreetMap Nominatim' }
  }),
  job({
    id: 'job:jeonju-unknown-distance', source: 'KRAFTON', company: '전주 AI 교육', title: 'Korean Language AI Evaluator - Jeonju',
    location: '전북특별자치도 전주시 완산구', remote: false, workplaceMode: 'onsite', type: 'Contract',
    url: 'https://example.com/job/jeonju-unknown-distance', score: 68,
    marketScopes: ['domestic'], marketSegment: 'domestic',
    domesticRegion: { country: '대한민국', province: '전북특별자치도', city: '전주시', district: '완산구', neighborhood: '', locality: '전주시 완산구', label: '전북특별자치도 전주시 완산구', evidenceLevel: 'source_location_text' }
  }),
  job({
    id: 'job:seoul-remote-domestic', source: 'RWS TrainAI', company: 'RWS', title: 'Korean Remote Evaluator - Seoul',
    location: 'Seoul', remote: true, workplaceMode: 'remote', type: 'Freelance', url: 'https://example.com/job/seoul-remote-domestic', score: 80,
    marketScopes: ['overseas_remote'], marketSegment: 'overseas_remote',
    domesticRegion: null
  })
];

const appierRemoteJob = job({
  id: 'job:appier-remote', source: 'Appier', company: 'Appier', title: '[Part Time] AI Creative QC Reviewer, Korea',
  location: 'Seoul, South Korea', remote: true, workplaceMode: 'remote', type: 'Part Time',
  url: 'https://example.com/job/appier-remote', eligibilityCode: 'korea', eligibility: '한국에서 지원 가능', score: 42,
  marketScopes: ['overseas_remote'], marketSegment: 'overseas_remote',
  salary: '₩10,320/시간', salaryInfo: { raw: '시급 10,320원', display: '₩10,320/시간', currency: 'KRW', min: 10320, max: 10320, period: 'hour', confidence: 'parsed' },
  requirementsStatus: 'routine_check', requirementsLabel: '일반 요건 확인 필요',
  domesticRegion: null
});

const gangnamHybridJob = job({
  id: 'job:gangnam-hybrid', source: 'Channel Corp', company: 'Channel Corp', title: 'Domestic Data Operations - Gangnam',
  location: 'Gangnam District, Seoul', remote: false, workplaceMode: 'hybrid', type: 'Full time',
  url: 'https://example.com/job/gangnam-hybrid', eligibilityCode: 'korea', eligibility: '한국에서 지원 가능', score: 55,
  sources: ['Channel Corp'],
  marketScopes: ['domestic'], marketSegment: 'domestic',
  domesticRegion: { country: '대한민국', province: '서울특별시', city: '', district: '강남구', neighborhood: '', locality: '강남구', label: '서울특별시 강남구', precision: 'district', evidenceLevel: 'source_structured', lat: 37.5177, lon: 127.0473, coordinatePrecision: 'district', coordinateSource: 'OpenStreetMap Nominatim' }
});

const work24LocalJobs = [
  job({
    id: 'job:work24-jeonju-office', source: '고용24', sourceKind: 'official_government', sourceTrustLabel: '고용노동부 공식 채용정보',
    company: '전주 생활서비스', title: '일반 사무원', location: '전북특별자치도 전주시 덕진구 금암동 거북바우3길 15',
    workAddress: '전북특별자치도 전주시 덕진구 금암동 거북바우3길 15', remote: false, workplaceMode: 'onsite',
    type: '기간의 정함이 없는 근로계약', url: 'https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=JEONJU1',
    platform: '고용24', sourcePostingId: 'JEONJU1', score: 45, category: '사무·운영',
    salary: '최소 ₩2,330,000/월', salaryInfo: { raw: '월급 233만원 이상', display: '최소 ₩2,330,000/월', currency: 'KRW', min: 2330000, max: 2330000, period: 'month', confidence: 'parsed', qualifier: 'minimum' },
    deadlineType: 'fixed', deadlineDate: '2026-10-31', deadlineLabel: '20261031',
    listingStatus: 'official_listed', listingLabel: '고용24 모집 확인', listingBasis: 'official_government_feed',
    listingEvidence: [{ type: 'official_government_listing', label: '정부 공식 채용정보 원문', url: 'https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=JEONJU1' }],
    marketScopes: ['domestic'], marketSegment: 'domestic',
    domesticRegion: { country: '대한민국', province: '전북특별자치도', city: '전주시', district: '덕진구', neighborhood: '금암동', locality: '전주시 덕진구', label: '전북특별자치도 전주시 덕진구 금암동', precision: 'address', evidenceLevel: 'source_structured', lat: 35.8294, lon: 127.1342, coordinatePrecision: 'district', coordinateLabel: '전북특별자치도 전주시 덕진구', coordinateSource: 'OpenStreetMap Nominatim' }
  }),
  job({
    id: 'job:work24-wanju-office', source: '고용24', sourceKind: 'official_government', sourceTrustLabel: '고용노동부 공식 채용정보',
    company: '완주 운영센터', title: '운영지원 사무원', location: '전북특별자치도 완주군 봉동읍 완주산단9로 15',
    workAddress: '전북특별자치도 완주군 봉동읍 완주산단9로 15', remote: false, workplaceMode: 'onsite',
    type: '기간의 정함이 있는 근로계약', url: 'https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=WANJU1',
    platform: '고용24', sourcePostingId: 'WANJU1', score: 35, category: '사무·운영',
    salary: '₩2,400,000/월', salaryInfo: { raw: '월급 240만원', display: '₩2,400,000/월', currency: 'KRW', min: 2400000, max: 2400000, period: 'month', confidence: 'parsed' },
    deadlineType: 'rolling', deadlineDate: '', deadlineLabel: '채용시까지',
    listingStatus: 'official_listed', listingLabel: '고용24 모집 확인', listingBasis: 'official_government_feed',
    listingEvidence: [{ type: 'official_government_listing', label: '정부 공식 채용정보 원문', url: 'https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=WANJU1' }],
    marketScopes: ['domestic'], marketSegment: 'domestic',
    domesticRegion: { country: '대한민국', province: '전북특별자치도', city: '완주군', district: '', neighborhood: '봉동읍', locality: '완주군', label: '전북특별자치도 완주군 봉동읍', precision: 'address', evidenceLevel: 'source_structured', lat: 35.9039, lon: 127.1622, coordinatePrecision: 'city', coordinateLabel: '전북특별자치도 완주군', coordinateSource: 'OpenStreetMap Nominatim' }
  }),
  job({
    id: 'job:work24-jeonju-unknown', source: '고용24', sourceKind: 'official_government', sourceTrustLabel: '고용노동부 공식 채용정보',
    company: '전주 지원센터', title: '자료입력 보조', location: '전북특별자치도 전주시 완산구', remote: false, workplaceMode: 'onsite',
    type: '시간선택제', url: 'https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=JEONJU2',
    platform: '고용24', sourcePostingId: 'JEONJU2', score: 40, category: '사무·운영',
    listingStatus: 'official_listed', listingLabel: '고용24 모집 확인', listingBasis: 'official_government_feed',
    listingEvidence: [{ type: 'official_government_listing', label: '정부 공식 채용정보 원문', url: 'https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=JEONJU2' }],
    marketScopes: ['domestic'], marketSegment: 'domestic',
    domesticRegion: { country: '대한민국', province: '전북특별자치도', city: '전주시', district: '완산구', neighborhood: '', locality: '전주시 완산구', label: '전북특별자치도 전주시 완산구', precision: 'district', evidenceLevel: 'source_structured' }
  })
];

async function useFeed(page, getFeed = () => feed(defaultJobs)) {
  await page.route('**/jobs.json*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(getFeed())
    });
  });
}

test('기본 추천이 렌더링되고 검토 우선순위로 표시된다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  await expect(page.locator('.job-card')).toHaveCount(3);
  await expect(page.locator('.score').first()).toContainText('검토 우선순위');
  await expect(page.locator('.eligibility-badge').first()).toContainText('한국에서 지원 가능');
});

test('국내 일반 지역 공고는 추천에서 제외하되 전체 시장 탐색에서는 유지한다', async ({ page }) => {
  const domesticRegion = {
    country: '대한민국', province: '전북특별자치도', city: '전주시', district: '덕진구', neighborhood: '',
    locality: '전주시', precision: 'district', evidenceLevel: 'source_structured'
  };
  const roleFit = job({
    id: 'job:domestic-role-fit', title: '자료입력 사무보조', company: '업무적합사',
    url: 'https://example.com/job/domestic-role-fit', location: '전북 전주시 덕진구', remote: false,
    workplaceMode: 'onsite', marketScopes: ['domestic'], marketSegment: 'domestic', domesticRegion,
    score: 48, roleFitEvidence: true, roleFitBasis: 'keyword_match', matchedKeywords: ['자료입력'], recommendationEligible: true
  });
  const generic = job({
    id: 'job:domestic-generic', title: '카페 매장 직원', company: '지역카페',
    url: 'https://example.com/job/domestic-generic', location: '전북 전주시 덕진구', remote: false,
    workplaceMode: 'onsite', marketScopes: ['domestic'], marketSegment: 'domestic', domesticRegion,
    score: 28, roleFitEvidence: false, roleFitBasis: 'none', matchedKeywords: [], recommendationEligible: false,
    decisionUnknowns: ['관심 업무와 직접 일치하는 근거 부족']
  });
  await useFeed(page, () => feed([roleFit, generic]));
  await page.goto('/');
  await page.locator('#marketDomestic').click();

  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.job-card .title')).toHaveText('자료입력 사무보조');
  await page.locator('#showAllActive').click();
  await expect(page.locator('.job-card')).toHaveCount(2);
  const genericCard = page.locator('.job-card', { hasText: '카페 매장 직원' });
  await expect(genericCard.locator('.score')).toContainText('시장 탐색 후보');
  await expect(genericCard.locator('.decision-unknown')).toContainText('관심 업무와 직접 일치하는 근거 부족');
});

test('시장 요약은 추천 필터 밖의 활성 공고와 주요 확인 필요 항목을 보여주고 전체 활성 공고 보기로 전환한다', async ({ page }) => {
  const priority = job({
    id: 'job:pulse-priority', title: '우선 검토 공고', url: 'https://example.com/job/pulse-priority', score: 70,
    decisionUnknowns: ['급여·단가']
  });
  const lowScore = job({
    id: 'job:pulse-low', title: '낮은 점수지만 활성인 공고', url: 'https://example.com/job/pulse-low',
    score: 10, recommendationEligible: false, salary: '',
    salaryInfo: { raw: '', display: '', currency: '', min: null, max: null, period: '', confidence: 'none' },
    decisionUnknowns: ['급여·단가']
  });
  await useFeed(page, () => feed([priority, lowScore]));
  await page.goto('/');

  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('#scopeCount')).toContainText('숨김 제외 활성 전체 2개');
  await expect(page.locator('#marketPulse')).toContainText('시장 한눈에 보기');
  await expect(page.locator('#marketPulse')).toContainText('최근 7일 신규');
  await expect(page.locator('#marketPulseNote')).toContainText('활성 공고 2개');
  const decisionGap = page.locator('.market-pulse-card').filter({ hasText: '가장 많은 확인 필요' });
  await expect(decisionGap).toContainText('2개');
  await expect(decisionGap).toContainText('급여·단가');
  await expect(page.locator('#showAllActive')).toBeVisible();
  await expect(page.locator('#showAllActive')).toHaveText('숨김 제외 활성 공고 보기');
  await expect(page.locator('#eligibility option[value="worldwide"]')).toHaveText('전 세계 지원 가능');

  await page.locator('#showAllActive').click();
  await expect(page.locator('#minScore')).toHaveValue('0');
  await expect(page.locator('.job-card')).toHaveCount(2);
  await expect(page.locator('#showAllActive')).toBeHidden();
});

test('시장 요약의 상위 회사는 단순 공고 수가 아니라 실제 추천 기준 충족 공고로 정한다', async ({ page }) => {
  const noisyCatalog = Array.from({ length: 4 }, (_, index) => job({
    id: `job:catalog-${index}`,
    title: `대량 수집 저우선 공고 ${index + 1}`,
    company: 'Catalog Heavy',
    url: `https://example.com/job/catalog-${index}`,
    score: 10,
    recommendationEligible: false
  }));
  const actionable = Array.from({ length: 2 }, (_, index) => job({
    id: `job:actionable-${index}`,
    title: `지원 후보 공고 ${index + 1}`,
    company: 'Ready Co',
    url: `https://example.com/job/actionable-${index}`,
    score: 70,
    recommendationEligible: true
  }));
  await useFeed(page, () => feed([...noisyCatalog, ...actionable]));
  await page.goto('/');

  const companyCard = page.locator('.market-pulse-card').filter({ hasText: '지원 후보 상위 회사' });
  await expect(companyCard).toContainText('Ready Co · 2개');
  await expect(companyCard).toContainText('활성 2개 중 추천 기준 충족 2개');
  await expect(companyCard).not.toContainText('Catalog Heavy');
});

test('활성 전체 수와 전체 보기 버튼은 개인 숨김 공고를 제외해 같은 범위를 사용한다', async ({ page }) => {
  const visible = job({ id: 'job:scope-visible', title: '표시할 활성 공고', url: 'https://example.com/job/scope-visible', score: 70 });
  const hidden = job({ id: 'job:scope-hidden', title: '숨긴 활성 공고', url: 'https://example.com/job/scope-hidden', score: 10, recommendationEligible: false });
  await page.addInitScript((hiddenId) => localStorage.setItem('jobHidden', JSON.stringify([hiddenId])), hidden.id);
  await useFeed(page, () => feed([visible, hidden]));
  await page.goto('/');

  await expect(page.locator('#scopeCount')).toContainText('숨김 제외 활성 전체 1개');
  await expect(page.locator('#marketPulseNote')).toContainText('활성 공고 2개');
  await expect(page.locator('.job-card')).toHaveCount(1);

  await page.locator('#showAllActive').click();
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('#showAllActive')).toBeHidden();
});

test('적용 조건을 결과 위에서 확인하고 개별 또는 전체 해제할 수 있다', async ({ page }) => {
  const priority = job({ id: 'job:filter-chip-priority', title: '우선 검토 공고', url: 'https://example.com/job/filter-chip-priority', score: 70 });
  const lowScore = job({
    id: 'job:filter-chip-low', title: '낮은 점수 활성 공고', url: 'https://example.com/job/filter-chip-low',
    score: 10, recommendationEligible: false
  });
  await useFeed(page, () => feed([priority, lowScore]));
  await page.goto('/');

  await expect(page.locator('#activeFilters')).toBeVisible();
  await expect(page.locator('#activeFilterChips')).toContainText('지원 범위: 한국 / 전 세계');
  await expect(page.locator('#activeFilterChips')).toContainText('최소 검토 우선순위: 추천 20+');
  await expect(page.locator('.job-card')).toHaveCount(1);

  await page.locator('[data-filter-id="minScore"]').click();
  await expect(page.locator('#minScore')).toHaveValue('0');
  await expect(page.locator('.job-card')).toHaveCount(2);
  await expect(page.locator('#activeFilterChips')).not.toContainText('최소 검토 우선순위');
  await expect(page.locator('#showAllActive')).toBeVisible();

  await page.locator('#clearActiveFilters').click();
  await expect(page.locator('#activeFilters')).toBeHidden();
  await expect(page.locator('#eligibility')).toHaveValue('');
  await expect(page.locator('#showAllActive')).toBeHidden();
});

test('기본 정렬은 같은 점수에서 오늘 판단하기 쉬운 공고를 먼저 보여준다', async ({ page }) => {
  const uncertain = job({
    id: 'job:sort-uncertain',
    title: 'Korean Reviewer - More Unknowns',
    url: 'https://example.com/job/sort-uncertain',
    postedAt: '2026-10-04T05:00:00.000Z',
    score: 90,
    sourceKind: 'job_board',
    sourceOfficiality: 'intermediary',
    sourceQualityTier: 'mixed',
    sourceReliabilityState: 'observed',
    listingStatus: 'current_feed',
    listingLabel: '집계·채용보드 현재 피드',
    eligibilityCode: 'worldwide',
    eligibility: 'Worldwide',
    requirementsStatus: 'routine_check',
    salary: '',
    salaryInfo: { raw: '', display: '', currency: '', min: null, max: null, period: '', confidence: 'none' },
    decisionUnknowns: ['고용주 공식 모집 상태', '급여·단가', '작업 장비 확인']
  });
  const ready = job({
    id: 'job:sort-ready',
    title: 'Korean Reviewer - Ready to Review',
    url: 'https://example.com/job/sort-ready',
    postedAt: '2026-09-20T05:00:00.000Z',
    score: 90,
    decisionUnknowns: []
  });
  await useFeed(page, () => feed([uncertain, ready]));
  await page.goto('/');

  await expect(page.locator('#sort option:checked')).toHaveText('오늘 먼저 볼 순');
  await expect(page.locator('.job-card .title').first()).toHaveText('Korean Reviewer - Ready to Review');

  await page.locator('#sort').selectOption('newest');
  await expect(page.locator('.job-card .title').first()).toHaveText('Korean Reviewer - More Unknowns');
});

test('기본은 해외·원격이고 국내 탭에서 시도→시군구와 산정동 기준 거리를 구분한다', async ({ page }) => {
  await useFeed(page, () => feed([...defaultJobs, ...domesticJobs]));
  await page.goto('/');

  await expect(page.locator('#marketOverseas')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.job-card').filter({ hasText: 'Korean Remote Evaluator - Seoul' })).toHaveCount(1);
  await expect(page.locator('.job-card').filter({ hasText: 'Korean AI Data Reviewer - Jeonju' })).toHaveCount(0);

  await page.locator('#marketDomestic').click();
  await expect(page.locator('#marketDomestic')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#sort')).toHaveValue('distance');
  await expect(page.locator('.job-card').first().locator('.title')).toHaveText('Korean AI Data Reviewer - Jeonju');
  await expect(page.locator('#distanceReference')).toContainText('산정동');
  await expect(page.locator('#distanceReference')).toContainText('직선거리');
  await expect(page.locator('#domesticProvince')).toContainText('전북특별자치도');
  await expect(page.locator('#domesticProvince')).toContainText('전남광주통합특별시');
  await expect(page.locator('#domesticProvince')).not.toContainText('전라남도');
  await page.locator('#domesticProvince').selectOption('전북특별자치도');
  await expect(page.locator('#domesticLocality')).toContainText('전주시 덕진구');
  await page.locator('#domesticLocality').selectOption('전주시 덕진구');

  await expect(page.locator('.job-card')).toHaveCount(1);
  const card = page.locator('.job-card').filter({ hasText: 'Korean AI Data Reviewer - Jeonju' });
  await expect(card.locator('.distance-value')).toContainText('지역 기준 직선거리 약 0km');
  await expect(card.locator('.distance-note')).toContainText('전북특별자치도 전주시 덕진구 산정동 기준');
  await expect(card.locator('.distance-note')).toContainText('실제 도로 이동거리 아님');
  await card.locator('.details').click();
  await expect(page.locator('#detailsDistanceValue')).toContainText('지역 기준 직선거리 약 0km');
});

test('국내 거리 근거가 부족하면 정밀 거리를 만들지 않고 글로벌 원격은 국내에서 제외한다', async ({ page }) => {
  await useFeed(page, () => feed(domesticJobs));
  await page.goto('/');
  await page.locator('#marketDomestic').click();

  const unknown = page.locator('.job-card').filter({ hasText: 'Korean Language AI Evaluator - Jeonju' });
  await expect(unknown.locator('.distance-value')).toHaveText('주소 부족으로 거리 계산 불가');
  await page.locator('#remote').selectOption('');
  await page.locator('#domesticProvince').selectOption('');
  await page.locator('#domesticLocality').selectOption('');
  const remote = page.locator('.job-card').filter({ hasText: 'Korean Remote Evaluator - Seoul' });
  await expect(remote).toHaveCount(0);
});

test('한국 대상 글로벌 원격은 국내에서 제외하고 국내 하이브리드는 거리 근거를 보여준다', async ({ page }) => {
  await useFeed(page, () => feed([appierRemoteJob, gangnamHybridJob]));
  await page.goto('/');
  await page.locator('#marketDomestic').click();
  await page.locator('#remote').selectOption('');
  await page.locator('#domesticProvince').selectOption('');
  await page.locator('#domesticLocality').selectOption('');

  const appier = page.locator('.job-card').filter({ hasText: 'AI Creative QC Reviewer' });
  await expect(appier).toHaveCount(0);

  const gangnam = page.locator('.job-card').filter({ hasText: 'Domestic Data Operations - Gangnam' });
  await expect(gangnam.locator('.distance-note')).toContainText('서울특별시 강남구 기준');
});

test('전주·완주 로컬 기본 탐색은 출근형을 거리순으로 보고 읍면동까지 좁힐 수 있다', async ({ page }) => {
  await useFeed(page, () => feed([...defaultJobs, ...work24LocalJobs, appierRemoteJob]));
  await page.goto('/');
  await page.locator('#marketDomestic').click();

  await expect(page.locator('#domesticProvince')).toHaveValue('전북특별자치도');
  await expect(page.locator('#domesticLocality')).toHaveValue('전주·완주');
  await expect(page.locator('#remote')).toHaveValue('local');
  await expect(page.locator('#minScore')).toHaveValue('20');
  await expect(page.locator('#sort')).toHaveValue('distance');
  await expect(page.locator('.job-card').filter({ hasText: 'AI Creative QC Reviewer' })).toHaveCount(0);

  const titles = await page.locator('.job-card .title').allTextContents();
  expect(titles.slice(0, 3)).toEqual(['일반 사무원', '운영지원 사무원', '자료입력 보조']);
  await expect(page.locator('.job-card').filter({ hasText: '자료입력 보조' }).locator('.distance-value')).toHaveText('주소 부족으로 거리 계산 불가');

  await page.locator('#domesticLocality').selectOption('완주군');
  await expect(page.locator('#domesticNeighborhood')).toContainText('봉동읍');
  await page.locator('#domesticNeighborhood').selectOption('봉동읍');
  await expect(page.locator('.job-card')).toHaveCount(1);
  const wanju = page.locator('.job-card').filter({ hasText: '운영지원 사무원' });
  await expect(wanju.locator('.distance-note')).toContainText('전북특별자치도 완주군 기준');
  await expect(wanju.locator('.posted')).toContainText('채용시까지');

  await wanju.locator('.details').click();
  await expect(page.locator('#detailsLink')).toHaveText('채용정보 제공사이트로 이동 ↗');
  await expect(page.locator('#work24Attribution')).toBeVisible();
  await expect(page.locator('#work24Attribution')).toContainText('정보출처: 고용24');
});

test('국내 거리 전체 보기에서는 글로벌 원격을 제외하고 국내 근무지만 거리순으로 정렬한다', async ({ page }) => {
  const imminentDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const nearRolling = job({
    ...work24LocalJobs[0],
    id: 'job:near-rolling-retail',
    title: '가까운 상시 매장 지원',
    score: 35,
    category: '일반·파트타임',
    deadlineType: 'rolling', deadlineDate: '', deadlineLabel: '상시채용',
    domesticRegion: { ...work24LocalJobs[0].domesticRegion, lat: 35.8500, lon: 127.1700 }
  });
  const fartherImminent = job({
    ...work24LocalJobs[0],
    id: 'job:farther-imminent-office',
    title: '조금 더 먼 마감임박 사무 지원',
    score: 35,
    category: '사무·운영',
    deadlineType: 'fixed', deadlineDate: imminentDate, deadlineLabel: imminentDate,
    domesticRegion: { ...work24LocalJobs[0].domesticRegion, lat: 35.8900, lon: 127.1600 }
  });
  await useFeed(page, () => feed([nearRolling, fartherImminent, work24LocalJobs[2], appierRemoteJob]));
  await page.goto('/');
  await page.locator('#marketDomestic').click();
  await page.locator('#remote').selectOption('');
  await page.locator('#domesticProvince').selectOption('');
  await page.locator('#domesticLocality').selectOption('');

  const titles = await page.locator('.job-card .title').allTextContents();
  expect(titles).toEqual(['조금 더 먼 마감임박 사무 지원', '가까운 상시 매장 지원', '자료입력 보조']);
  await expect(page.locator('.job-card').first().locator('.posted')).toContainText('마감 임박');
  await expect(page.locator('.job-card').filter({ hasText: 'AI Creative QC Reviewer' })).toHaveCount(0);
});

test('지역 중심점 거리는 보수적 밴드로 정렬하고 지원 판단 메타를 카드와 상세에 노출한다', async ({ page }) => {
  const coarse = job({
    ...work24LocalJobs[0],
    id: 'job:coarse-centroid',
    source: '잡코리아',
    title: '지역 중심점 기반 사무 지원',
    url: 'https://example.com/coarse-centroid',
    score: 40,
    workSchedule: '주5일 · 08:30~17:30',
    workPeriod: '24개월',
    preferredConditions: ['유사업무 경험 우대'],
    compensationNotes: ['식사 지원'],
    deadlineType: 'fixed',
    deadlineDate: '2099-12-31',
    deadlineLabel: '2099-12-31',
    deadlineCloseOnHire: true,
    domesticRegion: {
      ...work24LocalJobs[0].domesticRegion,
      lat: 35.8122,
      lon: 127.1197,
      coordinatePrecision: 'district',
      coordinateLabel: '전북특별자치도 전주시 완산구'
    }
  });
  const exact = job({
    ...coarse,
    id: 'job:exact-coordinate',
    title: '정확 좌표 기반 사무 지원',
    url: 'https://example.com/exact-coordinate',
    domesticRegion: {
      ...coarse.domesticRegion,
      coordinatePrecision: 'coordinates',
      coordinateLabel: '공고 위치'
    }
  });

  await useFeed(page, () => feed([coarse, exact]));
  await page.goto('/');
  await page.locator('#marketDomestic').click();

  const titles = await page.locator('.job-card .title').allTextContents();
  expect(titles).toEqual(['정확 좌표 기반 사무 지원', '지역 중심점 기반 사무 지원']);

  const coarseCard = page.locator('.job-card', { hasText: '지역 중심점 기반 사무 지원' });
  await expect(coarseCard.locator('.distance-note')).toContainText('지역 중심점은 거리 구간을 보수적으로 판정');
  await expect(coarseCard.locator('.meta')).toContainText('근무 주5일 · 08:30~17:30');
  await expect(coarseCard.locator('.meta')).toContainText('기간 24개월');
  await expect(coarseCard.locator('.meta')).toContainText('우대 유사업무 경험 우대');
  await expect(coarseCard.locator('.compensation-note')).toContainText('식사 지원');
  await expect(coarseCard.locator('.posted')).toContainText('채용 시 조기마감 가능');

  await coarseCard.locator('.details').click();
  await expect(page.locator('#detailsMeta')).toContainText('근무 주5일 · 08:30~17:30');
  await expect(page.locator('#detailsMeta')).toContainText('기간 24개월');
  await expect(page.locator('#detailsMeta')).toContainText('우대 유사업무 경험 우대');
  await expect(page.locator('#detailsCompensationNote')).toContainText('식사 지원');
});

test('국내·해외 탭의 검색과 지역 필터는 서로 독립적으로 reload 후 유지된다', async ({ page }) => {
  await useFeed(page, () => feed([...defaultJobs, ...domesticJobs]));
  await page.goto('/');
  await page.locator('#query').fill('Reviewer');
  await page.locator('#marketDomestic').click();
  await page.locator('#domesticProvince').selectOption('전북특별자치도');
  await page.locator('#domesticLocality').selectOption('전주시 덕진구');
  await page.locator('#domesticNeighborhood').selectOption('산정동');
  await page.locator('#query').fill('Jeonju');

  await page.locator('#marketOverseas').click();
  await expect(page.locator('#query')).toHaveValue('Reviewer');
  await page.locator('#marketDomestic').click();
  await expect(page.locator('#query')).toHaveValue('Jeonju');
  await expect(page.locator('#domesticProvince')).toHaveValue('전북특별자치도');
  await expect(page.locator('#domesticLocality')).toHaveValue('전주시 덕진구');
  await expect(page.locator('#domesticNeighborhood')).toHaveValue('산정동');

  await page.reload();
  await expect(page.locator('#marketDomestic')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#query')).toHaveValue('Jeonju');
  await expect(page.locator('#domesticProvince')).toHaveValue('전북특별자치도');
  await expect(page.locator('#domesticLocality')).toHaveValue('전주시 덕진구');
  await expect(page.locator('#domesticNeighborhood')).toHaveValue('산정동');
});

test('선택한 국내 지역 공고가 다음 피드에서 0건이 되어도 필터를 보존하고 명확히 안내한다', async ({ page }) => {
  let current = feed([...defaultJobs, ...domesticJobs]);
  await useFeed(page, () => current);
  await page.goto('/');
  await page.locator('#marketDomestic').click();
  await page.locator('#domesticProvince').selectOption('전북특별자치도');
  await page.locator('#domesticLocality').selectOption('전주시 덕진구');
  await expect(page.locator('.job-card')).toHaveCount(1);

  current = feed([...defaultJobs, domesticJobs[2], appierRemoteJob]);
  await page.reload();
  await expect(page.locator('#marketDomestic')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#domesticProvince')).toHaveValue('전북특별자치도');
  await expect(page.locator('#domesticLocality')).toHaveValue('전주시 덕진구');
  await expect(page.locator('.job-card')).toHaveCount(0);
  await expect(page.locator('#emptyMessage')).toContainText('전북특별자치도 전주시 덕진구');
  await expect(page.locator('#emptyMessage')).toContainText('확인하지 못했습니다');
});

test('2026 행정구역 변경 전 저장한 광주·전남 필터는 통합특별시로 마이그레이션된다', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('jobMarketTab', 'domestic');
    localStorage.setItem('jobFilterSchemaVersion', '6');
    localStorage.setItem('jobFiltersByMarket', JSON.stringify({
      domestic: { domesticProvince: '전라남도', domesticLocality: '' }
    }));
  });
  await useFeed(page, () => feed([...defaultJobs, ...domesticJobs]));
  await page.goto('/');
  await expect(page.locator('#marketDomestic')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#domesticProvince')).toHaveValue('전남광주통합특별시');
  await expect(page.locator('#domesticProvince')).not.toContainText('전라남도');
});

for (const legacySort of ['score', 'distance']) {
  test(`v7 국내 과거 기본값(${legacySort})은 새 전주·완주 기본값으로 한 번만 마이그레이션된다`, async ({ page }) => {
    const legacyFilters = legacyDomesticFilterDefaults(legacySort);
    await page.addInitScript(({ filters }) => {
      localStorage.setItem('jobMarketTab', 'domestic');
      localStorage.setItem('jobFilterSchemaVersion', '7');
      localStorage.setItem('jobFiltersByMarket', JSON.stringify({ domestic: filters }));
    }, { filters: legacyFilters });
    await useFeed(page, () => feed([...defaultJobs, ...domesticJobs, ...work24LocalJobs]));
    await page.goto('/');

    await expect(page.locator('#remote')).toHaveValue('local');
    await expect(page.locator('#domesticProvince')).toHaveValue('전북특별자치도');
    await expect(page.locator('#domesticLocality')).toHaveValue('전주·완주');
    await expect(page.locator('#sort')).toHaveValue('distance');
    const migrated = await page.evaluate(() => ({
      version: localStorage.getItem('jobFilterSchemaVersion'),
      domestic: JSON.parse(localStorage.getItem('jobFiltersByMarket') || '{}').domestic
    }));
    expect(migrated.version).toBe('8');
    expect(migrated.domestic).toMatchObject({
      remote: 'local',
      domesticProvince: '전북특별자치도',
      domesticLocality: '전주·완주',
      domesticNeighborhood: '',
      sort: 'distance'
    });

    await page.reload();
    await expect(page.locator('#remote')).toHaveValue('local');
    await expect(page.locator('#domesticProvince')).toHaveValue('전북특별자치도');
    await expect(page.locator('#domesticLocality')).toHaveValue('전주·완주');
  });
}

for (const legacySort of ['score', 'distance']) {
  test(`v7 재직렬화 국내 과거 기본값(${legacySort})도 새 기본값으로 마이그레이션된다`, async ({ page }) => {
    const legacyFilters = reserializedLegacyDomesticFilterDefaults(legacySort);
    await page.addInitScript(({ filters }) => {
      localStorage.setItem('jobMarketTab', 'domestic');
      localStorage.setItem('jobFilterSchemaVersion', '7');
      localStorage.setItem('jobFiltersByMarket', JSON.stringify({ domestic: filters }));
    }, { filters: legacyFilters });
    await useFeed(page, () => feed([...defaultJobs, ...domesticJobs, ...work24LocalJobs]));
    await page.goto('/');

    await expect(page.locator('#remote')).toHaveValue('local');
    await expect(page.locator('#domesticProvince')).toHaveValue('전북특별자치도');
    await expect(page.locator('#domesticLocality')).toHaveValue('전주·완주');
    await expect(page.locator('#sort')).toHaveValue('distance');
  });
}

test('v7 국내 필터가 과거 기본값과 조금이라도 다르면 사용자 설정을 보존한다', async ({ page }) => {
  const customFilters = { ...legacyDomesticFilterDefaults('distance'), query: 'Jeonju' };
  await page.addInitScript(({ filters }) => {
    localStorage.setItem('jobMarketTab', 'domestic');
    localStorage.setItem('jobFilterSchemaVersion', '7');
    localStorage.setItem('jobFiltersByMarket', JSON.stringify({ domestic: filters }));
  }, { filters: customFilters });
  await useFeed(page, () => feed([...defaultJobs, ...domesticJobs]));
  await page.goto('/');

  await expect(page.locator('#query')).toHaveValue('Jeonju');
  await expect(page.locator('#remote')).toHaveValue('');
  await expect(page.locator('#domesticProvince')).toHaveValue('');
  await expect(page.locator('#domesticLocality')).toHaveValue('');
  await expect(page.locator('#sort')).toHaveValue('distance');
  const stored = await page.evaluate(() => ({
    version: localStorage.getItem('jobFilterSchemaVersion'),
    domestic: JSON.parse(localStorage.getItem('jobFiltersByMarket') || '{}').domestic
  }));
  expect(stored.version).toBe('8');
  expect(stored.domestic).toEqual(customFilters);
});

test('구형 백업의 정확한 국내 기본값도 import 시 같은 v8 마이그레이션을 적용한다', async ({ page }) => {
  await useFeed(page, () => feed([...defaultJobs, ...domesticJobs, ...work24LocalJobs]));
  await page.goto('/');
  const legacyBackup = {
    schema: 'job-search-radar-state',
    version: 2,
    marketTab: 'domestic',
    favorites: [],
    jobStates: {},
    hiddenIds: [],
    reviewedIds: [],
    newIds: [],
    manualJobs: [],
    trackedJobs: {},
    knownJobIds: [],
    filtersByMarket: {
      domestic: legacyDomesticFilterDefaults('score')
    }
  };
  await page.locator('#importStateFile').setInputFiles({
    name: 'legacy-filter-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacyBackup))
  });
  await expect(page.locator('#toastText')).toContainText('백업 상태를 현재 데이터에 병합했습니다');
  await expect(page.locator('#marketDomestic')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#remote')).toHaveValue('local');
  await expect(page.locator('#domesticProvince')).toHaveValue('전북특별자치도');
  await expect(page.locator('#domesticLocality')).toHaveValue('전주·완주');
  await expect(page.locator('#sort')).toHaveValue('distance');
});

test('구형 백업의 재직렬화된 국내 기본값도 import 시 같은 v8 마이그레이션을 적용한다', async ({ page }) => {
  await useFeed(page, () => feed([...defaultJobs, ...domesticJobs, ...work24LocalJobs]));
  await page.goto('/');
  const legacyBackup = {
    schema: 'job-search-radar-state',
    version: 2,
    marketTab: 'domestic',
    favorites: [],
    jobStates: {},
    hiddenIds: [],
    reviewedIds: [],
    newIds: [],
    manualJobs: [],
    trackedJobs: {},
    knownJobIds: [],
    filtersByMarket: {
      domestic: reserializedLegacyDomesticFilterDefaults('distance')
    }
  };
  await page.locator('#importStateFile').setInputFiles({
    name: 'legacy-reserialized-filter-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacyBackup))
  });
  await expect(page.locator('#toastText')).toContainText('백업 상태를 현재 데이터에 병합했습니다');
  await expect(page.locator('#remote')).toHaveValue('local');
  await expect(page.locator('#domesticProvince')).toHaveValue('전북특별자치도');
  await expect(page.locator('#domesticLocality')).toHaveValue('전주·완주');
  await expect(page.locator('#sort')).toHaveValue('distance');
});

test('구형 국내 필터의 null 값은 exact 기본값으로 간주하지 않는다', async ({ page }) => {
  const customFilters = { ...legacyDomesticFilterDefaults('distance'), query: null };
  await page.addInitScript(({ filters }) => {
    localStorage.setItem('jobMarketTab', 'domestic');
    localStorage.setItem('jobFilterSchemaVersion', '7');
    localStorage.setItem('jobFiltersByMarket', JSON.stringify({ domestic: filters }));
  }, { filters: customFilters });
  await useFeed(page, () => feed([...defaultJobs, ...domesticJobs]));
  await page.goto('/');

  const stored = await page.evaluate(() => ({
    version: localStorage.getItem('jobFilterSchemaVersion'),
    domestic: JSON.parse(localStorage.getItem('jobFiltersByMarket') || '{}').domestic
  }));
  expect(stored.version).toBe('8');
  expect(stored.domestic.query).toBeNull();
  expect(stored.domestic.remote).toBe('');
  expect(stored.domestic.domesticProvince).toBe('');
  expect(stored.domestic.domesticLocality).toBe('');
});

test('구형 백업의 사용자 수정 국내 필터는 import 시 그대로 보존한다', async ({ page }) => {
  await useFeed(page, () => feed([...defaultJobs, ...domesticJobs]));
  await page.goto('/');
  const customFilters = { ...legacyDomesticFilterDefaults('distance'), query: 'Jeonju' };
  const legacyBackup = {
    schema: 'job-search-radar-state',
    version: 2,
    marketTab: 'domestic',
    favorites: [],
    jobStates: {},
    hiddenIds: [],
    reviewedIds: [],
    newIds: [],
    manualJobs: [],
    trackedJobs: {},
    knownJobIds: [],
    filtersByMarket: { domestic: customFilters }
  };
  await page.locator('#importStateFile').setInputFiles({
    name: 'legacy-custom-filter-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacyBackup))
  });
  await expect(page.locator('#toastText')).toContainText('백업 상태를 현재 데이터에 병합했습니다');
  await expect(page.locator('#query')).toHaveValue('Jeonju');
  await expect(page.locator('#remote')).toHaveValue('');
  await expect(page.locator('#domesticProvince')).toHaveValue('');
  await expect(page.locator('#domesticLocality')).toHaveValue('');
  await expect(page.locator('#sort')).toHaveValue('distance');
});

test('국내 통계와 동적 옵션은 실제 활성 필터 결과와 같은 공고 집합을 사용한다', async ({ page }) => {
  await useFeed(page, () => feed([domesticJobs[0], domesticJobs[1], gangnamHybridJob, appierRemoteJob]));
  await page.goto('/');
  await page.locator('#marketDomestic').click();

  await expect(page.locator('.job-card')).toHaveCount(2);
  await expect(page.locator('#resultCount')).toHaveText('2개 공고');
  await expect(page.locator('#stats .stat').filter({ hasText: '추천 공고' }).locator('strong')).toHaveText('2개');
  await expect(page.locator('#source')).not.toContainText('Appier');

  await page.locator('#domesticProvince').selectOption('서울특별시');
  await expect(page.locator('#domesticLocality')).toContainText('강남구');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.title')).toHaveText('Domestic Data Operations - Gangnam');
  await expect(page.locator('#resultCount')).toHaveText('1개 공고');
  await expect(page.locator('#stats .stat').filter({ hasText: '추천 공고' }).locator('strong')).toHaveText('1개');
  await expect(page.locator('#source')).toContainText('Channel Corp');
  await expect(page.locator('#source')).not.toContainText('Appier');

  await page.locator('#query').fill('존재하지 않는 검색어');
  await expect(page.locator('.job-card')).toHaveCount(0);
  await expect(page.locator('#resultCount')).toHaveText('0개 공고');
  await expect(page.locator('#stats .stat').filter({ hasText: '추천 공고' }).locator('strong')).toHaveText('0개');
});

test('상태와 동적 소스 필터가 reload 후 유지된다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  await page.selectOption('#source', 'OneForma');
  await page.locator('.job-card').first().locator('.favorite').click();
  await page.reload();
  await expect(page.locator('#source')).toHaveValue('OneForma');
  await page.selectOption('#statusFilter', 'saved');
  await expect(page.locator('.job-card')).toHaveCount(1);
});

test('관심·지원 상태·숨김은 내용 확인으로 간주하지 않고 상세 확인만 미확인에서 제외한다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  const targetTitle = 'AI Data Specialist - Korean';
  const target = () => page.locator('.job-card').filter({ hasText: targetTitle });

  await target().locator('.favorite').click();
  await target().locator('.job-state').selectOption('planned');
  await target().locator('.dismiss').click();
  await page.selectOption('#statusFilter', 'unreviewed');
  await expect(target()).toHaveCount(1);

  await target().locator('.dismiss').click();
  await target().locator('.details').click();
  await page.locator('#closeDetails').click();
  await expect(target()).toHaveCount(0);

  await page.reload();
  await expect(page.locator('#statusFilter')).toHaveValue('unreviewed');
  await expect(target()).toHaveCount(0);
});

test('카드 상태 변경과 상세 닫기 뒤에도 키보드 포커스가 작업 위치를 유지한다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');

  const targetTitle = await page.locator('.job-card').first().locator('.title').textContent();
  const targetCard = () => page.locator('.job-card').filter({ hasText: targetTitle || '' });
  await targetCard().locator('.favorite').click();
  await expect(targetCard().locator('.favorite')).toBeFocused();

  await targetCard().locator('.job-state').focus();
  await targetCard().locator('.job-state').selectOption('planned');
  await expect(targetCard().locator('.job-state')).toBeFocused();

  await targetCard().locator('.dismiss').click();
  const focusedAfterHide = await page.evaluate(() => ({
    className: document.activeElement?.className || '',
    jobId: document.activeElement?.closest?.('.job-card')?.dataset?.jobId || ''
  }));
  expect(focusedAfterHide.className).toContain('dismiss');
  expect(focusedAfterHide.jobId).not.toBe('');
  const nextCard = page.locator(`.job-card[data-job-id="${focusedAfterHide.jobId}"]`);

  await nextCard.locator('.details').click();
  await expect(page.locator('#detailsDialog')).toBeVisible();
  await page.locator('#closeDetails').click();
  await expect(nextCard.locator('.details')).toBeFocused();
});

test('일괄 관심은 미확인 상태를 유지하고 내용 확인함만 확인 상태를 바꾼다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  await page.locator('#selectVisible').check();
  await page.locator('#batchFavorite').click();
  await page.selectOption('#statusFilter', 'unreviewed');
  await expect(page.locator('.job-card')).toHaveCount(3);

  await page.locator('#selectVisible').check();
  await page.locator('#batchReviewed').click();
  await expect(page.locator('.job-card')).toHaveCount(0);
});

test('batch hide를 한 번에 되돌릴 수 있다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  await page.locator('#selectVisible').check();
  await page.locator('#batchHide').click();
  await expect(page.locator('.job-card')).toHaveCount(0);
  await expect(page.locator('#toastText')).toContainText('3개 공고를 숨겼습니다');
  await page.locator('#undoHide').click();
  await expect(page.locator('.job-card')).toHaveCount(3);
});

test('숨김 undo는 NEW·미검토 상태도 원래대로 복구한다', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('knownJobIds', JSON.stringify(['job:default', 'job:oneforma']));
  });
  await useFeed(page);
  await page.goto('/');
  await page.selectOption('#statusFilter', 'new');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.title')).toHaveText('Korean Content Reviewer');
  await page.locator('.dismiss').click();
  await expect(page.locator('.job-card')).toHaveCount(0);
  await page.locator('#undoHide').click();
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.title')).toHaveText('Korean Content Reviewer');
  await page.selectOption('#statusFilter', 'unreviewed');
  await expect(page.locator('.job-card').filter({ hasText: 'Korean Content Reviewer' })).toHaveCount(1);
});

test('지원 상태는 숨김과 복구 뒤에도 보존된다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  const target = () => page.locator('.job-card').filter({ hasText: 'AI Data Specialist - Korean' });
  await target().locator('.job-state').selectOption('applied');
  await target().locator('.dismiss').click();
  await page.selectOption('#statusFilter', 'hidden');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.job-state')).toHaveValue('applied');
  await page.locator('.dismiss').click();
  await page.selectOption('#statusFilter', 'applied');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.title')).toHaveText('AI Data Specialist - Korean');
});

test('관심 공고가 피드에서 사라져도 archived snapshot으로 남는다', async ({ page }) => {
  let current = feed(defaultJobs);
  await useFeed(page, () => current);
  await page.goto('/');
  const first = page.locator('.job-card').first();
  await first.locator('.favorite').click();
  current = feed(defaultJobs.slice(1));
  await page.reload();
  await page.selectOption('#statusFilter', 'saved');
  await page.selectOption('#listingFilter', 'all');
  await page.selectOption('#minScore', '0');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.title')).toHaveText('AI Data Specialist - Korean');
  await expect(page.locator('.listing-badge')).toHaveText('현재 피드에서 사라짐');
});

test('상세 이전/다음과 근거 패널이 현재 필터 큐를 따른다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  await page.locator('.job-card').first().locator('.details').click();
  await expect(page.locator('#detailsDialog')).toBeVisible();
  await expect(page.locator('#detailsTitle')).toHaveText('AI Data Specialist - Korean');
  await expect(page.locator('#detailsListingReason')).toContainText('공식 채용 페이지');
  await expect(page.locator('#detailsEligibilityReason')).toContainText('한국');
  await expect(page.locator('#detailsFitReasons')).toContainText('합격 가능성이 아니라 검토 우선순위');
  await page.locator('#nextDetails').click();
  await expect(page.locator('#detailsTitle')).toHaveText('Multilingual AI Quality Assurance Reviewer');
  await page.locator('#prevDetails').click();
  await expect(page.locator('#detailsTitle')).toHaveText('AI Data Specialist - Korean');
});

test('390px viewport에서 가로 overflow가 없다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useFeed(page, () => feed([...defaultJobs, ...domesticJobs]));
  await page.goto('/');
  expect(await page.locator('#advancedFilters').evaluate((element) => element.open)).toBe(false);
  await expect(page.locator('#advancedFiltersSummary')).toContainText('현재 조건 2개');
  const widths = await page.evaluate(() => ({
    inner: window.innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    firstCardY: document.querySelector('.job-card')?.getBoundingClientRect().top || 0,
    selectHitWidth: document.querySelector('.job-select-hit')?.getBoundingClientRect().width || 0,
    selectHitHeight: document.querySelector('.job-select-hit')?.getBoundingClientRect().height || 0
  }));
  expect(widths.html).toBeLessThanOrEqual(widths.inner);
  expect(widths.body).toBeLessThanOrEqual(widths.inner);
  expect(widths.firstCardY).toBeLessThan(1100);
  expect(widths.selectHitWidth).toBeGreaterThanOrEqual(43);
  expect(widths.selectHitHeight).toBeGreaterThanOrEqual(43);
  await expect(page.locator('.job-card')).toHaveCount(4);
  await page.locator('#marketPulseToggle').click();
  await expect(page.locator('.market-pulse-card small').first()).toBeVisible();
  await expect(page.locator('#marketPulseNote')).toBeVisible();
  const expandedMarketWidths = await page.evaluate(() => ({ inner: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(expandedMarketWidths.html).toBeLessThanOrEqual(expandedMarketWidths.inner);
  expect(expandedMarketWidths.body).toBeLessThanOrEqual(expandedMarketWidths.inner);
  await page.locator('#marketDomestic').click();
  const domesticWidths = await page.evaluate(() => ({ inner: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(domesticWidths.html).toBeLessThanOrEqual(domesticWidths.inner);
  expect(domesticWidths.body).toBeLessThanOrEqual(domesticWidths.inner);
  await expect(page.locator('#distanceReference')).toContainText('직선거리');
});

test('1440px 실제 브라우저에서 overflow·console 오류·이름 없는 주요 컨트롤이 없다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const browserErrors = [];
  const failedResponses = [];
  page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push({ url: response.url(), status: response.status() });
  });
  await useFeed(page, () => feed([...defaultJobs, ...domesticJobs]));
  await page.goto('/');
  await page.locator('#marketDomestic').click();

  const audit = await page.evaluate(() => {
    const interactive = [...document.querySelectorAll('button, a[href], input, select, textarea')]
      .filter((element) => !element.hidden && !element.closest('[hidden]'));
    const unnamed = interactive.filter((element) => {
      const id = element.id;
      const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : '';
      const wrappingLabel = element.closest('label')?.textContent || '';
      const labelledBy = (element.getAttribute('aria-labelledby') || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((labelId) => document.getElementById(labelId)?.textContent || '')
        .join(' ');
      const name = (
        element.getAttribute('aria-label')
        || element.getAttribute('title')
        || label
        || wrappingLabel
        || labelledBy
        || element.textContent
        || element.getAttribute('value')
        || ''
      ).trim();
      return !name;
    }).map((element) => `${element.tagName.toLowerCase()}#${element.id || ''}`);
    const navigation = performance.getEntriesByType('navigation')[0];
    return {
      inner: window.innerWidth,
      html: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      unnamed,
      resourceCount: performance.getEntriesByType('resource').length,
      domContentLoaded: navigation ? navigation.domContentLoadedEventEnd : 0
    };
  });

  expect(audit.html).toBeLessThanOrEqual(audit.inner);
  expect(audit.body).toBeLessThanOrEqual(audit.inner);
  expect(audit.unnamed).toEqual([]);
  expect(audit.resourceCount).toBeLessThan(20);
  expect(audit.domContentLoaded).toBeGreaterThan(0);
  const unexpectedResponses = failedResponses.filter(({ url, status }) => !(status === 404 && /\/api\/jobs(?:$|\?)/.test(url)));
  const hasExpectedStaticApiFallback = failedResponses.some(({ url, status }) => status === 404 && /\/api\/jobs(?:$|\?)/.test(url));
  const unexpectedBrowserErrors = browserErrors.filter((message) => !(
    hasExpectedStaticApiFallback
    && /Failed to load resource: the server responded with a status of 404 \(Not Found\)/.test(message)
  ));
  expect(unexpectedResponses).toEqual([]);
  expect(unexpectedBrowserErrors).toEqual([]);
});

test('빈 결과와 로드 오류에서 복구할 수 있다', async ({ page }) => {
  let mode = 'error';
  await page.route('**/api/jobs', async (route) => {
    if (mode === 'error') await route.fulfill({ status: 500, body: 'error' });
    else await route.fulfill({ status: 404, body: 'fallback' });
  });
  await page.route('**/jobs.json*', async (route) => {
    if (mode === 'error') await route.fulfill({ status: 500, body: 'error' });
    else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(feed(defaultJobs)) });
  });
  await page.goto('/');
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#emptyMessage')).toContainText('공고를 불러오지 못했습니다');
  mode = 'ok';
  await page.locator('#retryLoad').click();
  await expect(page.locator('.job-card')).toHaveCount(3);
  await page.fill('#query', '존재하지 않는 검색어');
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#emptyMessage')).toContainText('현재 필터에 맞는 공고가 없습니다');
});

test('새로고침 실패 시 기존 공고를 유지하면서 상단에서 오래된 결과임을 경고한다', async ({ page }) => {
  let failRefresh = false;
  await page.route('**/api/refresh', async (route) => route.fulfill({ status: 500, body: 'refresh failed' }));
  await page.route('**/api/jobs', async (route) => route.fulfill({ status: 500, body: 'api failed' }));
  await page.route('**/jobs.json*', async (route) => {
    if (failRefresh) await route.fulfill({ status: 500, body: 'feed failed' });
    else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(feed(defaultJobs)) });
  });
  await page.goto('/');
  await expect(page.locator('.job-card')).toHaveCount(3);
  failRefresh = true;

  await page.locator('#refreshBtn').click();
  await expect(page.locator('#loadErrorBanner')).toBeVisible();
  await expect(page.locator('#loadErrorText')).toContainText('마지막으로 성공한 수집 결과를 유지');
  await expect(page.locator('.job-card')).toHaveCount(3);
  await expect(page.locator('#empty')).toBeHidden();
});

test('상태 백업/가져오기는 지원함 상태와 필터를 복원한다', async ({ page }) => {
  await useFeed(page, () => feed([...defaultJobs, ...domesticJobs]));
  await page.goto('/');
  const target = page.locator('.job-card').filter({ hasText: 'AI Data Specialist - Korean' });
  await target.locator('.job-state').selectOption('applied');
  await page.selectOption('#source', 'RWS TrainAI');
  await page.locator('#marketDomestic').click();
  await page.selectOption('#domesticProvince', '전북특별자치도');
  await page.selectOption('#domesticLocality', '전주시 덕진구');
  await page.selectOption('#domesticNeighborhood', '산정동');
  await page.fill('#query', 'Jeonju');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportStateBtn').click()
  ]);
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#source')).toHaveValue('');
  await page.locator('#importStateFile').setInputFiles(backupPath);
  await expect(page.locator('#toastText')).toContainText('백업 상태를 현재 데이터에 병합했습니다');
  await expect(page.locator('#marketDomestic')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#query')).toHaveValue('Jeonju');
  await expect(page.locator('#domesticProvince')).toHaveValue('전북특별자치도');
  await expect(page.locator('#domesticLocality')).toHaveValue('전주시 덕진구');
  await expect(page.locator('#domesticNeighborhood')).toHaveValue('산정동');
  await expect(page.locator('#sort')).toHaveValue('distance');
  await page.locator('#marketOverseas').click();
  await expect(page.locator('#source')).toHaveValue('RWS TrainAI');
  await page.selectOption('#statusFilter', 'applied');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.title')).toHaveText('AI Data Specialist - Korean');
});

test('LinkedIn Job Alert parser JSON을 기존 가져오기 동선으로 중복 없이 병합한다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  const alertPayload = [{
    id: 'linkedin-alert:1234567890',
    linkedinJobId: '1234567890',
    source: 'LinkedIn Job Alert',
    title: 'Korean AI Content Reviewer',
    company: 'Alert Example',
    location: 'Seoul, South Korea (Remote)',
    remote: true,
    workplace: 'remote',
    url: 'https://www.linkedin.com/jobs/view/1234567890/',
    alertReceivedAt: '2026-10-10T01:00:00.000Z'
  }];
  const file = {
    name: 'linkedin-alert.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(alertPayload))
  };

  await page.locator('#importStateFile').setInputFiles(file);
  await expect(page.locator('#toastText')).toContainText('LinkedIn 알림 공고 1개');
  await expect(page.locator('.job-card', { hasText: 'Korean AI Content Reviewer' })).toBeVisible();
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('manualJobs') || '[]'));
  expect(saved.filter((item) => item.id === 'linkedin-alert:1234567890')).toHaveLength(1);
  expect(saved.find((item) => item.id === 'linkedin-alert:1234567890').postedAt).toBe('');
  expect(saved.find((item) => item.id === 'linkedin-alert:1234567890').recommendationEligible).toBe(false);

  await page.locator('#importStateFile').setInputFiles(file);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('manualJobs') || '[]'));
  expect(saved.filter((item) => item.id === 'linkedin-alert:1234567890')).toHaveLength(1);
});

test('collector 병합으로 ID가 바뀌어도 legacyIds가 관심·지원·숨김 상태를 새 ID로 승계한다', async ({ page }) => {
  const planned = job({
    id: 'job:merged-local-planned',
    title: '완주 현장 사무 운영 지원',
    legacyIds: ['job:old-local-planned', '알바몬:117809753'],
    sources: ['알바몬', '알바천국']
  });
  const applied = job({
    id: 'job:merged-local-applied',
    title: '전주 고객센터 운영 지원',
    legacyIds: ['job:old-local-applied', '잡코리아:50071517'],
    sources: ['잡코리아']
  });
  await useFeed(page, () => feed([planned, applied]));
  await page.addInitScript(() => {
    localStorage.setItem('jobFavorites', JSON.stringify(['job:old-local-planned']));
    localStorage.setItem('jobHidden', JSON.stringify(['job:old-local-planned']));
    localStorage.setItem('jobStates', JSON.stringify({ 'job:old-local-planned': 'planned', 'job:old-local-applied': 'applied' }));
    localStorage.setItem('reviewedJobIds', JSON.stringify(['job:old-local-planned']));
    localStorage.setItem('knownJobIds', JSON.stringify(['job:old-local-planned', 'job:old-local-applied']));
    localStorage.setItem('trackedJobs', JSON.stringify({
      'job:old-local-planned': { id: 'job:old-local-planned', title: 'old planned snapshot' },
      'job:old-local-applied': { id: 'job:old-local-applied', title: 'old applied snapshot' }
    }));
  });
  await page.goto('/');
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('jobFavorites') || '[]')))
    .toContain('job:merged-local-planned');

  const migrated = await page.evaluate(() => ({
    favorites: JSON.parse(localStorage.getItem('jobFavorites') || '[]'),
    hidden: JSON.parse(localStorage.getItem('jobHidden') || '[]'),
    states: JSON.parse(localStorage.getItem('jobStates') || '{}'),
    reviewed: JSON.parse(localStorage.getItem('reviewedJobIds') || '[]'),
    known: JSON.parse(localStorage.getItem('knownJobIds') || '[]'),
    tracked: JSON.parse(localStorage.getItem('trackedJobs') || '{}')
  }));
  expect(migrated.favorites).toContain('job:merged-local-planned');
  expect(migrated.hidden).toContain('job:merged-local-planned');
  expect(migrated.states['job:merged-local-planned']).toBe('planned');
  expect(migrated.states['job:merged-local-applied']).toBe('applied');
  expect(migrated.reviewed).toContain('job:merged-local-planned');
  expect(migrated.known).toEqual(expect.arrayContaining(['job:merged-local-planned', 'job:merged-local-applied']));
  expect(migrated.tracked['job:merged-local-planned']).toBeTruthy();
  expect(migrated.tracked['job:merged-local-applied']).toBeTruthy();
  expect(migrated.favorites).not.toContain('job:old-local-planned');
  expect(migrated.states['job:old-local-planned']).toBeUndefined();
  expect(migrated.states['job:old-local-applied']).toBeUndefined();
});

test('지원 가치·미확인·필수요건 상태를 카드와 상세에서 빠르게 확인한다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  const rws = page.locator('.job-card').filter({ hasText: 'AI Data Specialist - Korean' });
  await expect(rws.locator('.decision-value')).toContainText('공식 채용 페이지 모집 확인');
  await expect(rws.locator('.decision-unknown')).toContainText('지급 평판');
  await expect(rws.locator('.requirements-badge')).toHaveAttribute('data-state', 'clear');

  await page.selectOption('#requirementsFilter', 'routine_check');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.title')).toHaveText('Multilingual AI Quality Assurance Reviewer');
  await page.locator('.details').click();
  await expect(page.locator('#detailsDecisionValue')).toContainText('공식 프로젝트 게시 확인');
  await expect(page.locator('#detailsDecisionUnknown')).toContainText('실제 작업량');
  await expect(page.locator('#detailsFitWarnings')).toContainText('작업 장비');
});

test('내 상태와 검증 필터는 서로 독립적으로 교집합 적용된다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  await page.locator('.job-card').filter({ hasText: 'AI Data Specialist - Korean' }).locator('.favorite').click();
  await page.locator('.job-card').filter({ hasText: 'Korean Content Reviewer' }).locator('.favorite').click();
  await page.selectOption('#statusFilter', 'saved');
  await expect(page.locator('.job-card')).toHaveCount(2);
  await page.selectOption('#listingFilter', 'verified_open');
  await page.selectOption('#sourceKindFilter', 'official_ats');
  await page.selectOption('#eligibility', 'korea');
  await page.selectOption('#requirementsFilter', 'clear');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.title')).toHaveText('AI Data Specialist - Korean');
});

test('공식 ATS와 공식 플랫폼 게시를 구분하고 지급 근거 만료를 필터링한다', async ({ page }) => {
  const expired = job({
    id: 'job:expired-evidence',
    title: 'Korean AI Reviewer - Evidence Expired',
    url: 'https://example.com/job/expired-evidence',
    paymentEvidenceState: 'evidence_expired',
    paymentEvidenceLabel: '근거 만료·재검토 필요',
    paymentEvidenceFreshness: 'expired',
    paymentEvidenceNextReviewAt: '',
    paymentSignals: [{ type: 'review_aggregate', direction: 'caution', recurrence: 'repeated', checkedAt: '2026-10-04', latestSourceAt: '2026-01-01', freshness: 'expired', maxAgeDays: 120, expiresAt: '2026-05-01T00:00:00.000Z', label: '오래된 리뷰', url: 'https://example.com/old-reviews' }]
  });
  await useFeed(page, () => feed([...defaultJobs, expired]));
  await page.goto('/');
  await page.selectOption('#listingFilter', 'official_listed');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.listing-badge')).toHaveAttribute('data-state', 'official_listed');
  await page.selectOption('#listingFilter', 'all');
  await page.selectOption('#paymentFilter', 'evidence_expired');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.payment-badge')).toHaveAttribute('data-freshness', 'expired');
  await page.locator('.details').click();
  await expect(page.locator('#detailsPaymentSummary')).toContainText('근거 만료');
});

test('부분 소스 실패를 별도 경고하고 보존 공고로 바로 이동한다', async ({ page }) => {
  const preserved = job({
    id: 'job:preserved-source-error',
    source: 'OneForma',
    title: 'Preserved Korean Reviewer',
    url: 'https://example.com/job/preserved',
    score: 0,
    sourceKind: 'official_platform',
    listingStatus: 'source_error',
    listingLabel: '소스 확인 실패',
    listingVerification: 'source_error',
    listingReason: '이번 수집에서 원천 소스를 확인하지 못해 이전 공고를 보존함',
    listingCheckedAt: '2026-10-03T06:00:00.000Z',
    listingEvidence: [{ type: 'historical_listing', label: '마지막 확인 원문', url: 'https://example.com/job/preserved', checkedAt: '2026-10-03T06:00:00.000Z' }]
  });
  const partialFeed = {
    ...feed([...defaultJobs, preserved]),
    sourceStatus: [
      { source: 'RWS TrainAI', ok: true, count: 1 },
      { source: '알바천국', ok: true, count: 7, workplaceUnverifiedCount: 2, accessRestrictedCount: 1, detailRecoveredCount: 2, continuityRecoveredCount: 1 },
      { source: '인크루트', ok: true, count: 3, searchFailureCount: 1, searchFailureScopes: ['완주'] },
      { source: 'OneForma', ok: false, count: 0, preserved: 1, error: '503' }
    ]
  };
  await useFeed(page, () => partialFeed);
  await page.goto('/');
  await expect(page.locator('#sourceHealth')).toBeVisible();
  await expect(page.locator('#sourceHealth')).toContainText('OneForma');
  await expect(page.locator('#sourceHealth')).toContainText('근무지 확인 불가 2건 제외');
  await expect(page.locator('#sourceHealth')).toContainText('로그인·연령 인증 필요 1건 제외');
  await expect(page.locator('#sourceHealth')).toContainText('지역 검색 실패 1개(완주)');
  await expect(page.locator('#sourceHealth')).toContainText('대체 상세 구조 2건 복구');
  await expect(page.locator('#sourceHealth')).toContainText('검색창 이탈 1건 상세 재확인');
  await expect(page.locator('#showSourceErrors')).toContainText('보존 공고 1개');
  await page.locator('#showSourceErrors').click();
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.title')).toHaveText('Preserved Korean Reviewer');
  await expect(page.locator('.listing-badge')).toHaveText('출처 확인 실패');
});

test('자동 수집하지 못하는 플랫폼과 대체 경로를 시장별 수집 범위 안내로 보여준다', async ({ page }) => {
  const coverageFeed = {
    ...feed(defaultJobs),
    collectionGaps: [
      { source: '고용24', status: 'not_configured', label: '공식 API 미연결', reason: 'WORK24_AUTH_KEY 미설정', alternative: '공식 OPEN-API 인증키 설정', markets: ['domestic'] },
      { source: 'LinkedIn', status: 'manual_import', label: '자동 수집 안 함', reason: '로그인 기반 직접 크롤링 안 함', alternative: '공식 Job Alert JSON 가져오기', markets: ['overseas_remote', 'domestic'] },
      { source: 'Indeed', status: 'manual_only', label: '자동 수집 안 함', reason: '직접 크롤링 안 함', alternative: '공식 Job Alert 또는 공고 직접 추가', markets: ['overseas_remote', 'domestic'] },
      { source: '잡플래닛', status: 'access_restricted', label: '공개 접근 제한', reason: '공개 검색 접근 제한', alternative: '원출처 공고 또는 직접 추가', markets: ['domestic'] }
    ]
  };
  await useFeed(page, () => coverageFeed);
  await page.goto('/');

  await expect(page.locator('#collectionCoverage')).toBeVisible();
  await expect(page.locator('#collectionCoverageSummary')).toContainText('2개 출처');
  await page.locator('#collectionCoverageSummary').click();
  await expect(page.locator('#collectionCoverageList')).toContainText('LinkedIn');
  await expect(page.locator('#collectionCoverageList')).toContainText('공식 Job Alert JSON 가져오기');
  await expect(page.locator('#collectionCoverageList')).toContainText('Indeed');
  await expect(page.locator('#collectionCoverageList')).not.toContainText('고용24');
  await expect(page.locator('#marketPulseNote')).toContainText('자동 수집 제한 2개 출처');

  await page.locator('#marketDomestic').click();
  await expect(page.locator('#collectionCoverageSummary')).toContainText('4개 출처');
  await expect(page.locator('#collectionCoverageList')).toContainText('고용24');
  await expect(page.locator('#collectionCoverageList')).toContainText('잡플래닛');
  await expect(page.locator('#marketPulseNote')).toContainText('자동 수집 제한 4개 출처');
});

test('최근 검증·원문 변경을 카드에서 구분하고 상세 이력을 확인한다', async ({ page }) => {
  const changed = job({
    id: 'job:changed',
    title: 'Korean AI Reviewer - Updated',
    url: 'https://example.com/job/changed',
    lastChangeKind: 'content_changed',
    lastChangeAt: '2026-10-04T06:00:00.000Z',
    lastChangedFields: ['description', 'salary'],
    verificationHistory: [
      { at: '2026-10-01T06:00:00.000Z', event: 'first_seen', toStatus: 'verified_open', reason: '처음 수집됨' },
      { at: '2026-10-04T06:00:00.000Z', event: 'content_changed', fromStatus: 'verified_open', toStatus: 'verified_open', reason: '원문 주요 필드 변경: description, salary' }
    ]
  });
  await useFeed(page, () => feed([changed]));
  await page.goto('/');
  await expect(page.locator('.verification-badge[data-state="changed"]')).toHaveText('원문 변경됨');
  await page.locator('.details').click();
  await expect(page.locator('#detailsHistory')).toContainText('원문 변경');
  await expect(page.locator('#detailsHistory')).toContainText('description, salary');
});

test('사라졌다 재등장한 공고를 별도 상태로 표시한다', async ({ page }) => {
  const reappeared = job({
    id: 'job:reappeared',
    title: 'Korean Search Evaluator - Returned',
    url: 'https://example.com/job/reappeared',
    previousListingStatus: 'archived_missing',
    lastChangeKind: 'reappeared',
    lastChangeAt: '2026-10-04T06:00:00.000Z',
    verificationHistory: [
      { at: '2026-10-02T06:00:00.000Z', event: 'disappeared', fromStatus: 'verified_open', toStatus: 'archived_missing', reason: '원천에서 사라짐' },
      { at: '2026-10-04T06:00:00.000Z', event: 'reappeared', fromStatus: 'archived_missing', toStatus: 'verified_open', reason: '원천에 다시 나타남' }
    ]
  });
  await useFeed(page, () => feed([reappeared]));
  await page.goto('/');
  await expect(page.locator('.verification-badge[data-state="reappeared"]')).toHaveText('재등장');
  await page.locator('.details').click();
  await expect(page.locator('#detailsHistory')).toContainText('재등장');
});

test('근거 만료 임박은 저장된 오래된 freshness 값과 무관하게 현재 시각으로 재계산한다', async ({ page }) => {
  const aging = job({
    id: 'job:aging',
    title: 'Korean Reviewer - Aging Evidence',
    url: 'https://example.com/job/aging',
    paymentEvidenceFreshness: 'fresh',
    paymentEvidenceState: 'caution_repeated',
    paymentSignals: [{
      type: 'review_aggregate', direction: 'caution', recurrence: 'repeated',
      checkedAt: '2026-10-04', latestSourceAt: '2026-06-22', freshnessReferenceAt: '2026-06-22',
      freshness: 'fresh', maxAgeDays: 120, expiresAt: '2026-10-20T00:00:00.000Z',
      label: '리뷰 집계', url: 'https://example.com/reviews-aging'
    }]
  });
  await useFeed(page, () => feed([aging]));
  await page.goto('/');
  await expect(page.locator('.verification-badge[data-state="aging"]')).toHaveText('근거 만료 임박');
  await expect(page.locator('.payment-badge')).toHaveAttribute('data-freshness', 'aging');
});

test('부분 소스 실패 후 복구 상태와 이력을 유지한다', async ({ page }) => {
  let current = {
    ...feed([job({
      id: 'job:recover',
      title: 'Korean Reviewer - Source Recovery',
      url: 'https://example.com/job/recover',
      listingStatus: 'source_error',
      listingLabel: '소스 확인 실패',
      recommendationEligible: false,
      lastChangeKind: 'source_failed',
      lastChangeAt: '2026-10-03T06:00:00.000Z',
      verificationHistory: [{ at: '2026-10-03T06:00:00.000Z', event: 'source_failed', fromStatus: 'verified_open', toStatus: 'source_error', reason: '원천 소스 확인 실패' }]
    })]),
    sourceStatus: [{ source: 'RWS TrainAI', ok: false, count: 0, preserved: 1, error: '503' }]
  };
  await useFeed(page, () => current);
  await page.goto('/');
  await expect(page.locator('#sourceHealth')).toBeVisible();

  current = feed([job({
    id: 'job:recover',
    title: 'Korean Reviewer - Source Recovery',
    url: 'https://example.com/job/recover',
    lastChangeKind: 'source_recovered',
    lastChangeAt: '2026-10-04T06:00:00.000Z',
    verificationHistory: [
      { at: '2026-10-03T06:00:00.000Z', event: 'source_failed', fromStatus: 'verified_open', toStatus: 'source_error', reason: '원천 소스 확인 실패' },
      { at: '2026-10-04T06:00:00.000Z', event: 'source_recovered', fromStatus: 'source_error', toStatus: 'verified_open', reason: '원천 수집 복구' }
    ]
  })]);
  await page.reload();
  await expect(page.locator('#sourceHealth')).toBeHidden();
  await expect(page.locator('.verification-badge[data-state="recovered"]')).toHaveText('출처 복구');
  await page.locator('.details').click();
  await expect(page.locator('#detailsHistory')).toContainText('출처 복구');
});

test('추천 품질 게이트가 정상 후보 세트를 과도하게 축소하지 않는다', async ({ page }) => {
  const good = Array.from({ length: 6 }, (_, index) => job({
    id: `job:good-${index}`,
    title: `Korean AI Evaluator ${index + 1}`,
    url: `https://example.com/job/good-${index}`,
    score: 60 + index
  }));
  const degraded = job({
    id: 'job:degraded',
    title: 'Korean AI Evaluator - Unreliable Source',
    url: 'https://example.com/job/degraded',
    source: 'Remotive',
    sourceKind: 'job_board',
    sourceQualityTier: 'mixed',
    sourceReliabilityState: 'degraded',
    recommendationEligible: false,
    score: 95
  });
  const hard = job({
    id: 'job:hard',
    title: 'Korean Accessibility Specialist',
    url: 'https://example.com/job/hard',
    score: 95,
    requirementsStatus: 'hard_check',
    requirementsLabel: '하드요건 확인 필요',
    recommendationEligible: false
  });
  await useFeed(page, () => feed([...good, degraded, hard]));
  await page.goto('/');
  await expect(page.locator('.job-card')).toHaveCount(6);
  await expect(page.locator('#stats')).toContainText('6개');
  await expect(page.locator('.title', { hasText: 'Unreliable Source' })).toHaveCount(0);
  await expect(page.locator('.title', { hasText: 'Accessibility Specialist' })).toHaveCount(0);
});

test('재등장·복구와 원문 변경이 같은 실행에서 함께 발생해도 카드에 둘 다 표시한다', async ({ page }) => {
  const returnedChanged = job({
    id: 'job:returned-changed',
    title: 'Korean AI Reviewer - Returned And Changed',
    url: 'https://example.com/job/returned-changed',
    lastChangeKind: 'reappeared',
    lastChangeAt: '2026-10-04T06:00:00.000Z',
    verificationHistory: [
      { at: '2026-10-03T06:00:00.000Z', event: 'disappeared', fromStatus: 'verified_open', toStatus: 'archived_missing', reason: '원천에서 사라짐' },
      { at: '2026-10-04T06:00:00.000Z', event: 'reappeared', fromStatus: 'archived_missing', toStatus: 'verified_open', reason: '원천에 다시 나타남' },
      { at: '2026-10-04T06:00:00.000Z', event: 'content_changed', fromStatus: 'archived_missing', toStatus: 'verified_open', reason: '원문 주요 필드 변경: salary, description' }
    ]
  });
  const recoveredChanged = job({
    id: 'job:recovered-changed',
    title: 'Korean AI Reviewer - Recovered And Changed',
    url: 'https://example.com/job/recovered-changed',
    lastChangeKind: 'source_recovered',
    lastChangeAt: '2026-10-04T06:00:00.000Z',
    verificationHistory: [
      { at: '2026-10-03T06:00:00.000Z', event: 'source_failed', fromStatus: 'verified_open', toStatus: 'source_error', reason: '소스 확인 실패' },
      { at: '2026-10-04T06:00:00.000Z', event: 'source_recovered', fromStatus: 'source_error', toStatus: 'verified_open', reason: '소스 복구' },
      { at: '2026-10-04T06:00:00.000Z', event: 'content_changed', fromStatus: 'source_error', toStatus: 'verified_open', reason: '원문 주요 필드 변경: requirements' }
    ]
  });
  await useFeed(page, () => feed([returnedChanged, recoveredChanged]));
  await page.goto('/');
  const returnedCard = page.locator('.job-card', { hasText: 'Returned And Changed' });
  await expect(returnedCard.locator('.verification-badge[data-state="changed"]')).toHaveText('원문 변경됨');
  await expect(returnedCard.locator('.verification-badge[data-state="reappeared"]')).toHaveText('재등장');
  const recoveredCard = page.locator('.job-card', { hasText: 'Recovered And Changed' });
  await expect(recoveredCard.locator('.verification-badge[data-state="changed"]')).toHaveText('원문 변경됨');
  await expect(recoveredCard.locator('.verification-badge[data-state="recovered"]')).toHaveText('출처 복구');
});

test('검증 이력이 새 피드로 교체되어도 이전 사건을 유지한다', async ({ page }) => {
  let current = feed([job({
    id: 'job:history-retention',
    title: 'Korean Reviewer - History Retention',
    url: 'https://example.com/job/history-retention',
    verificationHistory: [
      { at: '2026-10-01T06:00:00.000Z', event: 'first_seen', toStatus: 'verified_open', reason: '처음 수집됨' },
      { at: '2026-10-03T06:00:00.000Z', event: 'content_changed', fromStatus: 'verified_open', toStatus: 'verified_open', reason: '원문 주요 필드 변경: description' }
    ]
  })]);
  await useFeed(page, () => current);
  await page.goto('/');
  await page.locator('.details').click();
  await expect(page.locator('#detailsHistory')).toContainText('원문 변경');
  await page.locator('#detailsDialog').evaluate((dialog) => dialog.close());

  current = feed([job({
    id: 'job:history-retention',
    title: 'Korean Reviewer - History Retention',
    url: 'https://example.com/job/history-retention',
    lastChangeKind: 'verified_unchanged',
    verificationHistory: [
      { at: '2026-10-01T06:00:00.000Z', event: 'first_seen', toStatus: 'verified_open', reason: '처음 수집됨' },
      { at: '2026-10-03T06:00:00.000Z', event: 'content_changed', fromStatus: 'verified_open', toStatus: 'verified_open', reason: '원문 주요 필드 변경: description' },
      { at: '2026-10-04T06:00:00.000Z', event: 'verified_unchanged', fromStatus: 'verified_open', toStatus: 'verified_open', reason: '변경 없이 재검증됨' }
    ]
  })]);
  await page.reload();
  await page.locator('.details').click();
  await expect(page.locator('#detailsHistory')).toContainText('처음 발견');
  await expect(page.locator('#detailsHistory')).toContainText('원문 변경');
  await expect(page.locator('#detailsHistory')).toContainText('변경 없이 재검증');
});

test('보수는 카드·상세에서 우선 노출되고 공개 수준으로 바로 필터링할 수 있다', async ({ page }) => {
  const amountJob = job({
    id: 'job:salary-amount',
    title: 'Korean AI Reviewer - Hourly Pay',
    url: 'https://example.com/job/salary-amount',
    salaryInfo: { raw: '$10/hour', display: '$10/시간', currency: 'USD', min: 10, max: 10, period: 'hour', confidence: 'parsed', scope: 'geography_dependent' }
  });
  const basisOnlyJob = job({
    id: 'job:salary-basis',
    title: 'Korean AI Reviewer - Rate Basis Only',
    url: 'https://example.com/job/salary-basis',
    salary: '금액 비공개 · 시간당 고정 단가',
    salaryInfo: { raw: '', display: '금액 비공개 · 시간당 고정 단가', currency: '', min: null, max: null, period: 'hour', confidence: 'basis_only', paymentBasis: 'fixed_hourly' },
    decisionUnknowns: ['급여·단가']
  });
  const undisclosedJob = job({
    id: 'job:salary-none',
    title: 'Korean AI Reviewer - Pay Undisclosed',
    url: 'https://example.com/job/salary-none',
    salary: '',
    salaryInfo: { raw: '', display: '', currency: '', min: null, max: null, period: '', confidence: 'none', paymentBasis: '' },
    decisionUnknowns: ['급여·단가']
  });
  await useFeed(page, () => feed([amountJob, basisOnlyJob, undisclosedJob]));
  await page.goto('/');

  const amountCard = page.locator('.job-card', { hasText: 'Hourly Pay' });
  await expect(amountCard.locator('.compensation-value')).toHaveText('$10/시간');
  await expect(amountCard.locator('.compensation-note')).toContainText('지역·국가에 따라 실제 단가 변동');
  await expect(amountCard.locator('.compensation')).not.toHaveClass(/unknown/);

  const basisCard = page.locator('.job-card', { hasText: 'Rate Basis Only' });
  await expect(basisCard.locator('.compensation-value')).toHaveText('금액 비공개 · 시간당 고정 단가');
  await expect(basisCard.locator('.compensation-note')).toContainText('지급 방식만 확인됨');
  await expect(basisCard.locator('.compensation')).toHaveClass(/limited/);

  const undisclosedCard = page.locator('.job-card', { hasText: 'Pay Undisclosed' });
  await expect(undisclosedCard.locator('.compensation-value')).toHaveText('금액 미공개');
  await expect(undisclosedCard.locator('.compensation-note')).toContainText('원문에서 확인 필요');
  await expect(undisclosedCard.locator('.compensation')).toHaveClass(/unknown/);

  await amountCard.locator('.details').click();
  await expect(page.locator('#detailsCompensationValue')).toHaveText('$10/시간');
  await expect(page.locator('#detailsCompensationNote')).toContainText('지역·국가에 따라 실제 단가 변동');
  await page.locator('#detailsDialog').evaluate((dialog) => dialog.close());

  await page.locator('#compensationFilter').selectOption('amount');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.job-card .title')).toHaveText('Korean AI Reviewer - Hourly Pay');

  await page.locator('#compensationFilter').selectOption('basis_only');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.job-card .title')).toHaveText('Korean AI Reviewer - Rate Basis Only');

  await page.locator('#compensationFilter').selectOption('undisclosed');
  await expect(page.locator('.job-card')).toHaveCount(2);
});

test('해외 탭에서 직접 추가한 공고는 기본 지원범위 필터에 가려지지 않고 즉시 보인다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  await expect(page.locator('#eligibility')).toHaveValue('likely');

  await page.locator('#addJobBtn').click();
  await page.locator('#addForm input[name="source"]').fill('LinkedIn');
  await page.locator('#addForm input[name="title"]').fill('Manual Korean AI Role');
  await page.locator('#addForm input[name="company"]').fill('Manual Co');
  await page.locator('#addForm input[name="url"]').fill('https://example.com/manual-overseas');
  await page.locator('#addForm button[value="default"]').click();

  await expect(page.locator('#eligibility')).toHaveValue('');
  await expect(page.locator('.job-card', { hasText: 'Manual Korean AI Role' })).toBeVisible();
  await expect(page.locator('#toastText')).toContainText('공고를 추가했습니다');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('manualJobs') || '[]')[0]);
  expect(saved.eligibilityCode).toBe('unknown');
  expect(saved.marketScopes).toEqual(['overseas_remote']);
});

test('국내 탭에서 직접 추가한 공고는 현재 지역 필터를 근거처럼 저장하지 않고 즉시 보인다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  await page.locator('#marketDomestic').click();
  await expect(page.locator('#domesticProvince')).toHaveValue('전북특별자치도');
  await expect(page.locator('#domesticLocality')).toHaveValue('전주·완주');

  await page.locator('#addJobBtn').click();
  await page.locator('#addForm input[name="source"]').fill('Indeed');
  await page.locator('#addForm input[name="title"]').fill('Manual Jeonju Role');
  await page.locator('#addForm input[name="location"]').fill('전주시 덕진구');
  await page.locator('#addForm input[name="url"]').fill('https://example.com/manual-domestic');
  await page.locator('#addForm button[value="default"]').click();

  await expect(page.locator('#domesticProvince')).toHaveValue('');
  await expect(page.locator('#domesticLocality')).toHaveValue('');
  await expect(page.locator('.job-card', { hasText: 'Manual Jeonju Role' })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('manualJobs') || '[]')[0]);
  expect(saved.marketScopes).toEqual(['domestic']);
  expect(saved.domesticRegion.province).toBe('');
  expect(saved.domesticRegion.city).toBe('');
  expect(saved.domesticRegion.label).toBe('전주시 덕진구');
  expect(saved.domesticRegion.evidenceLevel).toBe('manual_location');
});

test('국내 탭에서 원격으로 직접 추가한 공고는 해외·원격 범위로 이동해 표시한다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  await page.locator('#marketDomestic').click();

  await page.locator('#addJobBtn').click();
  await page.locator('#addForm input[name="title"]').fill('Manual Remote Role');
  await page.locator('#addForm input[name="url"]').fill('https://example.com/manual-remote');
  await page.locator('#addForm input[name="remote"]').check();
  await page.locator('#addForm button[value="default"]').click();

  await expect(page.locator('#marketOverseas')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.job-card', { hasText: 'Manual Remote Role' })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('manualJobs') || '[]')[0]);
  expect(saved.remote).toBe(true);
  expect(saved.marketScopes).toEqual(['overseas_remote']);
});
