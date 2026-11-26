import { formatDateTime } from './date-format.js';

const TEXT = {
  ko: {
    unavailable: '확인 불가',
    auto: '자동 수집',
    manual: '수동 확인',
    full: '전체 확인',
    partial: (n) => `일부 확인 · ${n}건 미확인`,
    unknown: '확인 상태 미확인',
    note: '항목별 확인일은 카드에서 확인 · 원문 재확인'
  },
  en: {
    unavailable: 'Unavailable',
    auto: 'Auto-collected',
    manual: 'Manual check',
    full: 'All checked',
    partial: (n) => `Partial · ${n} unchecked`,
    unknown: 'Verification unknown',
    note: 'Per-item check dates are on cards · verify original'
  }
};

export function renderFreshness(root, { value, source = 'manual', unchecked = null, locale = 'ko' }) {
  if (!root) return;
  const t = TEXT[locale] || TEXT.ko;
  const strong = root.querySelector('strong');
  if (strong) strong.textContent = value ? formatDateTime(value) : t.unavailable;
  const kind = root.querySelector('.freshness-kind');
  if (kind) kind.textContent = source === 'auto' ? t.auto : t.manual;
  const chip = root.querySelector('.freshness-chip');
  if (chip) {
    const known = Boolean(value) && Number.isFinite(unchecked);
    chip.textContent = !known ? t.unknown : unchecked > 0 ? t.partial(unchecked) : t.full;
    chip.dataset.state = !known ? 'unknown' : unchecked > 0 ? 'partial' : 'full';
  }
  const small = root.querySelector('small');
  if (small) small.textContent = t.note;
}
