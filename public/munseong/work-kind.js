// Classify the form of work, not the applicant's eligibility or desirability.
// Do not infer permanent employment from "full-time" or ongoing pay from an
// hourly rate. Source-provided type and project duration stay visible beside it.
export function workKind(job = {}) {
  const type = String(job.type || job.employmentType || '').normalize('NFKC').toLowerCase()
    // A possible promotion or a preference is not today's contract type.
    .replace(/정규직\s*(?:전환(?:\s*가능(?:한)?)?|우대|협의|희망)/g, '');
  const title = String(job.title || '').normalize('NFKC').toLowerCase();
  const taskWord = /\b(?:one[- ](?:off|time)|microtask|paid data task|single task|short task)\b|일회성|일회\s*과업|건별\s*지급/i;
  if (taskWord.test(type) || (taskWord.test(title) && !/정규직|\bpermanent\b/.test(type))) return 'task';
  const permanent = /정규직|무기계약직|\bpermanent\b/.test(type);
  const contract = /계약직|기간제|임기제|\bcontract\b|\btemporary\b|\bfixed[- ]term\b/.test(type);
  const partTime = /아르바이트|알바|시간제|\bpart[ -]?time\b|\bweekend shift\b/.test(type);
  const freelance = /프리랜서|프리랜스|\bfreelanc(?:e|er)\b|\b(?:independent\s+)?contractor\b/.test(type);
  if ([permanent, contract, partTime, freelance].filter(Boolean).length > 1) return 'mixed';
  if (partTime || /단기\s*(?:알바|아르바이트)/.test(title)) return 'part_time';
  if (freelance) return 'freelance';
  if (contract) return 'contract';
  if (permanent) return 'permanent';
  if (/\bfull[ -]?time\b/.test(type)) return 'full_time';
  // Several platforms omit the employment-type field. Only explicit words in
  // the headline count as evidence; a remote location or hourly pay does not.
  if (/\bfreelanc(?:e|er)\b|\bcontractor\b|프리랜서/.test(title)) return 'freelance';
  if (/\bpart[ -]?time\b|아르바이트|알바/.test(title)) return 'part_time';
  if (/\bfull[ -]?time\b/.test(title)) return 'full_time';
  return 'unknown';
}

export function workKindLabel(job, isNicole = false) {
  const kind = workKind(job);
  const names = isNicole
    ? { task: 'One-off task', mixed: 'Multiple contract types', part_time: 'Hourly / part-time', freelance: 'Freelance', contract: 'Contract', permanent: 'Permanent', full_time: 'Full-time (contract unknown)', unknown: 'Contract type to verify' }
    : { task: '일회성 과업', mixed: '고용형태 복수', part_time: '시간제·아르바이트', freelance: '프리랜서', contract: '계약직·기간제', permanent: '정규직', full_time: '상근(계약형태 확인)', unknown: '고용형태 확인 필요' };
  return names[kind];
}
