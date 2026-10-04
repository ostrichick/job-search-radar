# Digital Nomad Job Dashboard

여러 공개 구인 피드와 직접 추가한 공고를 한 화면에서 검색·필터·정렬하는 개인용 대시보드입니다.

## 실행

가장 간단한 방법은 `Start-Job-Dashboard.cmd`를 더블클릭하는 것입니다. 서버 창을 닫으면 대시보드도 종료됩니다.

터미널에서는 다음과 같이 실행할 수 있습니다.

```powershell
cd C:\projects\DigitalNomad\job-dashboard
npm run refresh
npm start
```

브라우저에서 `http://127.0.0.1:4317`을 엽니다.

`local-server.mjs`는 데스크톱 바로가기용 로컬 서버이며 웹 배포에는 사용하지 않습니다. 웹 배포는 `public/`과 `api/`의 서버리스 엔드포인트를 사용합니다.

서버가 켜져 있는 동안 6시간마다 자동 갱신하며, 마지막 수집이 6시간 이상 지난 상태에서 서버를 시작해도 자동으로 다시 수집합니다. 화면의 **새 공고 수집** 버튼으로 즉시 갱신할 수도 있습니다.

## 현재 자동 수집 소스

- Jobicy 공개 Remote Jobs API
- Remote OK 공개 JSON API
- Remotive 공개 Remote Jobs API
- Arbeitnow 공개 Job Board API
- `data/manual-jobs.json`에 직접 추가한 공고

LinkedIn과 Indeed는 직접 크롤링하지 않습니다. 두 플랫폼에서 발견한 공고는 화면의 **공고 추가**로 저장할 수 있습니다. 이후 이메일 알림 연동을 붙이면 수동 입력량을 더 줄일 수 있습니다.

## 웹 배포

- Vercel: `api/`의 서버리스 수집 API를 사용합니다.
- GitHub Pages: `npm run build:pages`가 최신 공고와 정적 UI를 `docs/`에 생성하며 `main/docs`를 영구 배포 대상으로 사용합니다.
- `deployment/pages-workflow.yml.example`은 6시간 자동 수집·배포용 GitHub Actions 템플릿입니다. GitHub OAuth에 `workflow` 권한이 있는 환경에서 `.github/workflows/pages.yml`로 활성화할 수 있습니다.
- 관심 공고, 지원 상태, 숨김, 직접 추가 공고와 필터 설정은 사용자의 브라우저 `localStorage`에 저장됩니다.

## 기능

- 직무·회사·설명·태그 통합 검색
- 소스, 분야, 원격/한국/Worldwide 조건 필터
- 적합도 임계값 필터
- 적합도·게시일·회사·직무명 정렬
- 관심 공고 저장 / 제외
- 중복 공고 제거
- 사용자의 관심 직무 키워드에 따른 기본 적합도 점수

적합도 점수는 채용 가능성 예측이 아니라 빠른 검토를 위한 우선순위 점수입니다. `config/search-profile.json`에서 키워드를 수정할 수 있습니다.
