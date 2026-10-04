import { test, expect } from '@playwright/test';

function job(overrides = {}) {
  const now = '2026-10-04T06:00:00.000Z';
  return {
    id: 'job:default',
    source: 'RWS TrainAI',
    title: 'AI Data Specialist - Korean',
    company: 'RWS',
    location: 'South Korea',
    remote: true,
    type: 'Freelance',
    salary: '$10/시간',
    url: 'https://example.com/job/default',
    postedAt: '2026-10-03T00:00:00.000Z',
    description: 'Evaluate Korean AI data and follow project guidelines.',
    tags: ['Korean', 'AI'],
    category: 'AI 평가·어노테이션',
    eligibility: '한국에서 지원 가능',
    eligibilityCode: 'korea',
    eligibilityBasis: 'location',
    eligibilityReason: '공고 위치에 한국이 명시됨: South Korea',
    salaryInfo: { raw: '$10/hour', display: '$10/시간', currency: 'USD', min: 10, max: 10, period: 'hour', confidence: 'parsed' },
    sourceKind: 'official_ats',
    sourceTrustLabel: '공식 직접 채용',
    sourceOfficiality: 'official',
    sourceSummary: '공식 ATS의 현재 공개 공고입니다.',
    sourceEvidence: [{ type: 'official_source', label: '공식 채용', url: 'https://example.com/source' }],
    sourceReviewAt: '2026-10-04',
    paymentStatus: 'caution',
    paymentLabel: '지급 후기 주의',
    paymentEvidenceState: 'caution_repeated',
    paymentEvidenceLabel: '반복 주의 신호',
    paymentConfidence: 'moderate',
    paymentSummary: '공개 리뷰 집계에 반복 주의 신호가 있습니다.',
    paymentSignals: [{ type: 'review_aggregate', direction: 'caution', recurrence: 'repeated', observedAt: '2026-10-04', label: '리뷰 집계', url: 'https://example.com/reviews' }],
    listingStatus: 'verified_open',
    listingLabel: '모집 확인됨',
    listingBasis: 'official_feed',
    listingReason: '공식 ATS의 현재 공개 목록에서 수집됨',
    listingCheckedAt: now,
    listingEvidence: [{ type: 'official_listing', label: '공식 공고 원문', url: 'https://example.com/job/default', checkedAt: now }],
    verifiedAt: now,
    stale: false,
    score: 90,
    matchedKeywords: ['korean', 'ai data specialist'],
    fitReasons: ['일치 키워드: korean, ai data specialist', '지원 범위: 한국에서 지원 가능'],
    fitWarnings: [],
    fitWarning: '',
    legacyIds: ['raw:default'],
    sources: ['RWS TrainAI'],
    alternateUrls: [],
    duplicateCount: 1,
    ...overrides
  };
}

function feed(jobs) {
  return {
    updatedAt: '2026-10-04T06:00:00.000Z',
    sourceStatus: [{ source: 'RWS TrainAI', ok: true, count: jobs.length }],
    jobs
  };
}

const defaultJobs = [
  job(),
  job({
    id: 'job:oneforma',
    source: 'OneForma',
    title: 'Multilingual AI Quality Assurance Reviewer',
    company: 'OneForma',
    url: 'https://example.com/job/oneforma',
    sourceKind: 'official_platform',
    sourceTrustLabel: '공식 프로젝트 플랫폼',
    listingEvidence: [{ type: 'official_listing', label: '공식 공고 원문', url: 'https://example.com/job/oneforma' }],
    score: 82,
    legacyIds: ['raw:oneforma'],
    sources: ['OneForma']
  }),
  job({
    id: 'job:worldwide',
    source: 'Remotive',
    title: 'Korean Content Reviewer',
    company: 'Example Co',
    location: 'Worldwide',
    url: 'https://example.com/job/worldwide',
    sourceKind: 'job_board',
    sourceTrustLabel: '공개 공고 피드',
    sourceOfficiality: 'intermediary',
    paymentStatus: 'not_payer',
    paymentLabel: '지급 주체 아님',
    paymentEvidenceState: 'not_applicable',
    paymentEvidenceLabel: '지급 주체 아님',
    paymentSignals: [],
    eligibility: 'Worldwide',
    eligibilityCode: 'worldwide',
    eligibilityReason: 'Worldwide 지원 범위가 명시됨',
    listingStatus: 'current_feed',
    listingLabel: '현재 피드',
    listingReason: '현재 채용 보드 피드에 존재함',
    score: 55,
    legacyIds: ['raw:worldwide'],
    sources: ['Remotive']
  })
];

async function useFeed(page, getFeed = () => feed(defaultJobs)) {
  await page.route('**/jobs.json*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(getFeed())
    });
  });
}

test('기본 추천이 렌더링되고 검토 우선순위로 표시된다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  await expect(page.locator('.job-card')).toHaveCount(3);
  await expect(page.locator('.score').first()).toContainText('검토 우선순위');
  await expect(page.locator('.eligibility-badge').first()).toContainText('한국에서 지원 가능');
});

test('상태와 동적 소스 필터가 reload 후 유지된다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  await page.selectOption('#source', 'OneForma');
  await page.locator('.job-card').first().locator('.favorite').click();
  await page.reload();
  await expect(page.locator('#source')).toHaveValue('OneForma');
  await page.selectOption('#statusFilter', 'saved');
  await expect(page.locator('.job-card')).toHaveCount(1);
});

test('batch hide를 한 번에 되돌릴 수 있다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  await page.locator('#selectVisible').check();
  await page.locator('#batchHide').click();
  await expect(page.locator('.job-card')).toHaveCount(0);
  await expect(page.locator('#toastText')).toContainText('3개 공고를 숨겼습니다');
  await page.locator('#undoHide').click();
  await expect(page.locator('.job-card')).toHaveCount(3);
});

test('숨김 undo는 NEW·미검토 상태도 원래대로 복구한다', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('knownJobIds', JSON.stringify(['job:default', 'job:oneforma']));
  });
  await useFeed(page);
  await page.goto('/');
  await page.selectOption('#statusFilter', 'new');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.title')).toHaveText('Korean Content Reviewer');
  await page.locator('.dismiss').click();
  await expect(page.locator('.job-card')).toHaveCount(0);
  await page.locator('#undoHide').click();
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.title')).toHaveText('Korean Content Reviewer');
  await page.selectOption('#statusFilter', 'unreviewed');
  await expect(page.locator('.job-card').filter({ hasText: 'Korean Content Reviewer' })).toHaveCount(1);
});

test('지원 상태는 숨김과 복구 뒤에도 보존된다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  const target = () => page.locator('.job-card').filter({ hasText: 'AI Data Specialist - Korean' });
  await target().locator('.job-state').selectOption('applied');
  await target().locator('.dismiss').click();
  await page.selectOption('#statusFilter', 'hidden');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.job-state')).toHaveValue('applied');
  await page.locator('.dismiss').click();
  await page.selectOption('#statusFilter', 'applied');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.title')).toHaveText('AI Data Specialist - Korean');
});

test('관심 공고가 피드에서 사라져도 archived snapshot으로 남는다', async ({ page }) => {
  let current = feed(defaultJobs);
  await useFeed(page, () => current);
  await page.goto('/');
  const first = page.locator('.job-card').first();
  await first.locator('.favorite').click();
  current = feed(defaultJobs.slice(1));
  await page.reload();
  await page.selectOption('#statusFilter', 'saved');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.title')).toHaveText('AI Data Specialist - Korean');
  await expect(page.locator('.listing-badge')).toHaveText('현재 피드에서 사라짐');
});

test('상세 이전/다음과 근거 패널이 현재 필터 큐를 따른다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  await page.locator('.job-card').first().locator('.details').click();
  await expect(page.locator('#detailsDialog')).toBeVisible();
  await expect(page.locator('#detailsTitle')).toHaveText('AI Data Specialist - Korean');
  await expect(page.locator('#detailsListingReason')).toContainText('공식 ATS');
  await expect(page.locator('#detailsEligibilityReason')).toContainText('한국');
  await expect(page.locator('#detailsFitReasons')).toContainText('합격 가능성이 아니라 검토 우선순위');
  await page.locator('#nextDetails').click();
  await expect(page.locator('#detailsTitle')).toHaveText('Multilingual AI Quality Assurance Reviewer');
  await page.locator('#prevDetails').click();
  await expect(page.locator('#detailsTitle')).toHaveText('AI Data Specialist - Korean');
});

test('390px viewport에서 가로 overflow가 없다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useFeed(page);
  await page.goto('/');
  expect(await page.locator('#advancedFilters').evaluate((element) => element.open)).toBe(false);
  const widths = await page.evaluate(() => ({
    inner: window.innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    firstCardY: document.querySelector('.job-card')?.getBoundingClientRect().top || 0,
    selectHitWidth: document.querySelector('.job-select-hit')?.getBoundingClientRect().width || 0,
    selectHitHeight: document.querySelector('.job-select-hit')?.getBoundingClientRect().height || 0
  }));
  expect(widths.html).toBeLessThanOrEqual(widths.inner);
  expect(widths.body).toBeLessThanOrEqual(widths.inner);
  expect(widths.firstCardY).toBeLessThan(1100);
  expect(widths.selectHitWidth).toBeGreaterThanOrEqual(43);
  expect(widths.selectHitHeight).toBeGreaterThanOrEqual(43);
  await expect(page.locator('.job-card')).toHaveCount(3);
});

test('빈 결과와 로드 오류에서 복구할 수 있다', async ({ page }) => {
  let mode = 'error';
  await page.route('**/api/jobs', async (route) => {
    if (mode === 'error') await route.fulfill({ status: 500, body: 'error' });
    else await route.fulfill({ status: 404, body: 'fallback' });
  });
  await page.route('**/jobs.json*', async (route) => {
    if (mode === 'error') await route.fulfill({ status: 500, body: 'error' });
    else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(feed(defaultJobs)) });
  });
  await page.goto('/');
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#emptyMessage')).toContainText('공고를 불러오지 못했습니다');
  mode = 'ok';
  await page.locator('#retryLoad').click();
  await expect(page.locator('.job-card')).toHaveCount(3);
  await page.fill('#query', '존재하지 않는 검색어');
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#emptyMessage')).toContainText('현재 필터에 맞는 공고가 없습니다');
});

test('상태 백업/가져오기는 지원함 상태와 필터를 복원한다', async ({ page }) => {
  await useFeed(page);
  await page.goto('/');
  const target = page.locator('.job-card').filter({ hasText: 'AI Data Specialist - Korean' });
  await target.locator('.job-state').selectOption('applied');
  await page.selectOption('#source', 'RWS TrainAI');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportStateBtn').click()
  ]);
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#source')).toHaveValue('');
  await page.locator('#importStateFile').setInputFiles(backupPath);
  await expect(page.locator('#toastText')).toContainText('백업 상태를 현재 데이터에 병합했습니다');
  await expect(page.locator('#source')).toHaveValue('RWS TrainAI');
  await page.selectOption('#statusFilter', 'applied');
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.title')).toHaveText('AI Data Specialist - Korean');
});
