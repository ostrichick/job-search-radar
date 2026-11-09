const JEONBUK_CITIES = new Set([
  '전주', '완주', '군산', '익산', '정읍', '남원', '김제', '진안', '무주', '장수', '임실', '순창', '고창', '부안'
]);
const CITY_KO = {
  seoul: '서울', incheon: '인천', suwon: '수원', seongnam: '성남', hanam: '하남',
  goyang: '고양', bucheon: '부천', anyang: '안양', yongin: '용인', uijeongbu: '의정부',
  paju: '파주', hwaseong: '화성', pyeongtaek: '평택', siheung: '시흥', gimpo: '김포',
  jeonju: '전주', wanju: '완주', gunsan: '군산', iksan: '익산', jeongeup: '정읍',
  namwon: '남원', gimje: '김제', jinan: '진안', muju: '무주', jangsu: '장수',
  imsil: '임실', sunchang: '순창', gochang: '고창', buan: '부안',
  daejeon: '대전', busan: '부산', daegu: '대구', gwangju: '광주', ulsan: '울산',
  jeju: '제주', cheongju: '청주', cheonan: '천안', changwon: '창원', gumi: '구미'
};
const PREFERRED_LABELS = /preferred|optional|a plus|nice to have|not required|not mandatory|not specified|not stated|not necessary|no requirement|우대|선호|불필요|무관|필수\s*(?:아님|아니|없)/i;
const NON_REQUIREMENT_CONTEXT = /\bresume\b|\bcv\b|이력서|not specified|not stated|not required|not mandatory|불필요|무관|아님/i;
const REMOTE_RESTRICTION = /\b(?:us|usa|canada|uk|united kingdom|europe|eu|emea|apac|latam|mena)\s*(?:only|based|residents?)\b|only\s+(?:us|usa|canada|uk|europe|eu)\b/i;
const FIVE_YEARS = /(?:[5-9]|1[0-9]|20)\s*\+?\s*years?\D{0,45}(?:experience|경력|실무)|(?:experience|경력|실무)\D{0,25}(?:[5-9]|1[0-9]|20)\s*\+?\s*years?|(?:경력|실무|근무)\D{0,15}(?:[5-9]|1[0-9]|20)\s*년|(?:[5-9]|1[0-9]|20)\s*년\s*이상\s*(?:경력|근무|실무)/i;
const SENIOR = /\b(?:senior|principal|director|head of|vp|vice president)\b/i;
const MASTER = /\bmaster'?s?\s+(?:degree|in)\b|석사\s*(?:학위|이상|필수)|석사\s*소지/i;
const MASTER_ALTERNATIVE = /학사\s*또는\s*석사|석사\s*또는\s*학사|bachelor.{0,20}or.{0,20}master|master.{0,20}or.{0,20}bachelor/i;

function hasFiveYearRequirement(value) {
  for (const match of value.matchAll(new RegExp(FIVE_YEARS.source, 'gi'))) {
    const around = value.slice(Math.max(0, match.index - 40), match.index + match[0].length + 60);
    if (!/company|founded|since|offices?|operations?|history|설립|업력/i.test(around)) return true;
  }
  return false;
}
const KOREAN_HIGH = /(?:topik\s*(?:level\s*)?[3-6]|한국어.{0,20}(?:중급|고급|능통|유창|비즈니스|원어민)|(?:fluent|native|business|advanced|professional|intermediate).{0,25}korean|korean.{0,25}(?:fluent|native|business|advanced|intermediate|c1|c2))/i;
const OTHER_LANGUAGE_REQUIRED = /(?:japanese|chinese|일본어|중국어).{0,30}(?:required|mandatory|fluent|native|business|능통|필수)|(?:required|mandatory|fluent|native|business|능통|필수).{0,30}(?:japanese|chinese|일본어|중국어)/i;
const SPANISH_HIGH = /(?:native|fluent|advanced|business|professional).{0,25}spanish|spanish.{0,25}(?:native|fluent|advanced|business|required)/i;
const ENGLISH_HIGH = /english.{0,25}(?:c1|c2|fluent|native|business|professional)|(?:c1|c2).{0,25}english/i;
const TEACHING = /korean\s+(?:language\s+)?(?:teacher|instructor|tutor|teaching)|한국어\s*(?:강사|교원|선생님|튜터|교육)|세종학당|korean language (?:education|teaching)/i;
const EDTECH = /edtech|curriculum|instructional|learning (?:content|experience)|교육\s*콘텐츠|커리큘럼|에듀테크|lxd/i;
const AI_LANGUAGE = /ai (?:data|trainer|evaluator|quality)|annotation|quality rater|korean.{0,30}(?:evaluat|annotat|quality|linguistic)|한국어.{0,20}(?:평가|검수|데이터|언어)|linguistic/i;
const LOCALIZATION = /localization|localisation|translation|translator|proofread|linguist|번역|현지화|교정|자막|qa\b/i;
const SUPPORT = /customer (?:support|service|success)|help desk|고객\s*(?:지원|상담)|cs\b/i;
const MARKETING = /marketing|marketer|growth|seo|sem|crm|social media|sns|community|광고|마케팅/i;
const CONTENT = /content|copywrit|video|youtube|tiktok|reels|ugc|editor|creator|콘텐츠|영상|쇼츠/i;
const INTERPRET = /interpret|interpreting|interpreter|통역/i;
const SPANISH = /spanish|español|castilian|latam|latin america|스페인어/i;

function text(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function shortCity(raw) {
  const value = String(raw || '').trim();
  const korean = value.replace(/(?:특별시|광역시|특별자치시|특별자치도|시|군|구)$/u, '');
  return korean || value;
}

function locationText(job) {
  const region = job.domesticRegion || {};
  return [
    region.province, region.city, region.district, region.locality, region.neighborhood, job.location
  ].filter(Boolean).join(' ');
}

export function classifyWorkplace(job) {
  const raw = locationText(job);
  const remoteText = /\bremote\b|원격/i.test(raw) && !/hybrid/i.test(`${job.workplaceMode || ''} ${raw}`);
  if (job.remote || job.workplaceMode === 'remote' || remoteText) {
    return { group: 'remote', rank: 0, label: '원격', display: '원격', city: '' };
  }
  const value = text(raw);
  const region = job.domesticRegion || {};
  let group = 'unknown';
  let city = '';
  if (/(?:전북|전라북도|jeonbuk|jeonju|wanju|gunsan|iksan|jeongeup|namwon|gimje|jinan|muju|jangsu|imsil|sunchang|gochang|buan)/i.test(value)
    || JEONBUK_CITIES.has(shortCity(region.city))) {
    group = 'jeonbuk';
  } else if (/(?:서울|seoul)/i.test(value)) {
    group = 'seoul';
  } else if (/(?:경기|인천|gyeonggi|incheon|suwon|seongnam|hanam|goyang|bucheon|anyang|yongin|uijeongbu|paju|hwaseong|pyeongtaek|siheung|gimpo)/i.test(value)) {
    group = 'metro';
  } else if (value && !/^(?:south korea|republic of korea|korea|대한민국)$/i.test(value.trim())) {
    group = 'other';
  }
  const rawCity = region.city || '';
  const citySource = rawCity || raw.match(/\b(seoul|incheon|suwon|seongnam|hanam|goyang|bucheon|anyang|yongin|uijeongbu|paju|hwaseong|pyeongtaek|siheung|gimpo|jeonju|wanju|gunsan|iksan|jeongeup|namwon|gimje|jinan|muju|jangsu|imsil|sunchang|gochang|buan|daejeon|busan|daegu|gwangju|ulsan|jeju|cheongju|cheonan|changwon|gumi)\b/i)?.[1] || '';
  if (citySource) {
    city = CITY_KO[text(citySource)] || shortCity(citySource);
  }
  if (!city) {
    const koreanCity = raw.match(/([가-힣]{2,}(?:시|군|구))/u)?.[1];
    if (koreanCity) city = shortCity(koreanCity);
  }
  if (group === 'seoul') city = '';
  const label = {
    jeonbuk: '전북권', other: '그 외', seoul: '서울', metro: '수도권', unknown: '위치 미확인'
  }[group];
  const display = group === 'unknown'
    ? '위치 미확인'
    : city && group !== 'seoul' ? `${label} · ${city}` : label;
  return { group, rank: { remote: 0, jeonbuk: 1, other: 2, seoul: 3, metro: 4, unknown: 5 }[group], label, display, city };
}

function clauses(value) {
  return value.split(/[\n.;,]|\bbut\b|\bhowever\b/i).map((part) => part.trim()).filter(Boolean);
}

function requiredIn(value, pattern) {
  return clauses(value).some((part) => pattern.test(part)
    && !PREFERRED_LABELS.test(part) && !NON_REQUIREMENT_CONTEXT.test(part));
}

function sourceConfidence(job) {
  if (job.sourceKind === 'official_ats' || job.sourceKind === 'official_government' || job.listingStatus === 'verified_open') return 'high';
  if (job.sourceKind === 'public_listing_index' || job.sourceKind === 'manual' || job.listingStatus === 'unconfirmed') return 'low';
  return 'medium';
}

export function evaluateProfileFit(job, { isNicole = false, now = Date.now() } = {}) {
  const title = text(job.title);
  const body = text([job.description, job.languageRequirements, job.eligibility, job.sourceSummary, job.tags?.join(' ')].filter(Boolean).join(' '));
  const combined = `${title} ${body}`;
  const workplace = classifyWorkplace(job);
  const reasons = [];
  const gaps = [];
  let status = 'high';
  const fail = (reason) => { status = 'fail'; gaps.push(reason); };
  const check = (reason) => { if (status !== 'fail') status = 'check'; gaps.push(reason); };
  const pass = (reason) => { if (!reasons.includes(reason)) reasons.push(reason); };

  if (job.listingStatus === 'expired') fail('마감 경과');
  if (hasFiveYearRequirement(combined) || SENIOR.test(title)) fail('5년 이상·시니어 요건');
  if (requiredIn(combined, MASTER) && !MASTER_ALTERNATIVE.test(combined)) fail('석사 학위 필수');
  if (requiredIn(combined, OTHER_LANGUAGE_REQUIRED)) fail('일본어·중국어 필수');

  if (isNicole) {
    if (requiredIn(combined, KOREAN_HIGH)) fail('한국어 중급 이상 필수');
    else if (/korean|한국어/i.test(combined)) check('한국어 요구 수준 확인');
    if (/(?:sales|account|business development)\s+manager/i.test(title)) check('세일즈·매니저 직무');
    if (requiredIn(combined, SPANISH)) pass('스페인어 원어민');
    const visaText = [job.visaRequirements, job.eligibility].filter(Boolean).join(' ');
    if (visaText) {
      if (/F-6|international marriage|결혼이민/i.test(visaText)) pass('F-6 거주 자격');
      else if (/visa sponsorship (?:is )?not available|no visa sponsorship/i.test(visaText)) pass('F-6로 비자 후원 불필요');
      else if (/F-2|F-4|F-5|E-7|D-10/i.test(visaText)) check('선호 비자 조건 확인');
      else if (/korea residents? only|valid residence permit/i.test(visaText)) pass('한국 거주자 지원 가능');
    } else if (/korea residents? only|valid residence permit/i.test(combined)) {
      pass('한국 거주자 지원 가능');
    }
  } else {
    if (requiredIn(combined, SPANISH_HIGH)) fail('스페인어 고급 이상 필수');
    if (requiredIn(combined, ENGLISH_HIGH)) check('영어 C1/C2 요구 확인');
    if (/korean|한국어/i.test(combined)) pass('한국어 원어민');
  }

  if (REMOTE_RESTRICTION.test(combined) && workplace.group === 'remote') check('원격 지원 국가 제한 확인');

  if (workplace.group === 'remote') {
    pass('원격 근무');
  } else if (workplace.group === 'jeonbuk') {
    pass('전북권');
  } else if (workplace.group === 'seoul' || workplace.group === 'metro') {
    check('서울·수도권 출근·이주 검토');
  } else if (workplace.group === 'other') {
    if (!isNicole && /sejong|세종학당|overseas|해외/i.test(combined)) pass('해외 세종학당');
    else check('그 외 지역 출근·이주 검토');
  } else {
    check('위치 미확인');
  }

  const categories = isNicole
    ? [
        [SPANISH, '스페인어권 시장'], [MARKETING, '마케팅·SNS'], [CONTENT, '콘텐츠·영상'],
        [LOCALIZATION, '번역·로컬라이제이션'], [INTERPRET, '통역'], [SUPPORT, '고객지원']
      ]
    : [
        [TEACHING, '한국어 교육'], [EDTECH, '에듀테크·교육과정'], [AI_LANGUAGE, 'AI·언어평가'],
        [LOCALIZATION, '번역·QA'], [SUPPORT, '고객지원']
      ];
  const categoryMatches = categories.filter(([pattern]) => pattern.test(combined)).map(([, label]) => label);
  if (categoryMatches.length) {
    pass(categoryMatches[0]);
  } else {
    check('직무 관련성 확인');
  }

  if (job.requirementsStatus === 'hard_check') check('필수요건 확인 필요');
  if (job.sourceKind === 'public_listing_index') check('원문 공고 확인 필요');
  if (!job.description || job.description === 'KOWORK public job reference. Open the original page for requirements and current availability.') {
    check('상세 정보 부족');
  }

  const confidence = sourceConfidence(job);
  if (status === 'fail') {
    return { status, score: 0, reasons, gaps, confidence, workplace };
  }
  let score = 45;
  if (categoryMatches.length) score += 25;
  if (workplace.group === 'remote' || workplace.group === 'jeonbuk') score += 20;
  else if (workplace.group === 'seoul' || workplace.group === 'metro') score += 5;
  if (reasons.includes('한국어 원어민') || reasons.includes('스페인어 원어민') || reasons.includes('F-6 거주 자격')) score += 10;
  if (job.requirementsStatus !== 'hard_check') score += 5;
  if (confidence === 'high') score += 5;
  score -= gaps.length * 4;
  score = Math.max(0, Math.min(100, score));
  return { status, score, reasons, gaps: [...new Set(gaps)].slice(0, 4), confidence, workplace };
}
