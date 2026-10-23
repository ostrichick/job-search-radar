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
- 남은 일: 2b(화면 코드 통합)는 선택.

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

### 2b단계: 화면 코드까지 하나로 (선택, 나중에)

- 헤더에 사람 전환. URL `?p=me` / `?p=dubu`로 공유·새로고침 시 유지.
- 사람마다 자기 피드만 불러온다(아내는 약 150KB만 받음).
- Dubu 피드를 화면 공통 형식으로 바꾸는 어댑터(offline→domestic, online→overseas_remote, 언어 적합도→요건 확인 항목 등).
- 화면 문구를 한국어/영어 사전으로 분리. 사람별 기본 언어.
- 개인 상태를 사람별 저장 공간으로 분리. 아내 첫 실행 시 `dubu-job-radar` DB를 읽어 변환.
- 검증: 기존 E2E 77개 + Dubu E2E 핵심 시나리오를 통합 화면 기준으로 이전, 390px 모바일 확인.

### 3단계: 정리

- ~~옛 Dubu 사이트를 새 주소 안내 페이지로 교체하고 Dubu 저장소의 정기 수집 중지.~~ 2a와 함께 완료.
- ~~공통 4개 출처를 한 번만 호출하고 사람별 규칙으로 나눔.~~ 완료(응답 공유 방식).
- 상위 DigitalNomad 저장소의 `nicole-job-radar`는 이전 완료 표시 후 정리.

## 하지 않는 것

- 두 사람의 추천 규칙을 하나로 합치지 않는다. 사람별 규칙은 그대로 유지한다.
- 이력 재작성이나 강제 push는 하지 않는다.
