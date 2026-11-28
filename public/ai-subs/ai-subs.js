import { renderFreshness } from '../shared/freshness.js';
import { formatDate } from '../shared/date-format.js';

const $ = (id) => document.getElementById(id);

const SEEN_KEY = 'aiSubsSeenIds';
const HIDDEN_KEY = 'aiSubsHiddenIds';
const EMPTY_MESSAGE = '표시할 항목이 없습니다.';
const ERROR_MESSAGE = '요금 데이터를 불러오지 못했습니다. 새로고침 후 다시 확인하세요.';
const FRESHNESS_NOTE = '항목별 확인일은 카드에서 확인 · 결제 전 원문 재확인';

const SERVICE_LABELS = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini', cursor: 'Cursor', opencode: 'OpenCode' };
const KIND_LABELS = { billing: '정기 결제', promo: '프로모션', student: '학생', credits: '크레딧', cashback: '캐시백', payment: '결제 수단' };
const REGION_LABELS = { korea: '한국', peru: '페루', global: '전세계' };
const BILLING_LABELS = { monthly: '월 결제', annual: '연 결제', 'one-time': '일회성', none: '해당 없음' };
const STATUS_LABELS = { official: '공식 확인', check: '확인 필요', expired: '만료' };
const STATUS_ORDER = { official: 0, check: 1, expired: 2 };

const KST_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
});

const state = {
  items: [],
  updatedAt: '',
  fx: null,
  loadError: false,
  filters: { query: '', service: '', kind: '', region: '', billing: '', status: '' }
};

function readSet(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(stored) ? new Set(stored) : new Set();
  } catch { /* 저장소를 쓸 수 없으면 빈 상태로 시작 */ }
  return new Set();
}
function writeSet(key, set) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* 메모리 상태는 유지 */ }
}
const seenIds = readSet(SEEN_KEY);
const hiddenIds = readSet(HIDDEN_KEY);
const displayedSeenIds = new Set(seenIds);

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
};
const finite = (value) => value != null && value !== '' && Number.isFinite(Number(value));
const usd = (value) => finite(value) ? `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '';

function kstToday() { return KST_DATE.format(new Date()); }

// 날짜 전용 값은 KST 날짜 문자열로, 시간 포함 ISO는 실제 시각으로 만료 판정
function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const text = String(expiresAt);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text < kstToday();
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) && parsed < Date.now();
}

function effectiveStatus(item) {
  if (isExpired(item.expiresAt)) return 'expired';
  return STATUS_ORDER[item.status] !== undefined ? item.status : 'check';
}

function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

function paintFreshness(value, unchecked) {
  const root = $('aiSubsUpdatedAt').closest('.hero-aside');
  renderFreshness(root, { value, source: 'manual', unchecked });
  // 공통 freshness 문구 대신 이 탭의 안내 문구를 유지
  const note = root.querySelector('small');
  if (note) note.textContent = FRESHNESS_NOTE;
}

// 환율 기준일·출처를 화면에 남겨 환산 값이 추정임을 드러낸다.
function paintFx(fx) {
  const node = $('subsFxNote');
  if (!node) return;
  node.replaceChildren();
  if (!fx || !finite(fx.usdKrw) || !finite(fx.penPerUsd)) {
    node.hidden = true;
    return;
  }
  node.hidden = false;
  const basis = `환율 기준 ${formatDate(fx.asOf) || '-'} · 1 USD = ${Number(fx.usdKrw).toLocaleString('ko-KR')}원 / ${Number(fx.penPerUsd)} PEN · `;
  node.append(document.createTextNode(basis));
  const url = safeUrl(fx.source);
  if (url) {
    const anchor = el('a', '', '출처');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    node.append(anchor);
  } else {
    node.append(document.createTextNode('출처 미확인'));
  }
  node.append(document.createTextNode(' · USD 가격의 현지 통화 환산은 추정입니다.'));
}

function approximate(monthly) {
  if (!state.fx || !finite(monthly)) return '';
  const krw = Math.round(Number(monthly) * state.fx.usdKrw);
  const pen = (Number(monthly) * state.fx.penPerUsd).toFixed(1);
  return `≈ ₩${krw.toLocaleString('ko-KR')} · S/ ${pen} (추정)`;
}

const NOTE_AREAS = { promo: '프로모션', student: '학생 할인', cashback: '캐시백', payment: '결제 수수료·세금', regional: '현지 가격' };
const NOTE_RESULTS = { partial: '부분 확인', none: '미확인', full: '확인' };

// 조사에서 확인하지 못한 영역을 화면에 남겨 빈 칸을 추정으로 메우지 않게 한다.
function paintNotes(notes) {
  const section = $('subsNotes');
  const list = $('subsNoteList');
  if (!section || !list) return;
  list.replaceChildren();
  if (Array.isArray(notes)) {
    for (const note of notes) {
      if (!note || typeof note !== 'object' || !note.note) continue;
      const area = NOTE_AREAS[note.area] || note.area || '기타';
      const result = NOTE_RESULTS[note.result] || '';
      const item = el('li');
      item.append(el('strong', '', result ? `${area} · ${result}` : area), document.createTextNode(` ${note.note}`));
      list.append(item);
    }
  }
  section.hidden = list.childElementCount === 0;
}

function toggleHidden(item) {
  hiddenIds.has(item.id) ? hiddenIds.delete(item.id) : hiddenIds.add(item.id);
  writeSet(HIDDEN_KEY, hiddenIds);
  render();
  $('subsStatus').focus({ preventScroll: true });
}

function markSeen(item, card, badge) {
  if (seenIds.has(item.id)) return;
  seenIds.add(item.id);
  card.classList.remove('is-unreviewed');
  card.classList.add('is-seen');
  if (badge) badge.hidden = false;
  writeSet(SEEN_KEY, seenIds);
}

function attachSeenTracking(card, item, badge) {
  let dwellTimer = null;
  const armSeen = () => {
    if (seenIds.has(item.id)) return;
    clearTimeout(dwellTimer);
    dwellTimer = setTimeout(() => markSeen(item, card, badge), 450);
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

function matches(item) {
  const f = state.filters;
  // 숨김 보기에서도 나머지 필터를 그대로 적용한다.
  if (f.status === 'hidden' ? !hiddenIds.has(item.id) : hiddenIds.has(item.id)) return false;
  if (f.service && item.service !== f.service) return false;
  if (f.kind && item.kind !== f.kind) return false;
  if (f.region && item.region !== f.region && item.region !== 'global') return false;
  if (f.billing && item.billing !== f.billing) return false;
  if (f.status && f.status !== 'hidden' && item.effectiveStatus !== f.status) return false;
  const query = f.query.trim().toLowerCase();
  if (!query) return true;
  return [
    SERVICE_LABELS[item.service] || item.service, item.plan,
    REGION_LABELS[item.region] || item.region, KIND_LABELS[item.kind] || item.kind,
    item.savingDisplay, item.eligibility, item.caveat
  ].filter(Boolean).join(' ').toLowerCase().includes(query);
}

function sorted(items) {
  return [...items].sort((a, b) => {
    const statusDiff = STATUS_ORDER[a.effectiveStatus] - STATUS_ORDER[b.effectiveStatus];
    if (statusDiff) return statusDiff;
    const seenDiff = Number(displayedSeenIds.has(a.id)) - Number(displayedSeenIds.has(b.id));
    if (seenDiff) return seenDiff;
    return String(a.service || '').localeCompare(String(b.service || ''), 'ko')
      || String(a.plan || '').localeCompare(String(b.plan || ''), 'ko');
  });
}

function renderCard(item) {
  const card = el('article', 'card subs-card');
  card.dataset.subsId = item.id;
  const seen = seenIds.has(item.id);
  card.classList.toggle('is-unreviewed', !seen);
  card.classList.toggle('is-seen', seen);

  const status = item.effectiveStatus;
  const badges = el('div', 'card-top subs-badges');
  const seenStatus = el('span', 'seen-status', '확인됨');
  seenStatus.hidden = !seen;
  badges.append(
    seenStatus,
    el('span', `tag subs-status ${status}`, STATUS_LABELS[status] || '확인 필요'),
    el('span', 'tag subs-kind', KIND_LABELS[item.kind] || '유형 확인 필요'),
    el('span', 'tag subs-region', REGION_LABELS[item.region] || '지역 확인 필요')
  );
  const isHidden = hiddenIds.has(item.id);
  const hide = el('button', 'card-hide', isHidden ? '↶' : '×');
  hide.type = 'button';
  hide.title = isHidden ? '숨김 해제' : '숨기기';
  hide.setAttribute('aria-label', `${item.plan || item.service || '항목'} ${isHidden ? '숨김 해제' : '숨기기'}`);
  hide.addEventListener('click', () => toggleHidden(item));
  card.append(badges, hide);
  attachSeenTracking(card, item, seenStatus);

  const label = item.plan || SERVICE_LABELS[item.service] || item.service || '구독 플랜';
  const title = el('h3');
  const link = safeUrl(item.url);
  if (link) {
    const anchor = el('a', '', label);
    anchor.href = link;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    title.append(anchor);
  } else {
    title.textContent = label;
  }
  card.append(title);
  card.append(el('p', 'subs-service',
    `${SERVICE_LABELS[item.service] || item.service || '서비스 확인 필요'} · ${BILLING_LABELS[item.billing] || item.billing || '결제 주기 확인 필요'}`));

  const price = el('div', 'subs-price');
  price.append(el('span', 'subs-price-label', '실질 월 비용'));
  if (!finite(item.listPriceUsd)) {
    price.append(el('strong', '', '확인 필요'), el('small', '', 'USD 금액은 공식 페이지에서 확인하세요.'));
  } else {
    const amount = el('div', 'subs-amount');
    const monthly = finite(item.monthlyEquivalentUsd) ? item.monthlyEquivalentUsd : item.listPriceUsd;
    amount.append(el('strong', '', usd(monthly)));
    if (item.priceBasis === 'converted') amount.append(el('span', 'chip subs-estimate', '추정'));
    const detail = [`정가 ${usd(item.listPriceUsd)}`];
    if (finite(item.prepayUsd)) detail.push(`선결제 ${usd(item.prepayUsd)}`);
    if (finite(item.renewalPriceUsd)) detail.push(`갱신 ${usd(item.renewalPriceUsd)}`);
    price.append(amount, el('small', '', detail.join(' · ')));
    if (item.priceBasis === 'official') {
      const approx = approximate(monthly);
      if (approx) price.append(el('small', 'subs-approx', approx));
    }
  }
  card.append(price);

  const facts = el('dl', 'subs-facts');
  const fact = (term, value) => {
    const row = el('div');
    row.append(el('dt', '', term), el('dd', '', value));
    facts.append(row);
  };
  fact('플랜 유형', KIND_LABELS[item.kind] || item.kind || '확인 필요');
  fact('지역', REGION_LABELS[item.region] || item.region || '확인 필요');
  fact('자격', item.eligibility || '확인 필요');
  if (item.localPrice && typeof item.localPrice === 'object') {
    const lp = item.localPrice;
    const amountText = finite(lp.amount) ? `${lp.currency || ''} ${Number(lp.amount).toLocaleString('ko-KR')}`.trim() : '금액 확인 필요';
    const vatFlag = lp.includesVat ?? lp.vatIncluded;
    const vatText = vatFlag === true ? '부가세 포함' : vatFlag === false ? '부가세 별도' : '부가세 여부 확인 필요';
    fact('현지가', `${amountText} · ${vatText}`);
  }
  if (item.savingDisplay) fact('절감', item.savingDisplay);
  card.append(facts);

  if (item.caveat) card.append(el('p', 'subs-caveat', item.caveat));

  const actions = el('div', 'subs-actions');
  if (link) {
    const official = el('a', 'button secondary compact', '공식 페이지 ↗');
    official.href = link;
    official.target = '_blank';
    official.rel = 'noopener noreferrer';
    actions.append(official);
  }
  actions.append(el('span', 'subs-checked', `확인 ${formatDate(item.verifiedAt) || '-'}`));
  card.append(actions);
  return card;
}

function render() {
  if (state.loadError) return; // 로드 실패 문구를 빈 결과 문구로 덮어쓰지 않음
  const items = sorted(state.items.filter(matches));
  $('subsResultCount').textContent = `${items.length}개`;
  $('subsCards').replaceChildren(...items.map(renderCard));
  $('subsEmpty').hidden = items.length > 0;
  if (!items.length) $('subsEmptyMessage').textContent = EMPTY_MESSAGE;
}

function renderMetrics() {
  const items = state.items;
  $('totalCount').textContent = String(items.length);
  $('officialCount').textContent = String(items.filter((item) => item.effectiveStatus === 'official').length);
  $('checkCount').textContent = String(items.filter((item) => item.effectiveStatus === 'check').length);
  $('expiredCount').textContent = String(items.filter((item) => item.effectiveStatus === 'expired').length);
}

async function load() {
  try {
    const response = await fetch('./deals.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data || !Array.isArray(data.items)) throw new Error('요금 데이터 형식이 올바르지 않습니다.');
    state.items = data.items
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({ ...item, effectiveStatus: effectiveStatus(item) }));
    state.updatedAt = data.updatedAt || '';
    state.fx = data.fx && typeof data.fx === 'object' ? data.fx : null;
    state.loadError = false;
    paintFreshness(state.updatedAt, state.items.filter((item) => item.effectiveStatus === 'check').length);
    paintFx(state.fx);
    paintNotes(data.researchNotes);
    if (data.disclaimer) $('subsDisclaimer').textContent = data.disclaimer;
    renderMetrics();
    render();
  } catch {
    // 실패는 화면 문구로만 알리고 예외를 던지지 않음
    state.items = [];
    state.loadError = true;
    paintFreshness(null, null);
    $('subsResultCount').textContent = '0개';
    $('subsCards').replaceChildren();
    $('subsEmptyMessage').textContent = ERROR_MESSAGE;
    $('subsEmpty').hidden = false;
    renderMetrics();
  }
}

const bind = (id, key) => $(id).addEventListener('change', () => {
  state.filters[key] = $(id).value;
  render();
});
bind('subsService', 'service');
bind('subsKind', 'kind');
bind('subsRegion', 'region');
bind('subsBilling', 'billing');
bind('subsStatus', 'status');

let queryTimer = null;
$('subsQuery').addEventListener('input', () => {
  clearTimeout(queryTimer);
  queryTimer = setTimeout(() => { state.filters.query = $('subsQuery').value; render(); }, 150);
});

$('subsReset').addEventListener('click', () => {
  Object.assign(state.filters, { query: '', service: '', kind: '', region: '', billing: '', status: '' });
  for (const id of ['subsQuery', 'subsService', 'subsKind', 'subsRegion', 'subsBilling', 'subsStatus']) $(id).value = '';
  render();
});

load();
