# 디자인 토큰·시각 규약

`job-dashboard`의 네 탭은 **하나의 토큰 계약**(`public/shared/tokens.css`)과 **하나의 공통 셸**(`public/shared/app-shell.css`)을 공유한다. 색은 모든 탭이 같은 팔레트를 쓰고, 페이지 파일에는 콘텐츠 전용 규칙만 둔다. 규칙 파일에는 색상 리터럴을 쓰지 않는다.

## 구조

| 파일 | 역할 |
| --- | --- |
| `public/shared/tokens.css` | 토큰 정의. 색·타입·간격·반경·그림자·모션의 단일 출처 |
| `public/shared/app-shell.css` | 공통 셸: 다크 크롬, pill 탭, 지표 카드, 패널, 버튼, 필터, 카드 표면, 칩, 빈 상태 |
| `public/shared/icons/` | 공통 파비콘 SVG와 Apple Touch 아이콘 PNG |
| `public/munseong/styles.css` | 구인 목록 전용 규칙(보상·거리·워크플로 등). 토큰만 참조 |
| `public/nicole/styles.css` | Nicole 전용 규칙만 |
| `public/household/household.css` | 복지·강의 전용 규칙만 |

로드 순서: `tokens.css` → 페이지 CSS → `app-shell.css`(마지막). 공통 컴포넌트는 셸이 덮어쓰고, 페이지 파일은 콘텐츠 구조만 담당한다.

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
- `--font-sans`, `--text-display/title/heading/body-size/caption`, `--leading-tight/body`: 타입 램프
- `--space-1..12`, `--page-pad-x`, `--content-width`, `--control-height`: 4px 간격·레이아웃 스케일
- `--chrome-panel-bg/border`: 다크 헤더 안의 상태 카드

## 규칙

1. **색상 리터럴 금지.** 규칙 파일(`styles.css`)에 `#hex`, `rgb()`, `rgba()`가 남아 있으면 위반이다. 테마 블록(`:root`)만 값을 갖는다.
2. **의미로 고른다.** 같은 회색이라도 본문이면 `--text-muted`, 테두리면 `--border-base`를 쓴다. "가장 비슷한 값"으로 고르지 않는다.
3. **새 색이 필요하면 토큰을 먼저 추가한다.** `tokens.css`에 이름과 기본값을 넣고 모든 탭이 같은 값을 쓴다.
4. **반경은 스케일만.** 8 / 10 / 12 / 14 / 18 / pill 이외 값이 필요하면 스케일을 먼저 검토한다(예외: 6px 칩).
5. **상태 4종을 세트로 만든다.** 버튼·입력·카드 액션은 default / hover / `:focus-visible`(3px `--focus-ring`) / disabled를 같은 방식으로 정의한다.
6. **공통 컴포넌트는 셸에만.** 헤더·탭·버튼·패널·카드·필터·칩은 `app-shell.css`에서 고친다. 페이지 CSS에 같은 규칙을 복제하지 않는다. 새 페이지도 공통 셸을 먼저 연결한다.

## 새 탭 추가

```html
<link rel="stylesheet" href="../shared/tokens.css">
<link rel="stylesheet" href="./page.css">
<link rel="stylesheet" href="../shared/app-shell.css">
```

셸 클래스를 재사용한다: 헤더(`topbar`/`hero`), 탭(`profile-switch`/`sites`), 지표(`stats`/`overview`), 패널(`panel`), 카드(`job-card`/`card`/`class-card`), 필터(`filters`/`class-filters`), 버튼(`button primary/secondary`, `solid`/`outline`), 칩(`tag`/`chip`).

## 사이트 메타데이터·파비콘

파비콘·PWA 아이콘·공유 이미지의 원본은 `public/shared/icons/favicon.svg`와 `scripts/build-icons.mjs`다. 산출물은 커밋한다.

```bash
npm run build:icons
```

이 명령은 로컬 Playwright Chromium으로 `apple-touch-icon.png`(180×180), `icon-192.png`, `icon-512.png`, `maskable-512.png`, `og-image.png`(1200×630)를 만든다. 예약 CI에는 Chromium이 없으므로 `npm run check`에서 실행하지 않는다.

운영 탭 8개(`action`, `ai-subs`, `classes`, `household`, `munseong`, `nicole`, `side-gigs`, `tours`)의 head 블록 예시:

```html
<link rel="icon" href="../shared/icons/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="../shared/icons/apple-touch-icon.png">
<link rel="manifest" href="../shared/site.webmanifest">
<meta name="theme-color" content="#161c1a">
<meta name="description" content="…">
<meta property="og:type" content="website">
<meta property="og:title" content="…">
<meta property="og:description" content="…">
<meta property="og:image" content="https://ostrichick.github.io/job-search-radar/shared/icons/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
```

루트(`public/index.html`)와 이동용 페이지(`dubu`, `nicole-classic`, `nicole-next`)는 `favicon.svg`와 `theme-color`만 둔다. 루트에서는 경로가 `./shared/icons/favicon.svg`다.

`public/shared/site.webmanifest`는 `start_url: "../nicole/"`, `scope: "../"`를 쓰고 `purpose: any`와 `maskable` 아이콘을 포함한다.

- `data:` 인라인 파비콘은 쓰지 않는다.
- GitHub Pages가 `/job-search-radar/` 하위에 배포되므로 `/shared/...` 같은 도메인 루트 경로를 쓰지 않는다.
- `theme-color`와 manifest의 `theme_color`는 `tokens.css`의 `--chrome-bg`와 같은 값을 쓴다.
- `og:image`는 배포 도메인이 바뀌면 함께 갱신한다.
- 운영 탭 8개는 서로를 모두 링크하고 현재 탭에만 `aria-current="page"`를 둔다.
- `node scripts/check-site-metadata.mjs`가 위 규칙, 자산 상대 경로·존재, PNG 크기, manifest 아이콘을 `public/`의 모든 HTML에 대해 전수 검사하며, `npm run check`에 포함된다.

`favicon.ico`는 이번 범위에 포함하지 않는다.

## 검증

- `npm run check` — 구문·사이트 메타데이터·정적 산출물 확인
- `npm run test:static` — 정적 산출물/경로 확인
- 화면 변경 시 `npx playwright` 또는 로컬 스크린샷으로 이전 이미지와 비교(최소 데스크톱 1440px, 모바일 390px)
- 토큰 추가는 기존 화면의 렌더 결과가 바뀌지 않는지 확인한 뒤 커밋한다.
