import assert from 'node:assert/strict';
import { parseJeonbukPublicDetail, parseJeonbukPublicList } from './jeonbuk-public.mjs';

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

console.log('Jeonbuk public institution parser tests passed');
