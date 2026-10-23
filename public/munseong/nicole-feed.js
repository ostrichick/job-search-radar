import { validatePublicFeed } from './backup-rules.js';

const clean = (value) => typeof value === 'string' ? value.trim() : '';
const provinces = [
  ['서울특별시', /서울|seoul/i], ['부산광역시', /부산|busan/i], ['대구광역시', /대구|daegu/i],
  ['인천광역시', /인천|incheon/i], ['대전광역시', /대전|daejeon/i], ['광주광역시', /광주|gwangju/i],
  ['울산광역시', /울산|ulsan/i], ['세종특별자치시', /세종|sejong/i], ['경기도', /경기|gyeonggi|수원|성남/i],
  ['전북특별자치도', /전북|전주|완주|익산|김제|군산|정읍|임실|진안|남원|jeonju|wanju|iksan|gimje/i],
  ['충청북도', /충북|청주|충주/i], ['충청남도', /충남|천안|아산/i],
  ['경상남도', /경남|창원|진주/i], ['경상북도', /경북|포항|안동/i],
  ['강원특별자치도', /강원|춘천|강릉/i], ['제주특별자치도', /제주|jeju/i],
  ['전남광주통합특별시', /전남|목포|여수|순천/i]
];
const near = /전주|완주|jeonju|wanju/i;
const nearby = /익산|김제|군산|정읍|임실|진안|남원|iksan|gimje|gunsan/i;

export function nicoleRegion(job) {
  const location = clean(job.location);
  const explicit = clean(job.commuteClass);
  const matches = provinces.filter(([, regex]) => regex.test(location));
  const province = matches.length === 1 ? matches[0][0] : '';
  const inferred = !province ? 'unknown' : province !== '전북특별자치도' ? 'relocation'
    : near.test(location) && !nearby.test(location) ? 'nearby'
    : nearby.test(location) && !near.test(location) ? 'expanded' : 'unknown';
  const commuteClass = ['nearby', 'expanded', 'relocation'].includes(explicit) ? explicit : inferred;
  return { country: '대한민국', province, locality: '', neighborhood: '', label: location, commuteClass };
}

const sourceForManual = (url, original = '') => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'upwork.com' || host.endsWith('.upwork.com')) return 'Upwork';
    if (['kowork.kr', 'kowork.co.kr'].some((domain) => host === domain || host.endsWith('.' + domain))) return 'KOWORK';
    if (host === 'proz.com' || host.endsWith('.proz.com')) return 'ProZ';
    if (host === 'workana.com' || host.endsWith('.workana.com')) return 'Workana';
    return original || host.replace(/^www\./, '');
  } catch { return original || 'Manual'; }
};
export { sourceForManual };

export function adaptNicoleJob(job) {
  const online = job.market === 'online';
  const scope = online ? 'overseas_remote' : 'domestic';
  const collection = clean(job.collectionState) || 'unknown';
  const listingStatus = collection === 'seen' ? 'current_feed' : collection === 'not_seen' ? 'archived_missing' : 'source_error';
  const source = clean(job.source) || 'Unknown source';
  const manual = clean(job.id).startsWith('manual:');
  const languageFitStatus = ['match', 'mismatch'].includes(job.languageFitStatus) ? job.languageFitStatus : 'unknown';
  const eligibilityCode = job.eligibilityStatus === 'possible' ? 'korea' : job.eligibilityStatus === 'restricted' ? 'restricted' : 'unknown';
  return {
    ...job,
    source: manual ? sourceForManual(job.url, source) : source,
    marketScopes: [scope], marketSegment: scope,
    remote: online, manual,
    category: clean(job.category) || 'other',
    languageFitStatus, languageFitReason: clean(job.languageFitReason),
    eligibilityCode,
    eligibilityReason: typeof job.eligibilityDetail === 'object' ? clean(job.eligibilityDetail.reason) : clean(job.eligibilityDetail),
    eligibility: typeof job.eligibility === 'string' ? job.eligibility : 'Unverified',
    listingStatus, collectionState: collection,
    listingLabel: collection === 'not_seen' ? 'Historical' : collection === 'seen' ? 'Current collection' : 'Collection unverified',
    postedAt: job.postedAt || '', firstSeenAt: job.firstSeenAt || '', lastSeenAt: job.lastSeenAt || '',
    researchReviewedAt: job.researchReviewedAt || '',
    score: Number.isFinite(job.score) ? job.score : 0,
    recommendationEligible: true,
    roleFitEvidence: true,
    sourceTrustLabel: source,
    domesticRegion: online ? undefined : nicoleRegion(job),
    requirementChecks: [], verificationHistory: [], paymentSignals: [],
    sourceEvidence: [], listingEvidence: [],
    applyValueReasons: [], decisionUnknowns: [],
    salaryInfo: job.salaryInfo || { raw: clean(job.pay), display: clean(job.pay), confidence: 'none' }
  };
}

export function adaptNicoleFeed(raw) {
  if (!raw || !Array.isArray(raw.jobs)) throw new Error('Invalid Nicole feed');
  const data = {
    ...raw,
    jobs: raw.jobs.map(adaptNicoleJob),
    sourceStatus: (raw.sourceStatus || []).map((s) => ({
      ...s, ok: s.ok ?? ['ok', 'partial', 'manual'].includes(s.status)
    }))
  };
  return validatePublicFeed(data);
}
