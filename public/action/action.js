import { formatDate, formatDateTime } from '../shared/date-format.js';

const $ = (id) => document.getElementById(id);
const OWNER_LABELS = { munseong: 'Munseong', nicole: 'Nicole', shared: '공동' };
const OWNER_SEARCH = { munseong: 'Munseong 문성', nicole: 'Nicole 니콜', shared: '공동' };
const KIND_LABELS = { job: '공고', platform: '플랫폼', search: '검색', program: '제도' };
const SEEN_KEY = 'actionSeenIds';
const CHECK_KEY = 'actionCheckedIds';

let actions = [];
let checklist = [];
let filter = 'all';
let query = '';
let notice = '';
let seenIds = new Set();
let checkedIds = new Set();

try {
  const storedSeen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
  if (Array.isArray(storedSeen)) seenIds = new Set(storedSeen);
} catch { /* Keep the seen state empty when this key is corrupt. */ }
const displayedSeenIds = new Set(seenIds);
try {
  const storedChecked = JSON.parse(localStorage.getItem(CHECK_KEY) || '[]');
  if (Array.isArray(storedChecked)) checkedIds = new Set(storedChecked);
} catch { /* Keep the checklist state empty when this key is corrupt. */ }

function saveSeen() {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seenIds])); } catch { /* Keep in-memory state. */ }
}

function saveChecked() {
  try { localStorage.setItem(CHECK_KEY, JSON.stringify([...checkedIds])); } catch { /* Keep in-memory state. */ }
}

function deadlineInfo(item) {
  if (!item.deadlineAt) return { state: 'none', label: '', text: '상시 · 마감 없음' };
  const end = Date.parse(item.deadlineAt);
  if (!Number.isFinite(end)) return { state: 'unknown', label: '', text: '마감 확인 필요' };
  const remaining = end - Date.now();
  const when = formatDateTime(end);
  if (remaining <= 0) return { state: 'closed', label: '마감', text: `마감 ${when}` };
  const hours = remaining / 3600000;
  const label = hours < 1 ? `${Math.max(1, Math.ceil(remaining / 60000))}분 남음`
    : hours < 24 ? `${Math.ceil(hours)}시간 남음`
      : `${Math.ceil(hours / 24)}일 남음`;
  return { state: hours <= 72 ? 'soon' : 'open', label, text: `마감 ${when}` };
}

function matches(item) {
  const info = deadlineInfo(item);
  if (filter === 'urgent' && !((item.priority === 'urgent' && info.state !== 'closed') || info.state === 'soon')) return false;
  if (filter === 'munseong' && item.owner !== 'munseong') return false;
  if (filter === 'nicole' && item.owner !== 'nicole') return false;
  if (filter === 'platform' && item.kind !== 'platform') return false;
  if (filter === 'search' && !['search', 'program'].includes(item.kind)) return false;
  if (!query) return true;
  const haystack = [item.title, item.org, item.payNote, item.location, item.eligibility, item.caveat,
    item.nextAction, item.statusNote, OWNER_SEARCH[item.owner] || item.owner, ...(item.tags || [])]
    .join(' ').toLowerCase();
  return haystack.includes(query);
}

function rank(item) {
  const info = deadlineInfo(item);
  if (info.state === 'closed') return 3;
  if (item.priority === 'urgent' || info.state === 'soon') return 0;
  if (item.priority === 'active') return 1;
  return 2;
}

function visibleActions() {
  return actions.map((item, index) => ({ item, index }))
    .filter(({ item }) => matches(item))
    .sort((a, b) => {
      const rankDiff = rank(a.item) - rank(b.item);
      if (rankDiff) return rankDiff;
      const aDeadline = a.item.deadlineAt ? Date.parse(a.item.deadlineAt) : Number.POSITIVE_INFINITY;
      const bDeadline = b.item.deadlineAt ? Date.parse(b.item.deadlineAt) : Number.POSITIVE_INFINITY;
      if (aDeadline !== bDeadline) return aDeadline - bDeadline;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function safeHref(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function markSeen(item) {
  if (seenIds.has(item.id)) return;
  seenIds.add(item.id);
  saveSeen();
}

function attachSeen(card, item) {
  let timer = null;
  const arm = () => {
    if (seenIds.has(item.id)) return;
    clearTimeout(timer);
    timer = setTimeout(() => markSeen(item), 450);
  };
  const disarm = () => { clearTimeout(timer); timer = null; };
  card.addEventListener('pointerenter', (event) => { if (event.pointerType !== 'touch') arm(); });
  card.addEventListener('pointermove', (event) => { if (event.pointerType !== 'touch' && !timer) arm(); }, { passive: true });
  card.addEventListener('pointerleave', disarm);
  card.addEventListener('focusin', arm);
  card.addEventListener('focusout', disarm);
}

function renderCard(item) {
  const info = deadlineInfo(item);
  const closed = info.state === 'closed';
  const card = make('article', `action-card${closed ? ' is-closed' : ''}`);
  card.dataset.actionId = item.id;
  card.classList.toggle('is-unreviewed', !displayedSeenIds.has(item.id));
  card.classList.toggle('is-seen', displayedSeenIds.has(item.id));
  const head = make('div', 'action-card-head');
  const badges = make('div', 'action-badges');
  badges.append(make('span', `action-badge owner-${item.owner}`, OWNER_LABELS[item.owner] || item.owner));
  badges.append(make('span', 'action-badge', KIND_LABELS[item.kind] || item.kind));
  if (item.priority === 'urgent') badges.append(make('span', 'action-badge urgent', '긴급'));
  if (item.priority === 'watch') badges.append(make('span', 'action-badge watch', '대기'));
  const seenStatus = make('span', 'seen-status', '확인됨');
  seenStatus.hidden = !displayedSeenIds.has(item.id);
  badges.append(seenStatus);
  head.append(badges);
  card.append(head);
  card.append(make('h2', '', item.title));
  if (item.org) card.append(make('p', 'action-org', item.org));
  if (item.payNote) card.append(make('p', 'action-pay', item.payNote));
  const facts = make('div', 'action-facts');
  for (const [label, value] of [['위치', item.location], ['자격', item.eligibility], ['첫 수입', item.firstIncome]]) {
    if (!value) continue;
    const row = make('div');
    row.append(make('b', '', `${label} · `), document.createTextNode(value));
    facts.append(row);
  }
  if (facts.childElementCount) card.append(facts);
  if (item.caveat) card.append(make('p', 'action-caveat', item.caveat));
  if (item.deadlineAt) {
    const deadline = make('div', `action-deadline ${info.state}`);
    deadline.append(make('span', 'deadline-chip', info.state === 'closed' ? '마감' : info.label));
    deadline.append(make('span', '', info.text));
    card.append(deadline);
  }
  if (item.nextAction) card.append(make('p', 'action-next', item.nextAction));
  if ((item.links || []).length) {
    const links = make('div', 'action-links');
    for (const [index, link] of item.links.entries()) {
      const href = safeHref(link.url);
      if (!href) continue;
      const anchor = make('a', `button compact ${index === 0 ? 'primary' : 'secondary-light'}`, `${link.label} ↗`);
      anchor.href = href;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.addEventListener('click', () => markSeen(item));
      links.append(anchor);
    }
    card.append(links);
  }
  const status = make('div', 'action-status');
  const linkStatus = item.linkStatus || 'unknown';
  status.append(make('span', `link-status ${linkStatus}`, linkStatus === 'ok' ? '링크 확인' : linkStatus === 'dead' ? '링크 만료' : '링크 미확인'));
  if (item.verifiedAt) status.append(make('span', '', `확인일 ${formatDate(item.verifiedAt)}`));
  if (item.statusNote) status.append(make('span', '', item.statusNote));
  card.append(status);
  attachSeen(card, item);
  return card;
}

function renderStats() {
  const openUrgent = actions.filter((item) => {
    const info = deadlineInfo(item);
    return info.state !== 'closed' && (item.priority === 'urgent' || info.state === 'soon');
  }).length;
  $('urgentCount').textContent = String(openUrgent);
  $('activeCount').textContent = String(actions.filter((item) => item.priority === 'active' && deadlineInfo(item).state !== 'closed').length);
  $('munseongCount').textContent = String(actions.filter((item) => item.owner === 'munseong').length);
  $('nicoleCount').textContent = String(actions.filter((item) => item.owner === 'nicole').length);
}

function renderNotice() {
  const coupang = actions.find((item) => item.id === 'coupang-cs-2026-11');
  if (coupang && deadlineInfo(coupang).state === 'closed') {
    $('actionNotice').textContent = '쿠팡 CS 공고는 마감되었습니다. 같은 조건의 재택 CS 공고를 검색 목록에서 확인하세요.';
    return;
  }
  $('actionNotice').textContent = actions.length ? notice : '실행 데이터를 불러오지 못했습니다.';
}

function renderChecklist() {
  const container = $('actionChecklist');
  container.replaceChildren();
  for (const item of checklist) {
    const label = make('label', 'check-item');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `action-check-${item.id}`;
    input.checked = checkedIds.has(item.id);
    input.addEventListener('change', () => {
      input.checked ? checkedIds.add(item.id) : checkedIds.delete(item.id);
      saveChecked();
    });
    const text = make('span');
    text.append(document.createTextNode(item.label));
    if (item.owner) text.append(make('span', 'check-owner', ` · ${OWNER_LABELS[item.owner] || item.owner}`));
    label.append(input, text);
    container.append(label);
  }
}

let deadlineTimer = null;

function scheduleDeadlineRefresh() {
  clearTimeout(deadlineTimer);
  deadlineTimer = null;
  const now = Date.now();
  const boundaries = [];
  for (const item of actions) {
    const end = Date.parse(item.deadlineAt);
    if (!Number.isFinite(end)) continue;
    boundaries.push(end, end - 72 * 3600000);
  }
  const next = boundaries.filter((value) => value > now).sort((a, b) => a - b)[0];
  if (!next) return;
  deadlineTimer = setTimeout(() => {
    render();
    scheduleDeadlineRefresh();
  }, Math.min(next - now + 1000, 2147483647));
}

function render() {
  renderStats();
  renderNotice();
  const items = visibleActions();
  $('actionResultCount').textContent = `${items.length}개 실행 항목`;
  $('actionCards').replaceChildren(...items.map(renderCard));
  $('actionEmpty').hidden = items.length > 0;
  scheduleDeadlineRefresh();
}

for (const button of document.querySelectorAll('#actionFilters button')) {
  button.addEventListener('click', () => {
    filter = button.dataset.filter || 'all';
    for (const candidate of document.querySelectorAll('#actionFilters button')) {
      const active = candidate === button;
      candidate.classList.toggle('active', active);
      candidate.setAttribute('aria-pressed', String(active));
    }
    render();
  });
}

let queryTimer = null;
$('actionQuery').addEventListener('input', () => {
  clearTimeout(queryTimer);
  queryTimer = setTimeout(() => {
    query = $('actionQuery').value.trim().toLowerCase();
    render();
  }, 120);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  render();
  scheduleDeadlineRefresh();
});

async function load() {
  try {
    const response = await fetch('./actions.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    actions = Array.isArray(data.items) ? data.items : [];
    checklist = Array.isArray(data.checklist) ? data.checklist : [];
    notice = String(data.notice || '');
    $('actionUpdatedAt').textContent = data.updatedAt
      ? (String(data.updatedAt).includes('T') ? formatDateTime(data.updatedAt) : formatDate(data.updatedAt))
      : '확인일 미상';
    renderChecklist();
    render();
  } catch (error) {
    $('actionUpdatedAt').textContent = '불러오기 실패';
    $('actionNotice').textContent = `실행 데이터를 불러오지 못했습니다. (${error.message})`;
    $('actionResultCount').textContent = '0개 실행 항목';
    $('actionEmpty').hidden = false;
  }
}

void load();
