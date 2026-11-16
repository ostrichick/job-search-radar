# Job Dashboard 데이터 흐름과 소유권

두 사용자 화면은 `public/munseong/app.js`와 `feed-client.js`를 공유하지만 수집기, 서버 피드, 개인 브라우저 저장소는 구분한다. 파일 이름이 비슷하다고 병합하거나 지우지 않는다.

| 위치 | 용도 및 소유권 | 갱신 경로 |
| --- | --- | --- |
| `data/jobs.json` | Munseong 로컬 서버의 최신 피드 (Git 제외) | `collectJobs()` / `POST /api/refresh` |
| `docs/jobs.json` | Munseong 배포용 이력 기준선 (Git 추적) | CI의 `format-feed-baseline.mjs` |
| `public/jobs.json` | Munseong 정적 사이트에 공개되는 피드 (Git 제외) | CI의 `build-static.mjs` |
| `profiles/dubu/public/jobs.json` | Nicole의 Git 추적 이력 기준선 | CI의 Nicole 수집기와 기준선 커밋 |
| `data/nicole-jobs.json` | Nicole 로컬 서버 캐시 (Git 제외) | 로컬 `POST /api/refresh?profile=nicole` 또는 6시간 자동 갱신 |
| `public/feeds/dubu.json` | Nicole 정적 사이트에 공개되는 피드 (Git 제외) | CI가 Nicole 기준선을 복사 |

## 로컬 서버

`npm start`로 실행하는 `local-server.mjs`는 `127.0.0.1:4317`에서만 요청을 받는다. Munseong은 `/api/jobs`에서 로컬 피드를 읽고, Nicole은 `/feeds/dubu.json`에서 `data/nicole-jobs.json`을 읽는다. Nicole 캐시가 없거나 파싱할 수 없으면 Git 추적 기준선 `profiles/dubu/public/jobs.json`을 제공한다. Nicole 캐시의 수집 결과는 기준선 파일을 직접 수정하지 않는다.

새로고침 버튼은 로컬에서 각각 `POST /api/refresh` 및 `POST /api/refresh?profile=nicole`을 호출한다. 수집 실패 시 화면은 마지막으로 읽을 수 있는 피드로 돌아가고 오류 안내를 표시한다. 로컬에서 실패했다고 배포 사이트의 기준선을 덮어쓰지 않는다. 두 POST 경로는 동일 출처 검사를 거친다.

## 정적 배포 및 브라우저 저장소

GitHub Pages에서는 서버 API를 호출하지 않으며, 새로고침 버튼은 배포된 각자의 정적 JSON을 다시 읽는다. CI는 `pages.yml`에서 Munseong 피드와 Nicole 피드를 각각 만들고 공개한다. 라이브 피드 생성 명령은 네트워크 수집과 파일 기록을 수반하므로 읽기 전용 검증에는 `npm run check`, `npm run test:static` 또는 격리된 fixture 출력 경로를 사용한다.

개인 저장 상태는 두 화면이 서로 다른 IndexedDB를 사용한다. Nicole의 기존 `dubu-job-radar` 자료를 새로운 `job-search-radar-nicole`로 옮기는 브라우저 마이그레이션 코드와 레거시 주소 리다이렉트는 보존한다. JSON 피드 정리 과정에서 IndexedDB, 백업, 이전 형식의 상태 데이터를 삭제하지 않는다.

## 유지보수 경계

- 공유할 수 있는 로직: 원자적 JSON 기록(`scripts/file-storage.mjs`), 프로필별 피드 요청(`public/munseong/feed-client.js`).
- 유지할 별도 로직: 사람별 수집·검증·이력 정책, 정적 배포 기준선, 로컬 런타임 캐시 및 IndexedDB 마이그레이션.
- 코드 분리 후보: `scripts/collect-jobs.mjs`의 사이트별 목록 파서와 상세 파서. 각 파서의 기존 fixture·회귀 검사가 준비된 단위부터 별도 모듈로 옮기고, 이번 작업에서 검증하지 않은 대규모 일괄 이동은 피한다.
