const REGION_ORDER = ['전주', '완주', '군산', '익산', '정읍', '남원', '김제', '진안', '무주', '장수', '임실', '순창', '고창', '부안'];

const todayIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
};

const formatDay = (value) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${year}.${month}.${day}`;
};

const statusOf = (item, today = todayIso()) => {
  if (item.startDate && item.startDate > today) return { key: 'upcoming', label: '예정' };
  if (!item.endDate) return { key: 'always', label: item.startDate ? '진행 중' : '상시·문의' };
  if (item.endDate < today) return { key: 'ended', label: '종료' };
  return { key: 'open', label: '진행 중' };
};

const canAdultsJoin = (audience = '') => {
  const text = String(audience);
  if (/어린이\s*동반/.test(text)) return false;
  if (/^(?:어린이|유아|청소년|기관)/.test(text)) return false;
  if (/(청소년|학생)/.test(text) && !/(성인|누구나|이상)/.test(text)) return false;
  if (/(초등|어린이|유아)/.test(text) && !/(이상|성인|누구나|가족)/.test(text)) return false;
  return true;
};

const periodText = (item) => {
  if (!item.startDate && !item.endDate) return item.schedule || '상시 · 원문 확인';
  const range = item.endDate
    ? `${formatDay(item.startDate)} ~ ${formatDay(item.endDate)}`
    : `${formatDay(item.startDate)} ~`;
  return item.schedule ? `${range} · ${item.schedule}` : range;
};

export function createToursView({ $ }) {
  const state = { feed: null, loading: false, error: null, filters: { query: '', category: '', region: '전주·완주', audience: 'adults', period: 'current', sort: 'soon' } };

  const query = $('tourQuery');
  const category = $('tourCategory');
  const region = $('tourRegion');
  const audience = $('tourAudience');
  const period = $('tourPeriod');
  const sort = $('tourSort');
  const list = $('toursList');
  const empty = $('toursEmpty');
  const emptyMessage = $('toursEmptyMessage');
  const count = $('tourCount');
  const updatedAt = $('tourUpdatedAt');
  const sourceStatus = $('tourSourceStatus');
  const refreshButton = $('tourRefresh');

  const currentItems = () => state.feed?.items || [];

  function populateRegions() {
    if (!region) return;
    const found = new Set(currentItems().map((item) => item.region).filter(Boolean));
    const options = REGION_ORDER.filter((value) => found.has(value));
    const previous = region.value;
    region.replaceChildren();
    region.append(new Option('전주·완주', '전주·완주'), new Option('전북 전체', ''));
    for (const value of options) region.append(new Option(value, value));
    region.value = [...region.options].some((option) => option.value === previous) ? previous : '전주·완주';
  }

  function filteredItems() {
    const filters = state.filters;
    const queryText = filters.query.trim().toLowerCase();
    const items = currentItems().filter((item) => {
      const status = statusOf(item);
      if (filters.period === 'current' && status.key === 'ended') return false;
      if (filters.audience === 'adults' && !canAdultsJoin(item.audience)) return false;
      if (filters.category && item.category !== filters.category) return false;
      if (filters.region === '전주·완주' && !['전주', '완주'].includes(item.region)) return false;
      if (filters.region && filters.region !== '전주·완주' && item.region !== filters.region) return false;
      if (queryText) {
        const haystack = [item.title, item.host, item.venue, item.address, item.region, item.description, item.audience, item.foreignerNote]
          .filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(queryText)) return false;
      }
      return true;
    });
    return items.sort((a, b) => {
      if (filters.sort === 'title') return String(a.title).localeCompare(String(b.title), 'ko');
      if (filters.sort === 'newest') return String(b.startDate || '').localeCompare(String(a.startDate || ''));
      return (a.endDate || '9999-12-31').localeCompare(b.endDate || '9999-12-31')
        || String(a.startDate || '').localeCompare(String(b.startDate || ''));
    });
  }

  function renderCard(item) {
    const status = statusOf(item);
    const card = el('article', 'tour-card');
    const badges = el('div', 'tour-badges');
    badges.append(
      el('span', 'tour-badge free', '무료'),
      el('span', 'tour-badge category', item.category || '프로그램'),
      el('span', `tour-badge status ${status.key}`, status.label)
    );
    if (item.region) badges.append(el('span', 'tour-badge region', item.region));
    card.append(badges);

    const title = el('h3', 'tour-title');
    const link = el('a', '', item.title || '제목 없음');
    link.href = item.applyUrl || item.sourceUrl || '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    title.append(link);
    card.append(title);

    const host = [item.host, item.sourceName].filter(Boolean).filter((value, index, array) => array.indexOf(value) === index).join(' · ');
    if (host) card.append(el('p', 'tour-host', host));

    const facts = el('dl', 'tour-facts');
    const fact = (term, value) => {
      if (!value) return;
      const row = el('div');
      row.append(el('dt', '', term), el('dd', '', value));
      facts.append(row);
    };
    fact('기간', periodText(item));
    fact('장소', item.venue || item.address);
    fact('대상', item.audience || '대상 미표기');
    fact('참가비', item.price || '무료');
    if (item.reservation) fact('신청', item.reservation);
    card.append(facts);

    if (item.description) card.append(el('p', 'tour-description', item.description));

    const foreigner = el('p', 'tour-foreigner');
    foreigner.append(el('strong', '', '외국인 참가 '), el('span', '', item.foreignerNote || '출처에 국적 제한 언급 없음 · 신청처 확인'));
    card.append(foreigner);

    const actions = el('div', 'tour-actions');
    const apply = el('a', 'button compact secondary-light', '신청·자세히 보기 ↗');
    apply.href = item.applyUrl || item.sourceUrl || '#';
    apply.target = '_blank';
    apply.rel = 'noopener noreferrer';
    actions.append(apply);
    if (item.sourceUrl && item.sourceUrl !== item.applyUrl) {
      const source = el('a', 'tour-source', '출처 원문');
      source.href = item.sourceUrl;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      actions.append(source);
    }
    if (item.checkedAt) actions.append(el('span', 'tour-checked', `확인 ${formatDay(item.checkedAt)}`));
    card.append(actions);
    return card;
  }

  function render() {
    if (!list) return;
    const items = filteredItems();
    if (count) count.textContent = `${items.length}개`;
    if (updatedAt) {
      updatedAt.textContent = state.feed?.updatedAt
        ? `업데이트 ${new Date(state.feed.updatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' })}`
        : '';
    }
    if (sourceStatus) {
      const problems = (state.feed?.sourceStatus || []).filter((source) => source.status !== 'ok');
      sourceStatus.hidden = !problems.length;
      sourceStatus.replaceChildren();
      if (problems.length) {
        const box = el('div');
        box.append(el('strong', '', '일부 출처를 확인하지 못했습니다.'), el('span', '', problems.map((source) => `${source.source}: ${source.message}`).join(' / ')));
        sourceStatus.append(box);
      }
    }
    list.replaceChildren(...items.map(renderCard));
    if (empty) empty.hidden = items.length > 0;
    if (emptyMessage) {
      emptyMessage.textContent = state.loading ? '무료 투어·체험 목록을 불러오는 중입니다…'
        : state.error ? `목록을 불러오지 못했습니다: ${state.error}`
          : state.feed ? '조건에 맞는 무료 투어·체험이 없습니다. 필터를 넓혀 보세요.'
            : '아직 투어 목록이 생성되지 않았습니다. 투어 새로고침을 눌러 주세요.';
    }
  }

  async function load({ force = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    render();
    try {
      const response = await fetch(`../tours.json${force ? `?t=${Date.now()}` : ''}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.items)) throw new Error('목록 형식이 올바르지 않습니다.');
      state.feed = data;
      state.error = null;
      populateRegions();
    } catch (error) {
      state.error = error.message;
    } finally {
      state.loading = false;
      render();
    }
  }

  async function refresh() {
    if (!refreshButton) return;
    const label = refreshButton.textContent;
    refreshButton.disabled = true;
    refreshButton.textContent = '새로고침 중…';
    try {
      if (['127.0.0.1', 'localhost'].includes(location.hostname)) {
        await fetch('/api/refresh?profile=tours', { method: 'POST' }).catch(() => null);
      }
      await load({ force: true });
    } finally {
      refreshButton.disabled = false;
      refreshButton.textContent = label;
    }
  }

  const bindFilter = (element, key, eventName = 'change') => {
    if (!element) return;
    element.addEventListener(eventName, () => {
      state.filters[key] = element.value;
      render();
    });
  };
  let timer = null;
  if (query) {
    query.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.filters.query = query.value; render(); }, 150);
    });
  }
  bindFilter(category, 'category');
  bindFilter(region, 'region');
  bindFilter(audience, 'audience');
  bindFilter(period, 'period');
  bindFilter(sort, 'sort');
  $('tourReset')?.addEventListener('click', () => {
    Object.assign(state.filters, { query: '', category: '', region: '전주·완주', audience: 'adults', period: 'current', sort: 'soon' });
    if (query) query.value = '';
    if (category) category.value = '';
    if (region) region.value = '전주·완주';
    if (audience) audience.value = 'adults';
    if (period) period.value = 'current';
    if (sort) sort.value = 'soon';
    render();
  });
  refreshButton?.addEventListener('click', refresh);

  return {
    setActive(active) {
      if (active && !state.feed && !state.loading) load();
      else if (state.feed) render();
    },
    load
  };
}
