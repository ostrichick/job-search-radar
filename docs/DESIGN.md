# 디자인 토큰·시각 규약

`job-dashboard`의 모든 화면은 **하나의 토큰 계약**(`public/shared/tokens.css`)을 공유한다. 페이지별 색 정체성은 토큰 값만 덮어써서 만든다. 규칙 파일에는 색상 리터럴을 쓰지 않는다.

## 구조

| 파일 | 역할 |
| --- | --- |
| `public/shared/tokens.css` | 토큰 정의(기본값 = Munseong 테마). 색·반경·그림자·모션의 단일 출처 |
| `public/munseong/styles.css` | 공용 레이아웃/컴포넌트 규칙. 토큰만 참조 |
| `public/nicole/styles.css` | 테마 오버라이드 + Nicole 전용 규칙만 |
| `public/household/household.css` | 테마 오버라이드 + Household 전용 규칙만 |

`tokens.css`는 각 페이지 CSS보다 **먼저** 로드한다(`<link rel="stylesheet" href="../shared/tokens.css">`).

## 토큰 범주

- `--surface-*`: 페이지 바탕(`canvas`), 카드(`card`), 옅은 면(`subtle`), 눌린/호버 면(`muted`), 반투명 플로팅, 오버레이
- `--chrome-*`: 상단 헤더 띠. `bg`, `text`, `text-muted`, `border`, `border-subtle`, `border-strong`, `button-bg`, `glow`
- `--surface-inverse` / `--surface-toast` / `--text-on-inverse`: 어두운 알약·토스트
- `--text-*`: `strong`, `body`, `muted`, `subtle`, `faint`, `accent`, `accent-strong`, `accent-muted`
- `--border-*`: `subtle`, `base`, `strong`, `accent`, `accent-strong`
- `--accent` / `--accent-hover` / `--accent-soft(-strong)` / `--accent-ink` / `--accent-marker` / `--focus-ring`
- `--status-{ok,warn,danger,info}-{soft,border,text}`, `--status-warn-strong`
- `--state-muted-*`: 검토 완료·마감 카드처럼 물러난 상태
- `--radius-xs/sm/md/lg/xl/pill`, `--shadow-sm/md/lg/toast/dialog/accent-ring/state-bar`, `--transition-fast`

## 규칙

1. **색상 리터럴 금지.** 규칙 파일(`styles.css`)에 `#hex`, `rgb()`, `rgba()`가 남아 있으면 위반이다. 테마 블록(`:root`)만 값을 갖는다.
2. **의미로 고른다.** 같은 회색이라도 본문이면 `--text-muted`, 테두리면 `--border-base`를 쓴다. "가장 비슷한 값"으로 고르지 않는다.
3. **새 색이 필요하면 토큰을 먼저 추가한다.** `tokens.css`에 이름과 기본값을 넣고, 페이지 테마에서 필요하면 값을 덮어쓴다.
4. **반경은 스케일만.** 8 / 10 / 12 / 14 / 18 / pill 이외 값이 필요하면 스케일을 먼저 검토한다(예외: 6px 칩).
5. **상태 4종을 세트로 만든다.** 버튼·입력·카드 액션은 default / hover / `:focus-visible`(3px `--focus-ring`) / disabled를 같은 방식으로 정의한다.
6. **테마는 변수만.** 새 프로필 페이지는 토큰 오버라이드로 시작하고, 구조가 다를 때만 규칙을 추가한다.

## 테마 추가

```css
:root {
  --surface-canvas: …;
  --chrome-bg: …;
  --accent: …;
  --accent-ink: …;   /* accent 위 글자색 */
  --text-strong: …;
  --border-base: …;
}
```

강조색이 어두우면 `--accent-ink`를 밝게, 밝으면 어둡게 지정한다. `--accent`와 `--accent-ink`의 대비는 4.5:1 이상을 유지한다.

## 검증

- `npm run test:static` — 정적 산출물/경로 확인
- 화면 변경 시 `npx playwright` 또는 로컬 스크린샷으로 이전 이미지와 비교(최소 데스크톱 1440px, 모바일 390px)
- 토큰 추가는 기존 화면의 렌더 결과가 바뀌지 않는지 확인한 뒤 커밋한다.
