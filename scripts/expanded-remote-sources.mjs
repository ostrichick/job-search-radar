// Large public job catalogs. Search only location-eligible slices instead of
// mirroring every job. Keep all public application links on the source board.
// Himalayas data is refreshed daily; the scheduled runner reads it four times
// a day and never forwards these jobs to external aggregators.
export const EXPANDED_REMOTE_FEEDS = Object.freeze({
  himalayas: [
    'https://himalayas.app/jobs/api/search?q=korean&country=KR&sort=recent&page=1',
    'https://himalayas.app/jobs/api/search?q=korean&country=KR&sort=recent&page=2',
    'https://himalayas.app/jobs/api/search?q=annotation&country=KR&sort=recent&page=1',
    'https://himalayas.app/jobs/api/search?q=annotation&country=KR&sort=recent&page=2',
    'https://himalayas.app/jobs/api/search?q=AI%20trainer&country=KR&sort=recent&page=1',
    'https://himalayas.app/jobs/api/search?q=translation&country=KR&sort=recent&page=1',
    'https://himalayas.app/jobs/api/search?q=spanish&country=KR&sort=recent&page=1',
    'https://himalayas.app/jobs/api/search?q=spanish&country=KR&sort=recent&page=2',
    'https://himalayas.app/jobs/api/search?q=content&country=KR&sort=recent&page=1'
  ],
  remotejobs: [
    'https://remotejobs.org/api/v1/jobs?q=korean&country=KR&eligibility=known&limit=50',
    'https://remotejobs.org/api/v1/jobs?q=spanish&country=KR&eligibility=known&limit=50',
    'https://remotejobs.org/api/v1/jobs?category=ai-training&country=KR&eligibility=known&limit=50',
    'https://remotejobs.org/api/v1/jobs?category=marketing&country=KR&eligibility=known&limit=50',
    'https://remotejobs.org/api/v1/jobs?category=writing&country=KR&eligibility=known&limit=50'
  ]
});

const timestamp = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1000000000) return null;
  return new Date(number * 1000).toISOString();
};
const validSourceUrl = (value, host) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host ? url.href : '';
  } catch { return ''; }
};
const salary = (min, max, currency, period) => {
  if (!Number.isFinite(Number(min)) && !Number.isFinite(Number(max))) return '';
  const values = [min, max].filter((item) => item !== null && item !== undefined && Number.isFinite(Number(item)));
  if (!values.length) return '';
  return `${currency || 'currency unspecified'} ${values.join('–')} ${period || 'period unspecified'}`;
};

export function expandedRemoteCandidates(key, payload, now = Date.now()) {
  if (key === 'himalayas') {
    if (!Array.isArray(payload?.jobs)) throw new Error('Himalayas API jobs array missing');
    return payload.jobs.flatMap((job) => {
      if (!job || !Array.isArray(job.locationRestrictions)) return [];
      const regions = job.locationRestrictions;
      if (regions.length && !regions.some((r) => /^(KR|South Korea|Republic of Korea|Korea)$/i.test(String(r).trim()))) return [];
      const expires = Number(job.expiryDate);
      if (Number.isFinite(expires) && expires > 0 && expires * 1000 <= now) return [];
      if (/\b(?:internal job posting|employees only|internal applicants only)\b/i.test(job.title)) return [];
      const url = validSourceUrl(job.applicationLink, 'himalayas.app');
      if (!url || !job.title || !job.companyName) return [];
      return [{
        source: 'Himalayas', sourcePostingId: job.guid || url, url,
        title: job.title, company: job.companyName,
        location: regions.length ? regions.join(', ') : 'Worldwide',
        remote: true, workplaceMode: 'remote',
        type: job.employmentType || 'Remote',
        description: job.description || job.excerpt || '',
        postedAt: timestamp(job.pubDate),
        // This is the board's maximum listing lifetime, NOT an employer's
        // application deadline. Used only for pruning expired feed entries.
        listingExpiresAt: timestamp(job.expiryDate),
        salary: salary(job.minSalary, job.maxSalary, job.currency, job.salaryPeriod),
        salaryProvenance: 'board_metadata',
        tags: [...(job.categories || []), ...(job.parentCategories || [])].filter((s) => typeof s === 'string')
      }];
    });
  }
  if (key === 'remotejobs') {
    if (!Array.isArray(payload?.data)) throw new Error('RemoteJobs.org API data array missing');
    return payload.data.flatMap((job) => {
      const geo = job?.applicant_location_requirements;
      // The API's country search alone is not enough: 'possible' results can
      // contain explicit US-only jobs. Require supported KR/worldwide evidence.
      const eligible = geo?.status === 'known' &&
        (geo.allowed_countries?.includes('KR') || geo.worldwide_permission_verified === true);
      if (!eligible || geo.work_arrangement !== 'remote') return [];
      if (geo.excluded_countries?.includes('KR')) return [];
      const heading = job.location_normalization;
      // Headline country limits can conflict with an inferred worldwide flag.
      const restrictedElsewhere = heading?.status === 'known'
        && heading.scope === 'restricted'
        && !heading.allowed_countries?.includes('KR')
        && (heading.allowed_countries?.length || heading.allowed_subdivisions?.length ||
          heading.allowed_regions?.length);
      if (restrictedElsewhere) return [];
      if (/\s[-–]\s(?:Ireland|Canada|UK|United Kingdom|United States|USA|Germany|France|Australia)\s*$/i.test(job.title || '')
        && !heading?.allowed_countries?.includes('KR')) return [];
      const url = validSourceUrl(job.url, 'remotejobs.org');
      if (!url || !job.title || !job.company?.name) return [];
      return [{
        source: 'RemoteJobs.org', sourcePostingId: job.id || url, url,
        title: job.title, company: job.company.name,
        location: geo.allowed_countries?.includes('KR') ? 'South Korea'
          : heading?.status === 'known' && heading.scope === 'worldwide'
            ? 'Worldwide'
            : 'Remote (Korea eligibility requires direct confirmation)',
        remote: true, workplaceMode: 'remote', type: job.type || 'Remote',
        description: job.description || '',
        postedAt: job.posted_at || null,
        salary: job.salary_text || salary(job.salary_min, job.salary_max, job.salary_currency, job.salary_period),
        salaryProvenance: 'board_metadata',
        tags: [job.category?.name].filter(Boolean)
      }];
    });
  }
  throw new Error('Unsupported expanded remote source');
}
