import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function parseLinkedInJobAlert({ body = '', emailTs = '' } = {}) {
  const source = String(body ?? '');
  if (!/You are receiving Job Alert emails\.|email_job_alert_digest/i.test(source)) return [];

  const jobs = [];
  const seen = new Set();
  const jobLink = /\[([^\n]*(?:\n[^\n]*){0,2})\]\((https:\/\/www\.linkedin\.com\/comm\/jobs\/view\/(\d+)\/[^)\s]*)\)/gi;
  for (const match of source.matchAll(jobLink)) {
    const label = match[1];
    if (!label.includes(' · ')) continue;
    const jobId = match[3];
    if (seen.has(jobId)) continue;

    const lines = label.split(/\r?\n/).map(clean).filter(Boolean);
    const detailIndex = lines.findIndex((line) => line.includes(' · '));
    if (detailIndex <= 0) continue;
    let title = clean(lines.slice(0, detailIndex).join(' '));
    title = title.replace(/^.*\]\(https:\/\/www\.linkedin\.com\/comm\/jobs\/view\/\d+\/[^)]*\)\s+/i, '');
    if (title.startsWith('[')) title = title.slice(1);
    title = clean(title);
    const [companyRaw, ...locationParts] = lines[detailIndex].split(' · ');
    const company = clean(companyRaw);
    const location = clean(locationParts.join(' · ').replace(/\s+Easy Apply(?:\s+Easy Apply)?$/i, ''));
    if (!title || !company || !location) continue;

    const workplace = /\(remote\)/i.test(location)
      ? 'remote'
      : /\(hybrid\)/i.test(location)
        ? 'hybrid'
        : /\(on-site\)/i.test(location)
          ? 'onsite'
          : 'unknown';
    jobs.push({
      id: `linkedin-alert:${jobId}`,
      linkedinJobId: jobId,
      source: 'LinkedIn Job Alert',
      title,
      company,
      location,
      remote: workplace === 'remote',
      workplace,
      url: `https://www.linkedin.com/jobs/view/${jobId}/`,
      alertReceivedAt: emailTs || ''
    });
    seen.add(jobId);
  }
  return jobs;
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2]) {
  const input = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
  const messages = Array.isArray(input) ? input : [input];
  const jobs = messages.flatMap((message) => parseLinkedInJobAlert(message));
  process.stdout.write(`${JSON.stringify(jobs, null, 2)}\n`);
}
