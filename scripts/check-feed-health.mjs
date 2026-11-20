import { appendFile } from 'node:fs/promises';
import { feedHealth } from '../public/munseong/feed-health.js';
import { isDefaultRecommendation } from '../public/munseong/recommendation-rules.js';
import { getProfile } from '../public/munseong/profiles.js';
import { pathToFileURL } from 'node:url';

const sourceStaleMs = 7 * 86400000;
const sourceConcentrationThreshold = 0.4;
const sourceConcentrationMinimum = 10;
const recommendationProfile = getProfile('munseong');

export function validatePublishedFeed(feed, now = Date.now()) {
  if (!feed || !Array.isArray(feed.jobs) || !Array.isArray(feed.sourceStatus)) throw Error('Invalid published feed structure');
  const health = feedHealth(feed.updatedAt, now);
  if (!health.ok) throw Error(health.message);
  return { updatedAt: feed.updatedAt, jobs: feed.jobs.length };
}

export function sourceHealthWarnings(feed, now = Date.now()) {
  const warnings = [];
  const recommendedJobs = (feed?.jobs || []).filter((job) => isDefaultRecommendation(
    job, feed?.recommendationPolicyVersion, { age: recommendationProfile.age }));
  const recommendationTotal = recommendedJobs.length;
  const recommendedBySource = new Map();
  for (const job of recommendedJobs) {
    recommendedBySource.set(job.source, (recommendedBySource.get(job.source) || 0) + 1);
  }
  for (const [source, metric] of Object.entries(feed?.sourceMetrics || {})) {
    if (!metric || metric.kind === 'manual') continue;
    const reasons = [];
    const failures = Number(metric.consecutiveFailures || 0);
    if (failures >= 2) reasons.push(`${failures}회 연속 수집 실패`);
    else if (['degraded', 'unstable'].includes(metric.reliabilityState)) reasons.push(`신뢰도 ${metric.reliabilityState}`);
    if (metric.qualityTier === 'weak') reasons.push('품질 weak');
    const recommended = recommendedBySource.get(source) || 0;
    if (recommendationTotal >= sourceConcentrationMinimum && recommended / recommendationTotal >= sourceConcentrationThreshold) {
      reasons.push(`추천 ${recommended}/${recommendationTotal} (${Math.round((recommended / recommendationTotal) * 100)}%) 집중`);
    }
    const lastSuccess = Date.parse(metric.lastSuccessAt || '');
    if (!Number.isFinite(lastSuccess)) reasons.push('성공 기록 없음');
    else if (now - lastSuccess > sourceStaleMs) reasons.push('7일 이상 성공 없음');
    if (reasons.length) warnings.push(`${source}: ${reasons.join(', ')}`);
  }
  for (const gap of feed?.collectionGaps || []) {
    if (gap.status === 'not_configured') warnings.push(`${gap.source}: ${gap.label || '수집 미설정'}`);
  }
  return [...new Set(warnings)];
}

export function workflowCommandText(value) {
  return String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

export function summaryText(value) {
  return String(value).replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}\[\]()#+.!|>]/g, '\\$&');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = new URL(process.argv[2]);
  if (url.protocol !== 'https:') throw Error('Published feed must use HTTPS');
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error(`Published feed returned HTTP ${response.status}`);
  const feed = await response.json();
  const result = validatePublishedFeed(feed);
  const warnings = sourceHealthWarnings(feed);
  console.log(JSON.stringify({ ...result, sourceHealthWarnings: warnings.length }));
  for (const warning of warnings) console.log(`::warning title=Source health::${workflowCommandText(warning)}`);
  if (warnings.length && process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `## Source health warnings\n\n${warnings.map((warning) => `- ${summaryText(warning)}`).join('\n')}\n`);
  }
}
