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
| Gmail Job Alert 자동 유입 | 정적 GitHub Pages에 OAuth 토큰을 둘 수 없어 미연결 | 현재는 사용자가 내보낸/복사한 알림을 parser 또는 `공고 추가`로 처리 | 서버/Apps Script/안전한 connector처럼 토큰이 브라우저에 노출되지 않는 경로가 생길 때 연결 |

## 공식 대체 입력의 근거

- LinkedIn은 검색 조건별 Job Alert를 만들고 이메일·앱 알림으로 매일 또는 매주 받을 수 있다고 공식 안내한다. 한 계정에서 동시에 설정할 수 있는 알림은 최대 20개다.
  https://www.linkedin.com/help/linkedin/answer/a512290?lang=ko-KR
- Indeed는 검색어·회사·위치 조건에 맞는 Job Alert 이메일을 받을 수 있고, 계정에서 빈도와 조건을 관리할 수 있다고 공식 안내한다. 국제 검색에서는 Alert 생성이 제한될 수 있다는 점도 명시한다.
  https://support.indeed.com/hc/en-us/articles/204488890-Starting-Stopping-and-Managing-Job-Alerts
- 고용24 OPEN-API는 HTTP/XML(UTF-8) 기반이며 회원 가입 후 발급받는 인증키가 필요하다.
  https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do

## 구현 우선순위

1. **고용24 키 연결** — 이미 공식 adapter가 있으므로 추가 크롤러 개발보다 효과가 크다.
2. **LinkedIn Alert 반자동 입력** — 기존 parser 결과 JSON을 `상태/알림 가져오기`에서 바로 병합하고, 실제 이메일에서 얻은 stable LinkedIn job ID를 provenance로 사용한다.
3. **Indeed Alert parser** — 실제 사용자 Job Alert 샘플을 확보했을 때만 fixture-first 방식으로 추가한다.
4. **잡플래닛 재점검** — 공개 무로그인 접근과 고유 posting/detail workplace 계약이 달라졌을 때만 다시 평가한다.

## 새 플랫폼을 추가할 때의 공통 gate

자동 collector는 최소한 다음 조건을 모두 만족해야 한다.

1. 공개·허용된 후보 발견 경로가 안정적으로 동작한다.
2. 공고마다 source-native stable ID 또는 동일 수준의 안정적인 식별자가 있다.
3. 실제 지원/출근 판단에 필요한 위치·지원 범위가 원문 근거로 확인된다.
4. 로그인·CAPTCHA·anti-bot 우회를 요구하지 않는다.
5. parser 붕괴나 접근 제한은 빈 정상 결과로 처리하지 않고 source failure로 fail-closed 한다.
6. 이미 연결된 원출처로 이동하는 중개 링크는 새 출처로 중복 수집하지 않는다.

위 조건을 충족하지 못하는 플랫폼은 “지원 범위 밖”이 아니라 **수집 근거 미충족**으로 기록하고, 수동 추가 또는 공식 알림 경로를 우선한다.
