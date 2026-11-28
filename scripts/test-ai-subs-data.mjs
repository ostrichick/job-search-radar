import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataFile = path.join(root, 'public/ai-subs/deals.json');

const SERVICES = ['chatgpt', 'claude', 'gemini', 'cursor', 'opencode'];
const REGIONS = ['korea', 'peru', 'global'];
const KINDS = ['billing', 'promo', 'student', 'credits', 'cashback', 'payment'];
const BILLINGS = ['monthly', 'annual', 'one-time', 'none'];
const STATUSES = ['official', 'check', 'expired'];
const EVIDENCE = ['pricing', 'promo', 'terms', 'community'];
const PRICE_BASES = ['official', 'converted', 'unknown'];
const CURRENCIES = ['KRW', 'PEN'];

const KST_TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

function isDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function isTimestampOrDate(value) {
  if (typeof value !== 'string' || !value) return false;
  if (isDateOnly(value)) return true;
  return Number.isFinite(Date.parse(value));
}

function isHttpsUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch { return false; }
}

const isMoney = (value) => Number.isFinite(value) && value >= 0;
const isMoneyOrNull = (value) => value === null || isMoney(value);

const raw = await fs.readFile(dataFile, 'utf8');
let data;
try {
  data = JSON.parse(raw);
} catch (error) {
  assert.fail(`public/ai-subs/deals.json is not valid JSON: ${error.message}`);
}

assert.ok(isTimestampOrDate(data.updatedAt), 'updatedAt must be a date or ISO timestamp');
assert.ok(typeof data.disclaimer === 'string' && data.disclaimer.trim(), 'disclaimer must be a non-empty string');

assert.ok(data.fx && typeof data.fx === 'object', 'fx is required');
assert.ok(Number.isFinite(data.fx.usdKrw) && data.fx.usdKrw > 0, 'fx.usdKrw must be a positive number');
assert.ok(Number.isFinite(data.fx.penPerUsd) && data.fx.penPerUsd > 0, 'fx.penPerUsd must be a positive number');
assert.ok(isDateOnly(data.fx.asOf), 'fx.asOf must be a real YYYY-MM-DD date');
assert.ok(isHttpsUrl(data.fx.source), 'fx.source must be an https URL');

assert.ok(Array.isArray(data.items) && data.items.length > 0, 'items must be a non-empty array');

const seenIds = new Set();
for (const [index, item] of data.items.entries()) {
  const where = `items[${index}]${item && item.id ? ` (${item.id})` : ''}`;
  assert.ok(item && typeof item === 'object', `${where} must be an object`);

  assert.ok(typeof item.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(item.id), `${where} id must be kebab-case`);
  assert.ok(!seenIds.has(item.id), `${where} duplicate id: ${item.id}`);
  seenIds.add(item.id);

  assert.ok(SERVICES.includes(item.service), `${where} service must be one of ${SERVICES.join('|')}`);
  assert.ok(typeof item.plan === 'string' && item.plan.trim(), `${where} plan must be a non-empty string`);
  assert.ok(REGIONS.includes(item.region), `${where} region must be one of ${REGIONS.join('|')}`);
  assert.ok(KINDS.includes(item.kind), `${where} kind must be one of ${KINDS.join('|')}`);
  assert.ok(BILLINGS.includes(item.billing), `${where} billing must be one of ${BILLINGS.join('|')}`);

  assert.ok(isMoneyOrNull(item.listPriceUsd), `${where} listPriceUsd must be a number or null`);
  assert.equal(typeof item.isFree, 'boolean', `${where} isFree must be a boolean`);
  assert.ok(isMoneyOrNull(item.prepayUsd), `${where} prepayUsd must be a number or null`);
  assert.ok(isMoneyOrNull(item.monthlyEquivalentUsd), `${where} monthlyEquivalentUsd must be a number or null`);
  assert.ok(isMoneyOrNull(item.renewalPriceUsd), `${where} renewalPriceUsd must be a number or null`);

  assert.ok(PRICE_BASES.includes(item.priceBasis), `${where} priceBasis must be one of ${PRICE_BASES.join('|')}`);
  if (item.localPrice !== null) {
    assert.ok(item.localPrice && typeof item.localPrice === 'object', `${where} localPrice must be an object or null`);
    assert.ok(CURRENCIES.includes(item.localPrice.currency), `${where} localPrice.currency must be one of ${CURRENCIES.join('|')}`);
    assert.ok(isMoney(item.localPrice.amount) && item.localPrice.amount > 0, `${where} localPrice.amount must be a positive number`);
    assert.equal(typeof item.localPrice.includesVat, 'boolean', `${where} localPrice.includesVat must be a boolean`);
  }

  assert.equal(typeof item.savingDisplay, 'string', `${where} savingDisplay must be a string`);
  assert.ok(typeof item.eligibility === 'string' && item.eligibility.trim(), `${where} eligibility must be a non-empty string`);
  assert.equal(typeof item.caveat, 'string', `${where} caveat must be a string`);

  assert.ok(STATUSES.includes(item.status), `${where} status must be one of ${STATUSES.join('|')}`);
  assert.ok(EVIDENCE.includes(item.evidenceType), `${where} evidenceType must be one of ${EVIDENCE.join('|')}`);

  assert.ok(item.expiresAt === null || isTimestampOrDate(item.expiresAt), `${where} expiresAt must be null or a real date`);
  assert.ok(isHttpsUrl(item.url), `${where} url must be an https URL`);
  assert.ok(isDateOnly(item.verifiedAt), `${where} verifiedAt must be a real YYYY-MM-DD date`);
  assert.ok(item.verifiedAt <= KST_TODAY, `${where} verifiedAt (${item.verifiedAt}) must not be in the future`);

  // 교차 조건: 근거 성격과 상태가 모순되면 안 된다.
  assert.ok(!(item.status === 'official' && item.evidenceType === 'community'),
    `${where} official status cannot be based on community evidence`);
  assert.ok(!(item.isFree === false && item.listPriceUsd === 0),
    `${where} isFree=false is inconsistent with listPriceUsd=0`);
  assert.ok(!(item.isFree === true && item.listPriceUsd !== 0),
    `${where} isFree=true requires listPriceUsd=0`);
  assert.ok(!(item.isFree === true && item.prepayUsd !== 0),
    `${where} isFree=true is inconsistent with a non-zero prepayUsd`);

  // 가격 표기 기준과 금액 필드는 서로 맞아야 한다.
  assert.equal(item.priceBasis === 'unknown', item.listPriceUsd === null,
    `${where} priceBasis=unknown must be used exactly when listPriceUsd is null`);
  if (item.listPriceUsd !== null) {
    assert.ok(isMoney(item.prepayUsd), `${where} prepayUsd must be a number when listPriceUsd is known`);
  }
  if (item.priceBasis === 'unknown') {
    assert.equal(item.localPrice, null, `${where} unknown price must not carry a localPrice`);
    assert.equal(item.prepayUsd, null, `${where} unknown price must not carry a prepayUsd`);
    assert.equal(item.monthlyEquivalentUsd, null, `${where} unknown price must not carry a monthlyEquivalentUsd`);
  }
  if (item.priceBasis === 'converted') {
    assert.ok(item.listPriceUsd !== null, `${where} converted price requires listPriceUsd`);
    assert.ok(item.localPrice !== null, `${where} converted price requires an official localPrice`);
  }
  if (item.priceBasis === 'official') {
    assert.ok(item.listPriceUsd !== null, `${where} official price requires listPriceUsd`);
  }
  assert.ok(!(item.region === 'global' && item.localPrice !== null),
    `${where} global region must not carry a country-specific localPrice`);
}

console.log(`ai-subs data checks passed (${data.items.length} items, ${KST_TODAY} KST)`);
