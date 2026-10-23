# 작업 지시: Nicole·Munseong 화면 코드 통합 (2b단계)

작성: 2026-10-23. 이 문서만으로 작업을 시작할 수 있게 썼다. 배경과 이전 결정은 `INTEGRATION_PLAN.md`에 있다.

## 목표 (완료 기준)

`/nicole/`과 `/munseong/`이 **같은 앱 코드 한 벌**로 동작한다. 사람마다 언어·피드·개인 저장소·표시 기능만 다르다. Nicole은 지금 쓰는 기능을 하나도 잃지 않고, 저장해 둔 관심·숨김·직접 추가 공고가 새 화면에 그대로 있다. 옛 Nicole 화면 코드는 되돌리기용 보관 기간 뒤 삭제된다.

중간 단계 하나를 끝낸 것은 진행일 뿐 완료가 아니다. 아래 1~5단계를 차례로 끝까지 진행한다. 단, 5단계의 공개 전환은 사용자 승인 후에만 한다(아래 "승인 경계").

## 정해진 결정

- 화면 언어: Nicole 영어, Munseong 한국어.
- 개인 상태: 사람별로 따로(공유 안 함).
- 기반 코드: `public/munseong/`(기능이 더 많고 E2E 77개로 보호됨). Nicole 고유 기능을 여기로 옮긴다.
- 수집·추천 규칙은 사람별 그대로. 통합 대상은 화면뿐이다.

### 사용자가 바꿀 수 있는 기본값 (바꾸려면 이 문서를 수정)

1. Nicole 화면 상단 브랜드: "DUBU JOB RADAR" → **"Nicole's Job Radar"**.
2. Munseong 전용 기능(지원 예정·지원함, 일괄 처리, 상태 백업·가져오기, 시장 요약)을 **Nicole에게도 모두 표시**. 시장 요약은 해당 탭 공고가 20건 미만이면 접힌 상태로 시작.
3. 디자인: **화면 구조는 하나, 색 테마만 사람별**(Munseong: 지금의 어두운 상단+라임, Nicole: 지금의 밝은 배경+짙은 녹색).

## 현재 상태 (2026-10-23 기준, 확인된 사실)

- 저장소: `C:\Projects\DigitalNomad\job-dashboard` → GitHub `ostrichick/job-search-radar`, 브랜치 `main`. 공개 주소 `https://ostrichick.github.io/job-search-radar/`.
- 주소 구조: `/`와 `/dubu/`는 `/nicole/`로 이동. `/nicole/` = Nicole 화면(`public/nicole/`), `/munseong/` = Munseong 화면(`public/munseong/`). 옛 사이트 `ostrichick/dubu-job-radar`는 `/job-search-radar/nicole/`로 이동만 한다.
- 피드: Munseong `public/jobs.json`(약 3MB, 공고 250여 건, 필드 119개, CI 생성), Nicole `public/feeds/dubu.json`(약 150KB, 공고 40건 안팎, 필드 32개, CI 생성). 로컬 서버는 `/feeds/dubu.json`을 `profiles/dubu/public/jobs.json`에서 제공한다.
- Munseong 앱: `public/munseong/app.js`(약 1,900줄) + 모듈(`render-cards.js`, `filter-rules.js`, `sort-rules.js`, `state-storage.js`, `backup-rules.js`, `manual-job.js`, `compensation-ui.js`, `feed-health.js`, `recommendation-rules.js`, `state-rules.js`, `render-cache.js`). 한글이 든 줄이 약 480개(app.js 234, index.html 161 등).
- Nicole 앱: `public/nicole/app.js`(약 790줄), `state-storage.js`, `feed-health.js`, `styles.css`, `index.html`. 영어 UI.
- 개인 저장소(같은 origin `ostrichick.github.io`):
  - Munseong: IndexedDB `job-search-radar`, 문자열 키-값(`jobFavorites`, `jobHidden`, `jobStates`, `manualJobs`, `trackedJobs`, `jobFiltersByMarket` 등). 그대로 유지한다.
  - Nicole: IndexedDB `dubu-job-radar`, store `state`, key `current` = `{ saved: string[], hidden: { jobs, companies, sources }: string[], manual: Job[], revision }`. 옛 localStorage 키 `nicole-job-radar:*`는 이미 한 번 이전된 원본.
- Nicole 고유 기능(옮겨야 함): Online / In-person 탭, 분야 필터(marketing·advertising·translation·interpreting·content), 언어 적합 배지·필터(`languageFitStatus` match/mismatch), 통근권 3구분(전주·완주 / 익산·김제 등 인근 / 기타 지역), 시·도 필터, 과거 공고(`collectionState` not_seen·unverified) 표시 토글, 저장만 보기, 회사·출처 단위 숨김과 숨김 관리·전체 복원, 직접 추가(온라인/오프라인·분야, URL로 Upwork·KOWORK 출처 인식), 출처 목록과 플랫폼 수동 검색 링크(`sourceStatus`의 `manualSearches`, KOWORK·K-WORK·Hanultari·JOBPLOY), 날짜 4종(Posted / Added to Radar / Last collected / Source last reviewed), 피드 24시간 경고, 다른 탭 동기화.
- 검사: `npm.cmd run check`(단위 테스트, Nicole 수집기 테스트 57개 포함), `npx.cmd playwright test`(E2E 93개: Munseong 77 `tests/e2e/daily-workflow.spec.mjs`, Nicole 16 `tests/e2e/dubu.spec.mjs`). 모두 통과 상태.
- 배포: `main`에 push하면 `.github/workflows/pages.yml`이 검사·E2E·수집 후 Pages 배포(약 10분). 봇이 6시간마다 `docs/jobs.json`, `profiles/dubu/public/jobs.json`을 커밋하므로 push 전에 항상 `git fetch` 후 `git rebase origin/main`.

## 작업 순서

각 단계는 따로 커밋·배포할 수 있어야 한다. 1~4단계 동안 공개 `/nicole/`은 바뀌지 않는다. 새 통합 화면의 Nicole 버전은 **`/nicole-next/`**에서 개발·검증한다(전환 메뉴에는 노출하지 않음).

1. **사람 설정과 Nicole 피드 변환기 (화면 변화 없음)**
   - 사람 설정 하나(`profiles.js` 등): id, 표시 이름, 언어, 피드 주소, IndexedDB 이름, 시장 탭 이름, 기능 켜기/끄기, 색 테마.
   - Nicole 피드(`feeds/dubu.json`) → 공통 형식 변환기: `market` online→`marketScopes:['overseas_remote']`, offline→`['domestic']`, 언어 적합도·지원 자격·`collectionState`·날짜 필드를 공통 필드나 공통 표시로 매핑. 정보가 없으면 지어내지 말고 미상으로 둔다.
   - 단위 테스트: 실제 `profiles/dubu/public/jobs.json` 전체가 변환 후 `validatePublicFeed`를 통과.
   - Munseong이 사람 설정을 읽게 바꾸되 동작은 그대로. E2E 77개 통과.
2. **문구 다국어 분리**
   - Munseong의 한국어 문구(JS + index.html)를 한국어 사전으로 옮기고 영어 사전 작성. 같은 markup을 두 경로에서 쓰는 방법(공용 템플릿 + 생성, 또는 동일 파일 + 동기화 검사 등)은 가장 단순한 것을 고른다.
   - 검증: 한국어 E2E 77개 통과, `/nicole-next/`에서 공고 데이터 외 한글이 화면에 남지 않는지 자동 검사 1개.
3. **Nicole 기능 이식**: 위 "Nicole 고유 기능"을 모두 통합 화면에 구현. Nicole 데이터에 없는 패널(지급 신뢰, 검증 이력 등)은 자동 숨김. 기본값 1~3 적용.
   - 검증: `tests/e2e/dubu.spec.mjs`의 시나리오를 `/nicole-next/` 기준으로 옮겨 통과. 390px에서 가로 넘침 없음, Munseong 첫 카드 위치 기준(1100px 미만) 유지.
4. **Nicole 개인 상태 이전**
   - `/nicole-next/` 첫 실행 때 `dubu-job-radar`의 `current`를 읽어 Nicole용 새 DB(예: `job-search-radar-nicole`)로 변환: saved→관심, hidden.jobs→숨김, hidden.companies/sources→회사·출처 숨김, manual→직접 추가. 변환 완료 표시를 남겨 한 번만 실행. 원본 DB는 읽기만 한다.
   - 검증: 실제와 같은 모양의 상태로 변환 테스트, 원본 DB가 그대로인지 확인, 변환 실패 시 화면이 원본을 지우지 않고 안내하는지 확인.
5. **전환 (사용자 승인 후)**
   - 승인 요청 시 `/nicole-next/` 공개 주소, 데스크톱·390px 스크린샷, 빠진 기능이 없는지 비교 목록을 함께 보낸다.
   - 승인되면 `/nicole/`을 통합 화면으로 바꾸고, 옛 화면은 `/nicole-classic/`에 보관(메뉴 비노출). `/nicole-next/`는 `/nicole/`로 이동.
   - 공개 사이트를 실제 브라우저(데스크톱·390px)로 확인. 사용자가 보관 기간 종료를 확인하면 옛 Nicole 코드·테스트를 삭제.

## 하지 말 것

- 수집기·규칙 변경: `scripts/collect-jobs.mjs`, `scripts/source-adapters.mjs`, `scripts/normalize-job.mjs`, `profiles/dubu/scripts/*`. 화면 통합에 꼭 필요한 피드 필드가 없으면 변환기에서 처리하고, 수집기 변경이 정말 필요하면 이유와 함께 보고만 한다.
- 실제 사용자 브라우저의 IndexedDB(`job-search-radar`, `dubu-job-radar`)를 열거나 지우거나 쓰기. 검증은 Playwright의 격리 브라우저에서만.
- 승인 전 공개 `/nicole/` 변경, 주소 구조(`/`, `/nicole/`, `/munseong/`, `/dubu/`) 변경.
- 강제 push, 이력 재작성, 봇 커밋 되돌리기.
- 새 프레임워크·번들러·서버 도입, 화면을 위한 새 빌드 체계(꼭 필요하면 가장 작은 스크립트 하나), 같은 내용을 반복 검증하는 테스트·보고서 추가.
- 두 사람의 관심 목록 공유, 추천 규칙 통합.

## 작업 방식

- Windows PowerShell 기준. npm은 `npm.cmd`, Playwright는 `npx.cmd`. 임시 파일은 커밋하지 말고 정리.
- 검사는 변경 범위에 맞게 고른다. 단계 마무리 때는 `npm.cmd run check`와 전체 E2E를 한 번 돌린다. 이미 통과한 검사를 이유 없이 반복하지 않는다.
- 커밋은 단계·목적별로 묶고, 메시지는 무엇이 사용자에게 바뀌는지 적는다.
- 외부 장애(GitHub Actions 대기, 네트워크 등)는 원인과 재시도 조건을 한 번 기록하고, 할 수 있는 다른 작업을 계속한다.
- 진행할 때마다 `INTEGRATION_PLAN.md`의 "진행 상태"에 단계 완료와 커밋 해시를 한 줄로 남긴다.

## 승인 경계

- 사용자 승인 없이 해도 됨: 1~4단계 구현, 커밋, `main` push(공개 `/nicole/`과 `/munseong/` 동작이 그대로인 한), `/nicole-next/` 배포.
- 반드시 승인 후: 5단계 전환, 옛 Nicole 코드 삭제, 위 "하지 말 것"에 해당하는 변경.

## 완료 보고 (단계별 + 최종)

- 사용자가 새로 할 수 있게 된 것(한두 줄).
- 커밋 해시와 배포 결과(Actions 성공·실패, 공개 주소 확인 여부).
- 검증 결과를 범위별로 구분: 단위·E2E(로컬), 공개 사이트 실제 브라우저 확인, 확인하지 못한 것.
- 남은 일, 막힌 일과 재시도 조건, 사용자 결정이 필요한 것.
- 실패를 성공으로 쓰지 않는다. 코드만 바뀐 것, 배포됐지만 확인 못 한 것, 확인 완료된 것을 구분한다.
