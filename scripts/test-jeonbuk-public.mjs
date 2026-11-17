import assert from 'node:assert/strict';
import { collectJeonbukPublic, parseJeonbukPublicDetail, parseJeonbukPublicList } from './jeonbuk-public.mjs';
import { currentListingState } from './collect-jobs.mjs';

const list = `<table><tbody>
<tr><td>공공기관</td><td>전주덕일중학교</td><td class="left"><a href='/pro/view_orginfo/3966?offset=0&findvalue=&search=&ismine=n'>2026년 11. 교무실무사 대체인력 채용 공고</a></td><td>월급 2,144,500</td><td>2026-11-12일 까지</td></tr>
<tr><td>공공기관</td><td>전주근영중학교</td><td class="left"><a href='/pro/view_orginfo/3965?offset=0&findvalue=&search=&ismine=n'>최종합격자 발표 공고</a></td><td>월급</td><td></td></tr>
<tr><td>공공기관</td><td>군산학교</td><td class="left"><a href='/pro/view_orginfo/3964?offset=0&findvalue=&search=&ismine=n'>군산 기간제 채용</a></td><td>월급</td><td>2026-11-20일 까지</td></tr>
</tbody></table>`;
const rows = parseJeonbukPublicList(list);
assert.equal(rows.length, 2);
assert.equal(rows[0].company, '전주덕일중학교');
assert.equal(rows[0].deadline, '2026-11-12');
assert.match(rows[0].url, /view_orginfo\/3966/);

const detail = `<html><body><div class="bdate"><span>2026-11-05</span></div>
<table class="public_table"><tr><th>기관명</th><td colspan="3">전주덕일중학교</td></tr>
<tr><th>모집직종</th><td colspan="3">경영·회계·사무 관련직</td></tr>
<tr><th>고용형태</th><td>계약직</td><th>모집인원</th><td>1</td></tr>
<tr><th>급여조건</th><td>월급</td><th>학력</th><td>학력무관</td></tr>
<tr><th>경력</th><td>무관</td><th>근무지역</th><td>전주시</td></tr>
<tr><th>근무기간</th><td colspan="3">2026. 11. 23. ~ 2027. 2. 28.</td></tr>
<tr><th>접수기간</th><td colspan="3">2026-11-05 12:00 ~ 2026-11-12 16:00 까지</td></tr>
</table></body></html>`;
const parsed = parseJeonbukPublicDetail(detail);
assert.equal(parsed.location, '전주시');
assert.equal(parsed.employment, '계약직');
assert.match(parsed.category, /경영/);
assert.equal(parsed.postedAt, '2026-11-05');
assert.equal(parsed.deadline, '2026-11-12');
assert.equal(parseJeonbukPublicDetail('접수기간 2026-11-20').deadline, '');
assert.equal(parseJeonbukPublicDetail('접수기간 2026-11-20 마감').deadline, '2026-11-20');
assert.equal(parseJeonbukPublicDetail('접수기간 2026-11-20 까지').deadline, '2026-11-20');
assert.equal(parseJeonbukPublicDetail('접수기간 ~ 2026-11-20').deadline, '2026-11-20');
assert.equal(parseJeonbukPublicDetail('접수기간 2026-11-01, 2026-11-20').deadline, '');
assert.equal(parseJeonbukPublicDetail('접수기간 2026-11-05 ~ 11-12').deadline, '');
assert.equal(parseJeonbukPublicDetail('근무기간 2026-11-23 ~ 2027-02-28').deadline, '');
assert.equal(parseJeonbukPublicDetail('접수기간 1차 2026.11.01 ~ 2026.11.10 / 2차 2026.11.12 ~ 2026.11.20 근무기간 2027-01-01').deadline, '2026-11-20');

const previous = { source: '전북 공공기관', sourcePostingId: '3966', deadlineType: 'fixed', deadlineDate: '2026-11-12' };
async function collected(detailHtml, previousJobs = [previous]) {
  return collectJeonbukPublic({ offsets: [0], previousJobs,
    fetchText: async (url) => url.includes('view_orginfo') ? detailHtml : list.replace('2026-11-12일 까지', ''),
    normalizeJob: (job) => job, sourceCollection: (jobs) => jobs });
}
assert.equal((await collected(''))[0].deadlineDate, '2026-11-12');
assert.equal((await collected(''))[0].sourceListingState, 'deadline_recheck');
assert.equal((await collected('접수기간 2026-11-05 ~ 2026-11-25 (연장)'))[0].deadlineDate, '2026-11-25');
assert.equal((await collected('', [{ ...previous, sourcePostingId: '9999' }]))[0].deadlineDate, '');
assert.equal((await collected('', [{ ...previous, source: '다른 출처' }]))[0].deadlineDate, '');
assert.equal((await collected('', [{ ...previous, deadlineDate: '2026-11-20' }]))[0].deadlineDate, '2026-11-20');

async function withListDeadline(date, detailHtml, fails = false) {
  const jobs = await collectJeonbukPublic({ offsets: [0],
    fetchText: async (url) => {
      if (!url.includes('view_orginfo')) return list.replace('2026-11-12', date);
      if (fails) throw new Error('detail unavailable');
      return detailHtml;
    }, normalizeJob: (job) => job, sourceCollection: (jobs) => jobs });
  return jobs[0];
}
const failedFuture = await withListDeadline('2099-11-20', '', true);
assert.equal(failedFuture.sourceListingState, 'deadline_recheck');
assert.equal(currentListingState(failedFuture).code, 'stale');
assert.equal(currentListingState(await withListDeadline('2020-11-20', '', true)).code, 'expired');
assert.equal((await withListDeadline('2099-11-20', '')).sourceListingState, 'deadline_recheck');
const conflict = await withListDeadline('2099-11-20', '접수기간 2099-11-01 ~ 2099-11-12');
assert.equal(conflict.deadlineDate, '');
assert.equal(conflict.deadlineType, '');
assert.equal(conflict.sourceListingState, 'deadline_recheck');
assert.equal(currentListingState(conflict).code, 'stale');
const extended = await withListDeadline('2099-11-20', '접수기간 2099-11-01 ~ 2099-11-25 (연장)');
assert.equal(extended.deadlineDate, '2099-11-25');
assert.equal(extended.sourceListingState, 'public_detail');
const locationOnly = await withListDeadline('2099-11-20', '근무지역 전주시');
assert.equal(locationOnly.sourceListingState, 'deadline_recheck');
assert.equal(currentListingState(locationOnly).code, 'stale');
for (const [listDate, detailDate] of [['2099-11-20', '2020-11-12'], ['2020-11-20', '2099-11-12']]) {
  const job = await withListDeadline(listDate, `접수기간 ~ ${detailDate}`);
  assert.equal(job.deadlineDate, '');
  assert.equal(job.deadlineType, '');
  assert.equal(job.sourceListingState, 'deadline_recheck');
  assert.equal(currentListingState(job).code, 'stale');
  assert.match(currentListingState(job).reason, /목록·상세 마감일 충돌로 재확인 필요/);
}
const pastListExtended = await withListDeadline('2020-11-20', '접수기간 ~ 2099-11-25 (연장)');
assert.equal(pastListExtended.deadlineDate, '2099-11-25');
assert.equal(pastListExtended.sourceListingState, 'public_detail');
for (const [notice, positive] of [['변경 취소', false], ['추가 없음', false], ['변경 철회', false], ['연장 중단', false], ['중단', false], ['추가모집', true], ['변경', false]]) {
  const job = await withListDeadline('2020-11-20', `접수기간 ~ 2099-11-25 (${notice})`);
  assert.equal(job.sourceListingState, positive ? 'public_detail' : 'deadline_recheck', notice);
  assert.equal(job.deadlineDate, positive ? '2099-11-25' : '', notice);
  assert.equal(currentListingState(job).code, positive ? 'official_listed' : 'stale', notice);
}
for (const [html, positive] of [
  ['접수기간 2099-11-01 ~ 2099-11-30 (제출서류 변경)', false],
  ['접수기간 2099-11-01 ~ 2099-11-30 (면접 일정 변경)', false],
  ['접수기간 2099-11-01 ~ 2099-11-30 (면접 일정 연장)', false],
  ['접수기간 2099-11-01 ~ 2099-11-30 (인터뷰 연장)', false],
  ['접수기간 2099-11-01 ~ 2099-11-30 (근무기간 연장)', false],
  ['접수기간 2099-11-01 ~ 2099-11-30 (공고 내용 변경)', false],
  ['접수기간 2099-11-01 ~ 2099-11-30 (급여 변경)', false],
  ['접수기간 2099-11-01 ~ 2099-11-30 (자격요건 변경)', false],
  ['접수기간 2099-11-01 ~ 2099-11-30 (연장)', true],
  ['접수기간 변경 2099-11-30', true],
  ['접수기간 연장 2099-11-30', true],
  ['모집 마감 연장 2099-11-30', true],
  ['추가모집 2099-11-30', true],
  ['모집 마감 변경 2099-11-30', true],
  ['지원 일정 변경 2099-11-30', true],
  ['채용 기한 변경 2099-11-30', true],
  ['접수기간 2099-11-01 ~ 2099-11-30 (연장, 변경 취소)', false],
  [`접수기간 2099-11-01 ~ 2099-11-30 ${'안내 '.repeat(12)}변경`, false]
]) {
  const job = await withListDeadline('2020-11-20', html);
  assert.equal(parseJeonbukPublicDetail(html).deadlineChanged, positive, html);
  assert.equal(job.sourceListingState, positive ? 'public_detail' : 'deadline_recheck', html);
  assert.equal(job.deadlineDate, positive ? '2099-11-30' : '', html);
  assert.equal(currentListingState(job).code, positive ? 'official_listed' : 'stale', html);
}
const workExtension = await withListDeadline('2099-11-20', '근무기간 연장');
assert.equal(workExtension.sourceListingState, 'deadline_recheck');
assert.equal(currentListingState(workExtension).code, 'stale');
console.log('Jeonbuk public institution parser tests passed');
