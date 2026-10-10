# 채용 소스 사각지대와 안전한 대체 수집 경로

최종 점검: 2026-10-10

이 문서는 “현재 자동 수집하지 않는 플랫폼”을 모두 기술 장애로 취급하지 않는다. 원칙은 **로그인·CAPTCHA·Cloudflare 우회 없이**, 가능한 경우 공식 API·공식 알림·원출처 ATS를 우선하고, 근거가 약한 중개 페이지를 새 출처처럼 다시 저장하지 않는 것이다.

## 현재 우선 처리 대상

| 플랫폼/경로 | 현재 상태 | 지금 쓸 수 있는 안전한 대안 | 자동화 조건 |
| --- | --- | --- | --- |
| 잡플래닛 | 공개 무로그인 검색이 Cloudflare 403/challenge. 고유 Jobplanet posting ID와 posting-specific 전주·완주 근무지 계약도 미확인 | 잡플래닛이 외부 잡코리아·사람인 등 원문으로 연결하면 **원출처 collector가 소유**. 그 외에는 화면의 `공고 추가` 사용 | `config/domestic-source-access.json`의 3개 activation gate가 모두 true일 때만 collector 추가 |
| LinkedIn | 직접 크롤링하지 않음 | LinkedIn 공식 **Job Alert 이메일**을 사용. 저장/내보낸 이메일 본문은 `scripts/linkedin-alert-parser.mjs`로 파싱하고, 결과 JSON은 화면의 `상태/알림 가져오기`에서 stable LinkedIn job ID 기준으로 중복 없이 병합 | Gmail 등에서 토큰을 정적 웹앱에 노출하지 않는 서버 측 수집 경로가 생기면 자동 유입 검토 |
| Indeed | 직접 크롤링하지 않음 | Indeed 공식 **Job Alert 이메일**을 사용하거나 화면의 `공고 추가` 사용 | 실제 Job Alert 샘플 fixture를 확보한 뒤에만 parser를 작성. 이메일 형식을 추측해 구현하지 않음 |
| 고용24 | collector 구현 완료, 인증키가 없으면 비활성 | 공식 OPEN-API | 사용자 `WORK24_AUTH_KEY` 발급·설정 후 활성화 |
| 인크루트 | GitHub Actions 지역 검색 13회 연속 실패(2026-10-10), 두 지역 모두 시간 초과. 로컬은 같은 공개 검색 요청 HTTP 200; IP 차단은 **미확인** | 인크루트가 공개 안내하는 **전북 지역 RSS**(최신 최대 20건)에서 단일 전주·완주 지역 표기 공고만 약한 목록 근거로 확보. 상세 검증과 구분·추천 제외 | RSS는 전북 전체 수집을 대체하지 않으며, 지역 검색의 상세 검증 및 CI 접근 문제는 별개로 남음 |
| 사람인 | 2026-10-10 GitHub Actions에서 공개 지역 검색 `fetch failed`로 기존 34건 보존·현재 신규 0건 관측. PC에서 동일한 전주·완주 공개 검색 두 URL이 각각 HTTP 200, 일부 CI 실패의 네트워크 원인은 미확정 | 기존 공식 공개 전주·완주 목록 중 한쪽만 성공할 때 해당 지역의 유효한 상세 공고를 유지하고 나머지는 보존 공고로 구분 | 전체 두 지역 응답 또는 상세 확인이 모두 실패하면 기존대로 전체 실패 처리. 접근제한 우회·무의미한 반복 재시도 금지 |
| Gmail Job Alert 자동 유입 | 정적 GitHub Pages에 OAuth 토큰을 둘 수 없어 미연결 | 현재는 사용자가 내보낸/복사한 알림을 parser 또는 `공고 추가`로 처리 | 서버/Apps Script/안전한 connector처럼 토큰이 브라우저에 노출되지 않는 경로가 생길 때 연결 |

## 공식 대체 입력의 근거

- LinkedIn은 검색 조건별 Job Alert를 만들고 이메일·앱 알림으로 매일 또는 매주 받을 수 있다고 공식 안내한다. 한 계정에서 동시에 설정할 수 있는 알림은 최대 20개다.
  https://www.linkedin.com/help/linkedin/answer/a512290?lang=ko-KR
- Indeed는 검색어·회사·위치 조건에 맞는 Job Alert 이메일을 받을 수 있고, 계정에서 빈도와 조건을 관리할 수 있다고 공식 안내한다. 국제 검색에서는 Alert 생성이 제한될 수 있다는 점도 명시한다.
  https://support.indeed.com/hc/en-us/articles/204488890-Starting-Stopping-and-Managing-Job-Alerts
- 고용24 OPEN-API는 HTTP/XML(UTF-8) 기반이며 회원 가입 후 발급받는 인증키가 필요하다.
  https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do
- 인크루트는 공개 RSS 안내 페이지에서 지역별 채용정보 XML 피드를 제공하며, 전북 채널의 공개 위치를 확인했다. 2026-10-10 실측에서 HTTP 200, 20개 `item`과 공고 고유 ID·지역·게시일이 존재했다. 다중 지역/전북 전체는 전주·완주 단일 일자리로 추정하지 않는다.
  https://people.incruit.com/rss/rss.asp
- 인크루트 RSS 성공은 상세 HTML의 접근 성공과 무관하다. 검색 200이어도 상세 다수가 거부되면 `detailCollapseSuspected`로 기록하고 이전에 확인한 공고를 `source_error`로 보존한다. RSS에서 구별 가능한 마감일만 사용하고, 예전 상세 정보는 현재 검증 사실로 재표기하지 않는다. 인크루트·사람인·알바천국·고용24의 공식 공고 식별자 쿼리는 추적 파라미터와 달리 URL 동일성 판단에서 유지한다.

## 구현 우선순위

1. **고용24 키 연결** — 이미 공식 adapter가 있으므로 추가 크롤러 개발보다 효과가 크다.
2. **LinkedIn Alert 반자동 입력** — 기존 parser 결과 JSON을 `상태/알림 가져오기`에서 바로 병합하고, 실제 이메일에서 얻은 stable LinkedIn job ID를 provenance로 사용한다.
3. **Indeed Alert parser** — 실제 사용자 Job Alert 샘플을 확보했을 때만 fixture-first 방식으로 추가한다.
4. **잡플래닛 재점검** — 공개 무로그인 접근과 고유 posting/detail workplace 계약이 달라졌을 때만 다시 평가한다.

대시보드는 위 사각지대 중 현재 시장에 영향을 주는 항목을 `수집 범위 제한`으로 표시한다. 고용24는 `WORK24_AUTH_KEY`가 실제 수집 실행에 설정되면 이 제한 목록에서 자동으로 빠지고, 나머지는 현재 지원하는 공식 알림·원출처·직접 추가 경로를 함께 안내한다.

## 새 플랫폼을 추가할 때의 공통 gate

자동 collector는 최소한 다음 조건을 모두 만족해야 한다.

1. 공개·허용된 후보 발견 경로가 안정적으로 동작한다.
2. 공고마다 source-native stable ID 또는 동일 수준의 안정적인 식별자가 있다.
3. 실제 지원/출근 판단에 필요한 위치·지원 범위가 원문 근거로 확인된다.
4. 로그인·CAPTCHA·anti-bot 우회를 요구하지 않는다.
5. parser 붕괴나 접근 제한은 빈 정상 결과로 처리하지 않고 source failure로 fail-closed 한다.
6. 이미 연결된 원출처로 이동하는 중개 링크는 새 출처로 중복 수집하지 않는다.

위 조건을 충족하지 못하는 플랫폼은 “지원 범위 밖”이 아니라 **수집 근거 미충족**으로 기록하고, 수동 추가 또는 공식 알림 경로를 우선한다.
