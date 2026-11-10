import assert from 'node:assert/strict';
import { parseJbnuPublicDetail, parseJbnuPublicList } from './jbnu-public.mjs';
import { parseJjuPublicDetail, parseJjuPublicList } from './jju-public.mjs';

const jbnu = `<table><tbody>
<tr class="tr-normal"><td><p class="brd-num">1</p></td><td><div class="tag-type-01">직원채용</div></td><td><div class="tag-type-02 type-01">진행</div></td><td class="td-title"><a href="javascript:;" class="title" onclick="pf_DetailMove('219635')">전북대 RISE사업단 기간제 계약직원 채용시험 재공고</a><ul class="etc-list"><li>2026-11-10</li><li class="view-cnt">8</li></ul></td><td><p class="brd-writer">전북대RISE사업단</p></td></tr>
<tr class="tr-normal"><td><p class="brd-num">2</p></td><td><div class="tag-type-01">직원채용</div></td><td><div class="tag-type-02 type-02">마감</div></td><td class="td-title"><a href="javascript:;" class="title" onclick="pf_DetailMove('219476')">대학원생 모집</a></td></tr>
</tbody></table>`;
const jbnuRows = parseJbnuPublicList(jbnu);
assert.equal(jbnuRows.length, 1);
assert.equal(jbnuRows[0].title, '전북대 RISE사업단 기간제 계약직원 채용시험 재공고');
assert.equal(jbnuRows[0].department, '전북대RISE사업단');
assert.equal(jbnuRows[0].postedAt, '2026-11-10');
assert.match(jbnuRows[0].url, /Board\/219635\/detailView/);

const jbnuDetail = parseJbnuPublicDetail('<div>진행 2026-11-10 ~ 2026-12-31</div><div>접수기간 : 2026. 11. 11.(수) ~ 11. 16.(월) 18:00</div>');
assert.equal(jbnuDetail.deadline, '2026-12-31');

const jju = `<table><tbody>
<tr><td>231</td><td class="b-td-title"><a class="b-title" data-article-no="535238" href="?mode=view&amp;articleNo=535238&amp;article.offset=0&amp;articleLimit=10"><span class="b-status color01">[접수중]</span> 전주대학교 계약직원 채용 공고-재무지원실</a></td><td>총무지원실</td><td>2026-11-09</td></tr>
<tr><td>230</td><td class="b-td-title"><a class="b-title" data-article-no="534601" href="?mode=view&amp;articleNo=534601"><span class="b-status color02">[접수마감]</span> 전주대학교 계약직원 채용 공고-대학일자리플러스센터</a></td><td>총무지원실</td><td>2026-10-27</td></tr>
</tbody></table>`;
const jjuRows = parseJjuPublicList(jju);
assert.equal(jjuRows.length, 1);
assert.equal(jjuRows[0].title, '전주대학교 계약직원 채용 공고-재무지원실');
assert.equal(jjuRows[0].department, '총무지원실');
assert.equal(jjuRows[0].postedAt, '2026-11-09');
assert.match(jjuRows[0].url, /^https:\/\/jj\.ac\.kr\/jj\/community\/notice07\.do\?mode=view&articleNo=535238/);

const jjuDetail = parseJjuPublicDetail('<div>작성일 : 2026-11-09</div><div>접수기간 : 2026-11-09 ~ 2026-11-15</div>');
assert.equal(jjuDetail.postedAt, '2026-11-09');
assert.equal(jjuDetail.deadline, '2026-11-15');

console.log('university public institution parser tests passed');
