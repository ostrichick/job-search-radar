import assert from 'node:assert/strict';
import { addressCacheKey, addressQuery, geocodeAddress } from './address-geocoder.mjs';

assert.equal(addressCacheKey('  전북  전주시\n덕진구  '), '전북 전주시 덕진구');
assert.equal(addressQuery('전북 전주시 완산구 홍산남로 59-19,202호'), '전북 전주시 완산구 홍산남로 59-19');
assert.equal(addressQuery('전북 전주시 완산구 용머리로 73, 2층 핵심인재평생교육원'), '전북 전주시 완산구 용머리로 73');

const calls = [];
const mockFetch = async (url) => {
  calls.push(String(url));
  return {
    ok: true,
    json: async () => [{
      lat: '35.8426855', lon: '127.0576629', category: 'highway', type: 'unclassified',
      addresstype: 'unclassified', display_name: '안전로, 덕진구, 전주시, 대한민국',
      address: { country_code: 'kr', road: '안전로' }
    }]
  };
};
const result = await geocodeAddress('전북 전주시 덕진구 안전로 154, 3층 305호', {
  fetchImpl: mockFetch, now: '2026-11-10T00:00:00.000Z'
});
assert.equal(result.precision, 'road');
assert.equal(result.lat, 35.8426855);
assert.equal(result.checkedAt, '2026-11-10T00:00:00.000Z');
assert.match(calls[0], /street=%EC%95%88%EC%A0%84%EB%A1%9C/);

const outsideKorea = await geocodeAddress('Somewhere', {
  fetchImpl: async () => ({
    ok: true,
    json: async () => [{ lat: '40.0', lon: '127.0', address: { country_code: 'us' } }]
  })
});
assert.equal(outsideKorea, null);

console.log('address geocoder tests passed');
