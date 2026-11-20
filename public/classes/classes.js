import { formatDate } from '../shared/date-format.js';

const $ = (id) => document.getElementById(id);
const MODE_LABELS = { online: '온라인', offline: '오프라인', hybrid: '온·오프라인' };
const COST_LABELS = { free: '무료', low: '저가', paid: '유료', varies: '가격 변동' };
const ENROLLMENT_LABELS = { open: '접수 중', upcoming: '접수 예정', closed: '모집 마감', past: '지난 과정' };
let courses = [];
let selfStudy = [];
let language = 'ko';
const DATA_URLS = { ko: './data/classes.json', es: './data/spanish-classes.json' };
const SEEN_KEY = 'classSeenIds';
const HIDDEN_KEY = 'classHiddenIds';
let seenIds = new Set();
let hiddenIds = new Set();
try {
  const stored = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
  if (Array.isArray(stored)) seenIds = new Set(stored);
} catch { /* Start with an empty seen set when storage is unavailable. */ }
try {
  const stored = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
  if (Array.isArray(stored)) hiddenIds = new Set(stored);
} catch { /* Start with an empty hidden set when storage is unavailable. */ }
const displayedSeenIds = new Set(seenIds);

function toggleHidden(course) {
  hiddenIds.has(course.id) ? hiddenIds.delete(course.id) : hiddenIds.add(course.id);
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hiddenIds])); } catch { /* Keep the in-memory state. */ }
  render();
  $('visibility').focus({ preventScroll: true });
}

function markSeen(course, card, badge) {
  if (seenIds.has(course.id)) return;
  seenIds.add(course.id);
  card.classList.remove('is-unreviewed');
  card.classList.add('is-seen');
  if (badge) badge.hidden = false;
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seenIds])); } catch { /* Keep the in-memory state. */ }
}

function attachSeenTracking(card, course, badge) {
  let dwellTimer = null;
  const armSeen = () => {
    if (seenIds.has(course.id)) return;
    clearTimeout(dwellTimer);
    dwellTimer = setTimeout(() => markSeen(course, card, badge), 450);
  };
  const disarmSeen = () => { clearTimeout(dwellTimer); dwellTimer = null; };
  card.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'touch') armSeen();
  });
  card.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'touch' && !dwellTimer) armSeen();
  }, { passive: true });
  card.addEventListener('pointerleave', disarmSeen);
  card.addEventListener('focusin', armSeen);
  card.addEventListener('focusout', disarmSeen);
}

const normalize = (value) => String(value || '').normalize('NFKC').toLowerCase();

function levelMatches(course, level) {
  if (!level) return true;
  const value = String(course.level || '');
  if (level === '교원') return /교원/.test(value);
  if (level === '입문') return /입문|1~6급|1~5급|0~5단계/.test(value);
  if (level === '초급') return /입문|초급|1~6급|1~5급|0~5단계/.test(value);
  if (level === '중급') return /중급|1~6급|1~5급|0~5단계/.test(value);
  if (level === '고급') return /고급|1~6급/.test(value);
  return value.includes(level);
}

function costMatches(course, cost) {
  if (!cost) return true;
  return course.costType === cost;
}

function render() {
  const query = normalize($('query').value);
  const mode = $('mode').value;
  const cost = $('cost').value;
  const level = $('level').value;
  const visibility = $('visibility').value;
  const filtered = courses.filter((course) => {
    if (visibility === 'hidden') return hiddenIds.has(course.id);
    if (hiddenIds.has(course.id)) return false;
    if (mode && course.mode !== mode && !(mode === 'online' && course.mode === 'hybrid') && !(mode === 'offline' && course.mode === 'hybrid')) return false;
    if (!costMatches(course, cost)) return false;
    if (!levelMatches(course, level)) return false;
    if (!query) return true;
    return normalize([course.title, course.provider, course.level, course.audience, course.location, course.summary, course.schedule].join(' ')).includes(query);
  }).sort((a, b) => Number(displayedSeenIds.has(a.id)) - Number(displayedSeenIds.has(b.id)));
  $('resultCount').textContent = `${filtered.length}개 강의`;
  $('empty').hidden = filtered.length > 0;
  const container = $('courses');
  container.replaceChildren();
  const template = $('courseTemplate');
  for (const course of filtered) {
    const node = template.content.cloneNode(true);
    const card = node.querySelector('.class-card');
    card.dataset.courseId = course.id;
    const seen = seenIds.has(course.id);
    const seenStatus = node.querySelector('.seen-status');
    if (seenStatus) seenStatus.hidden = !seen;
    card.classList.toggle('is-unreviewed', !seen);
    attachSeenTracking(card, course, seenStatus);
    const chips = node.querySelector('.class-chips');
    const enrollmentChip = document.createElement('span');
    enrollmentChip.className = `chip enrollment ${course.enrollment || ''}`;
    enrollmentChip.textContent = ENROLLMENT_LABELS[course.enrollment] || '';
    enrollmentChip.hidden = !course.enrollment;
    chips.prepend(enrollmentChip);
    if (course.enrollment === 'closed' || course.enrollment === 'past') card.classList.add('is-muted');
    const modeChip = chips.querySelector('.mode');
    modeChip.textContent = MODE_LABELS[course.mode] || course.mode;
    const costChip = chips.querySelector('.cost');
    costChip.textContent = course.costLabel || COST_LABELS[course.costType] || course.costType;
    costChip.classList.add(course.costType);
    chips.querySelector('.level').textContent = course.level;
    node.querySelector('.class-title').textContent = course.title;
    node.querySelector('.class-provider').textContent = course.provider;
    node.querySelector('.class-summary').textContent = course.summary || '';
    node.querySelector('.schedule').textContent = course.schedule || '공식 공지 확인';
    node.querySelector('.location').textContent = course.location || '온라인';
    node.querySelector('.audience').textContent = course.audience || '공식 안내 확인';
    node.querySelector('.source-note').textContent = course.sourceNote || '';
    node.querySelector('.verify-note').textContent = `공식 원문 확인일 ${formatDate(course.verifiedAt)}`;
    const official = node.querySelector('.official');
    official.href = course.url;
    const apply = node.querySelector('.apply');
    if (course.applyUrl && course.applyUrl !== course.url) {
      apply.href = course.applyUrl;
      apply.textContent = course.applyLabel || '신청·조회 페이지 ↗';
    } else {
      apply.hidden = true;
    }
    official.addEventListener('click', () => markSeen(course, card, seenStatus));
    apply.addEventListener('click', () => markSeen(course, card, seenStatus));
    const hidden = hiddenIds.has(course.id);
    const hide = document.createElement('button');
    hide.type = 'button';
    hide.className = 'card-hide';
    hide.textContent = hidden ? '↶' : '×';
    hide.title = hidden ? '숨김 해제' : '숨기기';
    hide.setAttribute('aria-label', `${course.title} ${hidden ? '숨김 해제' : '숨기기'}`);
    hide.addEventListener('click', () => toggleHidden(course));
    card.append(hide);
    container.append(node);
  }
}

function renderStats() {
  $('totalCount').textContent = String(courses.length);
  $('onlineCount').textContent = String(courses.filter((course) => ['online', 'hybrid'].includes(course.mode)).length);
  $('offlineCount').textContent = String(courses.filter((course) => ['offline', 'hybrid'].includes(course.mode)).length);
  $('freeCount').textContent = String(courses.filter((course) => course.costType === 'free').length);
}

function selfStudySection() {
  let section = $('selfStudy');
  if (section) return section;
  section = document.createElement('section');
  section.id = 'selfStudy';
  section.className = 'panel self-study';
  section.innerHTML = '<div class="section-head"><div><p class="kicker">SELF-STUDY</p>'
    + '<h2>상시 자습 자료</h2>'
    + '<p>모집 기간 없이 언제든 이용하는 자습용 사이트입니다. 정규 강좌와 분리해 표시합니다.</p>'
    + '</div></div><ul class="self-study-list"></ul>';
  document.querySelector('main').append(section);
  return section;
}

function renderSelfStudy() {
  const list = selfStudySection().querySelector('.self-study-list');
  list.replaceChildren();
  for (const item of selfStudy) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.applyUrl || item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = item.title;
    const meta = document.createElement('span');
    meta.textContent = [item.provider, item.costLabel || COST_LABELS[item.costType], item.level].filter(Boolean).join(' · ');
    li.append(link, meta);
    list.append(li);
  }
  selfStudySection().hidden = selfStudy.length === 0;
}

async function loadLanguage(nextLanguage) {
  language = nextLanguage;
  for (const button of document.querySelectorAll('[data-language]')) {
    const active = button.dataset.language === language;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  }
  for (const id of ['query', 'mode', 'cost', 'level']) $(id).value = '';
  $('visibility').value = 'active';
  try {
    const response = await fetch(DATA_URLS[language], { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    courses = Array.isArray(data.courses) ? data.courses : [];
    selfStudy = Array.isArray(data.selfStudy) ? data.selfStudy : [];
    $('sourceDate').textContent = formatDate(data.researchedAt) || '확인일 미상';
    renderStats();
    render();
    renderSelfStudy();
  } catch (error) {
    courses = [];
    selfStudy = [];
    renderStats();
    renderSelfStudy();
    $('resultCount').textContent = '강의 목록을 불러오지 못했습니다';
    $('empty').hidden = false;
    $('empty').querySelector('p').textContent = `공식 자료를 불러오지 못했습니다. (${error.message})`;
  }
}

for (const id of ['query', 'mode', 'cost', 'level']) $(id).addEventListener('input', render);
for (const id of ['mode', 'cost', 'level', 'visibility']) $(id).addEventListener('change', render);
for (const button of document.querySelectorAll('[data-language]')) {
  button.addEventListener('click', () => loadLanguage(button.dataset.language));
}
$('reset').addEventListener('click', () => {
  $('query').value = '';
  $('mode').value = '';
  $('cost').value = '';
  $('level').value = '';
  $('visibility').value = 'active';
  render();
});
loadLanguage('ko');
