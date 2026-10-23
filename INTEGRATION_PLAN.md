# Job Search Radar + Dubu 통합 계획 (2026-10-22)

## 결정 사항

- 화면: 한 사이트, 상단에서 사람 전환(나 / 아내). 두 피드의 실제 공고는 0건 겹침.
- 언어: 사람별. 나는 한국어, 아내는 영어(현재 Dubu와 동일).
- 개인 상태(관심·숨김·지원 상태·직접 추가): 사람별로 따로 저장.
- 저장소·주소: `ostrichick/job-search-radar`로 합침. 기존 주소와 피드 이력·자동 갱신 유지.

## 현재 상태

| | Job Search Radar | Dubu |
|---|---|---|
| 공고 / 필드 | 252개 / 119개 (약 3MB) | 34개 / 32개 (약 150KB) |
| 화면 | 한국어, 국내·해외 원격 | 영어, offline·online |
| 수집기 | `scripts/collect-jobs.mjs` 등 | `scripts/collect.mjs`, `rules.mjs` 등 |
| 개인 상태 | IndexedDB `job-search-radar` | IndexedDB `dubu-job-radar` |
| 공통 출처 | Remotive, Jobicy, Remote OK, Arbeitnow | 같음 |

두 사이트 모두 `ostrichick.github.io`에 있어 IndexedDB가 같은 origin이다. 통합 사이트는 기존 아내 상태 DB를 직접 읽어 변환할 수 있다(백업 파일 불필요). 원본 DB는 지우지 않는다.

현재 두 저장소가 각각 Remotive API를 6시간마다 호출해 하루 8회가 된다. Remotive 권장 최대치는 하루 4회이므로 통합 수집으로 해결한다.

## 진행 상태 (2026-10-23)

- 1단계 완료: `65315bd`. 정기 수집이 `feeds/dubu.json`을 공개하고 Dubu 기준선을 자동 커밋함.
- 2a단계 완료: `a6d67de`. 공개 사이트 `/dubu/`에서 공고 39건 표시, 데스크톱·390px 모두 가로 넘침·브라우저 오류 없음, 전환 양방향 동작 확인.
- 옛 `dubu-job-radar`: `64a7343`부터 안내 페이지만 배포(하위 경로 포함 새 주소로 이동), 정기 수집과 별도 피드 점검 제거.
- 공통 출처 단일 호출: CI에서 메인 수집이 Remotive·Jobicy·Remote OK·Arbeitnow 응답(실패 포함)을 `SHARED_RESPONSE_DIR`에 기록하고 Dubu 수집이 재사용. 각 API는 수집당 1회(하루 4회). 주소는 `scripts/shared-responses.mjs` 한 곳에서 관리(Remotive는 500건으로 통일). Dubu 전용 Jobicy 검색 3건은 별도 호출 유지. 로컬 실행은 각자 호출.
- 이름·주소 변경(2026-10-23): 전환 메뉴 `Nicole / Munseong`. 첫 주소는 Nicole(`/nicole/`)로 이동, Munseong은 `/munseong/`, 예전 `/dubu/`는 `/nicole/`로 이동. 내부 수집기 경로(`profiles/dubu`, `feeds/dubu.json`)는 그대로.
- 2b 1단계 완료: `38132db`. 사람별 설정과 Nicole 기준선 39건 공통 피드 변환·검증.
- 2b 2단계 완료: `a6d1753`. 공통 앱의 영어 UI 사전과 동적 화면 문구 번역 준비.
- 2b 3단계 완료: `6ca841a`. `/nicole-next/` 영어 화면, Nicole 고유 필터·통근권·숨김 관리·직접 추가·출처 링크와 개인 DB 읽기 전용 이전 구현. 공개 `/nicole/` 보존.
- 2b 4단계 완료: `289dc74`. 원본 `dubu-job-radar` 보존, 1회 상태 이전 및 장애 경로를 격리된 E2E로 검증. 로컬 `npm.cmd run check` 통과, E2E 103/103 통과(기존 Munseong 77·Nicole classic 16·Nicole next 10).
- 2b 승인 전 카드 표현 보정: `e94f0c9`. Nicole의 영어 보수·지원범위·우선순위 표기와 불필요한 거리 표시 수정. Nicole 새 E2E 10/10 통과, GitHub Actions 빌드·전체 E2E·Pages 배포 성공, 공개 1440px·390px 브라우저 확인 완료. 승인 비교 자료는 `docs/PHASE2B_APPROVAL.md`.
- 2b 5단계 완료(사용자 승인 후): `70e1f76`. `/nicole/`에 공통 영어 화면 적용, `/nicole-classic/`에 옛 UI·코드 보관, `/nicole-next/`는 `/nicole/`로 이동. `npm.cmd run check`와 전체 Playwright 104/104 통과, [Actions 39937926682](https://github.com/ostrichick/job-search-radar/actions/runs/39937926682)에서 빌드·테스트·Pages 배포 성공. 공개 사이트 1440px·390px에서 Nicole/Munseong/classic 모두 공고 렌더링, 오류·수평 넘침 없음; `/`·`/dubu/`와 preview 이동 확인. 실제 사용자 IndexedDB 접근 없이 격리 브라우저로 이전 검증. **옛 코드 삭제는 별도 보관 기간 종료 확인 후에만 실행.**
- 옛 Nicole 화면 제거(2026-10-23, 사용자 확인): `public/nicole-classic/` 코드와 classic E2E 삭제, `/nicole-classic/`은 `/nicole/`로 이동. 원본 IndexedDB `dubu-job-radar`와 새 화면의 1회 이전 코드는 유지(아직 새 화면을 열지 않은 기기의 목록 이전용). 피드 상태 검사 모듈은 `public/nicole/feed-health.js`로 옮김.

## 단계

### 1단계: 수집 통합 (화면 변경 없음)

- Dubu 수집기·설정·단위 테스트를 `profiles/dubu/`로 옮긴다(상위 DigitalNomad 저장소의 최신본, 공개 Dubu 저장소보다 수정 1개 앞섬). 규칙 로직은 바꾸지 않는다.
- 배포 워크플로가 두 수집기를 모두 실행하고 `public/feeds/dubu.json`을 공개한다. 기존 `public/jobs.json`은 유지. Dubu 수집 전체 실패는 경고만 남기고 마지막 정상 피드를 공개한다.
- Dubu 피드 이력 기준선은 `profiles/dubu/public/jobs.json`(CI가 갱신·커밋). 공개 Dubu 저장소의 최신 피드에서 시작.
- 새 피드가 공개된 뒤 옛 Dubu 사이트가 새 피드를 읽게 바꾸고 Dubu 저장소의 정기 수집을 끈다. 그 전까지 두 곳에서 잠시 중복 수집한다.
- 검증: Dubu 단위 테스트 57개를 이 저장소의 `npm run check`에 포함, 공개 피드 상태 점검에 Dubu 피드 추가.

### 2a단계: 한 사이트 + 공통 전환 메뉴 (2026-10-23 결정, 먼저 진행)

- Dubu 화면을 `public/dubu/`로 옮겨 `/job-search-radar/dubu/`에서 제공. 피드는 `../feeds/dubu.json`.
- 두 화면 상단에 `Asul / Dubu` 전환. 각자 언어·기능·디자인 유지.
- 같은 origin이므로 아내의 IndexedDB `dubu-job-radar` 상태가 새 주소에서 그대로 보인다(변환 불필요).
- 휴대폰에서는 Asul 화면의 장식용 영문 소제목 자리에 전환 메뉴를 넣어 첫 카드 위치 기준(1100px 미만)을 유지.
- Dubu E2E 14개를 이 저장소로 옮기고 전환 테스트 1개 추가(전체 E2E 92개).
- 이후 옛 `dubu-job-radar` 사이트는 새 주소 안내로 바꾸고 정기 수집을 끈다.

### 2b단계: 화면 코드 통합 계획 (2026-10-23 작성, 착수 전)

실행용 작업 지시(현재 상태, 하지 말 것, 승인 경계, 보고 형식 포함)는 [`HANDOFF_PHASE2B.md`](./HANDOFF_PHASE2B.md)에 있다.

#### 목표

- 앱 하나가 두 사람을 그린다. 주소는 그대로 `/nicole/`, `/munseong/`이고 두 페이지는 같은 앱을 사람 설정만 바꿔 불러온다.
- 사람별로 다른 것: 화면 언어(Nicole 영어, Munseong 한국어), 피드, 개인 상태 저장소, 수집·추천 규칙(수집기 결과 그대로), 표시할 기능.
- 공통: 카드·필터·상세·백업·일괄 처리·숨김 되돌리기·여러 탭 동기화·피드 상태 경고.
- 기반은 Munseong 앱. 기능이 더 많고 E2E 77개로 보호된다. Nicole 앱의 고유 기능을 옮긴다.

#### 두 화면 비교와 통합 후 모습

| 영역 | Munseong | Nicole | 통합 후 |
|---|---|---|---|
| 시장 탭 | 해외·원격 / 국내 | Online / In-person | 데이터는 하나의 구분(overseas_remote / domestic)으로, 이름만 사람별 |
| 지역 | 시·도 / 시군구 / 동, 거리 | 전주·완주 / 인근 / 기타 지역, 시·도 | 공통 지역 필터 + Nicole의 통근권 3구분을 배지·필터로 |
| 필터 | 검색·출처·지원 범위·보수·상태·고급 | 검색·분야·과거 공고·언어 적합·저장만 | 공통 필터 + 언어 적합 필터 |
| 개인 상태 | 관심·지원 예정·지원함·확인함·숨김(공고) | 저장·숨김(공고/회사/출처) | Munseong 모델 + 회사·출처 숨김과 복원 관리 |
| 직접 추가 | 제목·URL·회사 등 | + 온라인/오프라인·분야, Upwork·KOWORK 출처 인식 | 하나의 폼, 출처 인식 공통 |
| 상세 | 판단 근거 5축, 검증 이력, 지급 신뢰 | 카드 안 정보 행(언어·자격·날짜) | 공통 상세, 데이터가 없는 패널은 자동 숨김 |
| 출처 | 출처 상태·수집 범위 패널 | 출처 목록 + 플랫폼 수동 검색 링크(KOWORK, Upwork 등) | 공통 패널 + 수동 검색 링크 영역 |
| 날짜 | 게시일·마감 | 게시일 / 레이더 등록 / 마지막 수집 / 원문 검토 | Nicole의 날짜 구분을 공통으로 |
| 백업·일괄 처리·시장 요약 | 있음 | 없음 | 두 사람 모두 사용 |
| 저장소 | IndexedDB `job-search-radar`(키-값) | IndexedDB `dubu-job-radar`(문서) | 사람별 DB. Munseong은 기존 DB 유지, Nicole은 새 DB로 1회 변환 |

#### 진행 단계 (5단계 승인·전환 완료, classic 보관 중)

1. **사람 설정과 피드 변환기 (화면 변화 없음)**
   - `profiles.js`: 사람별 이름·언어·피드 주소·저장소 이름·시장 탭 이름·기능 켜기/끄기.
   - Dubu 피드를 공통 형식으로 바꾸는 변환기(market→marketScopes, 언어 적합도→요건 확인 항목, collectionState→모집 확인 상태 등). 실제 Dubu 기준선 피드 전체가 `validatePublicFeed`를 통과하는지 단위 테스트.
   - Munseong 앱이 사람 설정을 읽게 바꾼다(값은 지금과 같음). 검증: 기존 E2E 77개 그대로 통과.
2. **화면 문구 다국어 분리**
   - 한국어 문구 약 440줄(app.js, render-cards.js, index.html 등)을 한국어 사전으로 옮기고 영어 사전 작성.
   - 검증: 한국어 E2E 77개 통과 + 영어로 열었을 때 공고 데이터 외 한글이 남지 않는지 자동 검사.
3. **Nicole 기능 이식**
   - 언어 적합 배지·필터, 통근권 구분, 회사·출처 숨김과 복원 관리, 플랫폼 수동 검색 링크, 날짜 4종, 과거 공고 보기, 직접 추가 시 Upwork·KOWORK 인식.
   - 데이터가 없는 패널(지급 신뢰, 검증 이력)은 자동으로 숨김.
   - 검증: Nicole E2E 14개를 새 화면 기준으로 다시 작성해 통과, 390px 모바일 첫 카드 위치 기준 유지.
4. **Nicole 개인 상태 이전**
   - 새 화면 첫 실행 때 `dubu-job-radar`의 문서를 읽어 변환: 저장→관심, 숨긴 공고→숨김, 숨긴 회사·출처→숨김 규칙, 직접 추가→직접 추가(형식 변환). 원본은 그대로 두고 변환은 한 번만.
   - 검증: 실제와 같은 형태의 상태로 변환 테스트. 변환 실패 시 원본을 유지하고 안내.
5. **전환**
   - `/nicole/`을 새 앱으로 교체하고, 옛 Nicole 화면은 `/nicole-classic/`에 한동안 보관해 문제가 생기면 되돌린다.
   - 공개 사이트를 데스크톱·390px로 확인하고, 격리된 브라우저에서 상태 변환을 확인(실제 사용자 데이터는 열거나 바꾸지 않음).
   - 옛 Nicole 코드와 테스트는 보관을 유지하고, 사용자가 보관 기간 종료를 별도로 확인한 뒤에만 삭제한다.

#### 위험과 대응

- Munseong 화면이 깨질 위험: 모든 단계에서 기존 E2E 77개 유지.
- 번역 누락: 영어 화면의 한글 잔존 자동 검사.
- Nicole 저장 목록 손실: 원본 DB 보존, 변환 1회 기록, `/nicole-classic/`로 되돌리기.
- 모바일 화면 밀림: 첫 카드 위치 기준(1100px 미만) 테스트 유지.

#### 범위 밖

- 수집·추천 규칙 통합(사람별 유지).
- 두 사람의 관심 목록 공유(각자 따로 유지하기로 결정).

#### 착수 전에 정할 것

1. Nicole 화면 상단 브랜드: 지금 "DUBU JOB RADAR"를 Nicole 이름으로 바꿀지.
2. Munseong 전용 기능(지원 예정·지원함, 일괄 처리, 백업, 시장 요약)을 Nicole에게도 모두 보일지. 제안: 모두 보이되 시장 요약은 공고가 적으면 접힌 상태로.
3. 디자인: 구조는 하나로 하되 사람별 색 테마만 다르게 할지(제안), 한쪽 디자인으로 완전히 통일할지.

### 3단계: 정리

- ~~옛 Dubu 사이트를 새 주소 안내 페이지로 교체하고 Dubu 저장소의 정기 수집 중지.~~ 2a와 함께 완료.
- ~~공통 4개 출처를 한 번만 호출하고 사람별 규칙으로 나눔.~~ 완료(응답 공유 방식).
- 상위 DigitalNomad 저장소의 `nicole-job-radar`는 이전 완료 표시 후 정리.

## 하지 않는 것

- 두 사람의 추천 규칙을 하나로 합치지 않는다. 사람별 규칙은 그대로 유지한다.
- 이력 재작성이나 강제 push는 하지 않는다.
