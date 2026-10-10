import crypto from 'node:crypto';
export function createSourceAdapters({ fetchJson, fetchText, text, lower, decodeHtmlEntities, normalizeJob, relevantToProfile, sourceCollection, work24Deadline, work24EmploymentType, work24IsoDate, parseWork24ListXml, xmlTag }) {
async function collectLeverBoard(site, source, company, { query = '', rowFilter = null } = {}) {
  const suffix = query ? `&${query}` : '';
  const rows = await fetchJson(`https://api.lever.co/v0/postings/${site}?mode=json${suffix}`);
  const collected = [];
  let profileMatchedCount = 0;
  for (const j of Array.isArray(rows) ? rows : []) {
    if (rowFilter && !rowFilter(j)) continue;
    const location = Array.isArray(j.categories?.allLocations) && j.categories.allLocations.length
      ? j.categories.allLocations.join(' / ')
      : j.categories?.location;
    const listText = (Array.isArray(j.lists) ? j.lists : [])
      .map((section) => [section?.text, text(section?.content)].filter(Boolean).join(': '))
      .filter(Boolean)
      .join('\n');
    const description = [j.descriptionPlain, j.descriptionBodyPlain, j.additionalPlain, listText]
      .filter(Boolean)
      .join('\n');
    const candidate = {
      id: `lever:${site}:${j.id}`,
      source,
      title: j.text,
      company,
      location,
      remote: j.workplaceType === 'remote',
      workplaceMode: j.workplaceType || '',
      type: j.categories?.commitment || j.workplaceType,
      salary: '',
      url: j.hostedUrl,
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      sourceListingState: 'published',
      sourceCreatedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      description,
      tags: [j.categories?.department, j.categories?.team, j.workplaceType].filter(Boolean),
      countryCode: j.country || '',
      locationEvidenceLevel: 'source_structured'
    };
    if (relevantToProfile(candidate)) {
      profileMatchedCount += 1;
      const normalized = normalizeJob(candidate);
      if (['korea', 'worldwide', 'unknown'].includes(normalized.eligibilityCode)) collected.push(normalized);
    }
  }
  return sourceCollection(collected, Array.isArray(rows) ? rows.length : 0, { profileMatchedCount });
}

async function collectWeloGlobal() {
  return collectLeverBoard('weloglobal', 'Welo Global', 'Welo Global');
}

async function collectRws() {
  return collectLeverBoard('rws', 'RWS TrainAI', 'RWS');
}

async function collectTsmg() {
  return collectLeverBoard('tsmg', 'TSMG', 'Terry Soot Management Group', {
    query: 'location=Remote%20in%20South%20Korea',
    rowFilter: (job) => (/\bkorean\b/i.test(job?.text || '')
      && /\b(?:transcription|quality control)\b/i.test(job?.text || ''))
      || /^Team Coordinator$/i.test(job?.text || '')
  });
}

async function collectElevenLabs() {
  const data = await fetchJson('https://api.ashbyhq.com/posting-api/job-board/elevenlabs');
  const rows = Array.isArray(data?.jobs) ? data.jobs : [];
  const collected = [];
  let localeEligibleCount = 0;
  let profileMatchedCount = 0;
  for (const j of rows) {
    if (j.isListed === false) continue;
    const locations = [j.location, ...(j.secondaryLocations || []).map((item) => item?.location)].filter(Boolean);
    if (!locations.some((location) => /\bkorea\b/i.test(location))) continue;
    localeEligibleCount += 1;
    if (!/\b(?:transcription|subtitling)\b/i.test(j.title || '')) continue;
    const description = j.descriptionPlain || j.descriptionHtml || '';
    const worldwide = /\b(?:executed globally|work globally|worldwide|anywhere in the world)\b/i.test(description);
    const candidate = {
      id: `ashby:elevenlabs:${j.id}`,
      source: 'ElevenLabs',
      title: j.title,
      company: 'ElevenLabs',
      location: worldwide ? 'World Wide - Remote' : 'Korea / Remote',
      remote: Boolean(j.isRemote) || /remote/i.test(j.workplaceType || ''),
      workplaceMode: j.workplaceType || '',
      type: j.employmentType || j.workplaceType || 'Freelance',
      salary: '',
      url: j.jobUrl || j.applyUrl,
      postedAt: j.publishedAt || null,
      sourceListingState: 'published',
      sourceCreatedAt: j.publishedAt || null,
      description,
      tags: ['Korean', 'Transcription', j.department, j.team, j.workplaceType, j.employmentType].filter(Boolean),
      countryCode: worldwide ? '' : 'KR'
    };
    profileMatchedCount += 1;
    collected.push(normalizeJob(candidate));
  }
  return sourceCollection(collected, rows.length, { localeEligibleCount, profileMatchedCount });
}

async function collectLilt() {
  const data = await fetchJson('https://api.ashbyhq.com/posting-api/job-board/lilt-production');
  const rows = Array.isArray(data?.jobs) ? data.jobs : [];
  const collected = [];
  let profileMatchedCount = 0;
  for (const j of rows) {
    if (j.isListed === false) continue;
    if (!/\b(?:korean|korea)\b/i.test(`${j.title || ''} ${j.location || ''}`)) continue;
    const candidate = {
      id: `ashby:lilt-production:${j.id}`,
      source: 'LILT Production',
      title: j.title,
      company: 'LILT',
      location: j.location || 'Remote',
      remote: Boolean(j.isRemote) || /remote/i.test(j.workplaceType || j.location || ''),
      workplaceMode: j.workplaceType || '',
      type: j.employmentType || j.workplaceType || 'Contract',
      salary: '',
      url: j.jobUrl || j.applyUrl,
      postedAt: j.publishedAt || null,
      sourceListingState: 'published',
      sourceCreatedAt: j.publishedAt || null,
      description: j.descriptionPlain || j.descriptionHtml || '',
      tags: [j.department, j.team, j.workplaceType, j.employmentType].filter(Boolean),
      countryCode: /\bkorea\b/i.test(j.location || '') ? 'KR' : ''
    };
    if (!candidate.title || !candidate.url || !relevantToProfile(candidate)) continue;
    profileMatchedCount += 1;
    const normalized = normalizeJob(candidate);
    if (['korea', 'worldwide', 'unknown'].includes(normalized.eligibilityCode)) collected.push(normalized);
  }
  return sourceCollection(collected, rows.length, { profileMatchedCount });
}

async function collectKrafton() {
  const data = await fetchJson('https://boards-api.greenhouse.io/v1/boards/krafton/jobs?content=true');
  const rows = Array.isArray(data?.jobs) ? data.jobs : [];
  const collected = [];
  let profileMatchedCount = 0;
  const relevantTitle = /\b(?:data program manager|foundation model evaluation engineer|korean localization specialist)\b/i;
  for (const j of rows) {
    if (!relevantTitle.test(j.title || '')) continue;
    const description = text(decodeHtmlEntities(j.content || ''));
    const metadata = Object.fromEntries((j.metadata || []).filter((item) => item?.name).map((item) => [item.name, item.value]));
    const candidate = {
      id: `greenhouse:krafton:${j.id}`,
      source: 'KRAFTON',
      title: j.title,
      company: 'KRAFTON',
      location: j.location?.name || 'Seoul, South Korea',
      remote: false,
      workplaceMode: 'onsite',
      type: metadata['Employment Type'] || '미상',
      salary: '',
      url: j.absolute_url,
      postedAt: j.first_published || null,
      sourceListingState: 'published',
      sourceCreatedAt: j.first_published || null,
      sourceModifiedAt: j.updated_at || null,
      description,
      tags: [metadata['Job Category - Data'], metadata['Job Category - Business & Service'], metadata.Sector, metadata['Employment Type']].filter(Boolean),
      countryCode: 'KR',
      locationEvidenceLevel: 'source_structured'
    };
    profileMatchedCount += 1;
    collected.push(normalizeJob(candidate));
  }
  return sourceCollection(collected, rows.length, { profileMatchedCount });
}

async function collectAppier() {
  const data = await fetchJson('https://boards-api.greenhouse.io/v1/boards/appier/jobs?content=true');
  const rows = Array.isArray(data?.jobs) ? data.jobs : [];
  const collected = [];
  let profileMatchedCount = 0;
  for (const j of rows) {
    if (!/\bAI Creative QC Reviewer,? Korea\b/i.test(j.title || '')) continue;
    const description = text(decodeHtmlEntities(j.content || ''));
    const candidate = {
      id: `greenhouse:appier:${j.id}`,
      source: 'Appier',
      title: j.title,
      company: 'Appier',
      location: j.location?.name || 'Seoul, South Korea',
      remote: true,
      workplaceMode: 'remote',
      type: /\bpart\s*time\b/i.test(j.title || '') ? 'Part Time' : 'Contract',
      salary: '',
      url: j.absolute_url,
      postedAt: j.first_published || null,
      sourceListingState: 'published',
      sourceCreatedAt: j.first_published || null,
      sourceModifiedAt: j.updated_at || null,
      description,
      tags: ['Korean', 'AI Creative QC', 'Quality Review', ...(j.departments || []).map((item) => item?.name)].filter(Boolean),
      countryCode: 'KR',
      locationEvidenceLevel: 'source_structured'
    };
    profileMatchedCount += 1;
    collected.push(normalizeJob(candidate));
  }
  return sourceCollection(collected, rows.length, { profileMatchedCount });
}

async function collectChannelCorp() {
  return collectLeverBoard('zoyi', 'Channel Corp', 'Channel Corp', {
    rowFilter: (job) => /^Data Analyst$/i.test(job?.text || '')
  });
}

function work24Candidate(row) {
  const address = text([row.basicAddr, row.detailAddr].filter(Boolean).join(' ')) || text(row.region);
  const deadline = work24Deadline(row.closeDt);
  const education = row.minEdubg && row.maxEdubg && row.minEdubg !== row.maxEdubg
    ? `${row.minEdubg} ~ ${row.maxEdubg}`
    : text(row.minEdubg || row.maxEdubg);
  const salary = text([row.salTpNm, row.sal].filter(Boolean).join(' '));
  const description = [
    row.career ? `경력: ${row.career}` : '',
    education ? `학력: ${education}` : '',
    row.holidayTpNm ? `근무일: ${row.holidayTpNm}` : ''
  ].filter(Boolean).join(' · ');
  const wantedAuthNo = text(row.wantedAuthNo);
  const url = `https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=${encodeURIComponent(wantedAuthNo)}&infoTypeCd=VALIDATION&infoTypeGroup=tb_workinfoworknet`;
  return normalizeJob({
    id: `work24:${wantedAuthNo}`,
    sourcePostingId: wantedAuthNo,
    platform: '고용24',
    source: '고용24',
    company: row.company,
    title: row.title,
    location: address,
    workAddress: address,
    remote: false,
    workplaceMode: 'onsite',
    type: work24EmploymentType(row.empTpCd),
    salary,
    salaryProvenance: 'source_metadata',
    url,
    postedAt: work24IsoDate(row.regDt),
    sourceListingState: `listed:${row.closeDt || 'open'}`,
    sourceModifiedAt: work24IsoDate(row.smodifyDtm),
    description,
    tags: [row.holidayTpNm, row.jobsCd, row.infoSvc].filter(Boolean),
    countryCode: 'KR',
    locationEvidenceLevel: 'source_structured',
    experience: row.career,
    education,
    deadlineType: deadline.type,
    deadlineDate: deadline.date,
    deadlineLabel: deadline.label
  });
}

function fallbackJobsForConfiguredSources(jobs, { work24Configured = false } = {}) {
  if (work24Configured) return jobs;
  return (jobs || []).filter((job) => job.source !== '고용24' && !(job.sources || []).includes('고용24'));
}

async function collectWork24(authKey) {
  if (!text(authKey)) throw new Error('WORK24_AUTH_KEY is required');
  const rowsById = new Map();
  const region = '52110|52111|52113|52710';
  for (let page = 1; page <= 10; page += 1) {
    const params = new URLSearchParams({
      authKey: text(authKey),
      callTp: 'L',
      returnType: 'XML',
      startPage: String(page),
      display: '100',
      region
    });
    const xml = await fetchText(`https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do?${params}`, {
      headers: { Accept: 'application/xml,text/xml,*/*' }
    });
    if (/인증키|authkey/i.test(xml) && /오류|error|유효|승인|인증/i.test(xml) && !/<wanted>/i.test(xml)) {
      throw new Error('고용24 API 인증 또는 승인 상태를 확인해야 합니다.');
    }
    const pageRows = parseWork24ListXml(xml);
    for (const row of pageRows) rowsById.set(row.wantedAuthNo, row);
    if (pageRows.length < 100) break;
  }
  const collected = [];
  for (const row of rowsById.values()) {
    const candidate = work24Candidate(row);
    const regionInfo = candidate.domesticRegion;
    if (!regionInfo || regionInfo.province !== '전북특별자치도') continue;
    if (!['전주시', '완주군'].includes(regionInfo.city)) continue;
    collected.push(candidate);
  }
  return sourceCollection(collected, rowsById.size, {
    localeEligibleCount: collected.length,
    profileMatchedCount: collected.filter((job) => job.roleFitEvidence).length
  });
}

async function collectMeridial() {
  const data = await fetchJson('https://boards-api.greenhouse.io/v1/boards/agency/jobs?content=true');
  const rows = Array.isArray(data?.jobs) ? data.jobs : [];
  const collected = [];
  let localeEligibleCount = 0;
  let profileMatchedCount = 0;
  for (const j of rows) {
    if (!/\bkorean\b/i.test(j.title || '')) continue;
    localeEligibleCount += 1;
    const description = text(decodeHtmlEntities(j.content || ''));
    const location = j.location?.name || 'Remote';
    const candidate = {
      id: `greenhouse:agency:${j.id}`,
      source: 'Meridial',
      title: j.title,
      company: j.company_name || 'Meridial',
      location,
      remote: /\bremote\b/i.test(location) || /workplace type\s*:?\s*remote/i.test(description),
      workplaceMode: /\bhybrid\b/i.test(description) ? 'hybrid' : (/\bremote\b/i.test(location) || /workplace type\s*:?\s*remote/i.test(description) ? 'remote' : 'unknown'),
      type: /\b(?:freelance|independent contractor)\b/i.test(description) ? 'Freelance / Contract' : 'Contract',
      salary: '',
      url: j.absolute_url,
      postedAt: j.first_published || null,
      sourceListingState: 'published',
      sourceCreatedAt: j.first_published || null,
      sourceModifiedAt: j.updated_at || null,
      description,
      tags: ['Greenhouse', /freelance ai trainer project/i.test(j.title || '') ? 'Freelance AI Trainer' : 'AI'],
      countryCode: /\bsouth korea\b/i.test(location) ? 'KR' : ''
    };
    if (!candidate.title || !candidate.url || !relevantToProfile(candidate)) continue;
    profileMatchedCount += 1;
    const normalized = normalizeJob(candidate);
    if (['korea', 'worldwide', 'unknown'].includes(normalized.eligibilityCode)) collected.push(normalized);
  }
  return sourceCollection(collected, rows.length, { localeEligibleCount, profileMatchedCount });
}

function oneFormaTerms(post, taxonomy) {
  return (post?._embedded?.['wp:term'] ?? [])
    .flat()
    .filter((term) => term?.taxonomy === taxonomy)
    .map((term) => text(term.name))
    .filter(Boolean);
}

function oneFormaSupportsKorean(post) {
  const languages = oneFormaTerms(post, 'language');
  if (!languages.length || languages.some((language) => /korean|한국어/i.test(language))) return true;
  const countries = oneFormaTerms(post, 'country');
  const content = lower(post?.content?.rendered || post?.excerpt?.rendered);
  const koreaLocation = countries.some((country) => /south korea|korea republic/i.test(country));
  const localLanguageRequirement = /native or (?:a )?fluent speaker of the language of the location|fluent speaker of the language of the location|language of the location where you are located/.test(content);
  return koreaLocation && localLanguageRequirement;
}

function oneFormaCandidate(post) {
  const countries = oneFormaTerms(post, 'country');
  const languages = oneFormaTerms(post, 'language');
  const types = oneFormaTerms(post, 'job_type');
  const jobTags = oneFormaTerms(post, 'job_tag');
  const domains = oneFormaTerms(post, 'domain');
  const worldwide = jobTags.some((tag) => /worldwide/i.test(tag));
  const koreaEligible = countries.some((country) => /south korea|korea republic/i.test(country));
  const remote = worldwide
    || jobTags.some((tag) => /remote/i.test(tag))
    || countries.some((country) => /^remote$/i.test(country))
    || /\bremote\b|work from home/i.test(text(post?.content?.rendered));
  const location = worldwide
    ? 'Worldwide'
    : koreaEligible
      ? (countries.length > 1 ? `South Korea + ${countries.length - 1}개 국가` : 'South Korea')
      : countries.slice(0, 3).join(' / ') || (remote ? 'Remote' : '위치 미상');
  const postedAt = post?.date_gmt
    ? new Date(`${post.date_gmt}Z`).toISOString()
    : post?.date
      ? new Date(post.date).toISOString()
      : null;
  return {
    id: `oneforma:${post?.id}`,
    source: 'OneForma',
    title: text(post?.title?.rendered),
    company: 'OneForma',
    location,
    remote,
    type: types.join(', ') || 'Project',
    salary: '',
    url: post?.link,
    postedAt,
    sourceListingState: post?.status || '',
    sourceCreatedAt: postedAt,
    sourceModifiedAt: post?.modified_gmt
      ? new Date(`${post.modified_gmt}Z`).toISOString()
      : post?.modified
        ? new Date(post.modified).toISOString()
        : null,
    description: text(post?.content?.rendered || post?.excerpt?.rendered),
    tags: [
      ...languages.filter((language) => /korean/i.test(language)),
      ...jobTags,
      ...domains,
      ...types,
      ...languages
    ].slice(0, 80),
    countryCode: worldwide ? '' : (koreaEligible ? 'KR' : '')
  };
}

async function collectOneForma() {
  const rows = await fetchJson('https://www.oneforma.com/wp-json/wp/v2/job?per_page=100&_embed=1');
  const collected = [];
  let localeEligibleCount = 0;
  let profileMatchedCount = 0;
  for (const post of Array.isArray(rows) ? rows : []) {
    if (!oneFormaSupportsKorean(post)) continue;
    localeEligibleCount += 1;
    const candidate = oneFormaCandidate(post);
    if (!candidate.title || !candidate.url) continue;
    if (relevantToProfile(candidate)) {
      profileMatchedCount += 1;
      collected.push(normalizeJob(candidate));
    }
  }
  return sourceCollection(collected, Array.isArray(rows) ? rows.length : 0, { localeEligibleCount, profileMatchedCount });
}

async function collectWeWorkRemotely() {
  const xml = await fetchText('https://weworkremotely.com/remote-jobs.rss');
  const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  const collected = [];
  for (const block of blocks) {
    const combinedTitle = text(xmlTag(block, 'title'));
    const separator = combinedTitle.indexOf(':');
    const company = separator > 0 ? combinedTitle.slice(0, separator).trim() : '회사 미상';
    const title = separator > 0 ? combinedTitle.slice(separator + 1).trim() : combinedTitle;
    const description = xmlTag(block, 'description');
    const candidate = {
      id: `wwr:${crypto.createHash('sha1').update(xmlTag(block, 'link')).digest('hex').slice(0, 16)}`,
      source: 'We Work Remotely',
      title,
      company,
      location: 'Remote',
      remote: true,
      type: 'Remote',
      salary: '',
      url: xmlTag(block, 'link'),
      postedAt: xmlTag(block, 'pubDate'),
      description,
      tags: ['remote']
    };
    if (relevantToProfile(candidate)) collected.push(normalizeJob(candidate));
  }
  return sourceCollection(collected, blocks.length);
}

async function collectJobicy() {
  const data = await fetchJson('https://jobicy.com/api/v2/remote-jobs?count=200');
  const rows = data.jobs ?? [];
  const collected = rows.map((j) => ({
    id: `jobicy:${j.id}`,
    source: 'Jobicy',
    title: j.jobTitle,
    company: j.companyName,
    location: j.jobGeo,
    remote: true,
    type: Array.isArray(j.jobType) ? j.jobType.join(', ') : j.jobType,
    salary: j.salaryMin || j.salaryMax ? `${j.salaryCurrency ?? ''} ${j.salaryMin ?? ''}${j.salaryMax ? `–${j.salaryMax}` : ''} ${j.salaryPeriod ?? ''}` : '',
    salaryProvenance: 'board_metadata',
    url: j.url,
    postedAt: j.pubDate,
    description: j.jobDescription || j.jobExcerpt,
    tags: [...(j.jobIndustry ?? []), j.jobLevel].filter(Boolean)
  })).filter(relevantToProfile).map(normalizeJob);
  return sourceCollection(collected, rows.length);
}

async function collectRemoteOk() {
  const data = await fetchJson('https://remoteok.com/api');
  const rows = (Array.isArray(data) ? data : []).filter((j) => j?.position);
  const collected = rows.map((j) => ({
    id: `remoteok:${j.id}`,
    source: 'Remote OK',
    title: j.position,
    company: j.company,
    location: j.location || 'Remote',
    remote: true,
    type: 'Remote',
    salary: j.salary_min || j.salary_max ? `${j.salary_min ?? ''}${j.salary_max ? `–${j.salary_max}` : ''}` : '',
    salaryProvenance: 'board_metadata',
    url: j.url,
    postedAt: j.date || (j.epoch ? new Date(j.epoch * 1000).toISOString() : null),
    description: j.description,
    tags: j.tags
  })).filter(relevantToProfile).map(normalizeJob);
  return sourceCollection(collected, rows.length);
}

async function collectRemotive() {
  const data = await fetchJson('https://remotive.com/api/remote-jobs?limit=200');
  const rows = data.jobs ?? [];
  const collected = rows.map((j) => ({
    id: `remotive:${j.id}`,
    source: 'Remotive',
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location || 'Remote',
    remote: true,
    type: j.job_type,
    salary: j.salary,
    salaryProvenance: 'board_metadata',
    url: j.url,
    postedAt: j.publication_date,
    description: j.description,
    tags: [j.category]
  })).filter(relevantToProfile).map(normalizeJob);
  return sourceCollection(collected, rows.length);
}

async function collectArbeitnow() {
  const all = [];
  let rawCount = 0;
  for (let page = 1; page <= 3; page += 1) {
    const data = await fetchJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
    for (const j of data.data ?? []) {
      rawCount += 1;
      const candidate = {
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
      };
      if (relevantToProfile(candidate)) all.push(normalizeJob(candidate));
    }
    if (!data.links?.next) break;
  }
  return sourceCollection(all, rawCount);
}


return { collectLeverBoard, collectWeloGlobal, collectRws, collectTsmg, collectElevenLabs, collectLilt, collectKrafton, collectAppier, collectChannelCorp, work24Candidate, fallbackJobsForConfiguredSources, collectWork24, collectMeridial, oneFormaTerms, oneFormaSupportsKorean, oneFormaCandidate, collectOneForma, collectWeWorkRemotely, collectJobicy, collectRemoteOk, collectRemotive, collectArbeitnow };
}
