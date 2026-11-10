# 우리 집 지원금 레이더 (로컬 MVP)

- 경로: `public/household/` (GitHub Pages의 프로젝트 경로를 고려해 링크는 모두 상대경로)
- 실행: 프로젝트 폴더에서 `npm start`, 브라우저에서 `/household/` (기존 정적 E2E 서버에서는 포트 4321)
- 기존 `/nicole/`, `/munseong/` 구직 상태는 유지. 이 페이지는 `jeonju-household-support-v1` IndexedDB의 `household/current` 레코드만 사용함.
- 개인 출생연도·소득·재산·비자 관련 상세값은 **공개 JSON/JS에 포함하지 않음**. 사용자가 선택적으로 입력한 값만 브라우저에 보관. 계좌번호·등록번호·상세 주소 수집 없음.
- 입력값이 없는 조건은 `unknown`으로 취급하며 사업별 자동 수급 판정은 수행하지 않음.

## 데이터 업데이트

`public/household/data/programs.json`의 `programs`를 편집합니다. 현재는 수집 자동화 없이 공식 자료를 대조한 54건을 표시합니다. `researchedAt`과 개별 `verifiedAt`은 **각 자료를 원문에서 실제 확인한 날짜에만** 변경합니다. 자동으로 오늘 날짜로 덮어쓰지 않습니다. 지난 모집은 종료 이력으로 남기며, 새 회차는 별도 공고 ID로 추가합니다. 종료된 카드는 회색(`.is-closed`)으로 표시됩니다.

프로그램에는 안정적인 `id`, 분야 `category`, 관할, 대상, 단위가 포함된 혜택 `value`, `start` / `end` / `periodType`, 요건 `conditions`, 확인 질문 `questions`, 공식 `officialUrl`, 신청 `applyUrl`, 근거 날짜 `verifiedAt`, 출처 해석 `sourceNote`가 필요합니다. `periodType: ongoing`은 **제도 소개가 상시 게시됨**이라는 의미이며 실제 모집 중이거나 자격이 확정되었다는 뜻이 아닙니다. 모집기간이 명시된 공고는 `periodType: dated`를 사용합니다.

공식 자료: 고용24(국민취업지원·내일배움카드), 국세청(2025 귀속 근로장려금·월세공제), 마이홈·보건복지부(주거·생계급여), 전주시청(2026 청년월세·공공임대 보증금·전세대출 이자·전주사랑상품권 추가 캐시백), 전주시가족센터(결혼이민자 취업지원 사업 영역). 각 카드의 공식 링크에서 확인할 수 있습니다. 종전 회차의 지원금액을 차기 모집에 그대로 적용하지 마세요.

## 백업·검증

JSON 백업에는 선택 입력한 개인정보, 관심·신청 메모, 상태가 모두 포함됩니다. 동일 브라우저/프로필에서만 로컬 저장이 유지되고 기기 간 동기화는 되지 않습니다. 백업 가져오기는 기존 **가구** 기록만 교체하며 확인창을 거칩니다. 민감한 JSON은 공개 저장소에 업로드하지 마세요.

`npm run check`로 기존 단위·정적 검사, `npx playwright test tests/e2e/household.spec.mjs`로 신규 화면/상태 복원/백업/모바일 검사를 수행합니다. 로컬 PC에 Playwright 번들 브라우저가 없다면 `HOUSEHOLD_BROWSER_PATH` 환경변수에 Chromium 호환 브라우저 실행 파일을 지정할 수 있습니다. 배포·push는 사용자 별도 승인 범위입니다.
