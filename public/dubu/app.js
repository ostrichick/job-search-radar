import { createStateStorage } from './state-storage.js';
import { feedHealth } from './feed-health.js';
const storage = await createStateStorage();
const initialState = storage.snapshot();
// Collected by this repository's Pages workflow (profiles/dubu).
const FEED_URL = '../feeds/dubu.json';
const PAGE_SIZE = 24;
const numberFormatter = new Intl.NumberFormat('en-US');

const categoryNames = {
  marketing: 'Marketing', advertising: 'Advertising', translation: 'Translation',
  interpreting: 'Interpreting', content: 'Content', other: 'Other',
};
const workplaceNames = {
  remote: 'Remote', onsite: 'On-site', hybrid: 'Hybrid', unknown: 'Work mode unknown',
};
const regionNames = {
  nearby: 'Jeonju / Wanju', expanded: 'Nearby · Check commute',
  relocation: 'Other region · Relocation / Remote negotiation', unknown: 'Location unknown',
};
const provincePatterns = [
  ['서울', /서울|seoul/i], ['부산', /부산|busan/i], ['대구', /대구|daegu/i],
  ['인천', /인천|incheon/i], ['광주', /광주|gwangju/i], ['대전', /대전|daejeon/i],
  ['울산', /울산|ulsan/i], ['세종', /세종|sejong/i],
  ['경기', /경기|gyeonggi|수원|성남|용인|고양|파주|화성|안양|평택|부천|안산|시흥|의정부|남양주|하남|광명|김포|구리|오산|안성|이천|광주\s*시/i],
  ['강원', /강원|gangwon|춘천|원주|강릉|속초|동해|삼척|태백|홍천/i],
  ['충북', /충북|충청북|chungbuk|청주|충주|제천|음성|진천|증평/i],
  ['충남', /충남|충청남|chungnam|천안|아산|서산|당진|공주|보령|논산|계룡|홍성/i],
  ['전북', /전북|전라북|jeonbuk|north\s*jeolla|전주|완주|익산|김제|군산|정읍|임실|진안|남원|부안|고창|무주|장수|순창/i],
  ['전남', /전남|전라남|jeonnam|south\s*jeolla|목포|여수|순천|광양|나주|해남|화순/i],
  ['경북', /경북|경상북|gyeongbuk|포항|경주|구미|안동|경산|영주|문경|김천|상주/i],
  ['경남', /경남|경상남|gyeongnam|창원|김해|진주|양산|거제|통영|밀양|사천/i],
  ['제주', /제주|jeju|서귀포/i],
];
const nearbyPattern = /전주|완주|jeonju|wanju/i;
const expandedPattern = /익산|김제|군산|정읍|임실|진안|남원|iksan|gimje|gunsan|jeongeup|imsil|jinan|namwon/i;
const sourceStatusNames = { ok: 'Collected', partial: 'Partial', error: 'Error', manual: 'Manual check', unavailable: 'Unavailable', not_configured: 'Not configured' };
const sourceKindNames = {
  official: 'Official job board', official_ats: 'Employer application system', official_government: 'Government job board',
  public_api: 'Public API', employer: 'Employer listing', aggregator: 'Job aggregator', manual: 'Manually added · Unverified', platform: 'Platform',
  curated_research: 'Individually researched · Check original',
};

const $ = (id) => document.getElementById(id);
const state = {
  activeTab: 'online', loaded: false, loading: false, loadError: '',
  jobs: [], remoteJobs: [], manualJobs: initialState.manual, updatedAt: null, sourceStatus: [],
  saved: new Set(initialState.saved), hidden: Object.fromEntries(Object.entries(initialState.hidden).map(([key, ids]) => [key, new Set(ids)])),
  filters: {
    online: { query: '', category: 'all', archive: 'all', languageFit: 'all', savedOnly: false, limit: PAGE_SIZE },
    offline: { query: '', category: 'all', province: 'all', region: 'all', archive: 'all', languageFit: 'all', savedOnly: false, limit: PAGE_SIZE },
  },
};

function canonical(value) {
  return clean(value).normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function applyStored(doc) {
  state.saved = new Set(doc.saved);
  state.manualJobs = doc.manual;
  state.hidden = Object.fromEntries(Object.entries(doc.hidden).map(([key, ids]) => [key, new Set(ids)]));
  rebuildJobs(); render();
}
async function updateStored(action) {
  try { await storage.update(action); return true; }
  catch (error) { showMessage(`Changes were not saved: ${error.message}. Your previous state is preserved. Reload to retry.`, 'warning'); return false; }
}
async function migrateJobAliases() {
  const jobs = state.remoteJobs.filter((job) => job.legacyIds.some((id) => state.saved.has(id) || state.hidden.jobs.has(id)));
  if (!jobs.length || !storage.writable) return;
  await updateStored((draft) => {
    for (const job of jobs) for (const field of [draft.saved, draft.hidden.jobs]) {
      if (!job.legacyIds.some((id) => field.includes(id))) continue;
      const remaining = field.filter((id) => !job.legacyIds.includes(id));
      remaining.push(job.id); field.splice(0, field.length, ...new Set(remaining));
    }
  });
}

function sourceForManualUrl(rawUrl) {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    if (hostname === 'upwork.com' || hostname.endsWith('.upwork.com')) return 'Upwork';
    if (hostname === 'kowork.kr' || hostname.endsWith('.kowork.kr')
      || hostname === 'kowork.co.kr' || hostname.endsWith('.kowork.co.kr')) return 'KOWORK';
    if (hostname === 'proz.com' || hostname.endsWith('.proz.com')) return 'ProZ';
    if (hostname === 'workana.com' || hostname.endsWith('.workana.com')) return 'Workana';
    return hostname.replace(/^www\./, '');
  } catch { /* URL is validated separately. */ }
  return 'Manual entry';
}

function isHidden(job) {
  return state.hidden.jobs.has(job.id)
    || (job.companyKnown && state.hidden.companies.has(canonical(job.company)))
    || state.hidden.sources.has(canonical(job.source));
}

async function hideItem(kind, value) {
  if (!await updateStored((draft) => { const ids = new Set(draft.hidden[kind]); ids.add(kind === 'jobs' ? value : canonical(value)); draft.hidden[kind] = [...ids]; })) return;
  $('hidden-manager').open = true;
}

async function restoreItem(kind, value) {
  await updateStored((draft) => { draft.hidden[kind] = draft.hidden[kind].filter((id) => id !== value); });
}

function clean(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function cleanList(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).join(' · ');
  return clean(value);
}

function englishStatus(value, fallback) {
  const text = clean(value);
  return /[가-힣]/.test(text) ? fallback : text || fallback;
}

function displayLanguages(value) {
  const labels = { '한국어': 'Korean', '영어': 'English', '스페인어': 'Spanish', '독일어': 'German',
    '일본어': 'Japanese', '중국어': 'Chinese', '프랑스어': 'French', '포르투갈어': 'Portuguese' };
  return clean(value).split(' · ').map((entry) => labels[entry.trim()] || englishStatus(entry, 'See original listing')).join(' · ');
}

function sourceDetail(value) {
  const message = clean(value);
  if (!/[가-힣]/.test(message)) return message;
  if (/WORK24_AUTH_KEY/.test(message) && /미설정/.test(message)) return 'WORK24_AUTH_KEY is not configured';
  if (/API|API_KEY|인증키|키 미설정/.test(message) && /미설정|누락|없음/.test(message)) return 'API credentials are not configured';
  return 'Check the original source for further collection details';
}

function safeUrl(raw) {
  const candidate = clean(raw);
  if (!candidate) return '';
  try {
    const url = new URL(candidate);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function dateValue(raw) {
  const value = clean(raw);
  const date = value.match(/^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/);
  if (!date) return '';
  const timestamp = Date.parse(`${date[1]}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date[1] ? date[1] : '';
}

function formatDate(raw, includeTime = false) {
  const value = clean(raw);
  const isoDay = dateValue(value);
  if (!isoDay) return 'Not listed';
  if (!includeTime || /^\d{4}-\d{2}-\d{2}$/.test(value)) return isoDay;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return isoDay;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function todayInKorea() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function daysSince(raw) {
  const day = dateValue(raw);
  if (!day) return null;
  const diff = (Date.parse(`${todayInKorea()}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000;
  return Number.isFinite(diff) ? Math.floor(diff) : null;
}

function detectLocation(location) {
  const name = clean(location);
  if (!name) return { province: 'unknown', region: 'unknown' };
  // 전국·복수 지역·근무지 협의는 출근 가능 지역을 단정할 수 없다.
  if (/전국|전지역|전 지 역|다수\s*지역|근무지\s*협의|지역\s*무관|nationwide|multiple\s*locations/i.test(name)) {
    return { province: 'unknown', region: 'unknown' };
  }
  const found = provincePatterns.filter(([, pattern]) => pattern.test(name)).map(([province]) => province);
  if (found.length !== 1) return { province: 'unknown', region: 'unknown' };
  const province = found[0];
  if (province !== '전북') return { province, region: 'relocation' };
  const near = nearbyPattern.test(name);
  const expanded = expandedPattern.test(name);
  if (near && !expanded) return { province, region: 'nearby' };
  if (expanded && !near) return { province, region: 'expanded' };
  // 전북 시·군 중 장거리 가능 지역은 통근 가능하다고 표시하지 않는다.
  if (/무주|장수|순창|부안|고창/.test(name)) return { province, region: 'relocation' };
  return { province, region: 'unknown' };
}

function resolveLocation(raw, location) {
  const inferred = detectLocation(location);
  const sourceProvince = clean(raw.province);
  const alias = {
    local: 'nearby', nearby: 'nearby', expanded: 'expanded', 'commutable-nearby': 'expanded',
    commutable_nearby: 'expanded', relocation: 'relocation', unknown: 'unknown',
  };
  const directClass = alias[clean(raw.commuteClass)] || '';
  // 수집기의 정규화 결과가 제공되면 사용하되, 근무지 자체가 비어 있는 경우에는 추정하지 않는다.
  if (directClass && clean(location)) {
    const canonicalProvince = provincePatterns.find(([name]) => sourceProvince === name || sourceProvince.startsWith(`${name}특별`) || sourceProvince.startsWith(`${name}도`));
    return { region: directClass, province: canonicalProvince?.[0] || inferred.province };
  }
  return inferred;
}

function eligibilityDisplay(value, explicitStatus, explicitDetail) {
  const object = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const status = clean(explicitStatus) || clean(object.status);
  const label = status === 'possible' ? 'Potentially eligible' : status === 'restricted' ? 'Restrictions noted' : 'Eligibility unverified';
  const detailObject = explicitDetail && typeof explicitDetail === 'object' && !Array.isArray(explicitDetail) ? explicitDetail : {};
  const detail = [
    clean(explicitDetail), clean(detailObject.reason), clean(detailObject.geoScope),
    clean(object.reason), clean(object.geoScope), typeof value === 'string' ? value.trim() : '',
  ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ');
  return { label, description: englishStatus(detail, 'Check residency, work authorization and other requirements in the original listing'),
    kind: status === 'possible' ? 'possible' : status === 'restricted' ? 'restricted' : 'unknown' };
}

function liveInterpreting(job) {
  if (job.category === 'interpreting') return true;
  const text = `${job.title} ${job.description}`;
  return /실시간\s*통역|동시\s*통역|순차\s*통역|전화\s*통역|화상\s*통역|현장\s*통역|통역사|live\s*interpret|simultaneous\s*interpret|consecutive\s*interpret|phone\s*interpret|video\s*interpret|remote\s*interpreter/i.test(text);
}

function normalizeJob(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const market = clean(raw.market);
  if (market !== 'online' && market !== 'offline') return null;
  const source = clean(raw.source);
  const url = safeUrl(raw.url);
  const title = clean(raw.title);
  const id = clean(raw.id) || `${source}:${url || `${title}:${index}`}`;
  const location = clean(raw.location);
  return {
    legacyIds: Array.isArray(raw.legacyIds) ? raw.legacyIds.filter((id) => typeof id === 'string') : [],
    id, market, title: title || 'Job title unknown', company: clean(raw.company) || 'Company not specified',
    companyKnown: !!clean(raw.company),
    source: id.startsWith('manual:') ? sourceForManualUrl(url) : source || 'Source unknown',
    sourceKind: clean(raw.sourceKind), url,
    description: clean(raw.description), location,
    workplaceMode: workplaceNames[clean(raw.workplaceMode)] ? clean(raw.workplaceMode) : 'unknown',
    category: categoryNames[clean(raw.category)] ? clean(raw.category) : 'other',
    postedAt: clean(raw.postedAt), deadline: clean(raw.deadline), pay: clean(raw.pay),
    language: displayLanguages(cleanList(raw.languageRequirements)), eligibility: eligibilityDisplay(raw.eligibility, raw.eligibilityStatus, raw.eligibilityDetail),
    languageFit: ['match', 'mismatch'].includes(clean(raw.languageFitStatus)) ? clean(raw.languageFitStatus) : 'unknown',
    languageFitReason: clean(raw.languageFitReason)
      ? englishStatus(raw.languageFitReason, 'Check required languages in the original listing') : '',
    verifiedAt: clean(raw.verifiedAt), firstSeenAt: clean(raw.firstSeenAt),
    lastSeenAt: clean(raw.lastSeenAt), researchReviewedAt: clean(raw.researchReviewedAt),
    listingStatus: ['listed', 'unconfirmed'].includes(clean(raw.listingStatus)) ? clean(raw.listingStatus) : '',
    researchPriority: ['high', 'normal', 'low'].includes(clean(raw.researchPriority)) ? clean(raw.researchPriority) : '',
    savedAt: clean(raw.savedAt),
    collectionState: clean(raw.collectionState) || 'unknown',
    archived: clean(raw.collectionState) === 'not_seen', manual: id.startsWith('manual:'),
    ...resolveLocation(raw, location),
  };
}

function rebuildJobs() {
  state.jobs = [...state.remoteJobs, ...state.manualJobs.map(normalizeJob).filter(Boolean)]
    .sort((a, b) => {
      // 사용자 직접 저장 공고는 게시일을 꾸미지 않고 목록 맨 위에 배치한다.
      if (a.manual !== b.manual) return a.manual ? -1 : 1;
      if (a.manual && b.manual) return b.savedAt.localeCompare(a.savedAt);
      return (dateValue(b.postedAt) || '').localeCompare(dateValue(a.postedAt) || '');
    });
}

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function svgIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#icon-${name}`); svg.append(use);
  return svg;
}

function infoRow(label, content, className = '') {
  const row = el('div', `detail-item ${className}`.trim());
  row.append(el('dt', '', label), el('dd', '', content));
  return row;
}

function createCard(job) {
  const card = el('article', 'job-card');
  card.dataset.jobId = job.id;
  const header = el('div', 'card-top');
  const chips = el('div', 'top-chips');
  chips.append(el('span', 'category-chip', categoryNames[job.category]));
  const age = daysSince(job.firstSeenAt);
  if (age !== null) {
    const label = age < 0 ? 'Future collection date' : age <= 3 ? 'Added recently' : age <= 7 ? 'Added within 7 days' : `Added ${age} days ago`;
    chips.append(el('span', `freshness-chip ${age > 7 ? 'is-old' : ''}`.trim(), label));
  } else if (!job.manual) {
    chips.append(el('span', 'freshness-chip is-old', 'First collection date unknown'));
  }
  if (job.archived) chips.append(el('span', 'history-chip', 'Not in latest collection · Historical'));
  else if (job.collectionState === 'unverified' && !job.manual) chips.append(el('span', 'history-chip is-unverified', 'Collection unverified'));
  if (job.manual) chips.append(el('span', 'history-chip is-manual', 'Added manually'));
  if (job.sourceKind === 'curated_research') chips.append(el('span', 'history-chip is-manual', 'Original page individually reviewed'));
  if (job.listingStatus === 'listed') chips.append(el('span', 'history-chip is-listed', 'Source lists as open · Confirm'));
  else if (job.listingStatus === 'unconfirmed') chips.append(el('span', 'history-chip is-unverified', 'Opening status unconfirmed'));
  if (job.researchPriority === 'low') chips.append(el('span', 'history-chip is-unverified', 'Stretch role · Extra requirements'));
  if (job.languageFit === 'mismatch') chips.append(el('span', 'language-fit-chip is-mismatch', 'Language mismatch · Check'));
  else if (job.languageFit === 'match') chips.append(el('span', 'language-fit-chip is-match', 'Possible language match'));
  const saved = state.saved.has(job.id);
  const bookmark = el('button', `bookmark-button ${saved ? 'is-saved' : ''}`.trim());
  bookmark.type = 'button'; bookmark.dataset.saveId = job.id;
  bookmark.setAttribute('aria-pressed', String(saved));
  bookmark.setAttribute('aria-label', `${saved ? 'Remove saved job' : 'Save job'}: ${job.title}`);
  bookmark.append(svgIcon('bookmark'), el('span', '', saved ? 'Saved' : 'Save'));
  bookmark.addEventListener('click', () => toggleSaved(job.id));
  const actions = el('div', 'card-actions');
  const hideMenu = el('details', 'hide-menu');
  const toggle = el('summary', 'hide-toggle', '×');
  toggle.setAttribute('aria-label', `Hide options for ${job.title}`);
  toggle.setAttribute('title', 'Hide options');
  const options = el('div', 'hide-options');
  const hideButton = (kind, value, label) => {
    const button = el('button', '', label);
    button.type = 'button';
    button.addEventListener('click', () => {
      hideMenu.open = false;
      hideItem(kind, value);
      document.querySelector('#hidden-manager > summary')?.focus({ preventScroll: true });
    });
    options.append(button);
  };
  hideButton('jobs', job.id, 'Hide this job');
  if (job.companyKnown) hideButton('companies', job.company, 'Hide this company');
  if (job.source !== 'Source unknown') hideButton('sources', job.source, 'Hide this source/platform');
  hideMenu.append(toggle, options);
  hideMenu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && hideMenu.open) {
      hideMenu.open = false; toggle.focus(); event.stopPropagation();
    }
  });
  actions.append(bookmark, hideMenu);
  header.append(chips, actions);

  const heading = el('h4', 'job-title', job.title);
  const company = el('p', 'job-company', job.company);
  const badges = el('div', 'job-badges');
  if (job.market === 'offline') {
    badges.append(el('span', `region-badge region-${job.region}`, regionNames[job.region]));
  }
  badges.append(el('span', 'workplace-badge', workplaceNames[job.workplaceMode]));

  const location = el('div', 'location-line');
  location.append(svgIcon('pin'), el('span', '', job.location || 'Location not listed'));

  const details = el('dl', 'job-details');
  details.append(
    infoRow('Source', job.source),
    infoRow('Pay / Compensation', job.pay || 'Not listed'),
    infoRow('Posted', formatDate(job.postedAt)),
    infoRow('Deadline', formatDate(job.deadline), dateValue(job.deadline) && dateValue(job.deadline) < todayInKorea() ? 'is-expired' : ''),
  );
  if (dateValue(job.deadline) && dateValue(job.deadline) < todayInKorea()) {
    details.lastElementChild.querySelector('dd')?.append(' (Expired)');
  }

  const criteria = el('div', 'criteria');
  const eligibility = el('div', `eligibility eligibility-${job.eligibility.kind}`);
  eligibility.append(el('strong', '', job.eligibility.label), el('span', '', job.eligibility.description));
  const language = el('div', 'language');
  language.append(el('strong', '', 'Language requirements'), el('span', '', [job.language || 'Unknown', job.languageFitReason].filter(Boolean).join(' · ')));
  criteria.append(eligibility, language);

  const description = el('div', 'description-block');
  if (job.description) {
    description.append(el('p', 'job-description', job.description));
    if (job.description.length > 200) {
      const expanded = el('details', 'description-more');
      expanded.append(el('summary', '', 'Read full description'), el('p', '', job.description));
      description.append(expanded);
    }
  } else {
    description.append(el('p', 'job-description is-empty', 'No description provided · Check the original listing.'));
  }

  const footer = el('div', 'card-footer');
  const source = el('span', 'source-kind', sourceKindNames[job.sourceKind] || job.sourceKind || 'Source type unknown');
  const lastCollected = formatDate(job.lastSeenAt || job.verifiedAt);
  const firstCollected = formatDate(job.firstSeenAt);
  const sourceReviewed = formatDate(job.researchReviewedAt || (job.sourceKind === 'curated_research' ? job.verifiedAt : ''));
  const stamp = el('span', 'verified-date', job.archived
    ? job.sourceKind === 'curated_research'
      ? `Source last reviewed ${sourceReviewed} · Added to Radar ${firstCollected} · Last included in feed ${lastCollected} · Source not rechecked`
      : `Last collected ${lastCollected} · Added to Radar ${firstCollected} · Not in latest collection; availability unverified`
    : job.manual ? `Saved manually ${formatDate(job.savedAt, true)} · Original unverified`
      : job.sourceKind === 'curated_research'
        ? `Source last reviewed ${sourceReviewed} · Added to Radar ${firstCollected} · Last included in feed ${lastCollected}`
        : `Last collected ${lastCollected} · Added to Radar ${firstCollected}`);
  const meta = el('div', 'source-meta'); meta.append(source, stamp);
  footer.append(meta);
  if (job.url) {
    const link = el('a', 'job-link', 'View original job');
    link.href = job.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `Open original listing in a new tab: ${job.title}`);
    link.append(svgIcon('arrow')); footer.append(link);
  } else {
    footer.append(el('span', 'job-link is-disabled', 'Original link unavailable'));
  }
  card.append(header, heading, company, badges, location, details, criteria, description, footer);
  return card;
}

async function toggleSaved(id) {
  const wanted = !state.saved.has(id);
  if (!await updateStored((draft) => { const ids = new Set(draft.saved); wanted ? ids.add(id) : ids.delete(id); draft.saved = [...ids]; })) return;
  const activeButton = [...document.querySelectorAll('.bookmark-button')].find((button) => button.dataset.saveId === id);
  const focusedId = activeButton?.dataset.saveId;
  renderJobs(state.activeTab);
  if (!state.filters[state.activeTab].savedOnly && focusedId) {
    [...document.querySelectorAll('.bookmark-button')].find((button) => button.dataset.saveId === focusedId)?.focus({ preventScroll: true });
  }
}

function visibleJobs(tab) {
  const filters = state.filters[tab];
  const query = filters.query.trim().toLocaleLowerCase('ko-KR');
  return state.jobs.filter((job) => {
    if (job.market !== tab || isHidden(job) || (tab === 'online' && liveInterpreting(job))) return false;
    if (filters.category !== 'all' && job.category !== filters.category) return false;
    if (filters.languageFit !== 'all' && job.languageFit !== filters.languageFit) return false;
    if (filters.archive === 'archived' && !job.archived) return false;
    if (filters.archive === 'current' && !((job.collectionState === 'seen') || job.manual)) return false;
    if (filters.archive === 'unverified' && job.collectionState !== 'unverified' && job.collectionState !== 'unknown') return false;
    if (filters.savedOnly && !state.saved.has(job.id)) return false;
    if (tab === 'offline') {
      if (filters.region !== 'all' && job.region !== filters.region) return false;
      if (filters.province !== 'all' && job.province !== filters.province) return false;
    }
    if (!query) return true;
    return [job.title, job.company, job.source, job.description, job.location, job.pay,
      job.language, job.eligibility.description, categoryNames[job.category]]
      .some((value) => value.toLocaleLowerCase('ko-KR').includes(query));
  });
}

function emptyState(tab, anyInTab) {
  const wrapper = el('div', 'empty-state');
  const icon = el('div', 'empty-symbol', anyInTab ? '⌕' : '—');
  const title = !state.loaded ? 'Could not load jobs' : anyInTab ? 'No jobs match your filters' : 'No jobs collected yet';
  const detail = !state.loaded ? 'Select Refresh to try again.' : anyInTab ? 'Adjust the search or filters, or restore any hidden items.' : 'Check source collection status or explore the platform links below.';
  wrapper.append(icon, el('h4', '', title), el('p', '', detail));
  if (anyInTab) {
    const reset = el('button', 'reset-button', 'Reset filters');
    reset.type = 'button'; reset.addEventListener('click', () => resetFilters(tab));
    wrapper.append(reset);
  }
  return wrapper;
}

function renderJobs(tab) {
  const list = $(`list-${tab}`);
  const filtered = visibleJobs(tab);
  const count = state.jobs.filter((job) => job.market === tab && !isHidden(job) && (tab !== 'online' || !liveInterpreting(job))).length;
  const limit = state.filters[tab].limit;
  const shown = filtered.slice(0, limit);
  const fragment = document.createDocumentFragment();
  if (!shown.length) fragment.append(emptyState(tab, count > 0));
  else shown.forEach((job) => fragment.append(createCard(job)));
  list.replaceChildren(fragment);
  $(`tab-count-${tab}`).textContent = numberFormatter.format(count);
  $(`count-${tab}`).textContent = state.loaded
    ? `${numberFormatter.format(filtered.length)} of ${numberFormatter.format(count)} jobs${filtered.length > limit ? ` · Showing ${numberFormatter.format(shown.length)}` : ''}`
    : 'Could not load jobs.';
  const more = $(`more-${tab}`);
  more.hidden = filtered.length <= limit;
  if (!more.hidden) more.textContent = `Show ${numberFormatter.format(Math.min(PAGE_SIZE, filtered.length - limit))} more jobs`;
}

function renderHidden() {
  const list = $('hidden-list');
  const fragment = document.createDocumentFragment();
  const kinds = [
    ['jobs', 'Job'], ['companies', 'Company'], ['sources', 'Source / Platform'],
  ];
  let count = 0;
  kinds.forEach(([kind, label]) => {
    [...state.hidden[kind]].sort((a, b) => a.localeCompare(b)).forEach((value) => {
      count += 1;
      const found = state.jobs.find((job) => kind === 'jobs' ? job.id === value
        : kind === 'companies' ? canonical(job.company) === value : canonical(job.source) === value);
      const display = kind === 'jobs' ? found?.title || value
        : kind === 'companies' ? found?.company || value : found?.source || value;
      const row = el('div', 'hidden-row');
      const summary = el('div', 'hidden-row-label');
      summary.append(el('small', '', label), el('strong', '', display));
      const restore = el('button', 'restore-button', 'Restore');
      restore.type = 'button';
      restore.setAttribute('aria-label', `Restore hidden ${label.toLowerCase()}: ${display}`);
      restore.addEventListener('click', () => {
        restoreItem(kind, value);
        document.querySelector('#hidden-manager > summary')?.focus({ preventScroll: true });
      });
      row.append(summary, restore); fragment.append(row);
    });
  });
  if (!count) fragment.append(el('p', 'hidden-empty', 'No hidden jobs, companies or sources.'));
  list.replaceChildren(fragment);
  $('hidden-count').textContent = `${numberFormatter.format(count)} hidden`;
  $('restore-all').hidden = count === 0;
}

function renderSources() {
  const list = $('source-list');
  const fragment = document.createDocumentFragment();
  const rows = state.sourceStatus;
  if (!rows.length) {
    fragment.append(el('li', 'source-empty', 'No source status information available.'));
  }
  rows.forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;
    const status = clean(raw.status);
    const item = el('li', 'source-row');
    const line = el('div', 'source-row-main');
    const name = el('strong', '', clean(raw.source) || 'Source unknown');
    const statusLabel = el('span', `source-state source-${sourceStatusNames[status] ? status : 'unknown'}`, sourceStatusNames[status] || 'Unknown');
    line.append(name, statusLabel);
    const info = el('p', 'source-row-sub', [
      Number.isSafeInteger(raw.count) && raw.count >= 0 ? `${numberFormatter.format(raw.count)} jobs` : '',
      `Checked ${formatDate(raw.checkedAt, true)}`,
      sourceDetail(raw.message || raw.detail),
    ].filter(Boolean).join(' · '));
    item.append(line, info);
    const url = safeUrl(raw.url);
    if (url) {
      const link = el('a', 'source-url', 'Open source website ↗');
      link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      item.append(link);
    }
    fragment.append(item);
  });
  list.replaceChildren(fragment);
  const normal = rows.filter((r) => r?.status === 'ok').length;
  const other = rows.length - normal;
  $('source-summary').textContent = rows.length ? `Collected ${normal} · Other ${other}` : 'No status data';
}

function renderManualJobs() {
  const list = $('manual-saved-list');
  const fragment = document.createDocumentFragment();
  $('manual-count').textContent = `${numberFormatter.format(state.manualJobs.length)} saved`;
  if (!state.manualJobs.length) {
    fragment.append(el('p', 'manual-empty', 'No manually added jobs yet.'));
  }
  state.manualJobs.forEach((job) => {
    const row = el('div', 'manual-saved-row');
    const info = el('div', 'manual-saved-info');
    const a = el('a', '', clean(job.title));
    a.href = safeUrl(job.url); a.target = '_blank'; a.rel = 'noopener noreferrer';
    info.append(a, el('small', '', `${job.market === 'online' ? 'Online' : 'In-person'} · ${clean(job.company) || 'Company not specified'}${isHidden(normalizeJob(job)) ? ' · Hidden from results' : ''}`));
    const remove = el('button', 'manual-remove', 'Delete');
    remove.type = 'button'; remove.setAttribute('aria-label', `Delete manually added job: ${clean(job.title)}`);
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Delete "${clean(job.title)}" from your manually added jobs?`)) return;
      if (!await updateStored((draft) => { draft.manual = draft.manual.filter((record) => record.id !== job.id); draft.saved = draft.saved.filter((id) => id !== job.id); })) return;
      $('manual-feedback').textContent = 'Manual job deleted.';
    });
    row.append(info, remove); fragment.append(row);
  });
  list.replaceChildren(fragment);
}

let manualSaving = false;
async function addManualJob(event) {
  event.preventDefault();
  if (manualSaving) return;
  const feedback = $('manual-feedback');
  feedback.classList.remove('is-error'); feedback.textContent = '';
  const title = $('manual-title').value.trim();
  const url = safeUrl($('manual-url').value);
  const company = $('manual-company').value.trim();
  const market = $('manual-market').value;
  const category = $('manual-category').value;
  const location = $('manual-location').value.trim();
  const description = $('manual-description').value.trim();
  const reject = (message) => { feedback.classList.add('is-error'); feedback.textContent = message; };
  if (!title || !url) { reject('Enter a job title and a valid http(s) URL.'); return; }
  if (market === 'online' && liveInterpreting({ category, title, description })) {
    reject('Live interpreting jobs are excluded from online listings. Check the job category.'); return;
  }
  if (state.manualJobs.length >= 250) { reject('You can save up to 250 manual jobs.'); return; }
  if (state.manualJobs.some((job) => safeUrl(job.url) === url)) {
    reject('This job URL is already saved manually.'); return;
  }
  const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const record = {
    id: `manual:${unique}`, title, url, company, market, category, location, description,
    source: sourceForManualUrl(url), sourceKind: 'manual', workplaceMode: 'unknown',
    postedAt: '', deadline: '', verifiedAt: '', pay: '', languageRequirements: [],
    eligibilityStatus: 'unknown', eligibilityDetail: 'Manually added: check eligibility on the original listing.',
    collectionState: 'seen', savedAt: new Date().toISOString(),
  };
  manualSaving = true;
  const formControls = [...$('manual-form').elements];
  formControls.forEach((control) => { control.disabled = true; });
  const stored = await updateStored((draft) => {
    if (draft.manual.length >= 250 || draft.manual.some((job) => safeUrl(job.url) === url)) throw Error('Manual job limit reached or URL already saved');
    draft.manual.unshift(record); draft.saved = [...new Set([...draft.saved, record.id])];
  });
  manualSaving = false;
  formControls.forEach((control) => { control.disabled = !storage.writable; });
  if (!stored) return;
  $('manual-form').reset();
  feedback.textContent = stored
    ? `Job saved to your ${market === 'online' ? 'Online' : 'In-person'} list. Open that tab to view it.`
    : 'Job added for this session, but browser storage is unavailable.';
}

function showMessage(text, kind = 'info') {
  const message = $('feed-message');
  message.textContent = text; message.dataset.kind = kind; message.hidden = !text;
}

function render() {
  // A commit from another tab must not interrupt an open menu or keyboard action.
  const focusable = 'button,summary,a,input,select,textarea';
  const active = document.activeElement;
  const activeCard = active?.closest('.job-card');
  const focus = activeCard ? { id: activeCard.dataset.jobId, index: [...activeCard.querySelectorAll(focusable)].indexOf(active) } : null;
  const openDetails = new Map([...document.querySelectorAll('.job-card')].map((card) => [card.dataset.jobId,
    [...card.querySelectorAll('details')].flatMap((detail, index) => detail.open ? [index] : [])]));
  $('feed-date').textContent = state.loaded ? `Feed updated ${formatDate(state.updatedAt, true)}` : 'Feed status unknown';
  renderJobs('online'); renderJobs('offline'); renderSources();
  renderManualJobs(); renderHidden();
  for (const card of document.querySelectorAll('.job-card')) {
    const details = card.querySelectorAll('details');
    for (const index of openDetails.get(card.dataset.jobId) || []) if (details[index]) details[index].open = true;
    if (focus?.id === card.dataset.jobId && focus.index >= 0) card.querySelectorAll(focusable)[focus.index]?.focus({ preventScroll: true });
  }
  if (!storage.writable) {
    document.querySelectorAll('.bookmark-button,.hide-menu button,.manual-remove,#manual-form button[type=submit],#restore-all,#hidden-list button').forEach((button) => { button.disabled = true; });
    showMessage(`Personal state is read-only: ${storage.error?.message || 'storage unavailable'}. Reload to retry.`, 'warning');
  }
}

async function loadFeed() {
  if (state.loading) return;
  state.loading = true; $('refresh-button').disabled = true;
  if (!state.loaded) showMessage('Loading job listings…', 'info');
  try {
    const response = await fetch(FEED_URL, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const feed = await response.json();
    if (!feed || !Array.isArray(feed.jobs) || !Array.isArray(feed.sourceStatus)) throw new Error('Invalid feed format.');
    state.remoteJobs = feed.jobs.map(normalizeJob).filter(Boolean);
    await migrateJobAliases();
    rebuildJobs();
    state.updatedAt = clean(feed.updatedAt);
    state.sourceStatus = feed.sourceStatus;
    state.loaded = true; state.loadError = '';
    const problems = state.sourceStatus.filter((row) => ['error', 'unavailable', 'partial', 'not_configured'].includes(row?.status));
    if (!feedHealth(state.updatedAt).ok) showMessage(feedHealth(state.updatedAt).message, 'warning');
    else if (problems.length) showMessage(`Collection is incomplete or unavailable for ${problems.length} source(s). See source status below.`, 'warning');
    else if (!state.updatedAt) showMessage('Feed update time is unknown. Check original listings for current availability.', 'warning');
    else showMessage('', 'info');
  } catch (error) {
    state.loadError = error instanceof Error ? error.message : 'Unknown error';
    showMessage(state.loaded
      ? `Could not refresh jobs. Showing previously loaded data. (${state.loadError})`
      : `Could not load job listings. Check whether jobs.json is deployed on the server. (${state.loadError})`, 'error');
  } finally {
    state.loading = false; $('refresh-button').disabled = false; render();
  }
}

function switchTab(tab, moveFocus = false) {
  state.activeTab = tab;
  for (const current of ['online', 'offline']) {
    const active = current === tab;
    const button = $(`tab-${current}`);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    $(`panel-${current}`).hidden = !active;
  }
  if (moveFocus) $(`tab-${tab}`).focus();
}

function resetFilters(tab) {
  const defaultFilters = tab === 'online'
    ? { query: '', category: 'all', archive: 'all', languageFit: 'all', savedOnly: false, limit: PAGE_SIZE }
    : { query: '', category: 'all', province: 'all', region: 'all', archive: 'all', languageFit: 'all', savedOnly: false, limit: PAGE_SIZE };
  state.filters[tab] = defaultFilters;
  $(`search-${tab}`).value = '';
  $(`category-${tab}`).value = 'all';
  $(`archive-${tab}`).value = 'all';
  $(`language-fit-${tab}`).value = 'all';
  $(`saved-${tab}`).checked = false;
  if (tab === 'offline') {
    $('province-offline').value = 'all';
    document.querySelectorAll('[data-region]').forEach((button) => {
      const active = button.dataset.region === 'all';
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  renderJobs(tab);
}

function setupListeners() {
  const tabs = [...document.querySelectorAll('[role="tab"][data-tab]')];
  tabs.forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
    button.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const target = event.key === 'Home' ? 'online' : event.key === 'End' ? 'offline'
          : state.activeTab === 'online' ? 'offline' : 'online';
        switchTab(target, true);
      }
    });
  });
  for (const tab of ['online', 'offline']) {
    const filters = state.filters[tab];
    $(`search-${tab}`).addEventListener('input', (event) => {
      filters.query = event.target.value; filters.limit = PAGE_SIZE; renderJobs(tab);
    });
    $(`category-${tab}`).addEventListener('change', (event) => {
      filters.category = event.target.value; filters.limit = PAGE_SIZE; renderJobs(tab);
    });
    $(`archive-${tab}`).addEventListener('change', (event) => {
      filters.archive = event.target.value; filters.limit = PAGE_SIZE; renderJobs(tab);
    });
    $(`language-fit-${tab}`).addEventListener('change', (event) => {
      filters.languageFit = event.target.value; filters.limit = PAGE_SIZE; renderJobs(tab);
    });
    $(`saved-${tab}`).addEventListener('change', (event) => {
      filters.savedOnly = event.target.checked; filters.limit = PAGE_SIZE; renderJobs(tab);
    });
    $(`more-${tab}`).addEventListener('click', () => {
      filters.limit += PAGE_SIZE; renderJobs(tab);
    });
  }
  $('province-offline').addEventListener('change', (event) => {
    state.filters.offline.province = event.target.value;
    state.filters.offline.limit = PAGE_SIZE; renderJobs('offline');
  });
  document.querySelectorAll('[data-region]').forEach((button) => {
    button.addEventListener('click', () => {
      state.filters.offline.region = button.dataset.region;
      state.filters.offline.limit = PAGE_SIZE;
      document.querySelectorAll('[data-region]').forEach((other) => {
        const active = other === button;
        other.setAttribute('aria-pressed', String(active));
        other.classList.toggle('is-selected', active);
      });
      renderJobs('offline');
    });
  });
  $('refresh-button').addEventListener('click', loadFeed);
  $('manual-form').addEventListener('submit', addManualJob);
  $('restore-all').addEventListener('click', async () => {
    if (!await updateStored((draft) => { draft.hidden = { jobs: [], companies: [], sources: [] }; })) return;
    document.querySelector('#hidden-manager > summary')?.focus({ preventScroll: true });
  });
  document.addEventListener('click', (event) => {
    document.querySelectorAll('.hide-menu[open]').forEach((menu) => {
      if (!menu.contains(event.target)) menu.open = false;
    });
  });
}

storage.subscribe(applyStored);
setupListeners();
rebuildJobs();
render();
loadFeed();
