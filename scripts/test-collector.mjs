import assert from 'node:assert/strict';
import {
  eligibilityFor,
  extractSalary,
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

const fixedHourlyBasis = extractSalary('', 'Compensation is calculated at a fixed hourly rate. The amount depends on language and location.');
assert.equal(fixedHourlyBasis.confidence, 'basis_only');
assert.equal(fixedHourlyBasis.display, '금액 비공개 · 시간당 고정 단가');
assert.equal(fixedHourlyBasis.paymentBasis, 'fixed_hourly');

const perSetBasis = extractSalary('', 'Compensation is paid per completed set of reviewed and matched text.');
assert.equal(perSetBasis.confidence, 'basis_only');
assert.equal(perSetBasis.display, '금액 비공개 · 완료 세트당 지급');
assert.equal(perSetBasis.paymentBasis, 'per_completed_set');

assert.equal(relevantToProfile({ title: 'Video Reviewer', description: 'This project involves data annotation for AI training.', tags: [] }), true);
assert.equal(relevantToProfile({ title: 'Senior Backend Engineer', description: 'Works with data and AI systems.', tags: [] }), false);
assert.equal(relevantToProfile({ title: 'Remote Office Assistant', description: 'Support administrative operations, bookkeeping, billing, reporting, and data entry.', tags: [] }), true);
assert.equal(relevantToProfile({ title: 'Remote Office Assistant', description: 'Schedule meetings and answer general phone calls.', tags: [] }), false);

const pool = currentListingState({ source: 'Welo Global', title: 'AI Trainers Network - Korean', description: 'This is not an active job opening.', postedAt: new Date().toISOString() });
assert.equal(pool.code, 'talent_pool');

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

const preservedFailure = markPreservedSourceFailure({ listingStatus: 'verified_open', listingLabel: '모집 확인됨', stale: false, score: 100 });
assert.equal(preservedFailure.listingStatus, 'source_error');
assert.equal(preservedFailure.stale, true);
assert.equal(preservedFailure.score, 80);

const base = {
  source: 'Welo Global', company: 'Example Inc.', title: 'Korean Evaluator', remote: true,
  type: 'Remote', salary: '', postedAt: new Date().toISOString(), description: '', tags: [], countryCode: ''
};
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
const recovered = reconcileVerificationHistory(
  [reappearedRaw],
  [failedHistory],
  Date.parse('2026-10-07T00:00:00Z')
)[0];
assert.equal(recovered.lastChangeKind, 'source_recovered');

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
assert.equal(sourceMetrics.Remotive.qualityTier, 'weak', 'high low-quality ratio on an intermediary source must prevent it from degrading recommendations');
const metricsApplied = applySourceMetricsToJobs([
  { ...historyBase, source: 'Remotive', sourceKind: 'job_board', requirementsStatus: 'clear', score: 80, eligibilityCode: 'worldwide', listingStatus: 'current_feed' }
], sourceMetrics)[0];
assert.equal(metricsApplied.recommendationEligible, true, 'low source yield alone must not blanket-block an individually strong job');
assert.equal(isDefaultRecommendation(metricsApplied), true);

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
  recommendationPolicyVersion: 1,
  jobs: Array.from({ length: 8 }, (_, index) => recommendationFixture(index))
};
const collapsedRecommendations = {
  recommendationPolicyVersion: 1,
  jobs: baselineRecommendations.jobs.slice(0, 2)
};
const collapseRisk = recommendationCollapseRisk(collapsedRecommendations, baselineRecommendations);
assert.equal(collapseRisk.collapse, true, 'same-policy unexplained recommendation collapse must be detected');
assert.equal(collapseRisk.baselineCount, 8);
assert.equal(collapseRisk.currentCount, 2);
assert.equal(recommendationCollapseRisk({ ...collapsedRecommendations, recommendationPolicyVersion: 2 }, baselineRecommendations).collapse, false,
  'policy version bump must explicitly rebaseline intentional recommendation policy changes');
const explainedRecommendations = {
  recommendationPolicyVersion: 1,
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
  recommendationPolicyVersion: 1,
  jobs: baselineRecommendations.jobs.map((job, index) => index < 2 ? job : recommendationFixture(index, {
    listingStatus: 'archived_missing',
    sourceCoverage: 'current_catalog',
    recommendationEligible: false,
    score: 0
  }))
};
assert.equal(recommendationCollapseRisk(currentCatalogCollapse, baselineRecommendations).collapse, true,
  'healthy current-catalog disappearance must remain unexplained so collector regressions cannot silently collapse recommendations');

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
