import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectTours, normalizeCurated, parseTourDetail, tourPriceStatus } from './collect-tours.mjs';

const curated = JSON.parse(readFileSync(new URL('../config/curated-tours.json', import.meta.url), 'utf8'));
const entries = curated.items.map(normalizeCurated);
const original = entries.filter((item) => item.id !== 'curated-jeonju-craft-experience-paid' && item.id !== 'curated-jeonju-traddy-damso-paid');
assert.equal(original.length, 8, 'existing curated programs must remain intact');
assert.equal(entries.length, 10, 'include two officially linked paid experiences');
assert.equal(new Set(entries.map((item) => item.id)).size, entries.length);
assert.equal(entries.filter((item) => item.priceStatus === 'paid').length, 2);
assert.match(entries.find((item) => item.id === 'curated-jeonju-craft-experience-paid').priceNote, /무료 표기.*실제 비용/);
assert.equal(entries.filter((item) => item.priceStatus === 'free').length, 8);
assert.ok(entries.every((item) => item.lastCheckedAt === item.checkedAt));
assert.ok(entries.every((item) => item.availabilityStatus === 'unverified'));

assert.equal(tourPriceStatus({ price: '무료' }), 'free');
assert.equal(tourPriceStatus({ price: '1인 10,000원' }), 'paid');
assert.equal(tourPriceStatus({ price: '참가비 1만원' }), 'paid');
assert.equal(tourPriceStatus({ price: '8,000~20,000원' }), 'paid');
assert.equal(tourPriceStatus({ price: '비용 별도 문의' }), 'unknown');
assert.equal(tourPriceStatus({}), 'unknown', 'missing price does not mean free');
assert.equal(tourPriceStatus({ free: true, price: '10,000원' }), 'unknown', 'contradictory source price cannot be labelled free');
assert.equal(tourPriceStatus({ free: true, priceStatus: 'free', price: '10,000원' }), 'unknown');

const paidHtml = '<h3 class="evt_view_title">체험 프로그램</h3><dt>가격</dt><dd>10,000원</dd><div class="evt_view_editor">공예 체험을 진행합니다.</div>';
const freeHtml = '<span class="evt_free"></span><dt>가격</dt><dd>무료</dd><div class="evt_view_editor">무료 체험입니다.</div>';
const unknownHtml = '<h3 class="evt_view_title">미확인 체험</h3><div class="evt_view_editor">참가비는 현장 문의 바랍니다.</div>';
assert.equal(parseTourDetail(paidHtml).priceStatus, 'paid');
assert.equal(parseTourDetail(freeHtml).priceStatus, 'free');
assert.equal(parseTourDetail(unknownHtml).priceStatus, 'unknown');
const conflictingHtml = '<span class="evt_free"></span><h3 class="evt_view_title">가격 혼재</h3><dt>가격</dt><dd>무료</dd><div class="evt_view_editor">참가비 1만원의 실습 재료를 준비하세요.</div>';
assert.equal(parseTourDetail(conflictingHtml).priceStatus, 'unknown', 'explicit free badge conflicts with a priced activity');
assert.equal(normalizeCurated({ title: '미상 가격 투어' }).lastCheckedAt, null, 'generated date cannot masquerade as verification');

const prior = { items: [{
  id: 'jbct-existing', source: 'jbct', title: 'Previously seen culture tour',
  sourceUrl: 'https://example.org/old', price: '무료', free: true,
  checkedAt: '2026-11-17', lastCheckedAt: '2026-11-17'
}] };
const offline = await collectTours({ previousFeed: prior, persist: false,
  autoCollector: async (statuses) => { statuses.push({ source: '전북문화포털', status: 'failed', count: 0, message: 'Fixture network outage' }); return []; } });
const previous = offline.items.find((item) => item.id === 'jbct-existing');
assert.ok(previous, 'a failed source must not erase a previously reviewed item');
assert.equal(previous.lastCheckedAt, '2026-11-17', 'refresh time must not become a fictitious official verification date');
assert.equal(previous.sourceVerificationState, 'source_error');
assert.equal(previous.availabilityStatus, 'unverified');
assert.equal(offline.policy.freeOnly, false);

const genuineZero = await collectTours({ previousFeed: prior, persist: false,
  autoCollector: async (statuses) => { statuses.push({ source: '전북문화포털', status: 'ok', count: 0, message: 'No qualifying active events' }); return []; } });
assert.equal(genuineZero.items.some((item) => item.id === 'jbct-existing'), false,
  'a successful empty fetch must not be disguised as a source outage');

const partial = await collectTours({ previousFeed: prior, persist: false,
  autoCollector: async (statuses) => {
    statuses.push({ source: '전북문화포털', status: 'partial', count: 1, message: 'Some details unavailable' });
    return [{ ...prior.items[0], priceStatus: 'paid', price: '10,000원', free: false, checkedAt: '2026-11-21', lastCheckedAt: '2026-11-21' }];
  } });
assert.equal(partial.items.filter((item) => item.id === 'jbct-existing').length, 1);
assert.equal(partial.items.find((item) => item.id === 'jbct-existing').lastCheckedAt, '2026-11-21',
  'newly confirmed source record wins over an outage fallback duplicate');

console.log('tour pricing, curated IDs, and verification-date tests passed');
