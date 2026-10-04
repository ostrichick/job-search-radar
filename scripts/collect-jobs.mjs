import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const profile = JSON.parse(await fs.readFile(path.join(root, 'config/search-profile.json'), 'utf8'));

function repairMojibake(value) {
  const raw = String(value ?? '');
  if (!/[ÃÂØÙ]|â[\u0080-\u00bf]/.test(raw)) return raw;
  try {
    const repaired = Buffer.from(raw, 'latin1').toString('utf8');
    return repaired.includes('�') ? raw : repaired;
  } catch {
    return raw;
  }
}

const text = (value) => repairMojibake(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const lower = (value) => text(value).toLowerCase();

function hasPhrase(haystack, phrase) {
  const target = lower(phrase);
  if (!target) return false;
  if (/[^a-z0-9 _-]/i.test(target) || /[가-힣]/.test(target)) return haystack.includes(target);
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
}

function classify(job) {
  const haystack = lower([job.title, job.description, job.tags?.join(' '), job.category].join(' '));
  const rules = [
    ['한국어·언어', ['korean', '한국어', 'linguist', 'proofread', 'localization', 'language quality', 'editor']],
    ['조사·데이터', ['research', 'data entry', 'data researcher', 'catalog', 'product data', 'administrative assistant']],
    ['교육 운영', ['education', 'learning operations', 'course operations', 'class manager', 'training']],
    ['커뮤니티·운영', ['moderator', 'community', 'operations coordinator', 'event']],
    ['채용 보조', ['sourcing', 'recruiting coordinator', 'talent coordinator', 'recruiter']],
    ['오디오·음성', ['audio', 'podcast', 'voice', 'narration']],
    ['시험 감독', ['proctor', 'exam']],
    ['GIS·지도', ['gis', 'mapping', 'geospatial']]
  ];
  const match = rules.find(([, words]) => words.some((word) => haystack.includes(word)));
  return match?.[0] ?? '기타';
}

function eligibilityFor(job) {
  const location = lower(job.location);
  if (/south korea|republic of korea|\bkorea\b|한국/.test(location)) return '한국 명시';
  if (/worldwide|anywhere|global/.test(location)) return 'Worldwide';
  if (job.remote && /\b(usa|united states|us only|canada|uk|united kingdom|europe|eu|germany|france|australia|singapore|japan)\b/.test(location)) return '지역 제한 가능';
  if (job.remote) return '확인 필요';
  return '현지 근무/확인 필요';
}

function scoreJob(job) {
  const haystack = lower([job.title, job.company, job.description, job.location, job.tags?.join(' ')].join(' '));
  const title = lower(job.title);
  const matched = profile.includeKeywords.filter((keyword) => hasPhrase(haystack, keyword));
  const titleMatched = profile.includeKeywords.filter((keyword) => hasPhrase(title, keyword));
  const excluded = profile.excludeKeywords.some((keyword) => hasPhrase(haystack, keyword));
  let score = 0;
  for (const keyword of matched) {
    if (keyword.toLowerCase() === 'korean' || keyword === '한국어') {
      score += titleMatched.includes(keyword) ? 45 : 28;
    } else {
      score += titleMatched.includes(keyword) ? 20 : 4;
    }
  }
  score += profile.preferredKeywords.filter((keyword) => hasPhrase(title, keyword)).length * 3;
  score += profile.preferredKeywords.filter((keyword) => hasPhrase(haystack, keyword)).length;
  if (job.remote) score += 4;
  if (/anywhere|worldwide|global/i.test(job.location)) score += 5;
  if (/korea|south korea|한국/i.test(job.location)) score += 12;
  if (/\blinguist\s*[-–—:]/i.test(job.title) && !/korean|한국어/i.test(job.title)) score -= 45;
  if (/\b(engineer|developer|data scientist|software architect|director of engineering|sap consultant)\b/i.test(job.title) && !/korean|한국어/i.test(haystack)) score -= 28;
  if (excluded) score -= 40;
  return { score: Math.max(0, Math.min(100, score)), matchedKeywords: matched.slice(0, 8), excluded };
}

function normalizeJob(raw) {
  const job = {
    id: raw.id,
    source: raw.source,
    title: text(raw.title),
    company: text(raw.company) || '회사 미상',
    location: text(raw.location) || '위치 미상',
    remote: Boolean(raw.remote),
    type: text(raw.type) || '미상',
    salary: text(raw.salary),
    url: raw.url,
    postedAt: raw.postedAt ? new Date(raw.postedAt).toISOString() : null,
    description: text(raw.description).slice(0, 1200),
    tags: Array.isArray(raw.tags) ? raw.tags.map(text).filter(Boolean).slice(0, 12) : []
  };
  job.category = classify(job);
  job.eligibility = eligibilityFor(job);
  Object.assign(job, scoreJob(job));
  return job;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'User-Agent': 'DigitalNomadJobDashboard/0.1', Accept: 'application/json', ...(options.headers ?? {}) }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} - ${url}`);
  return response.json();
}

async function collectJobicy() {
  const data = await fetchJson('https://jobicy.com/api/v2/remote-jobs?count=200');
  return (data.jobs ?? []).map((j) => normalizeJob({
    id: `jobicy:${j.id}`,
    source: 'Jobicy',
    title: j.jobTitle,
    company: j.companyName,
    location: j.jobGeo,
    remote: true,
    type: Array.isArray(j.jobType) ? j.jobType.join(', ') : j.jobType,
    salary: j.salaryMin || j.salaryMax ? `${j.salaryCurrency ?? ''} ${j.salaryMin ?? ''}${j.salaryMax ? `–${j.salaryMax}` : ''} ${j.salaryPeriod ?? ''}` : '',
    url: j.url,
    postedAt: j.pubDate,
    description: j.jobExcerpt || j.jobDescription,
    tags: [...(j.jobIndustry ?? []), j.jobLevel].filter(Boolean)
  }));
}

async function collectRemoteOk() {
  const data = await fetchJson('https://remoteok.com/api');
  return (Array.isArray(data) ? data : []).filter((j) => j?.position).map((j) => normalizeJob({
    id: `remoteok:${j.id}`,
    source: 'Remote OK',
    title: j.position,
    company: j.company,
    location: j.location || 'Worldwide / remote',
    remote: true,
    type: 'Remote',
    salary: j.salary_min || j.salary_max ? `${j.salary_min ?? ''}${j.salary_max ? `–${j.salary_max}` : ''}` : '',
    url: j.url,
    postedAt: j.date || (j.epoch ? new Date(j.epoch * 1000).toISOString() : null),
    description: j.description,
    tags: j.tags
  }));
}

async function collectRemotive() {
  const data = await fetchJson('https://remotive.com/api/remote-jobs?limit=200');
  return (data.jobs ?? []).map((j) => normalizeJob({
    id: `remotive:${j.id}`,
    source: 'Remotive',
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location || 'Remote',
    remote: true,
    type: j.job_type,
    salary: j.salary,
    url: j.url,
    postedAt: j.publication_date,
    description: j.description,
    tags: [j.category]
  }));
}

async function collectArbeitnow() {
  const all = [];
  for (let page = 1; page <= 3; page += 1) {
    const data = await fetchJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
    for (const j of data.data ?? []) {
      all.push(normalizeJob({
        id: `arbeitnow:${j.slug}`,
        source: 'Arbeitnow',
        title: j.title,
        company: j.company_name,
        location: j.location,
        remote: Boolean(j.remote),
        type: Array.isArray(j.job_types) ? j.job_types.join(', ') : '',
        salary: '',
        url: j.url,
        postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
        description: j.description,
        tags: j.tags
      }));
    }
    if (!data.links?.next) break;
  }
  return all;
}

async function collectManual() {
  const items = JSON.parse(await fs.readFile(path.join(root, 'data/manual-jobs.json'), 'utf8'));
  return items.map((j, index) => normalizeJob({ ...j, id: j.id || `manual:${index}`, source: j.source || '직접 추가' }));
}

function dedupe(jobs) {
  const byKey = new Map();
  for (const job of jobs) {
    const urlKey = lower(job.url).replace(/[?#].*$/, '').replace(/\/$/, '');
    const titleCompanyKey = `${lower(job.company)}::${lower(job.title)}`;
    const key = job.company && job.company !== '회사 미상' && job.title ? titleCompanyKey : urlKey;
    const existing = byKey.get(key);
    const jobTime = Date.parse(job.postedAt) || 0;
    const existingTime = Date.parse(existing?.postedAt) || 0;
    if (!existing || job.score > existing.score || (job.score === existing.score && jobTime > existingTime)) {
      byKey.set(key, job);
    }
  }
  return [...byKey.values()];
}

export async function collectJobs({ includeManual = true, persist = true } = {}) {
  const sources = [
    ['Jobicy', collectJobicy],
    ['Remote OK', collectRemoteOk],
    ['Remotive', collectRemotive],
    ['Arbeitnow', collectArbeitnow]
  ];
  if (includeManual) sources.push(['직접 추가', collectManual]);
  const jobs = [];
  const sourceStatus = [];
  for (const [name, collector] of sources) {
    try {
      const collected = await collector();
      jobs.push(...collected);
      sourceStatus.push({ source: name, ok: true, count: collected.length });
    } catch (error) {
      sourceStatus.push({ source: name, ok: false, count: 0, error: String(error.message ?? error) });
    }
  }
  const uniqueJobs = dedupe(jobs).sort((a, b) => (b.score - a.score) || ((Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0)));
  const payload = { updatedAt: new Date().toISOString(), sourceStatus, jobs: uniqueJobs };
  if (persist) await fs.writeFile(path.join(root, 'data/jobs.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const payload = await collectJobs();
  console.log(JSON.stringify({ updatedAt: payload.updatedAt, sourceStatus: payload.sourceStatus, jobs: payload.jobs.length }, null, 2));
}
