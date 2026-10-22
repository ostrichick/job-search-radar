import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const SOURCE_NAMES = new Set(['RWS TrainAI', 'Welo Global', 'OneForma', 'LILT Production',
  'Meridial', 'TELUS Digital', 'DataForce', 'Appen', 'Outlier', 'Mercor', 'DataAnnotation',
  'OpenTrain', 'Alignerr', 'Productive Playhouse', 'Company Careers',
  'KOWORK', 'JOBPLOY', '사람인', '전주교차로', 'Other original source']);
const THIRTY_DAYS = 30 * 86400000;

function isoDateOnly(raw) {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const value = Date.parse(raw + 'T00:00:00Z');
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === raw ? raw : null;
}

function sourceUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password ||
      !url.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.)/.test(url.hostname)) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

export function normalizeCuratedLead(item, { now = new Date().toISOString() } = {}) {
  if (!item || typeof item !== 'object' || Array.isArray(item) || item.withdrawnFromRadar) return null;
  const source = String(item.originalSource || '').trim();
  const url = sourceUrl(item.url);
  const title = String(item.title || '').trim().slice(0, 220);
  const company = String(item.company || '').trim().slice(0, 160);
  const summary = String(item.researchSummary || '').trim().slice(0, 1100);
  const requirements = String(item.requirements || '').trim().slice(0, 850);
  const location = String(item.location || '').trim().slice(0, 180);
  const reviewedAt = typeof item.reviewedAt === 'string' ? item.reviewedAt : '';
  const reviewed = Date.parse(reviewedAt);
  const nowMs = Date.parse(now);
  if (!SOURCE_NAMES.has(source) || !url || !title || !company || !summary || !requirements || !location ||
      !/^(?:remote|onsite|hybrid)$/.test(item.workplaceMode || '') ||
      !Number.isFinite(reviewed) || !Number.isFinite(nowMs) ||
      reviewed > nowMs + 5 * 60000 || nowMs - reviewed > THIRTY_DAYS ||
      !/^\d{4}-\d{2}-\d{2}T/.test(reviewedAt) ||
      !['listed', 'unconfirmed'].includes(item.openingStatus)) return null;
  const postedAt = item.postedAt ? isoDateOnly(item.postedAt) : null;
  if (item.postedAt && !postedAt) return null;
  const deadlineDate = item.deadlineDate ? isoDateOnly(item.deadlineDate) : null;
  if (item.deadlineDate && (!deadlineDate || deadlineDate < now.slice(0, 10))) return null;
  const checks = item.requirementChecks ?? [];
  if (!Array.isArray(checks) || checks.some((c) => !c || !['hard', 'routine', 'satisfied'].includes(c.kind) || typeof c.label !== 'string' || !c.label.trim())) return null;
  // The date describes a real source review, not a check on each scheduled refresh.
  return {
    id: 'curated:' + crypto.createHash('sha256').update(url).digest('hex').slice(0, 20),
    source: 'ChatGPT 수동 조사', platform: source, url, title, company, location,
    remote: item.workplaceMode === 'remote', workplaceMode: item.workplaceMode,
    countryCode: item.countryCode === 'KR' ? 'KR' : '',
    type: String(item.type || '계약/형태 확인 필요').slice(0, 100),
    postedAt, deadlineType: deadlineDate ? 'fixed' : 'unknown',
    deadlineDate: deadlineDate || '', salary: String(item.salary || '').slice(0, 130),
    description: `${summary} 필수·우대 조건: ${requirements}. ${String(item.eligibilityNote || '').slice(0, 350)}`,
    tags: ['ChatGPT 원문 조사', ...Array.isArray(item.tags) ? item.tags.slice(0, 5) : []],
    sourceListingState: 'manual_original_review', researchReviewedAt: new Date(reviewed).toISOString(),
    researchSource: source, researchOpeningStatus: item.openingStatus,
    researchNote: String(item.researchNote || '').slice(0, 350),
    researchRequirementChecks: checks.map((c) => ({ kind: c.kind, label: c.label.trim().slice(0, 180) }))
  };
}

export async function collectCuratedLeads({ root, now = new Date().toISOString(),
  readFile = fs.readFile } = {}) {
  let data;
  try { data = JSON.parse(await readFile(path.join(root, 'config/curated-research-jobs.json'), 'utf8')); }
  catch (error) {
    if (error?.code === 'ENOENT') return { jobs: [], rawCount: 0, rejected: 0 };
    throw error;
  }
  if (!Array.isArray(data?.jobs) || data.jobs.length > 500) throw new Error('Invalid curated research manifest');
  const jobs = data.jobs.map((item) => normalizeCuratedLead(item, { now })).filter(Boolean);
  return { jobs, rawCount: data.jobs.length, rejected: data.jobs.length - jobs.length };
}
