export function createJobNormalizer({ stableSourceDescription, normalizeWorkplaceMode, text, classify, domesticRegionFor, marketScopesFor, marketSegmentFor, eligibilityFor, sourceMeta, extractSalary, isOfficialKind, derivePaymentEvidence, currentListingState, lower, profile, evidenceSnippet, extractLocalWorkPeriod, extractLocalWorkSchedule, localCompensationNotes, localMandatoryQualification, localPreferredConditions, scoreJob, contentFingerprintVersion, sourceFieldFingerprints, contentFingerprint, localDomesticBoardSources }) {
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
    lastDetailVerifiedAt: raw.source === '인크루트' && raw.sourceListingState === 'public_detail'
      ? new Date().toISOString()
      : text(raw.lastDetailVerifiedAt),
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
    ...(job.roleFitEvidence && job.category !== '기타' ? [`관심 분야: ${job.category}`] : []),
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
    ...(job.roleFitEvidence && job.score >= 80 ? ['관심 업무와 강한 일치'] : job.roleFitEvidence && job.score >= 40 ? ['관심 업무와 일치'] : [])
  ].slice(0, 5);
  job.decisionUnknowns = [
    ...(!job.roleFitEvidence ? ['관심 업무와 직접 일치하는 근거 부족'] : []),
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


return { normalizeJob };
}
