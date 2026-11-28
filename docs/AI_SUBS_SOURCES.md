# 「AI 구독」 탭 데이터 출처 기록

조사일: 2026-11-28 (KST). `public/ai-subs/deals.json`의 모든 항목을 공식 페이지에서 직접 확인한 결과를 남긴다.
금액이 페이지 텍스트로 노출되지 않는 경우(동적 렌더)에는 같은 서비스의 공식 도움말 문서·국가별 요금 페이지를 사용했다.

## 환율

| 항목 | 값 | 기준일 | 출처 |
| --- | --- | --- | --- |
| 1 USD → KRW | 1,335.09 | 2026-11-28 | https://open.er-api.com/v6/latest/USD |
| 1 USD → PEN | 3.4638 | 2026-11-28 | https://open.er-api.com/v6/latest/USD |

환산 값은 결제 시점 환율과 다를 수 있어 화면에서 항상 "추정"으로 표시한다.

## 항목별 확인 결과

| # | id | 확인한 내용 | 근거 URL | 상태 | 근거 유형 |
| --- | --- | --- | --- | --- | --- |
| 1 | chatgpt-free | Free 티어 존재, $0 | https://openai.com/chatgpt/pricing/ | official | pricing |
| 2 | chatgpt-plus | "$20/month (billed monthly)", 연간 결제 미지원 | https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus | official | pricing |
| 3 | chatgpt-pro-100 | Pro 100 $100 / Pro 200 $200 / Pro 500 $500, 월 결제만 | https://help.openai.com/en/articles/9793128-what-is-chatgpt-pro | official | pricing |
| 4 | chatgpt-business-2x | "Sign up by Nov 30 … 2x included usage and fast mode … through Dec 31" | https://openai.com/chatgpt/pricing/ | official | promo |
| 5 | claude-free | Free 플랜 $0 | https://claude.com/pricing | official | pricing |
| 6 | claude-pro-monthly | Pro $20(월 결제) | https://claude.com/pricing | official | pricing |
| 7 | claude-pro-annual | "$17 per month with annual subscription discount ($200 billed up front)" | https://claude.com/pricing | official | pricing |
| 8 | claude-max | Max $100/월 | https://claude.com/pricing | official | pricing |
| 9 | claude-ultra | Ultra $200/월 | https://claude.com/pricing | official | pricing |
| 10 | gemini-ai-plus-korea | Google AI Plus(2TB) ₩11,900/월 | https://one.google.com/about/plans?hl=ko | official | pricing |
| 11 | gemini-ai-pro-korea | Google AI Pro(5TB) ₩29,000/월 | https://one.google.com/about/plans?hl=ko | official | pricing |
| 12 | gemini-ai-plus-student | "Google AI Plus 1년 무료" 학생 혜택 안내 | https://one.google.com/ai-student | check | promo |
| 13 | gemini-ai-plus-peru | 페루 통화 요금 미확인 | https://one.google.com/about/plans | check | pricing |
| 14 | cursor-free | Free $0/월 | https://cursor.com/pricing | official | pricing |
| 15 | cursor-plus | Plus $8/월 | https://cursor.com/pricing | official | pricing |
| 16 | cursor-premium | Premium $30/월 | https://cursor.com/pricing | official | pricing |
| 17 | cursor-super | Super $100/월 | https://cursor.com/pricing | official | pricing |
| 18 | opencode-free-models | 무료 모델 일일 한도 내 무료(일부 기간·지역 한정) | https://opencode.ai/pricing | official | pricing |
| 19 | opencode-go | Go $10/월 | https://opencode.ai/pricing | official | pricing |
| 20 | opencode-go-plus | Go Plus $40/월 | https://opencode.ai/pricing | official | pricing |
| 21 | shinhan-cashback-chatgpt | 신한 개인 신용카드 AI 구독결제 20/40/60 USD → 3,000/6,000/15,000원 캐시백, 대상에 ChatGPT Plus 포함 | https://www.shinhancard.com/pconts/html/benefit/event/2014681_2239.html | official | promo |
| 22 | shinhan-cashback-claude | 같은 이벤트, 대상에 Claude AI 포함 | https://www.shinhancard.com/pconts/html/benefit/event/2014681_2239.html | official | promo |
| 23 | shinhan-cashback-cursor | 같은 이벤트, 대상에 Cursor 포함 | https://www.shinhancard.com/pconts/html/benefit/event/2014681_2239.html | official | promo |
| 24 | cursor-ultra | Ultra $200/월 | https://cursor.com/docs/models-and-pricing | official | pricing |
| 25 | cursor-plus-annual | Plus 연 $80(월 $6.67 환산) | https://cursor.com/docs/models-and-pricing | official | pricing |
| 26 | cursor-premium-annual | Premium 연 $300(월 $25 환산) | https://cursor.com/docs/models-and-pricing | official | pricing |
| 27 | cursor-super-annual | Super 연 $1,000(월 $83.33 환산) | https://cursor.com/docs/models-and-pricing | official | pricing |
| 28 | cursor-ultra-annual | Ultra 연 $2,000(월 $166.67 환산) | https://cursor.com/docs/models-and-pricing | official | pricing |

## 확인하지 못한 영역 (화면에 `확인 필요`로 남김)

| 영역 | 결과 | 내용 |
| --- | --- | --- |
| 한시 프로모션 | partial | ChatGPT Business 2배 사용량과 Google AI Plus 학생 1년 무료만 확인. Claude·Cursor·OpenCode 한시 프로모션은 공식 가격 페이지에서 확인하지 못함 |
| 학생 할인 | partial | Google AI Plus 학생 혜택만 확인. ChatGPT·Claude·Cursor·OpenCode 학생 할인은 확인하지 못함 |
| 캐시백 | partial | 신한카드 AI 구독 캐시백(2026-11-30 응모 마감, ChatGPT·Claude·Midjourney·Cursor 합산 1인 1회·최대 15,000원) 확인. 다른 카드사·페루 은행 캐시백은 확인하지 못함 |
| 결제 수수료·세금 | none | 한국 카드 해외결제 수수료, 페루 부가세(IGV)는 카드사·결제수단·고지 방식에 따라 달라 금액을 넣지 않음 |
| 현지 통화 가격 | partial | Gemini 한국 원화 가격(₩11,900·₩29,000)만 직접 확인. ChatGPT 한국 원화 가격과 Gemini 페루 PEN 가격은 다른 로케일 세션이 필요해 이 저장소 작성 세션에서 재확인하지 못했고, 데이터에 넣지 않았다 |

## Cursor 요금 페이지 주의

2026-11-28 기준 `cursor.com/pricing`은 Grok/X 통합 구독 요금제(Free·Plus·Premium·Super·Ultra·Teams)로 표시되며, 서드파티 모델은 API 정가로 별도 과금된다고 안내한다. 연 결제 가격은 `cursor.com/docs/models-and-pricing`에만 명시되어 있어(Plus $80/년, Premium $300/년, Super $1,000/년, Ultra $2,000/년) 연 결제 항목의 출처로 이 문서를 사용했다. 서비스 키는 `cursor`로 유지했다.

## 갱신 주기

요금·프로모션 변동이 잦으므로 월 1회 `verifiedAt`을 갱신한다. `npm run check`는 스키마·교차 조건만 검사하며 금액의 최신성은 검사하지 않는다.
