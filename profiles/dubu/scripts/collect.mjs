#!/usr/bin/env node
/** Public feeds only. Run at most daily for static GitHub Pages snapshots. */
import { readFile, mkdir, rename, writeFile, stat, unlink } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { collectCuratedResearch } from './curated-research.mjs';
import { SHARED_SOURCE_URLS, loadSharedResponse } from '../../../scripts/shared-responses.mjs';
import { EXPANDED_REMOTE_FEEDS, expandedRemoteCandidates } from '../../../scripts/expanded-remote-sources.mjs';
import {
  assessEligibility, assessLanguageFit, classifyRole, dedupeJobs, excludeOnlineJobReason, excludeQualificationReason, extractLanguages, isoDate,
  requiresPhysicalAttendance, safePublicUrl, safeText, stableId,
} from './rules.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = [
  // Same URLs as the main collector so CI can reuse its responses.
  { key: 'remotive', name: 'Remotive', url: SHARED_SOURCE_URLS.remotive },
  { key: 'jobicy', name: 'Jobicy', url: SHARED_SOURCE_URLS.jobicy },
  { key: 'remoteok', name: 'Remote OK', url: SHARED_SOURCE_URLS.remoteok },
  { key: 'arbeitnow', name: 'Arbeitnow', url: SHARED_SOURCE_URLS.arbeitnow },
  { key: 'himalayas', name: 'Himalayas', url: EXPANDED_REMOTE_FEEDS.himalayas[0] },
  { key: 'remotejobs', name: 'RemoteJobs.org', url: EXPANDED_REMOTE_FEEDS.remotejobs[0] },
];

function asText(value, limit = 400) { return safeText(value, limit); }
function listText(value) { return Array.isArray(value) ? value.map((x) => asText(x)).filter(Boolean).join(' ') : asText(value); }
function getPay(parts) { return asText(parts.filter((p) => p !== undefined && p !== null && p !== '').join(' '), 200) || null; }
function recordStatus(source, status, count, checkedAt, detail = '', extras = {}) {
  return { source, status, count, checkedAt, detail, ...extras };
}

function commonJob({ source, providerId, url, title, company, description, location,
  restriction, postedAt, deadline, listingExpiresAt, pay, categories, now, homeCountry, languages, onExcluded }) {
  const safeUrl = safePublicUrl(url);
  const cleanTitle = asText(title, 240);
  const cleanCompany = asText(company, 160);
  if (!safeUrl || !cleanTitle || !cleanCompany) return null;
  const category = classifyRole({ title: cleanTitle, description, categories });
  if (!category) return null;
  const qualificationIssue = excludeQualificationReason({ title: cleanTitle, description });
  if (qualificationIssue) {
    onExcluded?.({ url: safeUrl, reason: qualificationIssue });
    return null;
  }
  const excludeReason = excludeOnlineJobReason({ source, title: cleanTitle, description, location, restriction, category },
    { homeCountry, knownLanguages: languages });
  if (excludeReason) {
    onExcluded?.({ url: safeUrl, reason: excludeReason });
    return null;
  }
  // The location constraint can appear near the *end* of a long job posting.
  const cleanDescription = asText(description, 7000);
  const cleanLocation = asText(location, 240) || '위치 미표시';
  const eligibilityDetail = assessEligibility({
    market: 'online', location: restriction || cleanLocation, restriction, description,
    homeCountry,
  });
  const eligibility = eligibilityDetail.status === 'restricted'
    ? `지역 제한 가능성 높음 · ${eligibilityDetail.geoScope}`
    : eligibilityDetail.status === 'possible'
      ? `한국에서 지원 가능성 있음 · ${eligibilityDetail.geoScope} (확인 필요)`
      : `한국 거주자 지원 가능 여부 확인 필요 · ${eligibilityDetail.geoScope}`;
  const languageRequirements = extractLanguages({ title: cleanTitle, description }).join(', ') || '공고 원문 확인 필요';
  const languageFit = assessLanguageFit({ title: cleanTitle, description, category, languageRequirements }, languages);
  return {
    id: stableId(source, providerId, safeUrl),
    // Himalayas requires its API applicationLink to be used unchanged, including
    // the API attribution query parameter. Keep the normalized URL for identity.
    title: cleanTitle, company: cleanCompany, source,
    url: source === 'Himalayas' ? url : safeUrl, description: cleanDescription,
    location: cleanLocation, workplaceMode: 'remote', market: 'online', category,
    postedAt: isoDate(postedAt), deadline: isoDate(deadline), listingExpiresAt: isoDate(listingExpiresAt), pay,
    languageRequirements, eligibility, eligibilityStatus: eligibilityDetail.status, eligibilityDetail,
    ...languageFit,
    verifiedAt: now, sourceKind: 'public_api',
    evidenceNote: `${source}의 공개 API 수집 기록. 지원 요건 및 현재 모집 여부는 연결된 원문에서 재확인 필요`,
  };
}

export function normalizeRemotive(payload, options = {}) {
  if (!Array.isArray(payload?.jobs)) throw new Error('Remotive: jobs 배열 누락');
  return payload.jobs.flatMap((item) => {
    const job = commonJob({
      source: 'Remotive', providerId: item.id, url: item.url, title: item.title,
      company: item.company_name, description: item.description,
      location: item.candidate_required_location || 'Remote',
      restriction: item.candidate_required_location || '', postedAt: item.publication_date,
      pay: getPay([item.salary]), categories: item.category, ...options,
    });
    return job ? [job] : [];
  });
}

export function normalizeJobicy(payload, options = {}) {
  if (payload?.success === false) throw new Error(`Jobicy: ${asText(payload.error || 'API failure', 120)}`);
  if (!Array.isArray(payload?.jobs)) throw new Error('Jobicy: jobs 배열 누락');
  return payload.jobs.flatMap((item) => {
    const salary = [item.salaryMin, item.salaryMax].filter((value) => value !== null && value !== undefined);
    const pay = getPay([
      salary.length ? salary.join('–') : '', salary.length ? item.salaryCurrency : '', salary.length ? item.salaryPeriod : '',
    ]);
    const job = commonJob({
      source: 'Jobicy', providerId: item.id || item.jobSlug, url: item.url,
      title: item.jobTitle, company: item.companyName,
      description: item.jobDescription || item.jobExcerpt,
      location: item.jobGeo || 'Remote', restriction: item.jobGeo || '',
      postedAt: item.pubDate, pay, categories: item.jobIndustry, ...options,
    });
    return job ? [job] : [];
  });
}

export function normalizeRemoteOk(payload, options = {}) {
  if (!Array.isArray(payload)) throw new Error('Remote OK: 배열 응답 누락');
  // First element is metadata (legal notice), never a job.
  return payload.flatMap((item) => {
    if (!item || (!item.id && !item.slug) || !item.position) return [];
    const salary = item.salary_min || item.salary_max ? getPay([item.salary_min, '–', item.salary_max, item.salary_currency || 'USD']) : null;
    const job = commonJob({
      source: 'Remote OK', providerId: item.id || item.slug,
      url: item.url || item.apply_url || (item.slug ? `https://remoteok.com/remote-jobs/${encodeURIComponent(item.slug)}` : null),
      title: item.position, company: item.company, description: item.description,
      location: item.location || 'Remote', restriction: item.location || '',
      postedAt: item.date || item.epoch, pay: salary, categories: item.tags, ...options,
    });
    return job ? [job] : [];
  });
}

export function normalizeArbeitnow(payload, options = {}) {
  if (!Array.isArray(payload?.data)) throw new Error('Arbeitnow: data 배열 누락');
  return payload.data.flatMap((item) => {
    if (item.remote !== true || requiresPhysicalAttendance(item.description)) return [];
    const job = commonJob({
      source: 'Arbeitnow', providerId: item.slug, url: item.url,
      title: item.title, company: item.company_name, description: item.description,
      // Arbeitnow location often identifies the employer's office, not remote eligibility.
      location: item.location || 'Remote', restriction: '',
      postedAt: item.created_at, pay: null, categories: item.tags, ...options,
    });
    if (!job) return [];
    job.eligibilityDetail = assessEligibility({ market: 'online', location: '', restriction: '',
      description: item.description, homeCountry: options.homeCountry });
    job.eligibilityStatus = job.eligibilityDetail.status;
    job.eligibility = job.eligibilityStatus === 'restricted'
      ? '거주 국가 제한 명시: 한국에서 지원하기 어려울 수 있음 (원문 확인)'
      : `사업장 위치 ${asText(item.location, 80) || '미표시'} · 한국 원격근무 가능 여부 확인 필요`;
    return [job];
  });
}

function unsupportedTargetLanguageReview(title) {
  const target = /^English\s+(?:to|into)\s+([A-Za-z-]+)(?:\s+\([^)]*\))?\s+(?:Review Lead|Translator|Translation|Linguist|Editor)\b/i.exec(title || '');
  return Boolean(target && target[1].toLowerCase() !== 'spanish');
}

export function normalizeExpandedRemote(key, payload, options = {}) {
  return expandedRemoteCandidates(key, payload).flatMap((item) => {
    // The broad 'marketing' API query also returns non-Spanish translation
    // review leads because their titles contain "Marketing & Product Content".
    // The requested target language is a hard job requirement, not a keyword.
    if (unsupportedTargetLanguageReview(item.title)) return [];
    const job = commonJob({
      source: item.source,
      providerId: item.sourcePostingId, url: item.url,
      title: item.title, company: item.company, description: item.description,
      location: item.location, restriction: item.location,
      postedAt: item.postedAt, listingExpiresAt: item.listingExpiresAt, pay: getPay([item.salary]),
      categories: item.tags, ...options
    });
    return job ? [job] : [];
  });
}

function validateManualJob(item, now) {
  if (!item || typeof item !== 'object') return null;
  const url = safePublicUrl(item.url);
  const title = asText(item.title, 240);
  const company = asText(item.company, 160);
  if (!url || !title || !company) return null;
  const market = item.market === 'offline' ? 'offline' : item.market === 'online' ? 'online' : null;
  if (!market) return null;
  const category = classifyRole({ title, description: item.description, categories: item.category, market });
  if (!category || (market === 'online' && category === 'interpreting')) return null;
  const location = asText(item.location, 240) || '위치 미표시';
  const eligibilityDetail = assessEligibility({ market, location, restriction: item.restriction || '', description: item.description });
  const allowedModes = ['remote', 'onsite', 'hybrid', 'unknown'];
  const workplaceMode = allowedModes.includes(item.workplaceMode) ? item.workplaceMode : (market === 'online' ? 'remote' : 'unknown');
  const source = asText(item.source, 100) || '사용자 저장 공고';
  return {
    id: stableId('manual', item.id || url, url), title, company, source,
    url, description: asText(item.description, 1800), location, market, workplaceMode,
    category, postedAt: isoDate(item.postedAt), deadline: isoDate(item.deadline),
    pay: asText(item.pay, 200) || null,
    languageRequirements: asText(item.languageRequirements, 200) || '공고 원문 확인 필요',
    eligibility: asText(item.eligibility, 300) || '지원 자격 직접 확인 필요',
    eligibilityStatus: eligibilityDetail.status, eligibilityDetail,
    verifiedAt: now, sourceKind: 'manual',
    evidenceNote: '사용자가 링크를 저장한 공고. 자동 API 조회 또는 모집 상태 검증은 수행하지 않음',
  };
}

export function normalizeManual(payload, now) {
  const entries = Array.isArray(payload) ? payload : payload?.jobs;
  if (!Array.isArray(entries)) throw new Error('수동 공고 파일 형식: {"jobs":[]} 또는 배열 필요');
  return { valid: entries.flatMap((x) => { const job = validateManualJob(x, now); return job ? [job] : []; }), invalid: entries.length - entries.filter((x) => validateManualJob(x, now)).length };
}

async function fetchJson(url, { fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  // In CI the main collector already queried this URL in the same refresh.
  const shared = await loadSharedResponse(url);
  if (shared) console.log(`Reused shared response (${shared.error ? 'failure' : 'ok'}): ${new URL(url).hostname}`);
  if (shared?.error) throw new Error(`shared request failed: ${shared.error}`);
  if (shared) return shared.body;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'NicoleJobRadar/1.0 (+public research; attribution via links)' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}${response.status === 429 ? ' (rate-limited)' : ''}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

async function collectOne(source, { fetchImpl, timeoutMs, now, homeCountry, languages }) {
  const normalize = {
    remotive: normalizeRemotive, jobicy: normalizeJobicy,
    remoteok: normalizeRemoteOk, arbeitnow: normalizeArbeitnow,
    himalayas: (data, opts) => normalizeExpandedRemote('himalayas', data, opts),
    remotejobs: (data, opts) => normalizeExpandedRemote('remotejobs', data, opts),
  }[source.key];
  const requests = source.key === 'jobicy'
    ? [source.url, `${source.url}&industry=marketing`, `${source.url}&tag=spanish`, `${source.url}&tag=translation`]
    : EXPANDED_REMOTE_FEEDS[source.key]
      ? EXPANDED_REMOTE_FEEDS[source.key]
    : [source.url];
  const collected = [];
  const excludedUrls = new Set();
  const failures = [];
  let completed = 0;
  for (const url of requests) {
    try {
      const data = await fetchJson(url, { fetchImpl, timeoutMs });
      collected.push(...normalize(data, { now, homeCountry, languages,
        onExcluded: ({ url }) => excludedUrls.add(url) }));
      completed++;
    } catch (err) { failures.push(asText(err?.message || err, 150)); }
  }
  const jobs = dedupeJobs(collected);
  const status = completed ? (failures.length ? 'partial' : 'ok') : 'error';
  const detail = `${completed}/${requests.length} 요청 완료. ${jobs.length}개 관련 공고. ${failures.length ? `오류: ${failures.join('; ')}` : '출처 공고 URL 원문 확인 필요'}`;
  return {
    jobs, excludedUrls: [...excludedUrls], successfulRequests: completed,
    sourceStatus: [recordStatus(source.name, status, jobs.length, now, detail,
      { url: source.url, ...(failures.length ? { failures } : {}) })],
  };
}

async function readProfile(root, readFileImpl = readFile) {
  const profile = JSON.parse(await readFileImpl(join(root, 'config/profile.json'), 'utf8'));
  if (profile.homeCountry !== 'KR') throw new Error('지원 지역 설정은 KR만 검증되었습니다.');
  return profile;
}

async function optionalKorea({ enabled, now, fetchImpl, koreaCollector }) {
  if (!enabled) return { jobs: [], sourceStatus: [recordStatus('고용24', 'disabled', 0, now, '사용자 프로필에서 비활성화')], successfulRequests: 0 };
  try {
    const collector = koreaCollector ?? (await import('./collect-korea.mjs')).collectKoreanJobs;
    if (typeof collector !== 'function') throw new Error('collectKoreanJobs 함수 누락');
    const result = await collector({ now, fetchImpl });
    if (!Array.isArray(result?.jobs) || !Array.isArray(result?.sourceStatus)) throw new Error('고용24 수집 결과 구조 오류');
    const jobs = result.jobs.filter((x) => x?.url && x?.id && x?.market && !(x.market === 'online' && x.category === 'interpreting'));
    return { jobs, sourceStatus: result.sourceStatus.map((status) => ({ ...status, checkedAt: status.checkedAt || now })),
      successfulRequests: result.sourceStatus.some((x) => x.status === 'ok' || x.status === 'partial') ? 1 : 0 };
  } catch (err) {
    return { jobs: [], sourceStatus: [recordStatus('고용24', 'error', 0, now, `고용24 수집 실패: ${asText(err?.message || err, 200)}`)], successfulRequests: 0 };
  }
}

async function optionalKoreaAts({ enabled, now, fetchImpl, koreaAtsCollector }) {
  if (!enabled) return { jobs: [], sourceStatus: [recordStatus('국내 기업 공식 ATS', 'disabled', 0, now, '사용자 프로필에서 비활성화')], successfulRequests: 0 };
  try {
    const collector = koreaAtsCollector ?? (await import('./collect-korea-ats.mjs')).collectKoreanAtsJobs;
    if (typeof collector !== 'function') throw new Error('collectKoreanAtsJobs 함수 누락');
    const result = await collector({ now, fetchImpl });
    if (!Array.isArray(result?.jobs) || !Array.isArray(result?.sourceStatus)) throw new Error('국내 기업 ATS 결과 구조 오류');
    return {
      jobs: result.jobs.filter((x) => x?.url && x?.id && x?.market && !(x.market === 'online' && x.category === 'interpreting')),
      sourceStatus: result.sourceStatus.map((status) => ({ ...status, checkedAt: status.checkedAt || now })),
      excludedUrls: result.excludedUrls || [],
      successfulRequests: result.sourceStatus.filter((x) => x.status === 'ok' || x.status === 'partial').length,
    };
  } catch (err) {
    return { jobs: [], sourceStatus: [recordStatus('국내 기업 공식 ATS', 'error', 0, now, `ATS 수집 실패: ${asText(err?.message || err, 200)}`)], successfulRequests: 0 };
  }
}

async function optionalManual({ root, filename, now, readFileImpl = readFile }) {
  const path = resolve(root, filename);
  if (!path.startsWith(`${root}\\`) && !path.startsWith(`${root}/`)) throw new Error('수동 공고 파일 경로가 프로젝트 외부입니다.');
  try {
    const payload = JSON.parse(await readFileImpl(path, 'utf8'));
    const { valid, invalid } = normalizeManual(payload, now);
    return { jobs: valid, sourceStatus: [recordStatus('사용자 저장 공고', 'manual', valid.length, now,
      `수동 저장 링크 ${valid.length}개; 형식 또는 관련성 검사 제외 ${invalid}개. 모집 상태 미검증`)], successfulRequests: 0 };
  } catch (err) {
    if (err?.code === 'ENOENT') return { jobs: [], sourceStatus: [recordStatus('사용자 저장 공고', 'not_configured', 0, now, 'config/manual-jobs.json 미생성. 선택 기능')], successfulRequests: 0 };
    return { jobs: [], sourceStatus: [recordStatus('사용자 저장 공고', 'error', 0, now, `파일 읽기 실패: ${asText(err?.message || err, 150)}`)], successfulRequests: 0 };
  }
}

export async function buildFeed({ root = ROOT, fetchImpl = fetch, readFileImpl = readFile,
  koreaCollector, koreaAtsCollector, koworkCollector, timeoutMs = 12000, now = new Date().toISOString() } = {}) {
  const profile = await readProfile(root, readFileImpl);
  const collectors = profile.collectors || {};
  const sourceTasks = SOURCES.map((source) => (collectors[source.key] === false
    || (EXPANDED_REMOTE_FEEDS[source.key] && collectors[source.key] !== true))
    ? Promise.resolve({ jobs: [], successfulRequests: 0, sourceStatus: [recordStatus(source.name, 'disabled', 0, now, '사용자 프로필에서 비활성화', { url: source.url })] })
    : collectOne(source, { fetchImpl, timeoutMs, now, homeCountry: profile.homeCountry, languages: profile.spokenLanguages }));
  // Work24 is outside this foreign-friendly board's normal collection scope.
  if (collectors.korea === true) sourceTasks.push(optionalKorea({ enabled: true, now, fetchImpl, koreaCollector }));
  sourceTasks.push(optionalKoreaAts({ enabled: collectors.koreaAts !== false, now, fetchImpl, koreaAtsCollector }));
  if (collectors.internationalAts === true) {
    const collector = (await import('./collect-international-ats.mjs')).collectInternationalAtsJobs;
    sourceTasks.push(collector({ fetchImpl, now, languages: profile.spokenLanguages, timeoutMs }));
  }
  if (collectors.kowork === true) {
    const collector = koworkCollector || (await import('./collect-kowork.mjs')).collectKoworkJobs;
    sourceTasks.push(collector({ fetchImpl, now, timeoutMs }));
  }
  if (collectors.curatedResearch !== false) {
    sourceTasks.push(collectCuratedResearch({
      root, readFileImpl, now, languages: profile.spokenLanguages,
    }));
  }
  sourceTasks.push(optionalManual({ root, filename: profile.manualFile || 'config/manual-jobs.json', now, readFileImpl }));
  const results = await Promise.all(sourceTasks);
  const collectedJobs = results.flatMap((x) => x.jobs);
  // An individually reviewed record supersedes the same minimal KOWORK index
  // card, keeping one job card while exposing the richer evidence and dates.
  const curatedUrls = new Set(collectedJobs
    .filter((job) => job.sourceKind === 'curated_research')
    .map((job) => safePublicUrl(job.url)).filter(Boolean));
  const jobs = dedupeJobs(collectedJobs.filter((job) =>
    !(job.sourceKind === 'public_listing_index' && curatedUrls.has(safePublicUrl(job.url)))
  ).filter((job) =>
    job.sourceKind === 'manual' || !excludeOnlineJobReason(job, {
      homeCountry: profile.homeCountry, knownLanguages: profile.spokenLanguages,
    }))).map((job) => ({
    ...job,
    ...(job.languageFitStatus ? {} : assessLanguageFit(job, profile.spokenLanguages)),
  }));
  jobs.sort((a, b) => (b.postedAt || '').localeCompare(a.postedAt || '') || a.id.localeCompare(b.id));
  const sourceStatus = results.flatMap((x) => x.sourceStatus);
  const upworkSearches = (Array.isArray(profile.upworkSearches) ? profile.upworkSearches : [])
    .filter((x) => x && typeof x.url === 'string')
    .map((x) => ({ label: asText(x.label, 80) || 'Upwork 검색', url: safePublicUrl(x.url) }))
    .filter((x) => { try { return x.url && new URL(x.url).hostname === 'www.upwork.com'; } catch { return false; } });
  sourceStatus.push(recordStatus('Upwork', 'manual', 0, now,
    'Upwork 공개 RSS 자동 수집 기능이 중단되어 검색 결과를 생성하지 않습니다. 계정 로그인 후 수동 검색 링크를 이용하세요.',
    { url: 'https://www.upwork.com/nx/search/jobs/', manualSearches: upworkSearches }));
  if (collectors.kowork !== true) sourceStatus.push(recordStatus('KOWORK', 'manual', 0, now,
    'KOWORK is disabled in this profile. Open the official public listings for manual research.',
    { url: 'https://kowork.kr/en' }));
  sourceStatus.push(recordStatus('K-WORK', 'manual', 0, now,
    'Korean government SME/foreign talent job platform. Each listing needs language and visa verification. Original-site browsing only.',
    { url: 'https://k-work.or.kr/empmnInfo/empmn/list.do' }));
  sourceStatus.push(recordStatus('Hanultari', 'manual', 0, now,
    'Seoul multicultural-family job portal. Automatic republication restricted; verify jobs at original source.',
    { url: 'https://mcfamily.or.kr/en/jobs/opening' }));
  sourceStatus.push(recordStatus('JOBPLOY', 'manual', 0, now,
    'Foreigner-focused Korea jobs. Terms restrict unlicensed copying; use original-site search.',
    { url: 'https://www.jobploy.kr/en' }));
  sourceStatus.push(recordStatus('Wanted', 'manual', 0, now,
    'Additional Korean employer listings for Spanish-language content and marketing. Search on the original site; individual postings can already be closed.',
    { url: 'https://www.wanted.co.kr/' }));
  sourceStatus.push(recordStatus('ProZ', 'manual', 0, now,
    'Specialist translation and localization jobs; verify deadlines, professional experience and ability to work from Korea on each original posting.',
    { url: 'https://www.proz.com/translation-jobs' }));
  return { feed: { updatedAt: now, jobs, sourceStatus },
    excludedUrls: results.flatMap((x) => x.excludedUrls || []),
    successfulRequests: results.reduce((n, x) => n + x.successfulRequests, 0),
    manualCount: results.at(-1)?.jobs?.length || 0 };
}

/**
 * Retain historical leads without treating disappearance from a public API as closure.
 * A successful source response confirms only that a posting was seen in this crawl.
 * "not_seen" means absent from a complete refresh, not closed or ineligible.
 * "unverified" means the prior posting could not be checked (source error/disabled/partial).
 */
export function mergeHistoricalFeed(incoming, previous, { retentionDays = 60, maxItems = 2000, knownLanguages, excludedUrls = [] } = {}) {
  const collectedAt = incoming.updatedAt;
  const fetchedAt = Date.parse(collectedAt);
  if (!Number.isFinite(fetchedAt)) throw new Error('수집 시각이 올바르지 않습니다.');
  const maxAgeMs = Math.max(1, Math.min(365, Number(retentionDays) || 60)) * 86400_000;
  const maxHistorical = Math.max(0, Math.min(10000, Number(maxItems) || 2000));
  const priorList = Array.isArray(previous?.jobs) ? previous.jobs : [];
  const explicitlyExcludedUrls = new Set(excludedUrls.map((url) => safePublicUrl(url)).filter(Boolean));
  // Only an explicit calendar deadline can establish that a posting expired;
  // absence from an API response does not establish closure.
  const pastDeadline = (job) => {
    if (job.sourceKind === 'manual') return false;
    if (job.listingExpiresAt && Date.parse(job.listingExpiresAt) < fetchedAt) return true;
    const deadline = isoDate(job.deadline);
    return Boolean(deadline && (job.deadlineHasTime
      ? Date.parse(deadline) < fetchedAt : deadline.slice(0, 10) < collectedAt.slice(0, 10)));
  };
  const priorById = new Map(priorList.filter((j) => j && typeof j.id === 'string').map((j) => [j.id, j]));
  const priorByUrl = new Map(priorList.flatMap((job) => {
    const url = safePublicUrl(job?.url);
    return url ? [[url, job]] : [];
  }));
  const eligibleIncoming = incoming.jobs.filter((job) =>
    !explicitlyExcludedUrls.has(safePublicUrl(job.url)) && !pastDeadline(job) &&
    !(job.source === 'RemoteJobs.org' && unsupportedTargetLanguageReview(job.title)) &&
    (job.sourceKind === 'manual' ||
      (!excludeOnlineJobReason(job, { knownLanguages }) && !excludeQualificationReason(job))));
  const current = eligibleIncoming.map((job) => {
    const earlier = priorById.get(job.id) || priorByUrl.get(safePublicUrl(job.url));
    return {
      ...job,
      legacyIds: [...new Set([...(job.legacyIds || []), ...(earlier?.legacyIds || []), earlier?.id].filter((id) => id && id !== job.id))],
      ...(job.languageFitStatus ? {} : assessLanguageFit(job, knownLanguages)),
      collectionState: 'seen', firstSeenAt: earlier ? (earlier.firstSeenAt || null) : collectedAt,
      lastSeenAt: collectedAt,
    };
  });
  const seenIds = new Set(current.map((x) => x.id));
  const bySource = new Map(incoming.sourceStatus.map((source) => [String(source.source), String(source.status)]));
  const currentUrl = new Set(current.map((x) => safePublicUrl(x.url)));
  const currentRole = new Set(current.map((x) => [x.company, x.title, x.location].map((v) => asText(v, 200).toLowerCase()).join('|')));
  const historical = priorList.flatMap((job) => {
    if (!job || typeof job.id !== 'string' || seenIds.has(job.id) || !safePublicUrl(job.url) ||
      (job.source === 'RemoteJobs.org' && unsupportedTargetLanguageReview(job.title)) ||
      explicitlyExcludedUrls.has(safePublicUrl(job.url)) || pastDeadline(job)) return [];
    if (job.sourceKind === 'curated_research' &&
        (!isoDate(job.researchReviewedAt) ||
        fetchedAt - Date.parse(isoDate(job.researchReviewedAt)) > 30 * 86400_000 ||
        (isoDate(job.deadline) && isoDate(job.deadline).slice(0, 10) < collectedAt.slice(0, 10)))) return [];
    // Drop previously misclassified records when a newer, stricter quality gate proves the role requires physical attendance.
    if ((job.market === 'online' && job.category === 'interpreting') ||
        (job.source === 'Arbeitnow' && requiresPhysicalAttendance(job.description))) return [];
    if (job.sourceKind !== 'manual' &&
      (excludeOnlineJobReason(job, { knownLanguages }) || excludeQualificationReason(job))) return [];
    const previousSeen = isoDate(job.lastSeenAt) || isoDate(job.verifiedAt) || isoDate(previous?.updatedAt);
    if (!previousSeen || fetchedAt - Date.parse(previousSeen) > maxAgeMs) return [];
    const url = safePublicUrl(job.url);
    const roleKey = [job.company, job.title, job.location].map((v) => asText(v, 200).toLowerCase()).join('|');
    if (currentUrl.has(url) || currentRole.has(roleKey)) return [];
    const sourceKey = [...bySource.keys()].find((source) => job.source === source || String(job.source).startsWith(`${source} (`));
    const sourceState = sourceKey ? bySource.get(sourceKey) : null;
    const collectionState = sourceState === 'ok' ? 'not_seen'
      : job.collectionState === 'not_seen' ? 'not_seen' : 'unverified';
    return [{
      ...job, collectionState,
      ...(job.languageFitStatus ? {} : assessLanguageFit(job, knownLanguages)),
      firstSeenAt: job.firstSeenAt || null,
      lastSeenAt: previousSeen,
      evidenceNote: job.evidenceNote || '이전 수집 기록: 공개 목록에서 현재 모집 여부를 재확인하세요',
    }];
  });
  historical.sort((a, b) => (b.lastSeenAt || '').localeCompare(a.lastSeenAt || '') || a.id.localeCompare(b.id));
  const unique = dedupeJobs([...current, ...historical.slice(0, maxHistorical)]);
  const seen = unique.filter((job) => job.collectionState === 'seen');
  const older = unique.filter((job) => job.collectionState !== 'seen');
  return {
    ...incoming,
    jobs: [...seen, ...older],
    historyPolicy: {
      retentionDays: Math.max(1, Math.min(365, Number(retentionDays) || 60)),
      maxHistoricalItems: maxHistorical,
      meaning: 'seen=이번 공개 수집 발견; not_seen=소스 정상 갱신에서 재발견되지 않음; unverified=소스 재검증 불가. 모집 종료를 뜻하지 않음',
    },
  };
}

export async function writeFeedAtomic(feed, filename) {
  await mkdir(dirname(filename), { recursive: true });
  const tmp = `${filename}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, `${JSON.stringify(feed, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(tmp, filename);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}

export async function run({ root = ROOT, ...options } = {}) {
  const { feed, successfulRequests, manualCount, excludedUrls } = await buildFeed({ root, ...options });
  const filename = join(root, 'public/jobs.json');
  const existed = await stat(filename).then(() => true, () => false);
  const previous = existed ? JSON.parse(await readFile(filename, 'utf8')) : null;
  const previousJobs = Array.isArray(previous?.jobs) ? previous.jobs : [];
  const previousByUrl = new Map(previousJobs.map((job) => [safePublicUrl(job.url), job]));
  const curatedChanged = feed.jobs.some((job) => {
    if (job.sourceKind !== 'curated_research') return false;
    const earlier = previousByUrl.get(safePublicUrl(job.url));
    return !earlier || Object.entries(job).some(([key, value]) =>
      key !== 'legacyIds' && JSON.stringify(value) !== JSON.stringify(earlier[key]));
  });
  const withdrawnChanged = excludedUrls.some((url) => previousByUrl.has(safePublicUrl(url)));
  if (existed && successfulRequests === 0 && manualCount === 0 && !curatedChanged && !withdrawnChanged) {
    return { written: false, message: '모든 자동 소스가 실패했거나 미설정이므로 마지막으로 성공한 jobs.json 유지', feed };
  }
  const profile = await readProfile(root);
  const merged = mergeHistoricalFeed(feed, previous, {
    retentionDays: profile.historyRetentionDays,
    maxItems: profile.historyMaxItems,
    knownLanguages: profile.spokenLanguages,
    excludedUrls,
  });
  await writeFeedAtomic(merged, filename);
  return { written: true, message: `공고 ${merged.jobs.length}건(이번 발견 ${merged.jobs.filter((j) => j.collectionState === 'seen').length}건)을 ${filename}에 저장`, feed: merged };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await run();
    console.log(JSON.stringify({ written: result.written, message: result.message,
      jobs: result.feed.jobs.length, sourceStatus: result.feed.sourceStatus }, null, 2));
    if (!result.written) process.exitCode = 1;
  } catch (err) {
    console.error(`수집 중단: ${asText(err?.message || err, 250)}`);
    process.exitCode = 1;
  }
}
