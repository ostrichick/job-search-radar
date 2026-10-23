# Nicole·Munseong 공통 화면 2b단계 — 5단계 전환 승인 자료

2026-10-23. **1~4단계 코드 및 로컬 검증 완료 / 5단계 전환 승인 대기.**

미리보기: https://ostrichick.github.io/job-search-radar/nicole-next/

- **데스크톱 1440×900**: [공개 미리보기 캡처](./phase2b/nicole-next-desktop-1440.png)
- **모바일 390×844**: [공개 미리보기 캡처](./phase2b/nicole-next-mobile-390.png)
- **데스크톱 공고 카드**: [카드 화면 캡처](./phase2b/nicole-next-desktop-cards-1440.png)
- **모바일 공고 카드**: [카드 화면 캡처](./phase2b/nicole-next-mobile-cards-390.png)

캡처 4장은 후속 문구·거리 표시 보정 `e94f0c9`의 **배포 성공 이후 공개 `/nicole-next/`** 주소를 독립된 Playwright 브라우저에서 열어 촬영했다.

이 화면은 `public/munseong/app.js`와 공통 모듈로 동작한다. Nicole은 영어, 밝은 배경과 짙은 녹색 테마, 별도 피드 및 별도 개인 저장소를 사용한다. 기존 공개 `/nicole/`, `/munseong/`, `/dubu/`, `/` 주소와 동작은 유지된다.

## Nicole 기존 기능 비교

| 기존 `/nicole/` | 새 `/nicole-next/` | 확인 근거 |
|---|---|---|
| Online / In-person | 공통 시장 모델에 Nicole 탭 이름 적용 | 새 E2E |
| 분야·시도 필터 | 공통 분야·시도 필터 및 고급 필터 | 새 E2E |
| 언어 적합 배지·필터 | 일치·불일치·미확인 표시와 필터 | 새 E2E |
| 전주·완주 / 인근 / 기타 통근권 | Nicole 통근권 배지·필터, 미확인 구분 | 새 E2E |
| 과거·미확인 수집 공고 | `collectionState`별 선택 표시 | 새 E2E |
| 저장만 보기 | `Saved jobs` 체크박스 | 새 E2E |
| 관심 공고 저장·해제 | 공통 즐겨찾기, Nicole 별도 DB | 새 E2E |
| 공고·회사·출처 숨김 | 공고 숨김 및 회사·출처 버튼, 숨김 관리 | 새 E2E |
| 숨김 항목 복구·전체 복구 | 유형별 개별 복구·전체 복구 | 구현 및 새 E2E(개별 복구) |
| 온라인/오프라인·분야별 직접 추가 | 공통 폼의 Nicole 전용 유형·분야 필드 | 새 E2E |
| Upwork·KOWORK 원문 주소에서 출처 인식 | 호스트 이름 기반 출처 인식 및 보존 | 새 E2E |
| 직접 추가 목록·삭제 | 전용 관리 목록과 삭제 | 구현 |
| 출처별 수집 현황 | 출처별 상태·갱신일·건수 목록 | 새 E2E |
| Upwork·KOWORK·K-WORK·Hanultari·JOBPLOY 수동 검색 | 새 화면의 직접 방문 링크, 피드의 `manualSearches` 반영 | 새 E2E |
| 날짜 네 종류 | Posted / Added to Radar / Last collected / Source last reviewed | 새 E2E(카드 날짜) |
| 24시간 이상 피드 지연 경고 | 공통 피드 상태 경고(24시간 기준) | 기존 단위·E2E |
| 다른 탭과 상태 동기화 | Nicole 전용 BroadcastChannel 및 저장 이벤트 | 새 E2E |
| 기존 IndexedDB의 관심·숨김·수동 입력 | 첫 방문 시 새 Nicole DB에 1회 변환, 원본 읽기 전용 | 새 E2E 및 단위 테스트 |

## 통합 화면에서 추가로 사용 가능

지원 예정·지원함·확인함, 일괄 작업, 상태 백업·가져오기, 시장 요약을 Nicole에서도 사용할 수 있다. 시장 요약은 해당 탭의 공고가 20건 미만이면 접힌 상태로 시작한다. Nicole 피드에 원래 존재하지 않는 지급 신뢰 근거·검증 이력 상세 패널은 자동으로 숨긴다.

## 검증과 승인 경계

- `npm.cmd run check`: 통과. 실제 Nicole 기준선 39건 변환 및 `validatePublicFeed` 확인.
- 로컬 Playwright: **103/103 통과**(Munseong 77, 기존 Nicole 16, Nicole 미리보기 10). 390px 가로 넘침 검사 포함.
- GitHub Pages Actions: [2b 1~4단계 최초 배포 성공](https://github.com/ostrichick/job-search-radar/actions/runs/39914670079), [후속 카드 표시 개선 `e94f0c9` 배포 성공](https://github.com/ostrichick/job-search-radar/actions/runs/39916473262). 후속 실행에서도 단위 검사, 전체 E2E, 정적 빌드, Pages 배포가 모두 성공했다.
- 공개 `/nicole-next/` 실제 독립 브라우저 확인: Online 공고 카드 20개·출처 상태 19개 렌더링, 로드 오류·JavaScript 오류 없음. 카드의 `Pay not listed` 영어 문구 및 실제 거리 정보가 없는 패널 숨김을 확인.
- 공개 데스크톱 1440px / 모바일 390px에서 모두 `scrollWidth = clientWidth`(수평 넘침 없음), 브라우저 오류 없음. 두 해상도의 상단·카드 캡처 4장 모두 이 배포본에서 촬영했다.
- 원본 `dubu-job-radar` 상태 이전은 Playwright의 독립 브라우저에서만 시험했다. **실제 사용자 브라우저의 개인 저장소는 검사하지 않았다.** 변환 원본은 읽기만 하며, Nicole 새 DB `job-search-radar-nicole`로 복사한다.
- 캡처는 Playwright의 신규 격리 브라우저 프로필에서 공개 미리보기 주소를 열어 생성한다.

**승인 요청:** 이 미리보기 화면을 현재 `/nicole/` 주소로 전환해도 되는지 결정해야 한다. 승인 후 기존 Nicole 화면은 `/nicole-classic/`에 보관하고 `/nicole-next/`를 `/nicole/`로 이동하도록 변경한다. 옛 Nicole 코드 삭제는 별도 보관 기간 종료 확인 후에만 한다.
