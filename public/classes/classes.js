const $ = (id) => document.getElementById(id);
const MODE_LABELS = { online: '온라인', offline: '오프라인', hybrid: '온·오프라인' };
const COST_LABELS = { free: '무료', low: '저가', paid: '유료', varies: '가격 변동' };
let courses = [];
let language = 'ko';
const DATA_URLS = { ko: './data/classes.json', es: './data/spanish-classes.json' };

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
  if (cost === 'low') return course.costType === 'free' || course.costType === 'varies';
  return course.costType === cost;
}

function render() {
  const query = normalize($('query').value);
  const mode = $('mode').value;
  const cost = $('cost').value;
  const level = $('level').value;
  const filtered = courses.filter((course) => {
    if (mode && course.mode !== mode && !(mode === 'online' && course.mode === 'hybrid') && !(mode === 'offline' && course.mode === 'hybrid')) return false;
    if (!costMatches(course, cost)) return false;
    if (!levelMatches(course, level)) return false;
    if (!query) return true;
    return normalize([course.title, course.provider, course.level, course.audience, course.location, course.summary, course.schedule].join(' ')).includes(query);
  });
  $('resultCount').textContent = `${filtered.length}개 강의`;
  $('empty').hidden = filtered.length > 0;
  const container = $('courses');
  container.replaceChildren();
  const template = $('courseTemplate');
  for (const course of filtered) {
    const node = template.content.cloneNode(true);
    const card = node.querySelector('.class-card');
    card.dataset.courseId = course.id;
    const chips = node.querySelector('.class-chips');
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
    node.querySelector('.verify-note').textContent = `공식 원문 확인일 ${course.verifiedAt}`;
    const official = node.querySelector('.official');
    official.href = course.url;
    const apply = node.querySelector('.apply');
    if (course.applyUrl && course.applyUrl !== course.url) {
      apply.href = course.applyUrl;
    } else {
      apply.hidden = true;
    }
    container.append(node);
  }
}

function renderStats() {
  $('totalCount').textContent = String(courses.length);
  $('onlineCount').textContent = String(courses.filter((course) => ['online', 'hybrid'].includes(course.mode)).length);
  $('offlineCount').textContent = String(courses.filter((course) => ['offline', 'hybrid'].includes(course.mode)).length);
  $('freeCount').textContent = String(courses.filter((course) => course.costType === 'free').length);
}

async function loadLanguage(nextLanguage) {
  language = nextLanguage;
  for (const button of document.querySelectorAll('[data-language]')) {
    const active = button.dataset.language === language;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  }
  for (const id of ['query', 'mode', 'cost', 'level']) $(id).value = '';
  try {
    const response = await fetch(DATA_URLS[language], { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    courses = Array.isArray(data.courses) ? data.courses : [];
    $('sourceDate').textContent = data.researchedAt || '확인일 미상';
    renderStats();
    render();
  } catch (error) {
    courses = [];
    renderStats();
    $('resultCount').textContent = '강의 목록을 불러오지 못했습니다';
    $('empty').hidden = false;
    $('empty').querySelector('p').textContent = `공식 자료를 불러오지 못했습니다. (${error.message})`;
  }
}

for (const id of ['query', 'mode', 'cost', 'level']) $(id).addEventListener('input', render);
for (const id of ['mode', 'cost', 'level']) $(id).addEventListener('change', render);
for (const button of document.querySelectorAll('[data-language]')) {
  button.addEventListener('click', () => loadLanguage(button.dataset.language));
}
$('reset').addEventListener('click', () => {
  $('query').value = '';
  $('mode').value = '';
  $('cost').value = '';
  $('level').value = '';
  render();
});
loadLanguage('ko');
