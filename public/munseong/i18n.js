/**
 * Nicole's DOM-only English localization layer.
 *
 * Call after a render (and again after subsequent renders). This function does
 * not touch feed objects, storage, element IDs, option values, or URLs. Unknown
 * strings remain unchanged so source-provided job information stays intact.
 */
const UI = new Map(Object.entries({
  '미상': 'Unknown',
  '해당 없음': 'Not applicable',
  '확인 필요': 'Needs verification',
  '상태 확인 필요': 'Status needs verification',
  '지원 범위 확인 필요': 'Eligibility needs verification',
  '필수조건 상태 미상': 'Requirements unknown',
  '추가 근거 확인 필요': 'Additional evidence needed',
  '주요 미확인 항목 없음': 'No major unknowns',
  '게시일 미상': 'Posting date unknown',
  '게시일 미표시': 'Posting date not listed',
  '오늘': 'Today',
  '어제': 'Yesterday',
  '신규': 'New',
  '원격': 'Remote',
  '하이브리드': 'Hybrid',
  '출근': 'On-site',
  '원문 공고 보기 ↗': 'View original job ↗',
  '채용정보 제공사이트로 이동 ↗': 'Visit the job information provider ↗',
  '근거 열기': 'Open evidence',
  '근거 보기': 'View evidence',
  '근거': 'Evidence',
  '검증': 'Verification',
  '시각 미상': 'Time unknown',
  '날짜 미상': 'Date unknown',
  '원문 변경': 'Source content changed',
  '원문 변경됨': 'Source content changed',
  '재등장': 'Reappeared',
  '출처 복구': 'Source recovered',
  '출처 확인 실패': 'Source check failed',
  '지급 근거 확인 필요': 'Payment evidence needs verification',
  '상세 설명 없음': 'No detailed description',
  '상세 설명이 제공되지 않았습니다.': 'No detailed description provided.',
  '직접 추가': 'Added manually',
  '검토 우선순위': 'Review priority',
  '추천 공고': 'Recommended jobs',
  '관심 공고': 'Saved jobs',
  '지원 예정': 'Planning to apply',
  '지원함': 'Applied',
  '아직 안 본 공고': 'Unreviewed jobs',
  '시장 요약': 'Market summary',
  '표시할 공고 없음': 'No jobs to display',
  '지역·분야·출처 필터를 완화하면 시장 요약을 볼 수 있습니다.': 'Broaden the location, category, or source filters to see a market summary.',
  '수집된 공고만 요약하며 전체 채용시장을 대표하지 않습니다.': 'This summarizes collected listings, not the entire job market.',
  '최근 14일 게시일 확인 공고 없음': 'No listings with confirmed posting dates in the past 14 days',
  '최근 7일 신규': 'New in the past 7 days',
  '보수 금액 공개': 'Jobs with pay amounts',
  '금액이 구조화된 공고 기준': 'Based on listings with structured pay amounts',
  '공고 수 상위 분야': 'Top job category',
  '분야 정보 부족': 'Insufficient category data',
  '현재 필터 안에서 가장 많이 수집된 분야': 'Most frequent category among filtered jobs',
  '지원 후보 상위 회사': 'Top company with eligible opportunities',
  '추천 후보 없음': 'No recommended candidates',
  '가장 많은 확인 필요': 'Most common unknown',
  '추가 확인 없음': 'No additional checks needed',
  '현재 필터에서 추천 기준을 충족한 회사 공고가 없습니다.': 'No company listings meet the recommendation criteria within the current filters.',
  '현재 필터에서 별도 확인 항목이 없습니다.': 'No additional checks within the current filters.',
  '전체 채용시장 대표 통계 아님': 'Not representative of the entire job market',
  '개인 상태/최소 점수는 시장 요약에서 제외': 'Personal status and minimum score excluded from market summary',
  '추가 필터': 'More filters',
  '추가 필터 · 현재 조건': 'More filters · Active conditions',
  '추가 필터 · 현재 조건 0개': 'More filters',
  '검색': 'Search',
  '출처': 'Source',
  '분야': 'Category',
  '근무 형태': 'Work setting',
  '지원 범위': 'Eligible locations',
  '시·도': 'Province / City',
  '시·군·구': 'City / District',
  '읍·면·동': 'Neighborhood',
  '보수 정보': 'Pay information',
  '게시 시점': 'Date posted',
  '모집 상태': 'Listing status',
  '출처 검증': 'Source verification',
  '지급 신뢰 근거': 'Payment evidence',
  '필수요건 확인': 'Required qualifications',
  '최소 검토 우선순위': 'Minimum review priority',
  '내 상태': 'My status',
  '정렬': 'Sort',
  '전체': 'All',
  '전체 시·도': 'All provinces / cities',
  '전체 시·군·구': 'All cities / districts',
  '전체 읍·면·동': 'All neighborhoods',
  '한국에서 지원 가능': 'Open to applicants in Korea',
  '전 세계 지원 가능': 'Open worldwide',
  '특정 국가 제한': 'Country restrictions apply',
  '한국 명시': 'Korea explicitly listed',
  '지역 제한 가능': 'Location restrictions may apply',
  '현지 근무/확인 필요': 'On-site location needs verification',
  '공식 채용 페이지 확인': 'Official job page verified',
  '공식 프로젝트 게시 확인': 'Official project listing verified',
  '집계·채용보드 현재 피드': 'Present in current job board / aggregate feed',
  '오래된 공고': 'Older listing',
  '현재 피드에서 사라짐': 'Missing from current feed',
  '인재풀': 'Talent pool',
  '종료 확인': 'Confirmed closed',
  '일반 요건 확인 필요': 'Routine requirements need verification',
  '필수조건 확인 필요': 'Required criteria need verification',
  '추가 필수조건 감지 없음': 'No additional requirements detected',
  '공식 직접 채용': 'Official direct hiring',
  '정부 공식 채용정보': 'Official government posting',
  '공식 프로젝트 플랫폼': 'Official project platform',
  '채용 보드': 'Job board',
  '집계 피드': 'Aggregated feed',
  '원격 · 출근 거리 비해당': 'Remote · Commuting distance does not apply',
  '한국 내 지원 지역은 확인되지만 출근 위치 비교 대상이 아닙니다.': 'Eligible location in Korea is known, but no office commute applies.',
  '주소 부족으로 거리 계산 불가': 'Cannot calculate distance without an address',
  '공고에 거리 계산에 충분한 주소·좌표가 없습니다.': 'The listing does not provide a sufficiently precise address or coordinates.',
  '공고 위치 좌표 기준': 'Based on listing coordinates',
  '직선거리 기준': 'Straight-line distance',
  '직선거리 기준(실제 이동거리 아님)': 'Straight-line distance (not travel distance)',
  '실제 도로 이동거리 아님': 'Not the actual road distance',
  '지역 중심점은 거리 구간을 보수적으로 판정': 'Area center used for conservative distance grouping',
  '지역 기준': 'Area-based',
  '공고 지역': 'Job location',
  '직선거리': 'Straight-line distance',
  '거리 기준': 'Distance reference',
  '원문 수동 검토': 'Manual source review',
  '정기 재검증 아님': 'Not regularly reverified',
  '이번 수집에서는 재검증 안 됨': 'Not reverified in this collection',
  '저장소 오류': 'Storage error',
  '최근 추가': 'Recently added',
  '지금 볼 이유': 'Why review',
  '미확인': 'Unverified',
  '현재 필터에 맞는 공고가 없습니다. 필터를 초기화하거나 조건을 넓혀보세요.': 'No jobs match the current filters. Reset the filters or broaden your search.',
  '채용 시 조기마감 가능': 'May close early when filled',
  '상시·채용시까지': 'Open until filled',
  '합격 가능성이 아니라 먼저 확인할 순서를 위한 점수입니다.': 'This score ranks review priority; it does not predict hiring chances.',
  '지역·출처 조건은 맞지만 관심 업무와 직접 일치하는 근거가 부족한 일반 시장 후보입니다.': 'The location and source match, but there is insufficient evidence of a direct role match.',
  '근거 최신': 'Evidence current',
  '재검토 시점 임박': 'Review due soon',
  '일부 근거 만료': 'Some evidence expired',
  '근거 만료': 'Evidence expired',
  '근거 부족': 'Insufficient evidence',
  '최신성 미상': 'Evidence freshness unknown',
  '지급 주체 아님': 'Not the paying party',
  '근거 만료·재검토 필요': 'Evidence expired; review needed',
  '상반된 신호·반복 주의': 'Conflicting repeated caution signals',
  '반복 주의 신호': 'Repeated caution signals',
  '단일 주의 사례': 'Single caution report',
  '공식 지급 정책 확인': 'Official payment policy verified',
  '원문 변경됨': 'Source changed',
  '근거 만료 임박': 'Evidence expiring soon',
  '지급 근거 만료': 'Payment evidence expired',
  '미확인 핵심요건': 'Unverified essential requirement',
  'RSS 목록 최근 확인': 'RSS list checked recently',
  '최근 검증됨': 'Recently verified',
  '처음 발견': 'First seen',
  '수동 조사 기록 수정': 'Manual research record updated',
  '변경 없이 재검증': 'Reverified without changes',
  'RSS 목록 재확인': 'RSS list rechecked',
  '확인 근거 범위 변경': 'Verification scope changed',
  '모집 상태 변경': 'Listing status changed',
  '원천에서 사라짐': 'Removed from source',
  '근거 최신성 변경': 'Evidence freshness changed',
  '지급 근거 상태 변경': 'Payment evidence status changed',
  '구형 원문 변경 기록·재검토': 'Legacy source change record reviewed',
  '원문 판정 기준 재설정': 'Source verification baseline reset',
  '아직 누적된 검증 이력이 없습니다.': 'No verification history yet.',
  '공식 정책': 'Official policy',
  '리뷰 집계': 'Aggregated reviews',
  '커뮤니티 사례': 'Community report',
  '반복 신호': 'Repeated signals',
  '단일 사례': 'Single report',
  '공식 문서': 'Official document',
  '최신': 'Current',
  '재검토 임박': 'Review due soon',
  '만료': 'Expired',
  '이 소스는 지급 주체가 아닙니다. 고용주·프로젝트 원문에서 지급 조건을 확인하세요.': 'This source is not the payer. Verify payment terms with the employer or project.',
  '구조화된 공개 지급 평판 근거가 충분하지 않습니다.': 'Insufficient structured public evidence about payment reliability.',
  '현재 자동으로 확인된 지원 가치 신호가 없습니다.': 'No automatically verified reasons to apply at this time.',
  '현재 자동 감지된 주요 미확인 항목이 없습니다.': 'No major unresolved issues detected automatically.',
  '현재 모집 상태의 자동 판정 근거가 없습니다.': 'No automated evidence for the current listing status.',
  '공고 원문': 'Original job posting',
  '원문에서 모집 상태와 계약·지급 조건을 확인하세요.': 'Verify the listing status, contract, and payment terms in the original posting.',
  'LinkedIn 공식 Job Alert 이메일에서 사용자가 내보낸 항목입니다. 공고 원문에서 현재 모집·지원 범위를 다시 확인하세요.': 'Imported from the user’s LinkedIn Job Alert email. Confirm that the original job posting is still open and check eligibility.',
  'LinkedIn 공고 원문': 'Original LinkedIn job posting',
  '기존 지급 평판 근거의 유효기간이 지나 최신 근거 재검토가 필요합니다.': 'Existing payment-reliability evidence has expired and needs a new review.',
  '공개 지급 평판 근거가 충분하지 않습니다. 실제 계약·정산 조건을 원문에서 확인하세요.': 'Public payment-reliability evidence is insufficient. Verify contract and payment details at the source.',
  '지원 가능 국가 범위의 자동 판정 근거가 없습니다.': 'No automated evidence for country-based eligibility.',
  '현재 자동 감지된 추가 필수조건 없음': 'No additional mandatory requirements detected automatically',
  '처음 수집': 'First collected',
  '원문 수동 검토:': 'Manual source review:',
  '정기 수집으로 원문을 재확인하지 않음': 'The source was not reverified during regular collection',
  'RSS 목록 마지막 확인': 'RSS list last checked',
  '모집 출처 마지막 확인': 'Listing source last checked',
  '모집 확인 시각 미상': 'Listing verification time unknown',
  '수집 시각 미상': 'Collection time unknown',
  '원문에서 확인 필요': 'Check the original posting',
  '금액 미공개': 'Pay amount not disclosed',
  '지역 한정 금액 · 다른 지역은 확인 필요': 'Regional amount only · Verify other locations',
  '금액 미공개 · 지급 방식만 확인됨': 'Pay amount not disclosed · Payment basis verified only',
  '상한액': 'Maximum amount',
  '대략적 금액': 'Approximate amount',
  '지역·국가에 따라 실제 단가 변동': 'Actual rates vary by region or country',
  '건당 지급을 시간당으로 환산': 'Per-task pay converted to an hourly equivalent',
  '원문과 채용보드 메타데이터 불일치': 'Original posting and job board metadata disagree',
  '채용보드 금액은 원문 미확인': 'Board-listed pay not verified in the original posting',
  '좋음': 'Good',
  '혼합': 'Mixed',
  '낮음': 'Low',
  '저하': 'Degraded',
  '안정': 'Stable',
  '관찰 중': 'Under observation',
  '불안정': 'Unstable',
  '직접 API': 'Direct API',
  '승인형 공식 API': 'Approved official API',
  '공식 REST API': 'Official REST API',
  '공식 RSS': 'Official RSS',
  '공개 API': 'Public API',
  '공개 웹페이지': 'Public webpage',
  '공개 웹페이지·구조화 데이터': 'Public webpage with structured data',
  '공개 피드': 'Public feed',
  '수동 확인': 'Manual check',
  '자동 수집 제한': 'Automated collection restriction',
  '대체 경로': 'Alternative route',
  '검색 급락 방어 작동': 'Search-collapse protection triggered',
  'HTTP 403 접근 거부': 'HTTP 403 access denied',
  'HTTP 429 요청 제한': 'HTTP 429 rate limited',
  'HTTP 서버 오류': 'HTTP server error',
  'HTTP 요청 오류': 'HTTP client error',
  'TLS 인증서 연결 오류': 'TLS certificate or connection error',
  'DNS 조회 실패': 'DNS lookup failed',
  '응답 시간 초과': 'Request timed out',
  '네트워크 연결 오류': 'Network connection error',
  '실패 원인 미분류': 'Unclassified failure',
  '상세 응답·검증 대량 실패 · 기존 공고 현재 모집 미확인': 'Many detail/verification failures · Existing listings not confirmed open',
  '목록 다시 확인': 'Check listings again',
  '목록 새로고침': 'Refresh listings',
  '목록 확인 중…': 'Checking listings…',
  '수집 중…': 'Collecting listings…',
  '요약 보기': 'Show summary',
  '요약 접기': 'Hide summary',
  '지원하지 않는 백업 파일입니다.': 'Unsupported backup file.',
  '상태 저장소가 읽기 전용입니다.': 'State storage is read-only.',
  'HTTP 또는 HTTPS URL을 입력해 주세요.': 'Enter an HTTP or HTTPS URL.',
  '공고를 추가했습니다. 방금 추가한 공고가 보이도록 현재 조건을 넓혔습니다.': 'Job added. Filters have been broadened to display the new job.',
  '백업 상태를 현재 데이터에 병합했습니다.': 'Backup state merged into current data.'
}));

// UI-owned string templates only: never apply these rules to arbitrary feed text.
const TEMPLATES = [
  [/^(\d+)개 중 (\d+)개 표시$/, '$2 of $1 jobs shown'],
  [/^(\d+)개 공고$/, '$1 jobs'],
  [/^(\d+)개 선택$/, '$1 selected'],
  [/^(\d+)\/(\d+)개$/, '$1/$2 jobs'],
  [/^(\d+)개$/, (_, count) => `${count} job${count === '1' ? '' : 's'}`],
  [/^현재 조건 (\d+)개$/, '$1 active'],
  [/^· 숨김 제외 활성 전체 (\d+)개$/, '· $1 total active jobs excluding hidden'],
  [/^숨김 제외 활성 전체 (\d+)개$/, '$1 total active jobs excluding hidden'],
  [/^(\d+)일 전$/, '$1 days ago'],
  [/^등록 후 (\d+)일$/, (_, days) => `Added ${days} day${days === '1' ? '' : 's'} ago`],
  [/^중복 (\d+)개 통합$/, '$1 duplicates merged'],
  [/^추가 필터 · 현재 조건 (\d+)개$/, 'More filters · $1 active'],
  [/^현재 연결된 공식 소스에서 (.+?) 공고를 확인하지 못했습니다\. 지역 조건을 넓히거나 나중에 다시 확인해 주세요\.$/, 'No jobs were found in $1 from the connected official sources. Broaden the area or check again later.'],
  [/^검토 우선순위 (\d+)$/, 'Review priority $1'],
  [/^시장 탐색 후보 · 우선순위 (\d+)$/, 'Market candidate · Priority $1'],
  [/^최근 (\d+)개 검증 사건$/, '$1 recent verification events'],
  [/^직전 7일 (\d+)개 대비 ([+-]?\d+)개$/, '$2 jobs compared with $1 in the previous 7 days'],
  [/^(\d+)\/(\d+)개 · (\d+)%$/, '$1/$2 jobs · $3%'],
  [/^(\d+)개 · (\d+)%$/, '$1 jobs · $2%'],
  [/^활성 (\d+)개 중 추천 기준 충족 (\d+)개$/, '$2 of $1 active jobs meet recommendation criteria'],
  [/^최근 성공 (\d+)%$/, 'Recent success $1%'],
  [/^검색 발견 (\d+)$/, 'Search results $1'],
  [/^유효 (\d+)\/(\d+) \((\d+)%\)$/, 'Valid $1/$2 ($3%)'],
  [/^유효 (\d+)\/(\d+)$/, 'Valid $1/$2'],
  [/^노이즈 (\d+)%$/, 'Noise $1%'],
  [/^중복 (\d+)%$/, 'Duplicates $1%'],
  [/^저품질 (\d+)%$/, 'Low quality $1%'],
  [/^연속성 확인 (\d+)\/(\d+)$/, 'Continuity checks $1/$2'],
  [/^자동 수집 제한 (\d+)개 출처$/, 'Automated collection restricted for $1 sources'],
  [/^현재 필터의 활성 공고 (\d+)개 기준$/, 'Based on $1 active listings in the current filters'],
  [/^게시일 확인 (\d+)\/(\d+)개$/, 'Posting dates confirmed for $1/$2'],
  [/^보존 공고 (\d+)개 보기$/, 'Show $1 preserved jobs'],
  [/^수집 범위 제한 · (\d+)개 출처$/, 'Collection limitations · $1 sources'],
  [/^일부 출처 확인 실패 · (\d+)개$/, '$1 sources could not be checked'],
  [/^일부 수집 제약 · (\d+)개 소스$/, '$1 sources have collection restrictions'],
  [/^출처 품질 주의 · (\d+)개$/, 'Quality warnings for $1 sources'],
  [/^이전 (\d+)개 보존$/, '$1 prior jobs preserved'],
  [/^이전 (\d+)개 보존 · 현재 모집 미확인$/, '$1 previous jobs preserved · Current opening unverified'],
  [/^지역 검색 실패 (\d+)개(.*)$/, '$1 regional searches failed$2'],
  [/^공식 공개 RSS 목록 (\d+)건 · 상세 미검증$/, '$1 public RSS listings · Details unverified'],
  [/^상세 파싱·응답 실패 (\d+)건$/, '$1 detail parsing/response failures'],
  [/^근무지 확인 불가 (\d+)건 제외$/, '$1 excluded due to unverified workplace'],
  [/^로그인·연령 인증 필요 (\d+)건 제외$/, '$1 excluded for login/age verification'],
  [/^상세 접근 제한 → 공개 목록 근거 (\d+)건 유지$/, '$1 retained from public list evidence after detail access restrictions'],
  [/^대체 상세 구조 (\d+)건 복구$/, '$1 recovered using alternate detail structure'],
  [/^검색창 이탈 (\d+)건 상세 재확인$/, '$1 listings rechecked after search-page navigation'],
  [/^마지막 수집 (.+)$/, 'Last collected $1'],
  [/^출처 오류: (.+)$/, 'Source errors: $1'],
  [/^(.+)\((\d+)개 유지\)$/, '$1 ($2 preserved)'],
  [/^수집 신뢰 (.+)$/, 'Collection reliability $1'],
  [/^출처 품질 (.+)$/, 'Source quality $1'],
  [/^근거 갱신 (.+)$/, 'Evidence refresh method $1'],
  [/^최초 발견 (.+)$/, 'First seen $1'],
  [/^최초 수집:? (.+)$/, 'First collected $1'],
  [/^마지막 수집:? (.+)$/, 'Last collected $1'],
  [/^최근 출처 (.+)$/, 'Latest source $1'],
  [/^원문 수동 검토:? (.+)$/, 'Manual source review $1'],
  [/^재검토 기준 (.+)$/, 'Review by $1'],
  [/^다음 재검토 기준 (.+)$/, 'Next review by $1'],
  [/^지급 근거 검토: (.+)$/, 'Payment evidence reviewed: $1'],
  [/^상세 마지막 교차 검증: (.+)$/, 'Last detail cross-check: $1'],
  [/^다른 출처 (\d+) ↗$/, 'Alternative source $1 ↗'],
  [/^게시일 (.+)$/, 'Posted $1'],
  [/^마감 임박$/, 'Closing soon'],
  [/^마감 (.+)$/, 'Deadline $1'],
  [/^지역 기준 직선거리 약 ([\d.]+)km$/, 'Approx. $1 km straight-line distance (regional estimate)'],
  [/^직선거리 약 ([\d.]+)km$/, 'Approx. $1 km straight-line distance'],
  [/^좌표 (.+)$/, 'Coordinates $1'],
  [/^추천 제외: (.+)$/, 'Excluded from recommendations: $1'],
  [/^근무 (.+)$/, 'Schedule: $1'],
  [/^기간 (.+)$/, 'Duration: $1'],
  [/^경력 (.+)$/, 'Experience: $1'],
  [/^학력 (.+)$/, 'Education: $1'],
  [/^우대 (.+)$/, 'Preferred: $1'],
  [/^확인 필요: (.+)$/, 'Needs verification: $1'],
  [/^이 점수는 합격 가능성이 아니라 검토 우선순위 (\d+)점입니다\.$/, 'This score indicates review priority ($1 points), not hiring chances.'],
  [/^상태를 저장할 수 없어 읽기 전용으로 표시합니다\. \((.+)\)$/, 'Could not save state; showing read-only data. ($1)'],
  [/^손상된 저장 항목 (\d+)개를 기본값으로 복구했습니다\. 정상 상태와 원본 기록은 보존했습니다\.$/, '$1 damaged stored items restored to defaults. Valid state and original records were preserved.'],
  [/^LinkedIn 알림 공고 (\d+)개를 현재 목록에 병합했습니다\.$/, '$1 LinkedIn alert jobs merged into current listings.'],
  [/^(\d+)개 공고를 숨겼습니다\.$/, '$1 jobs hidden.'],
  [/^새 수집에 실패하여 마지막 목록을 표시합니다\. \((.+)\)$/, 'The new collection failed. Showing the last available list. ($1)'],
  [/^새 목록을 확인하지 못했습니다\. 현재 화면은 마지막으로 성공한 수집 결과를 유지합니다\. \((.+)\)$/, 'Could not verify the latest list. Keeping the last successful collection. ($1)'],
  [/^공고를 다시 불러오지 못했습니다: (.+)$/, 'Could not reload jobs: $1'],
  [/^공고를 불러오지 못했습니다: (.+)$/, 'Could not load jobs: $1'],
  [/^상태 가져오기 실패: (.+)$/, 'Could not import state: $1'],
];

const HANGUL = /[가-힣]/;
const WHOLE_PHRASES = /^(?:추가 필터 · 현재 조건 \d+개|시장 탐색 후보 · 우선순위 \d+|일부 출처 확인 실패 · \d+개|일부 수집 제약 · \d+개 소스|출처 품질 주의 · \d+개|수집 범위 제한 · \d+개 출처|이전 \d+개 보존 · 현재 모집 미확인|공식 공개 RSS 목록 \d+건 · 상세 미검증|상세 응답·검증 대량 실패 · 기존 공고 현재 모집 미확인)$/;
const RAW_FIELDS = [
  '.title', '.company', '.description', '.tags', '.tag', '.meta', '.source',
  '#detailsTitle', '#detailsCompany', '#detailsDescription', '#detailsMeta',
  '#detailsListingReason', '#detailsSourceSummary', '#detailsEligibilityReason',
  '#detailsDecisionValue', '#detailsDecisionUnknown',
  '.history-item small', '.signal-item small', '.signal-item a', '.signal-item > strong',
  '#detailsListingEvidence a', '.collection-gap-item > span', '.collection-gap-item > small',
  '.trust-badge', '.job-card .compensation-value', '#detailsCompensationValue'
].join(', ');

const CARD_UI = [
  '.score', '.job-select', '.favorite', '.dismiss', '.job-state', '.details', '.apply',
  '.listing-badge', '.eligibility-badge', '.payment-badge', '.requirements-badge',
  '.verification-badges', '.compensation-label', '.compensation-note',
  '.distance-summary', '.collection-dates', '.decision-strip',
  '.decision-value', '.decision-unknown', '.posted'
].join(', ');
const SOURCE_DETAILS = [
  '#detailsDecisionValue', '#detailsDecisionUnknown', '#detailsListingReason',
  '#detailsSourceSummary', '#detailsEligibilityReason', '#detailsListingEvidence a',
  '#detailsPaymentSignals .signal-item > a', '#detailsPaymentSignals .signal-item > strong'
].join(', ');

function safeToTranslate(element) {
  if (!element || element.closest('script, style, noscript, textarea, [contenteditable="true"]')) return false;
  if (element.matches('.collection-gap-item > small')) return element.textContent.startsWith('대체 경로 · ');
  // These fields normally contain job/source data. Only translate a *known*
  // app-owned fallback string; free-form data is never rewritten.
  if (element.matches(SOURCE_DETAILS)) return UI.has(element.textContent.trim());
  if (element.closest(RAW_FIELDS)) return false;
  if (element.closest('.job-card') && !element.closest(CARD_UI)) return false;
  // These two market highlights can be literal company/category names.
  if (element.matches('.market-pulse-card strong') &&
      !['표시할 공고 없음', '분야 정보 부족', '추천 후보 없음', '추가 확인 없음'].includes(element.textContent.trim()) &&
      !/^\d+(?:\/\d+)?개(?: · \d+%)?$/.test(element.textContent.trim()) &&
      !/ · \d+개$/.test(element.textContent.trim())) return false;
  if (element.matches('#detailsPaymentSignals .signal-item > a')) return false;
  return true;
}

function localizeDateTemplates(text) {
  return text
    // toLocaleString('ko-KR') uses 오전/오후 even in otherwise numeric values.
    .replace(/\b(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}:\d{2}(?::\d{2})?)/g,
      (_, y, m, d, part, clock) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')} ${part === '오전' ? 'AM' : 'PM'} ${clock}`)
    .replace(/\b(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.(?!\d)/g,
      (_, y, m, d) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
}

function translateAtom(text) {
  const trimmed = text.trim();
  if (!HANGUL.test(trimmed)) return text;
  let result = UI.get(trimmed);
  if (result === undefined) {
    for (const [pattern, replacement] of TEMPLATES) {
      if (pattern.test(trimmed)) {
        result = trimmed.replace(pattern, replacement);
        break;
      }
    }
  }
  if (result === undefined) result = trimmed;
  const leading = text.match(/^\s*/)?.[0] || '';
  const trailing = text.match(/\s*$/)?.[0] || '';
  return leading + result + trailing;
}

function translateCompound(text, element) {
  if (!HANGUL.test(text)) return text;
  if (element?.matches('.collection-gap-item > small')) return text.replace(/^대체 경로 · /, 'Alternative route · ');
  if (element?.matches('.active-filter-chip')) {
    const chip = text.replace(/^([^:]+): ([\s\S]+) ×$/, (whole, label, value) =>
      UI.has(label) ? `${UI.get(label)}: ${value} ×` : whole);
    if (chip !== text) return chip;
    if (text.endsWith(' 조건 해제')) {
      for (const [label, english] of UI) {
        if (text.startsWith(`${label} `)) {
          return `${english} ${text.slice(label.length + 1, -' 조건 해제'.length)} remove filter`;
        }
      }
    }
  }
  const trimmed = text.trim();
  // Prefer individual fragments for mixed metadata. Templates such as
  // "First collected ..." must not swallow later Korean UI fragments.
  const wholeOwned = UI.has(trimmed) || WHOLE_PHRASES.test(trimmed);
  if (wholeOwned || !/( · | \/ )/.test(text)) {
    const exact = translateAtom(text);
    if (exact !== text) return localizeDateTemplates(exact);
  }

  // Card aria labels contain the job title; only their controlled suffix is UI.
  if (element?.closest('.job-card') && element.matches('.job-select, .favorite, .dismiss, .job-state')) {
    return text
      .replace(/ 선택$/, ' select')
      .replace(/ 관심 해제$/, ' remove from saved jobs')
      .replace(/ 관심 등록$/, ' save job')
      .replace(/ 지원 상태$/, ' application status')
      .replace(/ 숨김 해제$/, ' unhide')
      .replace(/ 숨기기$/, ' hide');
  }

  let result = text;
  // Whole-prefix strings whose suffix comes from user-provided job metadata.
  if (element?.matches('.decision-value')) result = result.replace(/^지금 볼 이유 · /, 'Why review · ');
  if (element?.matches('.decision-unknown')) result = result.replace(/^미확인 · /, 'Unknowns · ');
  if (element?.matches('#toastText')) result = result.replace(/ 공고를 숨겼습니다\.$/, ' was hidden.');
  if (element?.matches('#detailsFitWarnings')) result = result.replace(/^확인 필요: /, 'Needs verification: ');
  if (element?.matches('#detailsFitReasons')) {
    result = result.replace(/이 점수는 합격 가능성이 아니라 검토 우선순위 (\d+)점입니다\./, 'This score measures review priority ($1 points), not hiring chances.');
  }

  // Translate independently generated UI fragments while preserving unknown
  // job names, geographic labels, source quotes, and diagnostic details.
  result = result.split(/( · | \/ )/).map((fragment) => {
    if (fragment === ' · ' || fragment === ' / ') return fragment;
    return translateAtom(fragment);
  }).join('');

  // The above split cannot match dynamic prefixes nested inside fragments.
  result = result
    .replace(/(^| · )지금 볼 이유 · /g, '$1Why review · ')
    .replace(/(^| · )미확인 · /g, '$1Unknowns · ');
  // Enumerated quality/freshness values are emitted by app.js in compound
  // labels. Only translate known values, preserving unfamiliar source data.
  result = result.replace(/\b(Source quality|Collection reliability|Evidence refresh method) ([^·/]+?)(?= · | \/ |$)/g,
    (match, label, value) => `${label} ${translateAtom(value)}`);
  result = result.replace(/\(([^()]*)\)/g, (original, inner) =>
    UI.has(inner) ? `(${UI.get(inner)})` : original);
  if (element?.closest('#sourceHealth')) {
    result = result.replace(/HTTP (?:403 접근 거부|429 요청 제한|서버 오류|요청 오류)|TLS 인증서 연결 오류|DNS 조회 실패|응답 시간 초과|네트워크 연결 오류|실패 원인 미분류/g,
      (term) => UI.get(term) || term);
  }
  return localizeDateTemplates(result);
}

/**
 * Translate supported, UI-owned Korean DOM strings into English.
 *
 * Safe to call repeatedly; unknown feed-derived text and raw job fields are
 * left verbatim. Pass a specific subtree to localize newly inserted elements.
 * @param {Document | Element | DocumentFragment} root
 * @returns {number} Number of text nodes and attributes changed.
 */
export function localizeNicoleUI(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return 0;
  const documentNode = root.ownerDocument || root;
  const walker = documentNode.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  let changed = 0;
  for (const node of textNodes) {
    const element = node.parentElement;
    if (!safeToTranslate(element)) continue;
    const translated = translateCompound(node.nodeValue, element);
    if (translated !== node.nodeValue) {
      node.nodeValue = translated;
      changed++;
    }
  }
  const elements = root.nodeType === 1
    ? [root, ...root.querySelectorAll('*')]
    : root.querySelectorAll('*');
  for (const element of elements) {
    if (!safeToTranslate(element)) continue;
    for (const attribute of ['aria-label', 'title', 'placeholder']) {
      if (!element.hasAttribute(attribute)) continue;
      const original = element.getAttribute(attribute);
      const translated = translateCompound(original, element);
      if (original !== translated) {
        element.setAttribute(attribute, translated);
        changed++;
      }
    }
  }
  return changed;
}
