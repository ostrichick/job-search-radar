# 등재 기준 (강의·복지 정보)

공식 안내 페이지가 "존재한다"는 이유만으로 등재하지 않는다. **실제로 신청·수강할 수 있었던 근거**가 있을 때만 등록한다.

## 강의 (`public/classes/data/*.json`)

- `courses`: 접수 중(`open`)·접수 예정(`upcoming`)이거나, 최근 6개월 안에 실제 모집·수강이 있었던 과정(`closed` = 모집 기간 아님, `past` = 종료).
- 각 항목은 `enrollment` 상태를 갖는다. 6개월이 지난 종료 과정은 목록에서 제거한다.
- `selfStudy`: 특정 모집 기간 없이 언제든 쓰는 자습용 사이트·자료. 정규 강좌와 섞지 않고 `SELF-STUDY` 섹션에만 둔다.
- 일정·비용·신청 경로가 카드에 구체적으로 적히지 않으면 등재하지 않는다(기관 소개·보도자료만 있는 페이지 제외).

## 복지·지원사업 (`public/household/data/programs.json`)

- `periodType: dated`: `end`가 오늘 이후이거나, 최근 6개월 안에 마감된 모집만 유지한다. 6개월을 넘긴 종료 모집은 제거한다.
- `periodType: ongoing`: 지금도 신청 가능한 법정 급여·상시 서비스만 둔다. 단순 제도 소개(자동 적용 안내 등)는 실제 신청 창구와 금액이 확인될 때만 유지한다.
- `applyUrl`이 없으면 `officialUrl`에서 신청 방법(주민센터·복지로 등)이 확인되어야 한다.

## 검증 루틴

1. `officialUrl`/`applyUrl`을 열어 접수 기간·모집 상태를 확인한다.
2. `verifiedAt`을 확인 날짜로 갱신하고, `sourceNote`에 근거(공고명·기간)를 적는다.
3. 확인되지 않은 항목은 추정으로 남기지 말고 제거한다.
4. `npx playwright test tests/e2e/classes.spec.mjs tests/e2e/household.spec.mjs`로 건수·필터 동작을 확인한다.
