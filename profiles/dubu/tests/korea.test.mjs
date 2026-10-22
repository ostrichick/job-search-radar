import assert from 'node:assert/strict';
import { test } from 'node:test';
import { koreaCategory, koreaProvince, commuteRegion, parseWork24Xml, collectKoreanJobs } from '../scripts/collect-korea.mjs';

const response = `<?xml version="1.0"?><wantedRoot><total>3</total><wanted>
<wantedAuthNo>K100</wantedAuthNo><company>전주 회사</company><title><![CDATA[스페인어 번역 채용]]></title>
<region>전북 전주시</region><regDt>20261018</regDt><closeDt>20261101</closeDt>
<salTpNm>월급</salTpNm><sal>250만원</sal><wantedInfoUrl>https://www.work24.go.kr/jobs/100?a=1&amp;b=2</wantedInfoUrl></wanted>
<wanted><wantedAuthNo>K200</wantedAuthNo><company>서울 회사</company><title>브랜드 마케팅 채용</title><region>서울특별시 강남구</region>
<wantedInfoUrl>https://www.work24.go.kr/jobs/200</wantedInfoUrl></wanted>
<wanted><wantedAuthNo>K300</wantedAuthNo><company>무관 회사</company><title>주방 조리사</title><region>익산</region>
<wantedInfoUrl>https://www.work24.go.kr/jobs/300</wantedInfoUrl></wanted></wantedRoot>`;

test('province and commute tiers do not confuse a province-wide job with Jeonju', () => {
  assert.equal(koreaProvince('서울특별시 강남구'), '서울특별시');
  assert.equal(commuteRegion('전북 전주시 덕진구'), 'nearby');
  assert.equal(commuteRegion('익산시'), 'expanded');
  assert.equal(commuteRegion('전북특별자치도'), 'unknown');
  assert.equal(commuteRegion('서울특별시 마포구'), 'relocation');
  assert.equal(commuteRegion(''), 'unknown');
  assert.equal(koreaCategory('화상 통역 담당'), 'interpreting');
});

test('parse official fields conservatively and exclude unrelated positions', () => {
  const jobs = parseWork24Xml(response, { now: '2026-10-19T00:00:00Z' });
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].id, 'work24:K100');
  assert.equal(jobs[0].category, 'translation');
  assert.equal(jobs[0].commuteClass, 'nearby');
  assert.equal(jobs[0].postedAt, '2026-10-18');
  assert.match(jobs[0].url, /^https:\/\/www\.work24\.go\.kr\/wk\/a\/b\/1500\/empDetailAuthView\.do\?/);
  assert.equal(new URL(jobs[0].url).searchParams.get('wantedAuthNo'), 'K100');
  assert.equal(jobs[1].commuteClass, 'relocation');
  assert.equal(jobs[1].workplaceMode, 'unknown');
  assert.throws(() => parseWork24Xml('<error>unauthorized</error>'), /not a wantedRoot/);
});

test('no API key yields explicit, non-fictional disabled coverage', async () => {
  const result = await collectKoreanJobs({ authKey: '', searches: ['번역'] });
  assert.equal(result.jobs.length, 0);
  assert.equal(result.sourceStatus[0].status, 'not_configured');
});

test('collect deduplicates national results and records partial failures', async () => {
  const result = await collectKoreanJobs({ authKey: 'test-key', searches: ['번역', '마케팅'], fetchImpl: async (url) => {
    if (decodeURIComponent(url).includes('마케팅')) throw new Error('offline fixture failure');
    return { ok: true, text: async () => response };
  } });
  assert.equal(result.jobs.length, 2);
  assert.equal(result.sourceStatus[0].status, 'partial');
  assert.equal(result.sourceStatus[0].failures.length, 1);
});
