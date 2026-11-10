const ALBA_BOARD = /알바몬|알바천국/i;
const ALBA_TEXT = /아르바이트|알바|일용|일일|파트타임|시간제/i;
const HOURLY_PAY = /시급|시간당|\/\s*시간|per\s+hour|hourly/i;
const SHORT_TERM = /단기|일용|일일|1\s*주|1\s*개월|2\s*개월|3\s*개월|1\s*~\s*3\s*개월|3\s*개월\s*미만/i;

export function isShortTermHourlyJob(job) {
  const title = String(job?.title || '');
  const type = String(job?.type || '');
  const source = String(job?.source || '');
  const workPeriod = String(job?.workPeriod || '');
  const tags = (job?.tags || []).join(' ');
  const payText = [job?.salary, job?.pay, job?.salaryInfo?.display, job?.salaryInfo?.raw].filter(Boolean).join(' ');
  const albaText = ALBA_TEXT.test([title, type, tags].join(' '));
  const hourly = job?.salaryInfo?.period === 'hour' || HOURLY_PAY.test(payText);
  const shortTerm = SHORT_TERM.test([title, type, workPeriod].join(' '));
  return albaText || (ALBA_BOARD.test(source) && hourly) || (hourly && shortTerm);
}
