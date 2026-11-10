import assert from 'node:assert/strict';
import { parseJeonjuPublicList } from './jeonju-public.mjs';

const row = (num, uid, title, author, posted, deadline) => `<tr>
<td data-cell-header="번호" class="num">${num}</td>
<td class="title"><a href="/planweb/board/view.9is?dataUid=${uid}&&contentUid=x&boardUid=y&page=1">${title}</a></td>
<td>${author}</td><td class="file"><span class="icon_file"></span></td>
<td data-cell-header="작성일" class="date">${posted}</td>
<td data-cell-header="마감일" class="date">${deadline}</td>
<td data-cell-header="조회수" class="views">10</td></tr>`;

const html = `<html><body><table><tbody>
${row('1', 'abc123', '2027년 덕진보건소 청소 기간제근로자 채용 공고', '보건정책', '2026-11-04', '2026-11-11')}
${row('2', 'def456', '최종합격자 발표 공고', '총무과', '2026-11-03', '')}
${row('3', 'ghi789', '전주시설공단 2027년 교통약자 임차택시 사업자 모집 공고', '시설관리공단', '2026-11-02', '2026-11-17')}
${row('4', 'jkl012', '아이월드어린이집 보육교직원 공개채용', '여성아동과', '2026-11-01', '')}
</tbody></table></body></html>`;

const rows = parseJeonjuPublicList(html);
assert.equal(rows.length, 2);
assert.equal(rows[0].title, '2027년 덕진보건소 청소 기간제근로자 채용 공고');
assert.equal(rows[0].company, '보건정책');
assert.equal(rows[0].deadline, '2026-11-11');
assert.match(rows[0].url, /^https:\/\/www\.jeonju\.go\.kr\/planweb\/board\/view\.9is\?dataUid=abc123/);
assert.equal(rows[1].title, '아이월드어린이집 보육교직원 공개채용');

console.log('Jeonju public institution parser tests passed');
