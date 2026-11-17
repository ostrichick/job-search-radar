const ALBA_BOARD = /알바몬|알바천국/i;
const ALBA_TEXT = /아르바이트|알바|일용|일일|파트타임|시간제/i;
const HOURLY_PAY = /시급|시간당|\/\s*시간|per\s+hour|hourly/i;
const SHORT_TERM = /단기|일용|일일|1\s*주|1\s*개월|2\s*개월|3\s*개월|1\s*~\s*3\s*개월|3\s*개월\s*미만/i;

const FEMALE_ONLY = /\b(?:female|woman|women)\b[^.]{0,70}\b(?:only|voice|talent|actor|actress|speaker|narrat|applicant|candidate|required)\b|\b(?:only|voice|talent|actor|actress|speaker|narrat|applicant|candidate|required)\b[^.]{0,70}\b(?:female|woman|women)\b|(?:여성|여자)\s*(?:전용|한정|필수|지원자|보이스|성우)|(?:보이스|성우|아나운서)\s*(?:여성|여자)/i;
const MALE_ONLY = /\b(?:male|man|men)\b[^.]{0,70}\b(?:only|voice|talent|actor|speaker|narrat|applicant|candidate|required)\b|\b(?:only|voice|talent|actor|speaker|narrat|applicant|candidate|required)\b[^.]{0,70}\b(?:male|man|men)\b|(?:남성|남자)\s*(?:전용|한정|필수|지원자|보이스|성우)|(?:보이스|성우|아나운서)\s*(?:남성|남자)/i;

export function isGenderRestrictedJob(job, gender = 'male') {
  const title = String(job?.title || '');
  const body = String(job?.description || '').slice(0, 1600);
  const femaleOnly = FEMALE_ONLY.test(title) || /\b(?:female|woman|women)\s+(?:only|applicants?|candidates?|voices?|talent)\b|(?:여성|여자)\s*(?:전용|한정|지원자|보이스|성우)/i.test(body);
  const maleOnly = MALE_ONLY.test(title) || /\b(?:male|man|men)\s+(?:only|applicants?|candidates?|voices?|talent)\b|(?:남성|남자)\s*(?:전용|한정|지원자|보이스|성우)/i.test(body);
  if (gender === 'male') return femaleOnly;
  if (gender === 'female') return maleOnly;
  return femaleOnly || maleOnly;
}

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
