import assert from 'node:assert/strict';
import {
  defaultLocationReference,
  domesticProvinceOptions,
  domesticRegionFor,
  marketScopesFor,
  eligibilityFor,
  extractSalary,
  localCrossPlatformDuplicateKey,
  structuredLocalBoardCandidate,
  isJeonjuWanjuLocal,
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
  oneFormaCandidate,
  oneFormaSupportsKorean,
  enrichPaymentSignal,
  derivePaymentEvidence,
  reconcileVerificationHistory,
  buildSourceMetrics,
  applySourceMetricsToJobs,
  isDefaultRecommendation,
  recommendationCollapseRisk,
  refreshTimeBasedEvidence
} from './collect-jobs.mjs';

const remote = (location, description = '', countryCode = '') => ({ location, description, remote: true, countryCode });

for (const [input, code, label] of [
  [remote('Remote'), 'unknown', '확인 필요'],
  [remote('Anywhere in France'), 'restricted', '특정 국가 제한'],
  [remote('Worldwide'), 'worldwide', 'Worldwide'],
  [remote('Seoul', '', 'KR'), 'korea', '한국에서 지원 가능'],
  [remote('Remote', 'Location: South Korea (Work from Home).'), 'korea', '한국에서 지원 가능'],
  [remote('Remote', 'Candidates must reside in Germany.'), 'restricted', '특정 국가 제한'],
  [remote('Hong Kong'), 'restricted', '특정 국가 제한'],
  [remote('Sweden'), 'restricted', '특정 국가 제한'],
  [remote('Greater Orlando'), 'restricted', '특정 국가 제한']
]) {
  const result = eligibilityFor(input);
  assert.equal(result.code, code);
  assert.equal(result.label, label);
  assert.ok(result.reason, 'eligibility classification must include a user-readable reason');
  assert.ok(result.basis, 'eligibility classification must include an evidence basis');
}

const hourly = extractSalary('', 'Pay Rate: $13/hour\nFlexible schedule.');
assert.equal(hourly.currency, 'USD');
assert.equal(hourly.min, 13);
assert.equal(hourly.period, 'hour');
assert.equal(hourly.display, '$13/시간');

const koreanHourly = extractSalary('', '근무 조건 급여: 시급 10,320원 (주휴수당 포함 월 2,157,000원 선)');
assert.equal(koreanHourly.currency, 'KRW');
assert.equal(koreanHourly.min, 10320);
assert.equal(koreanHourly.period, 'hour');
assert.equal(koreanHourly.display, '₩10,320/시간');

const koreanMonthlyRange = extractSalary('', '월급 2,330,000원~2,800,000원');
assert.equal(koreanMonthlyRange.currency, 'KRW');
assert.equal(koreanMonthlyRange.min, 2330000);
assert.equal(koreanMonthlyRange.max, 2800000);
assert.equal(koreanMonthlyRange.display, '₩2,330,000–₩2,800,000/월');

const koreanAnnualMinimum = extractSalary('', '연봉 3,000만원 이상');
assert.equal(koreanAnnualMinimum.min, 30000000);
assert.equal(koreanAnnualMinimum.qualifier, 'minimum');
assert.equal(koreanAnnualMinimum.display, '최소 ₩30,000,000/년');

const decimal = extractSalary('', 'Rate: 22.95 USD/hour');
assert.equal(decimal.min, 22.95);
assert.equal(decimal.display, '$22.95/시간');

const suspicious = extractSalary('USD 74000 hourly');
assert.equal(suspicious.confidence, 'suspicious');
assert.match(suspicious.display, /단위 확인 필요/);

const decimalComma = extractSalary('$35,3k- $52k');
assert.equal(decimalComma.min, 35300);
assert.equal(decimalComma.max, 52000);

const sharedSuffix = extractSalary('€75–90k');
assert.equal(sharedSuffix.min, 75000);
assert.equal(sharedSuffix.max, 90000);

const proseNotSalary = extractSalary('', 'Competitive compensation package. Customizable benefits package, 28 days of vacation.');
assert.equal(proseNotSalary.confidence, 'none');

const employeeExpense = extractSalary('', 'Benefits include wellness support. Pay €23 yourself for the optional upgrade.');
assert.equal(employeeExpense.confidence, 'none');

const episodeRate = extractSalary('', 'Compensation: 40-120 EUR/gross per episode.');
assert.equal(episodeRate.min, 40);
assert.equal(episodeRate.max, 120);
assert.equal(episodeRate.period, 'episode');
assert.equal(episodeRate.display, '€40–€120/에피소드');

const upToHourly = extractSalary('', 'Pay: Up to 10 USD/hour.');
assert.equal(upToHourly.display, '최대 $10/시간');
assert.equal(upToHourly.qualifier, 'maximum');

const perJobApprox = extractSalary('', 'Salary: Paid per job – approximately $11.5 per hour.');
assert.equal(perJobApprox.display, '약 $11.5/시간 · 건당 지급 환산');
assert.equal(perJobApprox.paymentBasis, 'per_task_equivalent');

const unrelatedAbout = extractSalary('', 'Pay Rate: $13/hour. Are you passionate about language, technology, and data quality?');
assert.equal(unrelatedAbout.display, '$13/시간');

const regionalOnlyPay = extractSalary('', 'For candidates located in California, New York, Washington, and Colorado, the starting base pay for this position ranges from $15 to $25 per hour. For candidates outside of California, New York, Washington, and Colorado, compensation may fall outside the listed range.');
assert.equal(regionalOnlyPay.scope, 'regional_only');
assert.match(regionalOnlyPay.display, /미국 일부 주 기준/);
assert.match(regionalOnlyPay.display, /\$15–\$25\/시간/);
assert.match(regionalOnlyPay.display, /기타 지역 단가 확인/);

const koreanRegionalPay = extractSalary('', 'For candidates located in Seoul and Busan, the starting base pay for this position ranges from $15 to $25 per hour. For candidates outside Seoul and Busan, compensation may fall outside the listed range.');
assert.equal(koreanRegionalPay.scope, 'regional_only');
assert.match(koreanRegionalPay.display, /Seoul and Busan 기준/);
assert.doesNotMatch(koreanRegionalPay.display, /미국 일부 주/);

const geographyAdjustedRange = extractSalary('', 'We offer a pay range of $6 to $65 per hour, with the exact rate determined after evaluating your experience, expertise, and geographic location. Final offer amounts may vary from the pay range listed above.');
assert.equal(geographyAdjustedRange.display, '$6–$65/시간');
assert.equal(geographyAdjustedRange.scope, 'geography_dependent');

const countryAdjustedRate = extractSalary('', 'Rate: 10 USD per hour (rates vary per country. If you are based elsewhere, the rates will be different).');
assert.equal(countryAdjustedRate.display, '$10/시간');
assert.equal(countryAdjustedRate.scope, 'geography_dependent');

const fixedHourlyBasis = extractSalary('', 'Compensation is calculated at a fixed hourly rate. The amount depends on language and location.');
assert.equal(fixedHourlyBasis.confidence, 'basis_only');
assert.equal(fixedHourlyBasis.display, '금액 비공개 · 시간당 고정 단가');
assert.equal(fixedHourlyBasis.paymentBasis, 'fixed_hourly');

const perSetBasis = extractSalary('', 'Compensation is paid per completed set of reviewed and matched text.');
assert.equal(perSetBasis.confidence, 'basis_only');
assert.equal(perSetBasis.display, '금액 비공개 · 완료 세트당 지급');
assert.equal(perSetBasis.paymentBasis, 'per_completed_set');

const taskBasedBasis = extractSalary('', 'We offer competitive task-based compensation with a flexible workload.');
assert.equal(taskBasedBasis.confidence, 'basis_only');
assert.equal(taskBasedBasis.display, '금액 비공개 · 건별 지급');
assert.equal(taskBasedBasis.paymentBasis, 'per_task');

assert.equal(relevantToProfile({ title: 'Video Reviewer', description: 'This project involves data annotation for AI training.', tags: [] }), true);
assert.equal(relevantToProfile({ title: 'Senior Backend Engineer', description: 'Works with data and AI systems.', tags: [] }), false);
assert.equal(relevantToProfile({ title: 'Remote Office Assistant', description: 'Support administrative operations, bookkeeping, billing, reporting, and data entry.', tags: [] }), true);
assert.equal(relevantToProfile({ title: 'Remote Office Assistant', description: 'Schedule meetings and answer general phone calls.', tags: [] }), false);

const remoteOkStableBase = {
  source: 'Remote OK', company: 'iMerit Technology', title: 'Video Data Annotator', location: 'Remote', remote: true,
  type: 'Remote', salary: '', postedAt: new Date().toISOString(), tags: ['data annotation'], countryCode: '',
  url: 'https://remoteok.com/remote-jobs/remote-video-data-annotator-imerit-technology-1137428'
};
const remoteOkStableA = normalizeJob({
  ...remoteOkStableBase,
  id: 'remoteok:1137428',
  description: '<p>Location: Remote</p><p>Review and annotate videos. No prior AI experience is required.</p><br/><br/>Please mention the word **IMPROVES** and tag RTE= when applying to show you read the job post completely (#RTE=). This is a beta feature to avoid spam applicants.'
});
const remoteOkStableB = normalizeJob({
  ...remoteOkStableBase,
  id: 'remoteok:1137428',
  description: '<p>Location: Remote</p><p>Review and annotate videos. No prior AI experience is required.</p><br/><br/>Please mention the word **IMPROVES** and tag RTI= when applying to show you read the job post completely (#RTI=). This is a beta feature to avoid spam applicants.'
});
assert.equal(remoteOkStableA.description, remoteOkStableB.description, 'Remote OK request-specific anti-spam footer must not leak into the displayed description');
assert.equal(remoteOkStableA.contentFingerprint, remoteOkStableB.contentFingerprint, 'Remote OK request-specific anti-spam footer must not create false source changes');
const remoteOkRealChange = normalizeJob({
  ...remoteOkStableBase,
  id: 'remoteok:1137428',
  description: '<p>Location: Remote</p><p>Review and annotate videos. Two years of prior annotation experience is required.</p><br/><br/>Please mention the word **IMPROVES** and tag RTM= when applying to show you read the job post completely (#RTM=). This is a beta feature to avoid spam applicants.'
});
assert.notEqual(remoteOkStableA.contentFingerprint, remoteOkRealChange.contentFingerprint, 'real Remote OK requirement changes must still change the source fingerprint');
assert.equal(remoteOkStableA.contentFingerprintVersion, 2);
assert.ok(remoteOkStableA.sourceFieldFingerprints?.description);

const longSourceA = normalizeJob({
  company: 'Example Inc.', remote: true, type: 'Remote', salary: '', postedAt: new Date().toISOString(), countryCode: '',
  id: 'long-source-change',
  source: 'Welo Global',
  title: 'Korean AI Reviewer',
  location: 'South Korea',
  url: 'https://example.com/long-source-change',
  description: `${'Stable source text. '.repeat(90)}Requirement tail A`,
  tags: ['Korean', 'AI']
});
const longSourceFirst = reconcileVerificationHistory([longSourceA], [], Date.parse('2026-10-01T00:00:00Z'))[0];
const longSourceB = normalizeJob({
  company: 'Example Inc.', remote: true, type: 'Remote', salary: '', postedAt: new Date().toISOString(), countryCode: '',
  id: 'long-source-change',
  source: 'Welo Global',
  title: 'Korean AI Reviewer',
  location: 'South Korea',
  url: 'https://example.com/long-source-change',
  description: `${'Stable source text. '.repeat(90)}Requirement tail B`,
  tags: ['Korean', 'AI']
});
const longSourceChanged = reconcileVerificationHistory([longSourceB], [longSourceFirst], Date.parse('2026-10-02T00:00:00Z'))[0];
assert.ok(longSourceChanged.lastChangedFields.includes('description'), 'v2 field hashes must detect source changes beyond the stored description preview');

const pool = currentListingState({ source: 'Welo Global', title: 'AI Trainers Network - Korean', description: 'This is not an active job opening.', postedAt: new Date().toISOString() });
assert.equal(pool.code, 'talent_pool');

const liltProjectPool = currentListingState({
  source: 'LILT Production',
  title: 'AI Training Contributor - Korean - Remote',
  description: 'Work availability fluctuates with project demand. Finalize onboarding and become eligible for Applied AI projects.',
  postedAt: new Date().toISOString()
});
assert.equal(liltProjectPool.code, 'talent_pool');
assert.equal(liltProjectPool.basis, 'project_pool');

const currentProject = currentListingState({ source: 'Welo Global', title: 'Generative AI Analyst | Korean (Korea)', description: 'Project Details. Commitment: 4 weeks. Pay Rate: $13/hour. Apply now. Join our database and become part of our growing community.', postedAt: new Date().toISOString() });
assert.equal(currentProject.code, 'verified_open');
assert.equal(currentProject.verification, 'direct_open');

const officialPlatformProject = currentListingState({ source: 'OneForma', title: 'AI Reviewer', description: 'Apply through the platform.', postedAt: new Date().toISOString() });
assert.equal(officialPlatformProject.code, 'official_listed');
assert.equal(officialPlatformProject.verification, 'official_listed');

const expired = currentListingState({ source: 'Remote OK', title: 'Reviewer', description: 'Applications are closed.', postedAt: new Date().toISOString() });
assert.equal(expired.code, 'expired');

const activeTalentDuty = currentListingState({ source: 'Remote OK', title: 'Founding Talent Partner', description: 'Own recruiting end to end and build a talent pool for future hiring needs.', postedAt: new Date().toISOString() });
assert.equal(activeTalentDuty.code, 'current_feed');

const remoteFieldBoundary = eligibilityFor(remote('Remote', 'Location: Remote Engagement: Independent Contractor | Project-Based'));
assert.equal(remoteFieldBoundary.code, 'unknown', 'generic Remote location followed by another field label must not become a fake geography');
assert.match(remoteFieldBoundary.reason, /국가 범위/);
assert.equal(eligibilityFor(remote('World Wide - Remote', '')).code, 'worldwide', 'Greenhouse World Wide spelling must be treated as worldwide eligibility');

const preservedFailure = markPreservedSourceFailure({ listingStatus: 'verified_open', listingLabel: '모집 확인됨', stale: false, score: 100 });
assert.equal(preservedFailure.listingStatus, 'source_error');
assert.equal(preservedFailure.stale, true);
assert.equal(preservedFailure.score, 80);

const base = {
  source: 'Welo Global', company: 'Example Inc.', title: 'Korean Evaluator', remote: true,
  type: 'Remote', salary: '', postedAt: new Date().toISOString(), description: '', tags: [], countryCode: ''
};
const koreaRemoteMarket = normalizeJob({ ...base, id: 'market-korea-remote', location: 'Seoul', countryCode: 'KR', url: 'https://example.com/market-korea-remote' });
assert.deepEqual(koreaRemoteMarket.marketScopes, ['overseas_remote', 'domestic'], 'Korea-targeted remote work must remain in the default overseas/remote view and also be discoverable domestically');
assert.equal(koreaRemoteMarket.domesticRegion.province, '서울특별시');
const multiCountryRemoteMarket = normalizeJob({ ...base, id: 'market-multi-country', location: 'South Korea + 14개 국가', countryCode: 'KR', url: 'https://example.com/market-multi-country' });
assert.deepEqual(multiCountryRemoteMarket.marketScopes, ['overseas_remote'], 'multi-country remote projects must not masquerade as a domestic workplace listing');
assert.equal(multiCountryRemoteMarket.domesticRegion, null);
const sanjeongDomestic = normalizeJob({
  ...base,
  id: 'market-sanjeong-onsite',
  location: '전북특별자치도 전주시 덕진구 산정동',
  remote: false,
  workplaceMode: 'onsite',
  countryCode: 'KR',
  url: 'https://example.com/market-sanjeong-onsite'
});
assert.deepEqual(sanjeongDomestic.marketScopes, ['domestic']);
assert.equal(sanjeongDomestic.domesticRegion.province, '전북특별자치도');
assert.equal(sanjeongDomestic.domesticRegion.locality, '전주시 덕진구');
assert.equal(sanjeongDomestic.domesticRegion.neighborhood, '산정동');
assert.equal(sanjeongDomestic.domesticRegion.lat, defaultLocationReference.lat);
assert.equal(sanjeongDomestic.domesticRegion.coordinatePrecision, 'neighborhood');
assert.deepEqual(marketScopesFor(sanjeongDomestic), ['domestic']);
assert.equal(domesticRegionFor({ location: 'South Korea + 6개 국가', countryCode: 'KR' }), null);
const jeonjuAlias = domesticRegionFor({ location: 'Jeonju, South Korea', countryCode: 'KR' });
assert.equal(jeonjuAlias.province, '전북특별자치도');
assert.equal(jeonjuAlias.city, '전주시');
assert.equal(jeonjuAlias.evidenceLevel, 'derived_alias');
const suncheonAlias = domesticRegionFor({ location: 'Suncheon, South Korea', countryCode: 'KR' });
assert.equal(suncheonAlias.province, '전남광주통합특별시');
assert.equal(suncheonAlias.city, '순천시');
assert.equal(suncheonAlias.evidenceLevel, 'derived_alias');
for (const [location, province, city] of [
  ['Gunsan', '전북특별자치도', '군산시'],
  ['Gunsan, South Korea', '전북특별자치도', '군산시'],
  ['Goyang, South Korea', '경기도', '고양시'],
  ['Gimhae, South Korea', '경상남도', '김해시'],
  ['Yongin, South Korea', '경기도', '용인시'],
  ['군산시, 대한민국', '전북특별자치도', '군산시']
]) {
  const normalized = domesticRegionFor({ location, countryCode: 'KR' });
  assert.equal(normalized.province, province, `${location} must resolve to its current official province`);
  assert.equal(normalized.city, city, `${location} must resolve to its current official city`);
}
assert.ok(domesticProvinceOptions.includes('전남광주통합특별시'));
assert.ok(!domesticProvinceOptions.includes('광주광역시'));
assert.ok(!domesticProvinceOptions.includes('전라남도'));
const countryOnlyRegion = domesticRegionFor({ location: '위치 미상', countryCode: 'KR' });
assert.equal(countryOnlyRegion.precision, 'country');
assert.equal(countryOnlyRegion.evidenceLevel, 'country_code');
assert.equal(countryOnlyRegion.label, '대한민국');

const wanjuStructured = domesticRegionFor({
  location: '전북특별자치도 완주군 소양면 해월리 496-28',
  workAddress: '전북특별자치도 완주군 소양면 해월리 496-28',
  countryCode: 'KR',
  locationEvidenceLevel: 'source_structured'
});
assert.equal(wanjuStructured.province, '전북특별자치도');
assert.equal(wanjuStructured.city, '완주군');
assert.equal(wanjuStructured.district, '', 'county-level Wanju must not be duplicated as both city and district');
assert.equal(wanjuStructured.neighborhood, '소양면');
assert.equal(wanjuStructured.locality, '완주군');
assert.equal(wanjuStructured.coordinatePrecision, 'city');
assert.equal(wanjuStructured.coordinateLabel, '전북특별자치도 완주군');

const work24Rows = parseWork24ListXml(`<?xml version="1.0" encoding="UTF-8"?>
<wantedRoot>
  <wanted>
    <wantedAuthNo>K161132610050001</wantedAuthNo>
    <company>전주 생활서비스</company>
    <title>일반 사무원</title>
    <salTpNm>월급</salTpNm><sal>233만원 이상</sal><minSal>2330000</minSal><maxSal>0</maxSal>
    <region>전북 전주시 덕진구</region><holidayTpNm>주 5일 근무</holidayTpNm>
    <minEdubg>학력무관</minEdubg><maxEdubg>학력무관</maxEdubg><career>관계없음</career>
    <regDt>20261005</regDt><closeDt>20991231</closeDt><infoSvc>VALIDATION</infoSvc>
    <basicAddr>전북특별자치도 전주시 덕진구 금암동</basicAddr><detailAddr>거북바우3길 15</detailAddr>
    <empTpCd>10</empTpCd><jobsCd>029500</jobsCd><smodifyDtm>20261005123000</smodifyDtm>
  </wanted>
  <wanted>
    <wantedAuthNo>K161142610050002</wantedAuthNo>
    <company>완주 운영센터</company>
    <title>운영지원 사무원</title>
    <salTpNm>월급</salTpNm><sal>240만원</sal>
    <region>전북 완주군</region><minEdubg>학력무관</minEdubg><maxEdubg>학력무관</maxEdubg>
    <career>경력 1년 이상</career><regDt>20261005</regDt><closeDt>채용시까지</closeDt>
    <basicAddr>전북특별자치도 완주군 봉동읍</basicAddr><detailAddr>완주산단9로 15</detailAddr>
    <empTpCd>20</empTpCd><jobsCd>029500</jobsCd><smodifyDtm>20261005130000</smodifyDtm>
  </wanted>
</wantedRoot>`);
assert.equal(work24Rows.length, 2);
assert.equal(work24Rows[0].wantedAuthNo, 'K161132610050001');
assert.equal(work24Rows[1].career, '경력 1년 이상');

const work24Office = work24Candidate(work24Rows[0]);
assert.equal(work24Office.source, '고용24');
assert.equal(work24Office.platform, '고용24');
assert.equal(work24Office.sourcePostingId, 'K161132610050001');
assert.equal(work24Office.sourceKind, 'official_government');
assert.equal(work24Office.listingStatus, 'official_listed');
assert.equal(work24Office.category, '사무·운영');
assert.ok(work24Office.score >= 20, 'general local office work must remain reviewable');
assert.equal(work24Office.requirementsStatus, 'routine_check');
assert.ok(work24Office.requirementChecks.some((item) => /자격·면허/.test(item.label)),
  'list-only Work24 candidates must keep detail qualification uncertainty visible');
assert.equal(work24Office.salaryInfo.min, 2330000);
assert.equal(work24Office.salaryInfo.qualifier, 'minimum');
assert.equal(work24Office.domesticRegion.city, '전주시');
assert.equal(work24Office.domesticRegion.district, '덕진구');
assert.equal(work24Office.domesticRegion.neighborhood, '금암동');
assert.equal(work24Office.domesticRegion.precision, 'address');
assert.equal(work24Office.domesticRegion.coordinatePrecision, 'district');
assert.match(work24Office.url, /wantedAuthNo=K161132610050001/);
assert.equal(work24Office.deadlineType, 'fixed');
assert.equal(work24Office.deadlineDate, '2099-12-31');

const work24Experienced = work24Candidate(work24Rows[1]);
assert.equal(work24Experienced.domesticRegion.city, '완주군');
assert.equal(work24Experienced.domesticRegion.district, '');
assert.equal(work24Experienced.domesticRegion.neighborhood, '봉동읍');
assert.equal(work24Experienced.deadlineType, 'rolling');
assert.equal(work24Experienced.requirementsStatus, 'hard_check');
assert.ok(work24Experienced.score < 20, 'mandatory local career requirement must lower recommendation priority');
assert.match(work24Experienced.fitWarning, /경력 요건 확인/);
assert.match(work24Experienced.description, /경력: 경력 1년 이상/);

const work24PartTime = work24Candidate({
  ...work24Rows[0],
  wantedAuthNo: 'K161132610050003',
  title: '카페 매장 운영 파트타임',
  salTpNm: '시급',
  sal: '10,500원',
  career: '관계없음',
  minEdubg: '학력무관',
  maxEdubg: '학력무관'
});
assert.equal(work24PartTime.category, '일반·파트타임');
assert.ok(work24PartTime.score >= 20, 'practical local part-time roles must remain visible at the default domestic threshold');
assert.equal(work24PartTime.requirementsStatus, 'routine_check');

const albamonFixture = structuredLocalBoardCandidate(
  '알바몬',
  '117809753',
  'https://www.albamon.com/jobs/detail/117809753',
  `<!doctype html><html><body>
    <script type="application/ld+json">[
      {
        "@context":"http://schema.org",
        "@type":"JobPosting",
        "title":"[초보주부환영/학력경력무관] 물류현장 사무&운영 지원",
        "datePosted":"2026-07-11",
        "validThrough":"2026-10-24",
        "employmentType":["FULL_TIME","CONTRACTOR"],
        "experienceRequirements":"신입",
        "jobLocation":[{"@type":"Place","address":{"@type":"PostalAddress","streetAddress":"봉동읍 완주산단2로 282-22","addressLocality":"완주군","addressRegion":"전북특별자치도","addressCountry":"대한민국"}}],
        "description":"쿠팡로지스틱스서비스에서 채용을 진행합니다. 업직종: 문서작성·자료조사, 입출고·창고관리",
        "baseSalary":{"@type":"MonetaryAmount","currency":"KRW","value":{"@type":"QuantitativeValue","value":36000000,"unitText":"YEAR"}},
        "hiringOrganization":{"@type":"Organization","name":"쿠팡CLS"}
      }
    ]</script>
    <main>모집마감 상시모집 학력 학력무관 근무지역 전북특별자치도 완주군 봉동읍 완주산단2로 282-22</main>
  </body></html>`
);
assert.equal(albamonFixture.sourcePostingId, '117809753');
assert.equal(albamonFixture.platform, '알바몬');
assert.equal(albamonFixture.domesticRegion.city, '완주군', 'detail workplace must override a misleading search-result locality');
assert.equal(albamonFixture.domesticRegion.neighborhood, '봉동읍');
assert.equal(albamonFixture.domesticRegion.precision, 'address');
assert.equal(albamonFixture.salaryInfo.min, 36000000);
assert.equal(albamonFixture.salaryInfo.period, 'year');
assert.equal(albamonFixture.deadlineType, 'rolling');
assert.equal(albamonFixture.category, '사무·운영');
assert.ok(albamonFixture.score >= 20);

const albaFixture = structuredLocalBoardCandidate(
  '알바천국',
  '147241300',
  'https://www.alba.co.kr/job/Detail?adid=147241300',
  `<!doctype html><html><body>
    <script type="application/ld+json">{
      "@context":"http://schema.org/",
      "@type":"JobPosting",
      "title":"[다이소]완주봉동점 직원/파트 모집합니다. 시급상향",
      "datePosted":"2026-09-30T16:00",
      "validThrough":"2026-10-13T23:59",
      "employmentType":["PART_TIME","FULL_TIME","CONTRACTOR"],
      "hiringOrganization":{"@type":"Organization","name":"다이소 다이소 완주봉동점"},
      "jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","streetAddress":"봉동읍 과학로 1001 다이소완주봉동점","addressLocality":"완주군","addressRegion":"전북특별자치도","addressCountry":"KR"}},
      "baseSalary":{"@type":"MonetaryAmount","currency":"KRW","value":{"@type":"QuantitativeValue","value":10320,"unitText":"HOUR"}},
      "description":"유통·판매, 매장관리·판매, 캐셔·카운터"
    }</script>
    <main>모집마감 상시모집 학력 학력무관</main>
  </body></html>`
);
assert.equal(albaFixture.domesticRegion.city, '완주군');
assert.equal(albaFixture.domesticRegion.neighborhood, '봉동읍');
assert.equal(albaFixture.salaryInfo.min, 10320);
assert.equal(albaFixture.salaryInfo.period, 'hour');
assert.equal(albaFixture.category, '일반·파트타임');
assert.equal(albaFixture.deadlineType, 'rolling');
assert.ok(albaFixture.score >= 20);

const jobKoreaFixture = structuredLocalBoardCandidate(
  '잡코리아',
  '50102892',
  'https://www.jobkorea.co.kr/Recruit/GI_Read/50102892',
  `<!doctype html><html><body>
    <script type="application/ld+json">{
      "@context":"https://schema.org",
      "@type":"JobPosting",
      "title":"[신한은행 / 전북 전주시] 스마트혁신 AI 컨시어지 채용 (신입가능)",
      "description":"㈜아데코코리아 에서 계약직 경력무관 채용을 진행합니다.",
      "datePosted":"2026-10-02",
      "validThrough":"2026-11-01T23:59",
      "employmentType":["CONTRACTOR","TEMPORARY"],
      "experienceRequirements":"경력무관",
      "educationRequirements":"학력무관",
      "hiringOrganization":{"@type":"Organization","name":"㈜아데코코리아"},
      "jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","streetAddress":"전북 전주시 완산구 팔달로 204 (경원동3가, 신한은행)"}},
      "baseSalary":{"@type":"MonetaryAmount","currency":"KRW","value":{"@type":"QuantitativeValue","value":114650000,"unitText":"HOUR"}},
      "identifier":{"@type":"PropertyValue","name":"JobKorea","value":"50102892"}
    }</script>
    <main>모집요강 고용형태 계약직 급여 시급 11,465원 (면접 후 결정) 근무지주소 전북 전주시 완산구 팔달로 204 (경원동3가, 신한은행) 지원자격 경력 경력무관 학력 학력무관 접수기간 · 방법 시작일 2026.10.02(금) 마감일 2026.11.01(일)</main>
  </body></html>`
);
assert.equal(jobKoreaFixture.domesticRegion.city, '전주시');
assert.equal(jobKoreaFixture.domesticRegion.district, '완산구');
assert.equal(jobKoreaFixture.salaryInfo.min, 11465, 'visible JobKorea salary text must override malformed JSON-LD salary scaling');
assert.equal(jobKoreaFixture.salaryInfo.period, 'hour');
assert.equal(jobKoreaFixture.deadlineType, 'fixed');
assert.equal(jobKoreaFixture.deadlineDate, '2026-11-01');
assert.equal(jobKoreaFixture.experience, '경력무관');
assert.equal(jobKoreaFixture.education, '학력무관');
assert.equal(jobKoreaFixture.category, '사무·운영');
assert.ok(jobKoreaFixture.score >= 20);

const lotAddressFixture = structuredLocalBoardCandidate(
  '잡코리아',
  '50050328',
  'https://www.jobkorea.co.kr/Recruit/GI_Read/50050328',
  `<!doctype html><html><body>
    <script type="application/ld+json">{
      "@context":"https://schema.org",
      "@type":"JobPosting",
      "title":"[전북완주 산업단지내]제품정리&반품업무&사무직",
      "datePosted":"2026-09-25",
      "validThrough":"2026-10-24",
      "employmentType":["TEMPORARY"],
      "hiringOrganization":{"@type":"Organization","name":"(주)맨파워코리아"},
      "jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","streetAddress":"전북 완주군 봉동읍 용암리 841"}},
      "baseSalary":{"@type":"MonetaryAmount","currency":"KRW","value":{"@type":"QuantitativeValue","value":120000,"unitText":"DAY"}}
    }</script>
    <main>경력 경력무관 학력 학력무관 마감일 2026.10.24</main>
  </body></html>`
);
assert.equal(lotAddressFixture.domesticRegion.precision, 'address', 'parcel-lot addresses ending in 리 + lot number are exact source addresses');
assert.equal(lotAddressFixture.domesticRegion.coordinatePrecision, 'city', 'source address precision must remain separate from county centroid precision');

const localPackingFixture = structuredLocalBoardCandidate(
  '알바몬',
  '119526261',
  'https://www.albamon.com/jobs/detail/119526261',
  `<!doctype html><html><body>
    <script type="application/ld+json">{
      "@context":"https://schema.org",
      "@type":"JobPosting",
      "title":"완주)화장품포장 생산직모집★익산전주통근버스★(지게차 시급13000원)",
      "datePosted":"2026-10-05",
      "employmentType":["FULL_TIME","CONTRACTOR"],
      "hiringOrganization":{"@type":"Organization","name":"㈜대신산업"},
      "jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","streetAddress":"전북 완주군 완주산단5로 248 (용암리) 아이큐어 완주공장"}},
      "baseSalary":{"@type":"MonetaryAmount","currency":"KRW","value":{"@type":"QuantitativeValue","value":10700,"unitText":"HOUR"}},
      "description":"제조·가공·조립, 포장·품질검사, 물류피킹·포장·전산 초보가능"
    }</script>
    <main>모집마감 상시모집 학력 학력무관 우대사항 차량소지, 유사업무 경험 우대</main>
  </body></html>`
);
assert.equal(localPackingFixture.category, '일반·파트타임');
assert.ok(localPackingFixture.score >= 20, 'a beginner-friendly packing role must not be hidden merely because the title mentions a separate forklift pay rate');
assert.ok(!localPackingFixture.fitWarnings.includes('전문 자격·기술 경력 요건 확인'));

const remoteLocalAddressFixture = structuredLocalBoardCandidate(
  '알바몬',
  '119500001',
  'https://www.albamon.com/jobs/detail/119500001',
  `<!doctype html><html><body>
    <script type="application/ld+json">{
      "@context":"https://schema.org",
      "@type":"JobPosting",
      "title":"[재택근무] 전주 고객상담",
      "employmentType":["PART_TIME"],
      "hiringOrganization":{"@type":"Organization","name":"테스트 고객센터"},
      "jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","streetAddress":"전북특별자치도 전주시 덕진구 기린대로 1"}},
      "baseSalary":{"@type":"MonetaryAmount","currency":"KRW","value":{"@type":"QuantitativeValue","value":12000,"unitText":"HOUR"}},
      "description":"재택근무 고객상담"
    }</script>
  </body></html>`
);
assert.equal(isJeonjuWanjuLocal(remoteLocalAddressFixture), false, 'remote postings with a local address must not enter commute-local collection');
const nationwideLocalAddressFixture = {
  ...albamonFixture,
  title: '[전국채용] 배송기사 모집',
  description: '전국 모집',
  _fullDescription: '전국 모집'
};
assert.equal(isJeonjuWanjuLocal(nationwideLocalAddressFixture), false, 'nationwide postings must not be treated as Jeonju/Wanju commute jobs');

const work24Old = { ...work24Office, id: 'job:work24-old', source: '고용24', sources: ['고용24'] };
const nonWork24Fallback = { id: 'job:other-source', source: 'RWS TrainAI', sources: ['RWS TrainAI'] };
assert.deepEqual(
  fallbackJobsForConfiguredSources([work24Old, nonWork24Fallback], { work24Configured: false }).map((job) => job.id),
  [nonWork24Fallback.id],
  'Work24 jobs must not survive archived-missing grace after its approved API key is removed'
);
assert.equal(
  fallbackJobsForConfiguredSources([work24Old], { work24Configured: true }).length,
  1,
  'configured Work24 may use the normal source-failure preservation path'
);

const normalizedRemoteMode = normalizeJob({ ...base, id: 'mode-remote', remote: false, workplaceMode: 'Remote', location: 'South Korea', countryCode: 'KR', url: 'https://example.com/mode-remote' });
assert.equal(normalizedRemoteMode.workplaceMode, 'remote');
assert.equal(normalizedRemoteMode.remote, true);
assert.deepEqual(normalizedRemoteMode.marketScopes, ['overseas_remote', 'domestic']);
const normalizedHybridMode = normalizeJob({ ...base, id: 'mode-hybrid', remote: true, workplaceMode: 'Hybrid', location: 'Seoul', countryCode: 'KR', url: 'https://example.com/mode-hybrid' });
assert.equal(normalizedHybridMode.workplaceMode, 'hybrid');
assert.equal(normalizedHybridMode.remote, false, 'hybrid must not masquerade as fully remote');
assert.deepEqual(normalizedHybridMode.marketScopes, ['domestic']);

const korea = normalizeJob({ ...base, id: 'one', location: 'South Korea', url: 'https://example.com/korea' });
const france = normalizeJob({ ...base, id: 'two', location: 'France', url: 'https://example.com/france' });
const regional = dedupe([korea, france]);
assert.equal(regional.length, 2, 'specific regional postings must remain distinct');
assert.equal(new Set(regional.map((job) => job.id)).size, 2, 'specific regional postings need distinct stable ids');

const boardCopy = normalizeJob({ ...base, id: 'three', source: 'Remote OK', location: 'South Korea', url: 'https://board.example/korea' });
const merged = dedupe([korea, boardCopy]);
assert.equal(merged.length, 1);
assert.equal(merged[0].source, 'Welo Global', 'official ATS should be preferred as primary source');
assert.equal(merged[0].duplicateCount, 2);
assert.ok(merged[0].alternateUrls.includes('https://board.example/korea'));

const berlin = normalizeJob({ ...base, id: 'berlin', source: 'Arbeitnow', location: 'Berlin, Germany', url: 'https://example.com/berlin' });
const paris = normalizeJob({ ...base, id: 'paris', source: 'Arbeitnow', location: 'Paris, France', url: 'https://example.com/paris' });
const regionalBoardCopies = dedupe([berlin, paris]);
assert.equal(regionalBoardCopies.length, 2, 'same title/company in different restricted locations must not merge');
assert.equal(new Set(regionalBoardCopies.map((job) => job.id)).size, 2);

const domesticSeoul = normalizeJob({ ...base, id: 'domestic-seoul', location: '서울특별시', remote: false, workplaceMode: 'onsite', countryCode: 'KR', url: 'https://example.com/domestic-seoul' });
const domesticJeonju = normalizeJob({ ...base, id: 'domestic-jeonju', location: '전북특별자치도 전주시 덕진구', remote: false, workplaceMode: 'onsite', countryCode: 'KR', url: 'https://example.com/domestic-jeonju' });
const domesticLocationCopies = dedupe([domesticSeoul, domesticJeonju]);
assert.equal(domesticLocationCopies.length, 2, 'same company/title in different domestic localities must remain distinct');
assert.equal(new Set(domesticLocationCopies.map((job) => job.id)).size, 2);
const sameUrlSeoul = normalizeJob({ ...base, id: 'same-url-seoul', location: '서울특별시 강남구', remote: false, workplaceMode: 'onsite', countryCode: 'KR', url: 'https://example.com/shared-domestic-posting' });
const sameUrlJeonju = normalizeJob({ ...base, id: 'same-url-jeonju', location: '전북특별자치도 전주시 덕진구', remote: false, workplaceMode: 'onsite', countryCode: 'KR', url: 'https://example.com/shared-domestic-posting' });
const sameUrlDomesticLocations = dedupe([sameUrlSeoul, sameUrlJeonju]);
assert.equal(sameUrlDomesticLocations.length, 2, 'same URL must not override conflicting actual domestic workplace regions');
assert.equal(new Set(sameUrlDomesticLocations.map((job) => job.id)).size, 2);
const branchA = normalizeJob({
  ...base,
  id: 'branch-a',
  company: '지역생활서비스',
  title: '매장 운영 보조',
  location: '전북특별자치도 전주시 덕진구 기린대로 400-14',
  workAddress: '전북특별자치도 전주시 덕진구 기린대로 400-14',
  locationEvidenceLevel: 'source_structured',
  remote: false,
  workplaceMode: 'onsite',
  countryCode: 'KR',
  url: 'https://example.com/branch-a'
});
const branchB = normalizeJob({
  ...branchA,
  id: 'branch-b',
  location: '전북특별자치도 전주시 덕진구 기린대로 410',
  workAddress: '전북특별자치도 전주시 덕진구 기린대로 410',
  url: 'https://example.com/branch-b'
});
const distinctBranches = dedupe([branchA, branchB]);
assert.equal(distinctBranches.length, 2, 'same company/title at different exact branch addresses must remain distinct');
assert.equal(new Set(distinctBranches.map((job) => job.id)).size, 2);
const branchACopy = normalizeJob({
  ...branchA,
  id: 'branch-a-copy',
  source: 'Arbeitnow',
  sourceListingState: 'published',
  url: 'https://board.example.com/branch-a-copy'
});
const mergedSameBranch = dedupe([branchA, branchACopy]);
assert.equal(mergedSameBranch.length, 1, 'the same company/title at the same exact branch address may merge across sources');
assert.equal(mergedSameBranch[0].duplicateCount, 2);
const localizedAdA = normalizeJob({
  ...branchA,
  id: 'localized-ad-a',
  source: '알바천국',
  title: '쿠팡CLS물류현장운영&사무보조,주말,평일,야간,전주시 서신동',
  company: '쿠팡로지스틱스서비스 유한회사',
  location: '전북특별자치도 완주군 봉동읍 완주산단2로 282-22 쿠팡',
  workAddress: '전북특별자치도 완주군 봉동읍 완주산단2로 282-22 쿠팡',
  sourceListingState: 'public_detail',
  url: 'https://www.alba.co.kr/job/Detail?adid=1'
});
const localizedAdB = normalizeJob({
  ...localizedAdA,
  id: 'localized-ad-b',
  title: '쿠팡CLS물류현장운영&사무보조,주말,평일,야간,전주시 송천동1가',
  url: 'https://www.alba.co.kr/job/Detail?adid=2'
});
const mergedLocalizedAds = dedupe([localizedAdA, localizedAdB]);
assert.equal(mergedLocalizedAds.length, 1, 'location-targeting suffixes must not split the same actual local posting');
assert.equal(mergedLocalizedAds[0].duplicateCount, 2);
const distinctRoleSameAddress = normalizeJob({
  ...localizedAdA,
  id: 'localized-ad-role-b',
  title: '쿠팡CLS 헬퍼리더 현장 운영 관리자',
  url: 'https://www.alba.co.kr/job/Detail?adid=3'
});
assert.equal(dedupe([localizedAdA, distinctRoleSameAddress]).length, 2,
  'different roles at one workplace must remain distinct even when the exact address matches');

const albamonOfficeCrossBoard = normalizeJob({
  ...albamonFixture,
  id: 'albamon-office-cross-board',
  source: '알바몬',
  platform: '알바몬',
  company: '쿠팡CLS',
  title: '[초보주부환영/학력경력무관] 물류현장 사무&운영 지원',
  workAddress: '전북특별자치도 완주군 봉동읍 완주산단2로 282-22',
  location: '전북특별자치도 완주군 봉동읍 완주산단2로 282-22',
  salary: '연봉 36,000,000원',
  url: 'https://www.albamon.com/jobs/detail/117809753'
});
const albaOfficeCrossBoard = normalizeJob({
  ...albamonOfficeCrossBoard,
  id: 'alba-office-cross-board',
  source: '알바천국',
  platform: '알바천국',
  company: '쿠팡로지스틱스서비스 유한회사',
  title: '쿠팡CLS물류현장운영&사무보조,주말,평일,야간,전주시 송천동1가',
  workAddress: '전북특별자치도 완주군 봉동읍 완주산단2로 282-22 쿠팡',
  location: '전북특별자치도 완주군 봉동읍 완주산단2로 282-22 쿠팡',
  salary: '연봉 36,000,000원',
  url: 'https://www.alba.co.kr/job/Detail?adid=145474035'
});
const mergedCrossBoardOffice = dedupe([albamonOfficeCrossBoard, albaOfficeCrossBoard]);
assert.equal(
  localCrossPlatformDuplicateKey(albamonOfficeCrossBoard),
  localCrossPlatformDuplicateKey(albaOfficeCrossBoard),
  'actual-like cross-board duplicates must produce the same strong local duplicate signature'
);
assert.equal(mergedCrossBoardOffice.length, 1, 'same local role on different boards should merge when company alias, exact workplace, category and pay all agree');
assert.deepEqual(new Set(mergedCrossBoardOffice[0].sources), new Set(['알바몬', '알바천국']));
assert.ok(mergedCrossBoardOffice[0].legacyIds.includes('alba-office-cross-board') || mergedCrossBoardOffice[0].legacyIds.includes('albamon-office-cross-board'),
  'cross-board merge must retain the secondary stable/raw identity for saved user state migration');
const cafeBaristaCrossBoard = normalizeJob({
  ...albamonOfficeCrossBoard,
  id: 'cafe-barista-cross-board',
  source: '알바몬',
  platform: '알바몬',
  company: '같은카페',
  title: '같은카페 주말 바리스타 모집',
  workAddress: '전북특별자치도 완주군 봉동읍 과학로 100',
  location: '전북특별자치도 완주군 봉동읍 과학로 100',
  salary: '시급 10,320원',
  url: 'https://www.albamon.com/jobs/detail/119500002'
});
const cafeCashierCrossBoard = normalizeJob({
  ...cafeBaristaCrossBoard,
  id: 'cafe-cashier-cross-board',
  source: '알바천국',
  platform: '알바천국',
  title: '같은카페 주말 캐셔 모집',
  salary: '시급 10,320원',
  url: 'https://www.alba.co.kr/job/Detail?adid=147500002'
});
assert.equal(
  localCrossPlatformDuplicateKey(cafeBaristaCrossBoard),
  localCrossPlatformDuplicateKey(cafeCashierCrossBoard),
  'same address/category/pay is only a candidate duplicate signature, not sufficient proof by itself'
);
assert.equal(dedupe([cafeBaristaCrossBoard, cafeCashierCrossBoard]).length, 2,
  'different cross-board roles at the same branch and pay must not merge without strong title-role overlap');
const seongnamAliasA = normalizeJob({ ...base, id: 'seongnam-a', location: 'Seongnam, South Korea', remote: false, workplaceMode: 'onsite', countryCode: 'KR', url: 'https://example.com/seongnam-a' });
const seongnamAliasB = normalizeJob({ ...base, id: 'seongnam-b', location: 'Seongnam-si, Gyeonggi-do, South Korea', remote: false, workplaceMode: 'onsite', countryCode: 'KR', url: 'https://example.com/seongnam-b' });
assert.equal(dedupe([seongnamAliasA])[0].id, dedupe([seongnamAliasB])[0].id, 'equivalent English Korean-admin aliases must produce the same domestic stable id');
assert.equal(dedupe([korea])[0].id, dedupe([normalizeJob({ ...base, id: 'korea-same', location: 'South Korea', url: 'https://example.com/korea-same' })])[0].id,
  'Korea-targeted remote stable ids must not change just because domestic discovery was added');

const priorUnknown = dedupe([normalizeJob({ ...base, id: 'remoteok:42', source: 'Remote OK', location: 'Remote', url: 'https://example.com/same' })])[0];
const freshKorea = dedupe([normalizeJob({ ...base, id: 'remoteok:42', source: 'Remote OK', location: 'South Korea', url: 'https://example.com/same' })])[0];
assert.notEqual(priorUnknown.id, freshKorea.id, 'eligibility changes can legitimately change the stable id');
const carried = carryForwardLegacyIds([freshKorea], [priorUnknown])[0];
assert.ok(carried.legacyIds.includes(priorUnknown.id), 'previous stable id must remain an alias for client state migration');

const now = Date.parse('2026-10-04T00:00:00Z');
const disappeared = { ...priorUnknown, id: 'job:old-missing', missingSince: '2026-10-03T00:00:00Z' };
const withGracePeriod = carryRecentlyMissing([], [disappeared], now);
assert.equal(withGracePeriod.length, 1);
assert.equal(withGracePeriod[0].listingStatus, 'archived_missing');
assert.equal(withGracePeriod[0].score, 0);
assert.ok(['clear', 'routine_check', 'hard_check'].includes(withGracePeriod[0].requirementsStatus),
  'legacy carried jobs must be upgraded to the current requirements contract');
assert.ok(withGracePeriod[0].requirementsLabel);
assert.ok(withGracePeriod[0].contentFingerprint, 'legacy carried jobs must retain a stable historical content fingerprint');
const secondGraceCycle = carryRecentlyMissing([], withGracePeriod, now + 86400000);
assert.equal(secondGraceCycle.length, 1, 'relevant archived_missing jobs must remain through subsequent grace-period collections');
assert.equal(secondGraceCycle[0].listingStatus, 'archived_missing');
const nonKoreanOneFormaMissing = carryRecentlyMissing([], [{
  ...disappeared,
  source: 'OneForma',
  sourceKind: 'official_platform',
  tags: ['English', 'Annotation'],
  score: 30
}], now);
assert.equal(nonKoreanOneFormaMissing.length, 0, 'intentionally excluded non-Korean OneForma projects must not return through missing-job grace');
const tooOld = carryRecentlyMissing([], [{ ...disappeared, missingSince: '2026-09-01T00:00:00Z' }], now);
assert.equal(tooOld.length, 0, 'missing jobs must age out after the grace period');

const specialist = normalizeJob({ ...base, id: 'legal', source: 'RWS TrainAI', title: 'Legal Annotators - Korean', location: 'South Korea', url: 'https://example.com/legal' });
assert.ok(specialist.score < 20, 'unverified specialist credentials must not enter default recommendations');
assert.match(specialist.fitWarning, /전문/);

const oneFormaPost = {
  id: 2366,
  date_gmt: '2026-09-30T08:00:00',
  link: 'https://www.oneforma.com/projects/multilingual-ai-quality-assurance-reviewer/',
  title: { rendered: 'Multilingual AI Quality Assurance Reviewer' },
  content: { rendered: '<p>Review multilingual AI outputs as a remote quality reviewer.</p>' },
  _embedded: {
    'wp:term': [
      [{ taxonomy: 'job_type', name: 'Annotation' }],
      [{ taxonomy: 'job_tag', name: 'Fixed Rate Per Hour' }, { taxonomy: 'job_tag', name: 'Remote' }, { taxonomy: 'job_tag', name: 'Selected Locations' }],
      [{ taxonomy: 'domain', name: 'Languages' }],
      [{ taxonomy: 'country', name: 'South Korea' }, { taxonomy: 'country', name: 'Japan' }],
      [{ taxonomy: 'language', name: 'Korean' }, { taxonomy: 'language', name: 'Japanese' }]
    ]
  }
};
const oneFormaRaw = oneFormaCandidate(oneFormaPost);
assert.equal(oneFormaRaw.remote, true);
assert.match(oneFormaRaw.location, /South Korea/);
assert.ok(oneFormaRaw.tags.includes('Korean'));
const oneFormaJob = normalizeJob(oneFormaRaw);
assert.equal(oneFormaJob.eligibilityCode, 'korea');
assert.equal(oneFormaJob.sourceKind, 'official_platform');
assert.equal(oneFormaJob.listingStatus, 'official_listed');
assert.ok(oneFormaJob.listingReason);
assert.ok(oneFormaJob.eligibilityReason);
assert.equal(oneFormaJob.sourceOfficiality, 'official');
assert.ok(oneFormaJob.listingEvidence.some((item) => item.url === oneFormaJob.url));

const nonKoreanOneFormaPost = structuredClone(oneFormaPost);
nonKoreanOneFormaPost._embedded['wp:term'] = nonKoreanOneFormaPost._embedded['wp:term']
  .map((group) => group.filter((term) => term.taxonomy !== 'language' || term.name !== 'Korean'));
assert.equal(oneFormaSupportsKorean(nonKoreanOneFormaPost), false, 'OneForma projects with explicit non-Korean language lists must not enter the feed');
assert.equal(oneFormaSupportsKorean(oneFormaPost), true);

const koreanLocationLocalLanguagePost = structuredClone(nonKoreanOneFormaPost);
koreanLocationLocalLanguagePost._embedded['wp:term'].push([
  { taxonomy: 'country', name: 'South Korea' },
  { taxonomy: 'language', name: 'English' },
  { taxonomy: 'language', name: 'Spanish' }
]);
koreanLocationLocalLanguagePost.content.rendered = '<p>You are a native or a fluent speaker of the language of the location where you are located.</p>';
assert.equal(
  oneFormaSupportsKorean(koreanLocationLocalLanguagePost),
  true,
  'South Korea projects that explicitly require the local language must remain in recall even when language taxonomy omits Korean'
);

const translationRater = normalizeJob({
  ...base,
  id: 'translation-rater',
  source: 'OneForma',
  title: 'Bilingual Translation Quality Rater',
  location: 'Worldwide',
  url: 'https://example.com/translation-rater',
  description: 'Candidates should have some translation background and rate translations for selected language pairs.',
  tags: ['Korean', 'Worldwide', 'Quality Rater']
});
assert.ok(translationRater.score < 20, 'translation roles must not be default recommendations without verified translation qualifications');
assert.match(translationRater.fitWarning, /번역/);

const translationQualityPlus = normalizeJob({
  ...base,
  id: 'translation-quality-plus',
  source: 'OneForma',
  title: 'Paragraph-Level Translation Quality Rater',
  location: 'Worldwide',
  url: 'https://example.com/translation-quality-plus',
  description: 'Requirements: Native speaker, attention to detail, computer and internet. Previous experience with translation quality review is a plus.',
  tags: ['Korean', 'Worldwide', 'Quality Rater']
});
assert.ok(translationQualityPlus.score >= 20, 'translation quality evaluation must remain recommendable when translation experience is only a plus');
assert.doesNotMatch(translationQualityPlus.fitWarning, /번역 언어쌍/);

const residencyRequirement = normalizeJob({
  ...base,
  id: 'residency',
  source: 'OneForma',
  title: 'Local Search Quality Evaluator',
  location: 'South Korea',
  url: 'https://example.com/residency',
  description: 'You must be living in South Korea for at least 5 years and be fluent in Korean.',
  tags: ['Korean', 'Search Evaluator']
});
assert.ok(residencyRequirement.score < 20, 'unverified long-term residency requirements must not enter default recommendations');
assert.match(residencyRequirement.fitWarning, /거주/);

const annotationTenure = normalizeJob({
  ...base,
  id: 'annotation-tenure',
  source: 'OneForma',
  title: 'Multilingual Intent And Response Annotator',
  location: 'Worldwide',
  url: 'https://example.com/annotation-tenure',
  description: 'Requirements: At least 1 year of experience working on annotation or data labeling projects.',
  tags: ['Korean', 'Annotation']
});
assert.ok(annotationTenure.score < 20, 'unverified one-year annotation tenure must not enter default recommendations');
assert.match(annotationTenure.fitWarning, /1년/);

const transcriptionExperience = normalizeJob({
  ...base,
  id: 'transcription-experience',
  source: 'OneForma',
  title: 'Multilingual Podcast Transcription And Speech Annotator',
  location: 'South Korea',
  url: 'https://example.com/transcription-experience',
  description: 'Requirements: Native Korean. Previous transcription or speech annotation experience.',
  tags: ['Korean', 'Speech Annotator']
});
assert.ok(transcriptionExperience.score < 20, 'required transcription experience must be treated as an unverified hard requirement');
assert.match(transcriptionExperience.fitWarning, /전사/);

const severalYearsResidence = normalizeJob({
  ...base,
  id: 'residency-several-years',
  source: 'Remote OK',
  title: 'AI Trainer Image QA Evaluator',
  location: 'South Korea',
  url: 'https://example.com/residency-several-years',
  description: 'Applicants must currently reside in South Korea and have lived there for several years. English: C1 level or above.',
  tags: ['AI Trainer', 'QA']
});
assert.ok(severalYearsResidence.score < 20, 'several-years residence and C1 hard requirements must not enter default recommendations');
assert.match(severalYearsResidence.fitWarning, /장기 거주/);
assert.match(severalYearsResidence.fitWarning, /C1/);

const iosRequirement = normalizeJob({
  ...base,
  id: 'ios-requirement',
  source: 'OneForma',
  title: 'App Store And Music Search Evaluator',
  location: 'South Korea',
  url: 'https://example.com/ios-requirement',
  description: 'Requirements: You have a valid Apple ID. You have an iOS Device. You are native or fluent in Korean.',
  tags: ['Korean', 'Search Evaluator']
});
assert.ok(iosRequirement.score < 20, 'unverified Apple device requirements must not enter default recommendations');
assert.match(iosRequirement.fitWarning, /iOS/);

const meridialLanguageSpecialist = normalizeJob({
  ...base,
  id: 'greenhouse:agency:4629001101',
  source: 'Meridial',
  title: 'Korean Language Specialist - Freelance AI Trainer Project',
  company: 'Meridial',
  location: 'World Wide - Remote',
  url: 'https://job-boards.eu.greenhouse.io/agency/jobs/4629001101',
  description: 'A degree is not required for this role; real-world experience speaks louder. Teaching experience or hands-on linguistic analysis projects signal fit. We offer a pay range of $6 to $65 per hour. As a contractor you’ll supply a secure computer and high-speed internet.',
  tags: ['Korean', 'Freelance AI Trainer']
});
assert.equal(meridialLanguageSpecialist.sourceKind, 'official_ats');
assert.equal(meridialLanguageSpecialist.listingStatus, 'verified_open');
assert.ok(meridialLanguageSpecialist.score >= 20);
assert.notEqual(meridialLanguageSpecialist.requirementsStatus, 'hard_check');

const meridialAndroid = normalizeJob({
  ...base,
  id: 'greenhouse:agency:4762606101',
  source: 'Meridial',
  title: 'Korean Language Specialist (Android Device) - Freelance AI Trainer Project',
  company: 'Meridial',
  location: 'South Korea',
  url: 'https://job-boards.eu.greenhouse.io/agency/jobs/4762606101',
  description: 'Candidates must have access to Android devices. A masters or PhD is ideal.',
  tags: ['Korean']
});
assert.ok(meridialAndroid.score < 20);
assert.match(meridialAndroid.fitWarning, /Android/);

const meridialMultimodal = normalizeJob({
  ...base,
  id: 'greenhouse:agency:4778241101',
  source: 'Meridial',
  title: 'Korean Language Data Contributor (Multimodal) – Freelance AI Trainer Project',
  company: 'Meridial',
  location: 'World Wide - Remote',
  url: 'https://job-boards.eu.greenhouse.io/agency/jobs/4778241101',
  description: 'Eligibility for this project requires that you are 18 years or older and agree to the applicable participant and consent agreements. Supply a secure computer and high-speed internet.',
  tags: ['Korean', 'AI']
});
assert.match(meridialMultimodal.requirementChecks.map((item) => item.label).join(' '), /18세/);
assert.match(meridialMultimodal.requirementChecks.map((item) => item.label).join(' '), /동의서/);

const meridialVoice = normalizeJob({
  ...base,
  id: 'greenhouse:agency:voice',
  source: 'Meridial',
  title: 'Korean Voice Actor - Freelance AI Trainer Project',
  company: 'Meridial',
  location: 'World Wide - Remote',
  url: 'https://example.com/meridial-voice',
  description: 'Voice AI can improve education, entertainment, accessibility, and beyond. We need demonstrated experience in professional voice acting, dubbing, or narration.',
  tags: ['Korean']
});
assert.match(meridialVoice.fitWarning, /음성 연기/);
assert.doesNotMatch(meridialVoice.fitWarning, /접근성/, 'generic product accessibility context must not imply WCAG professional experience');

const meridialCoding = normalizeJob({
  ...base,
  id: 'greenhouse:agency:coding',
  source: 'Meridial',
  title: 'Coding Specialist (Fluent in Korean) - Freelance AI Trainer Project',
  company: 'Meridial',
  location: 'South Korea',
  url: 'https://example.com/meridial-coding',
  description: 'Evaluate coding tasks for AI systems.',
  tags: ['Korean']
});
assert.ok(meridialCoding.score < 20);
assert.match(meridialCoding.fitWarning, /코딩/);

const meridialLarp = normalizeJob({
  ...base,
  id: 'greenhouse:agency:4927750101',
  source: 'Meridial',
  title: 'Language Alignment & Resource Partner (Korean) - Freelance AI Trainer Project',
  company: 'Meridial',
  location: 'World Wide - Remote',
  url: 'https://job-boards.eu.greenhouse.io/agency/jobs/4927750101',
  description: 'Required Expertise: Demonstrable work or educational experience in linguistics, education, or other fields requiring high attention to linguistic detail. Prior, tangible experience working in human data evaluation or annotation. Verified Korean language proficiency of C1 or C2.',
  tags: ['Korean', 'AI']
});
assert.ok(meridialLarp.score >= 20, 'verified Korean teaching and AI evaluation experience should satisfy LARP experience requirements');
assert.equal(meridialLarp.requirementsStatus, 'routine_check');
assert.match(meridialLarp.requirementChecks.map((item) => item.label).join(' '), /검증된 경력과 일치/);
assert.match(meridialLarp.requirementChecks.map((item) => item.label).join(' '), /C1\/C2/);
assert.doesNotMatch(meridialLarp.decisionUnknowns.join(' '), /검증된 경력과 일치/,
  'satisfied requirements must not be presented as decision unknowns');

const tsmgKoreanQc = normalizeJob({
  ...base,
  id: 'lever:tsmg:c4edd822-bcd8-4e06-939b-a85ba4867707',
  source: 'TSMG',
  company: 'Terry Soot Management Group',
  title: 'Quality control specialist for AI/ ML with Korean language',
  location: 'Remote in South Korea',
  url: 'https://jobs.lever.co/tsmg/c4edd822-bcd8-4e06-939b-a85ba4867707',
  description: 'Review Korean language transcription quality for an AI speech recognition project. Previous transcription, proofreading, quality control, annotation, or linguistic project experience is a plus.',
  tags: ['AI/ML Data Collection']
});
assert.equal(tsmgKoreanQc.sourceKind, 'official_ats');
assert.equal(tsmgKoreanQc.eligibilityCode, 'korea');
assert.ok(tsmgKoreanQc.score >= 20);
assert.notEqual(tsmgKoreanQc.requirementsStatus, 'hard_check');

const elevenLabsTranscription = normalizeJob({
  ...base,
  id: 'ashby:elevenlabs:ef0a1e14-40ee-43d2-aab9-59fc9f6a4b8c',
  source: 'ElevenLabs',
  company: 'ElevenLabs',
  title: 'Transcription / Subtitling Specialist (Freelance)',
  location: 'World Wide - Remote',
  countryCode: '',
  url: 'https://jobs.ashbyhq.com/elevenlabs/ef0a1e14-40ee-43d2-aab9-59fc9f6a4b8c',
  description: 'Competitive task-based compensation. Requirements: Native or near-native fluency. Prior experience in transcription or subtitling and familiarity with relevant tools. This role is remote and can be executed globally.',
  tags: ['Korean', 'Transcription', 'Productions']
});
assert.equal(elevenLabsTranscription.sourceKind, 'official_ats');
assert.equal(elevenLabsTranscription.eligibilityCode, 'worldwide');
assert.equal(elevenLabsTranscription.salaryInfo.paymentBasis, 'per_task');
assert.equal(elevenLabsTranscription.salaryInfo.confidence, 'basis_only');
assert.equal(elevenLabsTranscription.requirementsStatus, 'hard_check');
assert.ok(elevenLabsTranscription.score < 20, 'mandatory prior transcription/subtitling experience must block the default recommendation');
assert.match(elevenLabsTranscription.fitWarning, /전사·자막/);

const kraftonLocalization = normalizeJob({
  ...base,
  id: 'greenhouse:krafton:8798601002',
  source: 'KRAFTON',
  company: 'KRAFTON',
  title: '[Studio Support Div.] Korean Localization Specialist (1년 이상 / 계약직)',
  location: 'Seoul; Seoul, South Korea',
  remote: false,
  workplaceMode: 'onsite',
  countryCode: 'KR',
  url: 'https://job-boards.greenhouse.io/krafton/jobs/8798601002',
  description: 'Review Korean localization and AI translation quality. Required: at least one year of professional game localization translation, editing, or language QA experience.',
  tags: ['Localization']
});
assert.equal(kraftonLocalization.sourceKind, 'official_ats');
assert.deepEqual(kraftonLocalization.marketScopes, ['domestic']);
assert.equal(kraftonLocalization.domesticRegion.province, '서울특별시');
assert.equal(kraftonLocalization.domesticRegion.coordinatePrecision, 'city');
assert.equal(kraftonLocalization.requirementsStatus, 'hard_check');
assert.ok(kraftonLocalization.score < 20, 'professional game localization experience must not be inferred from Korean teaching');
assert.match(kraftonLocalization.fitWarning, /로컬라이제이션/);

const kraftonDataProgram = normalizeJob({
  ...base,
  id: 'greenhouse:krafton:8798984002',
  source: 'KRAFTON', company: 'KRAFTON',
  title: '[AI Research Div.] Data Program Manager (경력무관 / 인턴)',
  location: 'Seoul; Seoul, South Korea', remote: false, workplaceMode: 'onsite', countryCode: 'KR',
  url: 'https://job-boards.greenhouse.io/krafton/jobs/8798984002',
  description: 'Plan AI training data sourcing, quality criteria, vendors, and data analysis. No years of prior experience are required.',
  tags: ['Machine Learning', 'Data']
});
assert.ok(kraftonDataProgram.score >= 20, 'exact domestic AI data-program role without hard experience must remain reviewable');
assert.equal(kraftonDataProgram.requirementsStatus, 'routine_check');
assert.match(kraftonDataProgram.requirementChecks.map((item) => item.label).join(' '), /ML 논문 이해·기초 데이터 분석/);
assert.doesNotMatch(kraftonDataProgram.fitWarning, /전문경력/);

const kraftonFoundationEvaluation = normalizeJob({
  ...base,
  id: 'greenhouse:krafton:8632414002',
  source: 'KRAFTON', company: 'KRAFTON',
  title: '[AI Research Div.] Foundation Model Evaluation Engineer - 독자 AI 파운데이션 모델 (2년 이상 / 인턴)',
  location: 'Seoul', remote: false, workplaceMode: 'onsite', countryCode: 'KR',
  url: 'https://job-boards.greenhouse.io/krafton/jobs/8632414002',
  description: 'Required: a master or PhD in a deep-learning-related field or equivalent research experience. Required: AI model evaluation and analysis experience or experience writing top-tier ML/NLP papers.',
  tags: ['AI', 'Model Evaluation']
});
assert.equal(kraftonFoundationEvaluation.category, 'AI 평가·어노테이션');
assert.equal(kraftonFoundationEvaluation.requirementsStatus, 'hard_check');
assert.ok(kraftonFoundationEvaluation.score < 20);
assert.match(kraftonFoundationEvaluation.fitWarning, /석·박사 또는 동등 연구경험/);
assert.match(kraftonFoundationEvaluation.fitWarning, /AI 모델 평가·분석 또는 상위권 ML\/NLP 논문 작성 경험/);
assert.doesNotMatch(kraftonFoundationEvaluation.fitWarning, /개발 전문경력/);

const appierCreativeQc = normalizeJob({
  ...base,
  id: 'greenhouse:appier:8187636',
  source: 'Appier', company: 'Appier',
  title: '[Part Time] AI Creative QC Reviewer, Korea',
  location: 'Seoul, South Korea', remote: true, workplaceMode: 'remote', countryCode: 'KR',
  type: 'Part Time', url: 'https://job-boards.greenhouse.io/appier/jobs/8187636',
  description: 'AI 생성 광고 소재의 한국어 품질 검수. 자격 요건: 한국어 원어민 수준, 영어 텍스트 기반 커뮤니케이션 가능. 우대 사항: AI 생성물 검수 또는 데이터 라벨링 경험. 급여: 시급 10,320원 (주휴수당 포함 월 2,157,000원 선). 근무 형태: 재택 (교육 기간 중 Hybrid 가능). 근무 시간: 주 40시간.',
  tags: ['Korean', 'AI Creative QC']
});
assert.equal(appierCreativeQc.sourceKind, 'official_ats');
assert.equal(appierCreativeQc.category, 'AI 평가·어노테이션');
assert.equal(appierCreativeQc.workplaceMode, 'remote');
assert.equal(appierCreativeQc.remote, true);
assert.deepEqual(appierCreativeQc.marketScopes, ['overseas_remote', 'domestic']);
assert.equal(appierCreativeQc.domesticRegion.province, '서울특별시');
assert.equal(appierCreativeQc.salaryInfo.currency, 'KRW');
assert.equal(appierCreativeQc.salaryInfo.min, 10320);
assert.equal(appierCreativeQc.salaryInfo.period, 'hour');
assert.equal(appierCreativeQc.salaryInfo.display, '₩10,320/시간');
assert.equal(appierCreativeQc.requirementsStatus, 'routine_check');
assert.doesNotMatch(appierCreativeQc.fitWarning, /데이터 라벨링|QC/);
assert.match(appierCreativeQc.requirementChecks.map((item) => item.label).join(' '), /교육 기간 중 하이브리드 출근/);
assert.ok(appierCreativeQc.score >= 20, 'preferred AI/QC experience must not hard-block the Appier role');

const channelDataAnalyst = normalizeJob({
  ...base,
  id: 'lever:zoyi:31ee3067-0c55-4ca3-b7a5-5a6c0d80e249',
  source: 'Channel Corp', company: 'Channel Corp',
  title: 'Data Analyst',
  location: 'Gangnam District, Seoul', remote: false, workplaceMode: 'hybrid', countryCode: 'KR',
  type: '주니어/시니어/정규직', url: 'https://jobs.lever.co/zoyi/31ee3067-0c55-4ca3-b7a5-5a6c0d80e249',
  description: '데이터 분석(DA) 관련 실무 경험 1년 ~ 5년 이상. SQL을 활용하여 Raw Data를 능숙하게 추출하고 분석. 1차 면접은 라이브 쿼리 테스트와 Q&A 형식으로 진행됩니다.',
  tags: ['Data']
});
assert.equal(channelDataAnalyst.sourceKind, 'official_ats');
assert.equal(channelDataAnalyst.category, '조사·데이터');
assert.equal(channelDataAnalyst.workplaceMode, 'hybrid');
assert.equal(channelDataAnalyst.domesticRegion.province, '서울특별시');
assert.equal(channelDataAnalyst.domesticRegion.district, '강남구');
assert.equal(channelDataAnalyst.domesticRegion.coordinatePrecision, 'district');
assert.equal(channelDataAnalyst.requirementsStatus, 'hard_check');
assert.ok(channelDataAnalyst.score < 20, 'mandatory DA experience and SQL must keep Channel Data Analyst out of default recommendations');
assert.match(channelDataAnalyst.fitWarning, /데이터 분석 실무 1년 이상·SQL/);
assert.match(channelDataAnalyst.requirementChecks.map((item) => item.label).join(' '), /라이브 SQL 테스트/);

const tsmgCoordinator = normalizeJob({
  ...base,
  id: 'lever:tsmg:8b91fe18-a80a-46bd-9513-c521b5d37c5c',
  source: 'TSMG', company: 'Terry Soot Management Group',
  title: 'Team Coordinator',
  location: 'Remote in South Korea', remote: true, workplaceMode: 'remote', countryCode: 'KR',
  type: 'Part time', url: 'https://jobs.lever.co/tsmg/8b91fe18-a80a-46bd-9513-c521b5d37c5c',
  description: 'Project focuses on structured image data collection and usability testing. Coordinate local participants, onboarding, scheduling, device logistics, sessions, metadata and documentation. Previous experience in coordination or training is a plus. Excellent communication skills in English. Knowledge of the local language is preferred but not mandatory.',
  tags: ['AI/ML Data Collection']
});
assert.equal(tsmgCoordinator.category, '커뮤니티·운영');
assert.equal(tsmgCoordinator.requirementsStatus, 'routine_check');
assert.equal(tsmgCoordinator.remote, true);
assert.deepEqual(tsmgCoordinator.marketScopes, ['overseas_remote', 'domestic']);
assert.ok(tsmgCoordinator.score >= 20, 'preferred-only coordination experience must not be promoted to a hard requirement');
assert.doesNotMatch(tsmgCoordinator.fitWarning, /coordination|training|경력/);

const appenLidar = normalizeJob({
  ...base,
  id: 'jobicy:154499',
  source: 'Jobicy',
  title: '3D & LiDAR Data Annotation Analyst',
  company: 'Appen',
  location: 'Anywhere',
  url: 'https://jobicy.com/jobs/154499-3d-lidar-data-annotation-analyst',
  description: 'What You Bring Experience working in a fast-paced, scaled environment with defined productivity, quality, or accuracy targets. Experience with image annotation GenAI workflows. Reliable high-speed internet, a distraction-free workspace, and the ability to work on a company-provisioned machine within a controlled environment. Nice to Haves Experience with 3D annotation tools.',
  tags: ['Data Annotation']
});
assert.ok(appenLidar.score < 20);
assert.match(appenLidar.fitWarning, /GenAI/);
assert.match(appenLidar.requirementChecks.map((item) => item.label).join(' '), /회사 제공 장비/);

const hardRelatedExperience = normalizeJob({
  ...base,
  id: 'hard-related-experience',
  source: 'Welo Global',
  title: 'Generative AI Analyst | Korean (Korea)',
  location: 'South Korea',
  url: 'https://example.com/hard-related-experience',
  description: 'We are looking for detail-oriented professionals with experience in annotation, content review, quality assurance, or data operations to support AI projects.',
  tags: ['Korean', 'AI']
});
assert.ok(hardRelatedExperience.score >= 20, 'verified AI evaluation/annotation/QA capability must satisfy the matching experience requirement');
assert.doesNotMatch(hardRelatedExperience.fitWarning, /실무 경험/);
assert.match(hardRelatedExperience.requirementChecks.map((item) => item.label).join(' '), /검증된 경력과 일치/);
assert.doesNotMatch(hardRelatedExperience.decisionUnknowns.join(' '), /검증된 경력과 일치/,
  'verified experience must remain a satisfied signal rather than an unknown');

const hardSubjectMatterExpert = normalizeJob({
  ...base,
  id: 'hard-sme',
  source: 'LILT Production',
  title: 'Subject Matter Expert – Retail Trade & Store Operations (English/Korean) – Remote',
  location: 'Korea (Remote)',
  url: 'https://example.com/hard-sme',
  description: 'Qualifications: Native Korean. 5+ years of professional experience in Retail, Store Operations, or related industry background.',
  tags: ['Korean', 'AI Data Services']
});
assert.ok(hardSubjectMatterExpert.score < 20, 'subject-matter expert roles with explicit five-year domain experience must not enter default recommendations');
assert.equal(hardSubjectMatterExpert.requirementsStatus, 'hard_check');
assert.match(hardSubjectMatterExpert.fitWarning, /전문경력/);

const boardMetadataConflict = normalizeJob({
  ...base,
  id: 'board-metadata-conflict',
  source: 'Remotive',
  title: 'Remote Office Assistant',
  location: 'Worldwide',
  url: 'https://example.com/board-metadata-conflict',
  salary: '$35.3k-$52k',
  salaryProvenance: 'board_metadata',
  description: 'For candidates located in California, New York, Washington, and Colorado, the starting base pay for this position ranges from $15 to $25 per hour. For candidates outside of California, New York, Washington, and Colorado, compensation may fall outside the listed range. Data entry and reporting are core duties.',
  tags: ['Operations']
});
assert.equal(boardMetadataConflict.salaryProvenance, 'posting_text');
assert.equal(boardMetadataConflict.salaryMetadataSuppressed, true);
assert.equal(boardMetadataConflict.salaryMetadataConflict, true);
assert.match(boardMetadataConflict.salaryInfo.display, /미국 일부 주 기준/);

const boardMetadataOnly = normalizeJob({
  ...base,
  id: 'board-metadata-only',
  source: 'Remote OK',
  title: 'Korean AI Response Reviewer',
  location: 'South Korea',
  url: 'https://example.com/board-metadata-only',
  salary: '20000',
  salaryProvenance: 'board_metadata',
  description: 'The final rate will be specified in the offer. Review Korean AI responses.',
  tags: ['Korean', 'AI']
});
assert.equal(boardMetadataOnly.salaryInfo.display, '');
assert.equal(boardMetadataOnly.salaryProvenance, 'board_metadata_unverified');
assert.equal(boardMetadataOnly.salaryMetadataSuppressed, true);

const preferredRelatedExperience = normalizeJob({
  ...base,
  id: 'preferred-related-experience',
  source: 'OneForma',
  title: 'Multilingual AI Quality Assurance Reviewer',
  location: 'South Korea',
  url: 'https://example.com/preferred-related-experience',
  description: 'Preferred experience: experience in annotation, content review, quality assurance, or data operations is a plus.',
  tags: ['Korean', 'AI Quality Assurance']
});
assert.ok(preferredRelatedExperience.score >= 20, 'preferred related experience must not become a hard blocker');
assert.doesNotMatch(preferredRelatedExperience.fitWarning, /실무 경험/);

const devRole = normalizeJob({
  ...base,
  id: 'developer-role',
  source: 'Remote OK',
  title: 'Korean Frontend Developer',
  location: 'South Korea',
  url: 'https://example.com/developer-role',
  description: 'Build production React applications. 3 years of frontend development experience required.',
  tags: ['Korean', 'Developer']
});
assert.ok(devRole.score < 20, 'software development roles must not rank as recommendations from Korean keyword overlap');
assert.match(devRole.fitWarning, /개발 전문경력/);

const copywriterRole = normalizeJob({
  ...base,
  id: 'copywriter-role',
  source: 'Remote OK',
  title: 'Korean Copywriter',
  location: 'South Korea',
  url: 'https://example.com/copywriter-role',
  description: 'Professional marketing copywriting experience required.',
  tags: ['Korean', 'Content']
});
assert.ok(copywriterRole.score < 20, 'professional copywriting roles must not rank as recommendations');
assert.match(copywriterRole.fitWarning, /카피라이팅/);

const accessibilityRole = normalizeJob({
  ...base,
  id: 'accessibility-role',
  source: 'Remote OK',
  title: 'Korean Accessibility Specialist',
  location: 'South Korea',
  url: 'https://example.com/accessibility-role',
  description: 'WCAG audit experience required for accessibility testing.',
  tags: ['Korean', 'Accessibility']
});
assert.ok(accessibilityRole.score < 20, 'accessibility specialist roles must not rank without verified accessibility expertise');
assert.match(accessibilityRole.fitWarning, /접근성 전문경력/);

const routineRequirement = normalizeJob({
  ...base,
  id: 'routine-requirement',
  source: 'RWS TrainAI',
  title: 'AI Data Specialist - Korean',
  location: 'South Korea',
  url: 'https://example.com/routine-requirement',
  description: 'English Proficiency: Fluent or advanced proficiency in English (levels B2-C2). Native Korean required.',
  tags: ['Korean', 'AI']
});
assert.equal(routineRequirement.requirementsStatus, 'routine_check');
assert.match(routineRequirement.requirementChecks.map((item) => item.label).join(' '), /영어/);

const practicalRequirements = normalizeJob({
  ...base,
  id: 'practical-requirements',
  source: 'Welo Global',
  title: 'Ads Quality Rater - Korean',
  location: 'South Korea',
  url: 'https://example.com/practical-requirements',
  description: 'Resident in Korea. This job requires you to work on freelance projects in Korea without any legal issues. Please do not use IP masking programs (VPN, etc.).',
  tags: ['Korean', 'Quality Rater']
});
assert.equal(practicalRequirements.requirementsStatus, 'routine_check');
assert.match(practicalRequirements.requirementChecks.map((item) => item.label).join(' '), /한국 거주/);
assert.match(practicalRequirements.requirementChecks.map((item) => item.label).join(' '), /프리랜서/);
assert.match(practicalRequirements.requirementChecks.map((item) => item.label).join(' '), /VPN/);

const historyBase = normalizeJob({
  ...base,
  id: 'history-base',
  source: 'Welo Global',
  title: 'Korean AI Reviewer',
  location: 'South Korea',
  url: 'https://example.com/history',
  description: 'Review Korean AI responses.',
  tags: ['Korean', 'AI']
});
const historyFirst = reconcileVerificationHistory([historyBase], [], Date.parse('2026-10-01T00:00:00Z'))[0];
assert.equal(historyFirst.lastChangeKind, 'first_seen');
assert.equal(historyFirst.verificationHistory.at(-1).event, 'first_seen');

const historyUnchangedRaw = normalizeJob({
  ...base,
  id: 'history-base',
  source: 'Welo Global',
  title: 'Korean AI Reviewer',
  location: 'South Korea',
  url: 'https://example.com/history',
  description: 'Review Korean AI responses.',
  tags: ['Korean', 'AI']
});
const historyUnchanged = reconcileVerificationHistory(
  [historyUnchangedRaw],
  [historyFirst],
  Date.parse('2026-10-02T00:00:00Z')
)[0];
assert.equal(historyUnchanged.verificationHistory.length, 1, 'unchanged six-hour refreshes must not grow history indefinitely');

const historyChangedRaw = normalizeJob({
  ...base,
  id: 'history-base',
  source: 'Welo Global',
  title: 'Korean AI Reviewer',
  location: 'South Korea',
  url: 'https://example.com/history',
  description: 'Review Korean AI responses. Pay Rate: $15/hour.',
  tags: ['Korean', 'AI']
});
const historyChanged = reconcileVerificationHistory(
  [historyChangedRaw],
  [historyUnchanged],
  Date.parse('2026-10-03T00:00:00Z')
)[0];
assert.equal(historyChanged.lastChangeKind, 'content_changed');
assert.ok(historyChanged.lastChangedFields.includes('description'));
assert.equal(historyChanged.verificationHistory.at(-1).event, 'content_changed');

const disappearedHistory = carryRecentlyMissing([], [historyChanged], Date.parse('2026-10-04T00:00:00Z'))[0];
assert.equal(disappearedHistory.verificationHistory.at(-1).event, 'disappeared');
assert.ok(disappearedHistory.missingCheckedAt);
assert.equal(disappearedHistory.lastSeenAt, historyChanged.lastSeenAt, 'lastSeenAt must remain the last successful observation');

const reappearedRaw = normalizeJob({
  ...base,
  id: 'history-base',
  source: 'Welo Global',
  title: 'Korean AI Reviewer',
  location: 'South Korea',
  url: 'https://example.com/history',
  description: 'Review Korean AI responses. Pay Rate: $15/hour.',
  tags: ['Korean', 'AI']
});
const reappeared = reconcileVerificationHistory(
  [reappearedRaw],
  [disappearedHistory],
  Date.parse('2026-10-05T00:00:00Z')
)[0];
assert.equal(reappeared.lastChangeKind, 'reappeared');
assert.equal(reappeared.verificationHistory.at(-1).event, 'reappeared');
assert.equal(reappeared.missingSince, '');

const failed = markPreservedSourceFailure(reappeared);
const failedHistory = reconcileVerificationHistory(
  [failed],
  [reappeared],
  Date.parse('2026-10-06T00:00:00Z')
)[0];
assert.equal(failedHistory.lastChangeKind, 'source_failed');
assert.equal(failedHistory.lastSeenAt, reappeared.lastSeenAt, 'source failure must not pretend the posting was successfully seen again');
assert.equal(failedHistory.lastVerifiedAt, reappeared.lastVerifiedAt, 'source failure must preserve the last successful verification timestamp');
assert.ok(failedHistory.sourceFailureCheckedAt);
const stillFailedRaw = markPreservedSourceFailure(reappearedRaw);
const stillFailedHistory = reconcileVerificationHistory(
  [stillFailedRaw],
  [failedHistory],
  Date.parse('2026-10-14T00:00:00Z')
)[0];
assert.equal(stillFailedHistory.verificationHistory.length, failedHistory.verificationHistory.length,
  'prolonged source_error must not append a false verified_unchanged checkpoint');
assert.notEqual(stillFailedHistory.verificationHistory.at(-1).event, 'verified_unchanged');
const recovered = reconcileVerificationHistory(
  [reappearedRaw],
  [failedHistory],
  Date.parse('2026-10-07T00:00:00Z')
)[0];
assert.equal(recovered.lastChangeKind, 'source_recovered');

const legacySalaryHistory = {
  ...historyUnchangedRaw,
  contentFingerprintVersion: undefined,
  sourceFieldFingerprints: undefined,
  lastChangeKind: 'content_changed',
  lastChangeAt: '2026-10-02T00:00:00.000Z',
  lastContentChangeAt: '2026-10-02T00:00:00.000Z',
  lastChangedFields: ['salary'],
  verificationHistory: [{
    at: '2026-10-02T00:00:00.000Z',
    event: 'content_changed',
    changedFields: ['salary'],
    reason: '원문 주요 필드 변경: salary'
  }]
};
const rebasedHistory = reconcileVerificationHistory(
  [historyUnchangedRaw],
  [legacySalaryHistory],
  Date.parse('2026-10-03T00:00:00Z')
)[0];
assert.ok(rebasedHistory.verificationHistory.some((item) => item.event === 'legacy_content_change_unverified'),
  'v1 derived-salary content events must be retained but explicitly downgraded as unverified');
assert.equal(rebasedHistory.verificationHistory.at(-1).event, 'source_fingerprint_rebased');
assert.equal(rebasedHistory.lastChangeKind, 'source_fingerprint_rebased');
assert.equal(rebasedHistory.lastContentChangeAt, '');

const legacyUnchangedHistory = {
  ...historyUnchangedRaw,
  contentFingerprintVersion: undefined,
  sourceFieldFingerprints: undefined,
  lastChangeKind: 'first_seen',
  lastChangeAt: '2026-10-01T00:00:00.000Z',
  verificationHistory: [{
    at: '2026-10-01T00:00:00.000Z',
    event: 'first_seen',
    toStatus: 'verified_open',
    reason: '처음 수집됨'
  }]
};
const rebasedUnchangedHistory = reconcileVerificationHistory(
  [historyUnchangedRaw],
  [legacyUnchangedHistory],
  Date.parse('2026-10-10T00:00:00Z')
)[0];
assert.equal(rebasedUnchangedHistory.verificationHistory.at(-1).event, 'source_fingerprint_rebased',
  'every v1→v2 contract transition must be recorded as a rebase rather than a verified_unchanged comparison');
assert.equal(rebasedUnchangedHistory.lastChangeKind, 'source_fingerprint_rebased');

const sourceMetrics = buildSourceMetrics(
  ['Welo Global', 'Remotive'],
  new Map([
    ['Welo Global', { rawCount: 100, matchedCount: 8, profileMatchedCount: 8 }],
    ['Remotive', { rawCount: 100, matchedCount: 6, profileMatchedCount: 6 }]
  ]),
  [
    { source: 'Welo Global', ok: true, count: 8 },
    { source: 'Remotive', ok: true, count: 6 }
  ],
  [
    ...Array.from({ length: 8 }, (_, index) => ({ ...historyBase, id: `welo-${index}`, source: 'Welo Global' })),
    ...Array.from({ length: 6 }, (_, index) => ({ ...historyBase, id: `remotive-${index}`, source: 'Remotive', sourceKind: 'job_board' }))
  ],
  [
    ...Array.from({ length: 8 }, (_, index) => ({ ...historyBase, id: `welo-${index}`, source: 'Welo Global' })),
    { ...historyBase, id: 'remotive-0', source: 'Remotive', sourceKind: 'job_board' }
  ],
  {},
  Date.parse('2026-10-04T00:00:00Z')
);
assert.equal(sourceMetrics['Welo Global'].qualityTier, 'strong');
assert.equal(sourceMetrics.Remotive.qualityTier, 'mixed', 'one noisy intermediary run must not blanket-block a potentially useful source');
const metricsApplied = applySourceMetricsToJobs([
  { ...historyBase, source: 'Remotive', sourceKind: 'job_board', requirementsStatus: 'clear', score: 80, eligibilityCode: 'worldwide', listingStatus: 'current_feed' }
], sourceMetrics)[0];
assert.equal(metricsApplied.recommendationEligible, true, 'low source yield alone must not blanket-block an individually strong job');
assert.equal(isDefaultRecommendation(metricsApplied), true);

const repeatedNoisySourceMetrics = buildSourceMetrics(
  ['Remotive'],
  new Map([['Remotive', { rawCount: 100, matchedCount: 6, profileMatchedCount: 6 }]]),
  [{ source: 'Remotive', ok: true, count: 6 }],
  Array.from({ length: 6 }, (_, index) => ({ ...historyBase, id: `repeat-remotive-${index}`, source: 'Remotive', sourceKind: 'job_board' })),
  [{ ...historyBase, id: 'repeat-remotive-0', source: 'Remotive', sourceKind: 'job_board' }],
  {
    Remotive: {
      history: [
        { at: '2026-10-01T00:00:00.000Z', ok: true, rawCount: 100, matchedCount: 6, keptCount: 1, recommendedCount: 0, duplicateCount: 0, lowQualityCount: 5 },
        { at: '2026-10-02T00:00:00.000Z', ok: true, rawCount: 100, matchedCount: 6, keptCount: 1, recommendedCount: 0, duplicateCount: 0, lowQualityCount: 5 }
      ]
    }
  },
  Date.parse('2026-10-04T00:00:00Z')
);
assert.equal(repeatedNoisySourceMetrics.Remotive.qualityTier, 'weak', 'repeated 80%+ noise must downgrade an intermediary source');
const repeatedNoisyJob = applySourceMetricsToJobs([
  { ...historyBase, source: 'Remotive', sourceKind: 'job_board', requirementsStatus: 'clear', score: 80, eligibilityCode: 'worldwide', listingStatus: 'current_feed' }
], repeatedNoisySourceMetrics)[0];
assert.equal(repeatedNoisyJob.recommendationEligible, false, 'repeatedly weak sources must not contribute default recommendations');
assert.match(repeatedNoisyJob.sourceRecommendationGateReason, /유효 공고 비율|중복·저품질/);

const repeatedDuplicateMetrics = buildSourceMetrics(
  ['Remote OK'],
  new Map([['Remote OK', { rawCount: 100, matchedCount: 10, profileMatchedCount: 10 }]]),
  [{ source: 'Remote OK', ok: true, count: 10 }],
  Array.from({ length: 2 }, (_, index) => ({ ...historyBase, id: `remote-duplicate-${index}`, source: 'Remote OK', sourceKind: 'job_board' })),
  Array.from({ length: 2 }, (_, index) => ({ ...historyBase, id: `remote-duplicate-${index}`, source: 'Remote OK', sourceKind: 'job_board' })),
  {
    'Remote OK': {
      history: [
        { at: '2026-10-01T00:00:00.000Z', ok: true, rawCount: 100, matchedCount: 10, keptCount: 2, recommendedCount: 0, duplicateCount: 8, lowQualityCount: 0 },
        { at: '2026-10-02T00:00:00.000Z', ok: true, rawCount: 100, matchedCount: 10, keptCount: 2, recommendedCount: 0, duplicateCount: 8, lowQualityCount: 0 }
      ]
    }
  },
  Date.parse('2026-10-04T00:00:00Z')
);
assert.equal(repeatedDuplicateMetrics['Remote OK'].qualityTier, 'weak', 'repeated duplicate-heavy matching must count as source noise');

const failedSourceMetrics = buildSourceMetrics(
  ['Remotive'],
  new Map([['Remotive', { rawCount: 0, matchedCount: 0 }]]),
  [{ source: 'Remotive', ok: false, count: 0, error: '503' }],
  [],
  [],
  {
    Remotive: {
      history: [{ at: '2026-10-02T00:00:00.000Z', ok: false, rawCount: 0, matchedCount: 0, keptCount: 0, recommendedCount: 0, duplicateCount: 0, lowQualityCount: 0 }]
    }
  },
  Date.parse('2026-10-04T00:00:00Z')
);
assert.equal(failedSourceMetrics.Remotive.reliabilityState, 'degraded');
const failedMetricJob = applySourceMetricsToJobs([
  { ...historyBase, source: 'Remotive', sourceKind: 'job_board', requirementsStatus: 'clear', score: 80, eligibilityCode: 'worldwide', listingStatus: 'current_feed' }
], failedSourceMetrics)[0];
assert.equal(failedMetricJob.recommendationEligible, false, 'repeated source failures must gate recommendations until the source recovers');

const evidenceAgingPrior = { ...historyFirst, paymentEvidenceFreshness: 'fresh', paymentEvidenceState: 'mixed_caution' };
const evidenceAgingCurrent = { ...historyUnchangedRaw, paymentEvidenceFreshness: 'aging', paymentEvidenceState: 'mixed_caution' };
const evidenceAgingHistory = reconcileVerificationHistory(
  [evidenceAgingCurrent],
  [evidenceAgingPrior],
  Date.parse('2026-10-08T00:00:00Z')
)[0];
assert.equal(evidenceAgingHistory.verificationHistory.at(-1).event, 'evidence_freshness_changed');

const evidenceStateOnlyPrior = { ...historyFirst, paymentEvidenceFreshness: 'fresh', paymentEvidenceState: 'caution_repeated' };
const evidenceStateOnlyCurrent = { ...historyUnchangedRaw, paymentEvidenceFreshness: 'fresh', paymentEvidenceState: 'mixed_caution' };
const evidenceStateOnlyHistory = reconcileVerificationHistory(
  [evidenceStateOnlyCurrent],
  [evidenceStateOnlyPrior],
  Date.parse('2026-10-08T00:00:00Z')
)[0];
assert.equal(evidenceStateOnlyHistory.verificationHistory.at(-1).event, 'evidence_state_changed');
assert.equal(evidenceStateOnlyHistory.verificationHistory.at(-1).fromStatus, 'caution_repeated');
assert.equal(evidenceStateOnlyHistory.verificationHistory.at(-1).toStatus, 'mixed_caution');
assert.doesNotMatch(evidenceStateOnlyHistory.verificationHistory.at(-1).reason, /fresh → fresh/);

const archivedEvidence = {
  ...historyFirst,
  source: 'Welo Global',
  listingStatus: 'archived_missing',
  paymentEvidenceFreshness: 'fresh',
  paymentEvidenceState: 'mixed_caution',
  verificationHistory: [{ at: '2026-10-04T00:00:00.000Z', event: 'disappeared', fromStatus: 'verified_open', toStatus: 'archived_missing' }]
};
const archivedAged = refreshTimeBasedEvidence([archivedEvidence], Date.parse('2027-01-10T00:00:00Z'))[0];
assert.notEqual(archivedAged.paymentEvidenceFreshness, 'fresh');
assert.ok(archivedAged.verificationHistory.some((item) => item.event === 'evidence_freshness_changed'));
assert.ok(archivedAged.verificationHistory.some((item) => item.event === 'evidence_state_changed'));
const archivedAgedAgain = refreshTimeBasedEvidence([archivedAged], Date.parse('2027-01-10T12:00:00Z'))[0];
assert.equal(archivedAgedAgain.verificationHistory.length, archivedAged.verificationHistory.length, 'unchanged carried evidence freshness must not append duplicate events');

const sourceErrorEvidence = {
  ...historyFirst,
  source: 'Welo Global',
  listingStatus: 'source_error',
  paymentEvidenceFreshness: 'fresh',
  paymentEvidenceState: 'mixed_caution'
};
const sourceErrorExpired = refreshTimeBasedEvidence([sourceErrorEvidence], Date.parse('2027-05-01T00:00:00Z'))[0];
assert.equal(sourceErrorExpired.paymentEvidenceFreshness, 'expired');
assert.ok(sourceErrorExpired.verificationHistory.some((item) => item.event === 'evidence_freshness_changed'));
assert.ok(sourceErrorExpired.verificationHistory.some((item) => item.event === 'evidence_state_changed'));

const recommendationFixture = (index, overrides = {}) => ({
  id: `rec-${index}`,
  url: `https://example.com/rec-${index}`,
  title: `Korean AI Evaluator ${index}`,
  score: 70,
  recommendationEligible: true,
  eligibilityCode: 'korea',
  requirementsStatus: 'clear',
  listingStatus: 'verified_open',
  sourceReliabilityState: 'reliable',
  ...overrides
});
const baselineRecommendations = {
  recommendationPolicyVersion: 2,
  jobs: Array.from({ length: 8 }, (_, index) => recommendationFixture(index))
};
const collapsedRecommendations = {
  recommendationPolicyVersion: 2,
  jobs: baselineRecommendations.jobs.slice(0, 2)
};
const collapseRisk = recommendationCollapseRisk(collapsedRecommendations, baselineRecommendations);
assert.equal(collapseRisk.collapse, true, 'same-policy unexplained recommendation collapse must be detected');
assert.equal(collapseRisk.baselineCount, 8);
assert.equal(collapseRisk.currentCount, 2);
assert.equal(recommendationCollapseRisk({ ...collapsedRecommendations, recommendationPolicyVersion: 3 }, baselineRecommendations).collapse, false,
  'policy version bump must explicitly rebaseline intentional recommendation policy changes');
const explainedRecommendations = {
  recommendationPolicyVersion: 2,
  jobs: baselineRecommendations.jobs.map((job, index) => index < 2 ? job : recommendationFixture(index, {
    listingStatus: 'archived_missing',
    sourceCoverage: 'bounded_window',
    recommendationEligible: false,
    score: 0
  }))
};
assert.equal(recommendationCollapseRisk(explainedRecommendations, baselineRecommendations).collapse, false,
  'bounded-window disappearance must not trip the recommendation regression guard');
const currentCatalogCollapse = {
  recommendationPolicyVersion: 2,
  jobs: baselineRecommendations.jobs.map((job, index) => index < 2 ? job : recommendationFixture(index, {
    listingStatus: 'archived_missing',
    sourceCoverage: 'current_catalog',
    recommendationEligible: false,
    score: 0
  }))
};
assert.equal(recommendationCollapseRisk(currentCatalogCollapse, baselineRecommendations).collapse, true,
  'healthy current-catalog disappearance must remain unexplained so collector regressions cannot silently collapse recommendations');

const weakSourceDowngrade = {
  recommendationPolicyVersion: 2,
  jobs: baselineRecommendations.jobs.map((job, index) => index < 2 ? job : recommendationFixture(index, {
    recommendationEligible: false,
    sourceQualityTier: 'weak',
    sourceRecommendationGateReason: '반복적으로 유효 공고 비율이 낮은 소스'
  }))
};
assert.equal(recommendationCollapseRisk(weakSourceDowngrade, baselineRecommendations).collapse, false,
  'intentional weak-source quality gating must be an explained recommendation loss rather than forcing low-value jobs to remain');

const freshSignal = enrichPaymentSignal(
  { type: 'review_aggregate', checkedAt: '2026-10-04', latestSourceAt: '2026-10-02', direction: 'caution', recurrence: 'repeated' },
  Date.parse('2026-11-01T00:00:00Z')
);
assert.equal(freshSignal.freshness, 'fresh');
assert.ok(freshSignal.expiresAt);
assert.equal(freshSignal.freshnessReferenceAt, '2026-10-02');

const undatedCommunity = enrichPaymentSignal(
  { type: 'community_report', checkedAt: '2026-10-04', direction: 'caution', recurrence: 'single' },
  Date.parse('2026-10-04T00:00:00Z')
);
assert.equal(undatedCommunity.freshness, 'unknown', 'undated community anecdotes must not become fresh merely because they were rechecked today');
assert.equal(undatedCommunity.expiresAt, '');

const expiredEvidence = derivePaymentEvidence({
  paymentStatus: 'caution',
  reviewedAt: '2026-01-01',
  paymentSummary: 'Old caution should not remain current forever.',
  paymentSignals: [
    { type: 'review_aggregate', direction: 'caution', recurrence: 'repeated', checkedAt: '2026-10-04', latestSourceAt: '2026-01-01' }
  ]
}, Date.parse('2026-10-04T00:00:00Z'));
assert.equal(expiredEvidence.state, 'evidence_expired');
assert.equal(expiredEvidence.freshness, 'expired');
assert.match(expiredEvidence.label, /만료/);

const mixedAgeEvidence = derivePaymentEvidence({
  paymentStatus: 'caution',
  reviewedAt: '2026-10-04',
  paymentSignals: [
    { type: 'official_policy', direction: 'neutral', recurrence: 'policy', checkedAt: '2026-10-04' },
    { type: 'review_aggregate', direction: 'caution', recurrence: 'repeated', checkedAt: '2026-10-04', latestSourceAt: '2026-01-01' }
  ]
}, Date.parse('2026-10-04T00:00:00Z'));
assert.equal(mixedAgeEvidence.state, 'policy_only', 'expired review caution must not remain a current caution when only policy evidence is fresh');
assert.equal(mixedAgeEvidence.freshness, 'mixed_age');

console.log('collector tests passed');
