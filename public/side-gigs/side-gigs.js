const $ = (id) => document.getElementById(id);

const CATEGORY_LABELS = {
  'ai-data': 'AI 데이터',
  survey: '설문·리서치',
  testing: '사용성 테스트',
  microtask: '마이크로태스크',
  content: '콘텐츠·체험단',
  freelance: '긱 마켓'
};
const PAYOUT_LABELS = { cash: '현금', points: '포인트', gift: '상품권', product: '현물', mixed: '현금+현물' };
const ACCESS_LABELS = { yes: '가능', check: '확인 필요', no: '불가' };
const RISK_LABELS = { safe: '일반', check: '조건 확인' };
const PAY_STATUS_LABELS = { official: '보수 공식 확인', check: '보수 확인 필요' };
const LANGUAGE_LABELS = { ko: '한국어', en: '영어', es: '스페인어' };

const state = { items: [], updatedAt: '', filters: { query: '', category: '', language: '', payout: '', risk: '', sort: 'official' } };

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
};

function matches(item) {
  const f = state.filters;
  if (f.category && item.category !== f.category) return false;
  if (f.language && !(item.languages || []).includes(f.language)) return false;
  if (f.payout && item.payoutType !== f.payout) return false;
  if (f.risk && item.risk !== f.risk) return false;
  const query = f.query.trim().toLowerCase();
  if (!query) return true;
  return [item.platform, item.title, ...(item.taskTypes || []), item.notes, item.siteLanguage, item.taskLanguage]
    .join(' ').toLowerCase().includes(query);
}

function sorted(items) {
  return [...items].sort((a, b) => {
    if (state.filters.sort === 'name') return a.platform.localeCompare(b.platform, 'ko');
    const aOfficial = a.payStatus === 'official' ? 0 : 1;
    const bOfficial = b.payStatus === 'official' ? 0 : 1;
    return aOfficial - bOfficial || a.platform.localeCompare(b.platform, 'ko');
  });
}

function renderCard(item) {
  const card = el('article', 'gig-card');
  const badges = el('div', 'gig-badges');
  badges.append(
    el('span', 'gig-badge category', CATEGORY_LABELS[item.category] || item.category),
    el('span', `gig-badge ${item.payStatus === 'official' ? 'official' : 'check'}`, PAY_STATUS_LABELS[item.payStatus] || '보수 확인 필요'),
    el('span', `gig-badge ${item.risk === 'safe' ? 'safe' : 'risk-check'}`, RISK_LABELS[item.risk] || '조건 확인')
  );
  card.append(badges);

  const title = el('h3', 'gig-title');
  const link = el('a', '', item.title);
  link.href = item.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  title.append(link);
  card.append(title, el('p', 'gig-platform', item.platform));

  if (item.taskTypes?.length) card.append(el('p', 'gig-tasks', item.taskTypes.join(' · ')));

  const pay = el('div', 'gig-pay');
  pay.append(
    el('span', '', '보수'),
    el('strong', '', item.payDisplay),
    el('small', '', item.payStatus === 'official' ? '공식 페이지 기준' : '금액·단가 재확인 필요')
  );
  if (item.payStatus === 'official') {
    const paySource = el('a', 'gig-pay-source', '보수 근거 ↗');
    paySource.href = item.paySourceUrl || item.url;
    paySource.target = '_blank';
    paySource.rel = 'noopener noreferrer';
    pay.append(paySource);
  }
  card.append(pay);

  const facts = el('dl', 'gig-facts');
  const fact = (term, value) => {
    const row = el('div');
    row.append(el('dt', '', term), el('dd', '', value));
    facts.append(row);
  };
  fact('지급', `${PAYOUT_LABELS[item.payoutType] || item.payoutType} · ${item.payoutDetail}`);
  fact('한국 수령', `${ACCESS_LABELS[item.koreaPayout] || '확인 필요'} · 지급 수단·수수료 별도 확인`);
  fact('한국 이용', `${ACCESS_LABELS[item.platformKoreaAccess] || '확인 필요'}${item.platformKoreaNote ? ` · ${item.platformKoreaNote}` : ''}`);
  fact('F-6', item.f6Work === 'allowed' ? '취업 제한 없음 (세금·신고는 확인 필요)' : '확인 필요');
  fact('언어', `사이트 ${item.siteLanguage} · 작업 ${item.taskLanguage}`);
  card.append(facts);

  const risk = el('p', `gig-risk ${item.risk === 'safe' ? 'safe' : ''}`, item.riskNote);
  card.append(risk);
  if (item.notes) card.append(el('p', 'gig-notes', item.notes));

  const actions = el('div', 'gig-actions');
  const apply = el('a', 'button secondary compact', '공식 페이지 ↗');
  apply.href = item.url;
  apply.target = '_blank';
  apply.rel = 'noopener noreferrer';
  actions.append(apply, el('span', 'gig-checked', `확인 ${item.checkedAt}`));
  card.append(actions);
  return card;
}

function render() {
  const items = sorted(state.items.filter(matches));
  $('gigCount').textContent = `${items.length}개`;
  $('gigs').replaceChildren(...items.map(renderCard));
  $('gigsEmpty').hidden = items.length > 0;
  if (!items.length) $('gigsEmptyMessage').textContent = state.items.length ? '조건에 맞는 사이드 기그가 없습니다. 필터를 넓혀 보세요.' : '목록을 불러오지 못했습니다.';
}

function renderMetrics() {
  const items = state.items;
  $('totalCount').textContent = String(items.length);
  $('officialCount').textContent = String(items.filter((item) => item.payStatus === 'official').length);
  $('checkCount').textContent = String(items.filter((item) => item.payStatus !== 'official').length);
  $('cashCount').textContent = String(items.filter((item) => ['cash', 'mixed'].includes(item.payoutType)).length);
}

async function load() {
  try {
    const response = await fetch('./data.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.items)) throw new Error('목록 형식이 올바르지 않습니다.');
    state.items = data.items;
    state.updatedAt = data.updatedAt || '';
    $('gigUpdatedAt').textContent = state.updatedAt || '-';
    $('gigUpdatedAtInline').textContent = state.updatedAt ? `업데이트 ${state.updatedAt}` : '';
    if (data.disclaimer) $('gigDisclaimer').textContent = data.disclaimer;
    renderMetrics();
    render();
  } catch (error) {
    state.items = [];
    $('gigUpdatedAt').textContent = '-';
    $('gigCount').textContent = '0개';
    $('gigsEmptyMessage').textContent = `목록을 불러오지 못했습니다: ${error.message}`;
    $('gigsEmpty').hidden = false;
    renderMetrics();
  }
}

const bind = (id, key, event = 'change') => $(id).addEventListener(event, () => {
  state.filters[key] = $(id).value;
  render();
});
bind('gigCategory', 'category');
bind('gigLanguage', 'language');
bind('gigPayout', 'payout');
bind('gigRisk', 'risk');
bind('gigSort', 'sort');
let timer = null;
$('gigQuery').addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => { state.filters.query = $('gigQuery').value; render(); }, 150);
});
$('gigReset').addEventListener('click', () => {
  Object.assign(state.filters, { query: '', category: '', language: '', payout: '', risk: '', sort: 'official' });
  for (const id of ['gigQuery', 'gigCategory', 'gigLanguage', 'gigPayout', 'gigRisk']) $(id).value = '';
  $('gigSort').value = 'official';
  render();
});

load();
