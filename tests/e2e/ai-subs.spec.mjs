import { test, expect } from '@playwright/test';

// 라우팅으로 주입하는 고정 요금 데이터 (만료 항목은 과거 날짜로 고정)
const FIXTURE = {
  updatedAt: '2026-11-28T10:00:00+09:00',
  fx: { usdKrw: 1380, penPerUsd: 0.27, asOf: '2026-11-28', source: 'https://example.com/fx' },
  disclaimer: '요금과 혜택은 수시로 바뀝니다.',
  items: [
    {
      id: 'chatgpt-plus-korea',
      service: 'chatgpt',
      plan: 'ChatGPT Plus',
      region: 'korea',
      kind: 'billing',
      billing: 'monthly',
      listPriceUsd: 20,
      isFree: false,
      prepayUsd: 20,
      monthlyEquivalentUsd: 20,
      renewalPriceUsd: 20,
      localPrice: { currency: 'KRW', amount: 29000, includesVat: true },
      priceBasis: 'official',
      savingDisplay: '월 결제 기준',
      eligibility: '제한 없음',
      caveat: '국내 결제 수단에 따라 부가세가 달라질 수 있습니다.',
      status: 'official',
      evidenceType: 'pricing',
      expiresAt: null,
      url: 'https://openai.com/chatgpt/pricing/',
      verifiedAt: '2026-11-28'
    },
    {
      id: 'claude-pro-global',
      service: 'claude',
      plan: 'Claude Pro',
      region: 'global',
      kind: 'billing',
      billing: 'monthly',
      listPriceUsd: 20,
      isFree: false,
      prepayUsd: 20,
      monthlyEquivalentUsd: 20,
      renewalPriceUsd: 20,
      localPrice: null,
      priceBasis: 'official',
      savingDisplay: '연 결제 시 할인',
      eligibility: '제한 없음',
      caveat: '지역별 요금과 통화가 다를 수 있습니다.',
      status: 'check',
      evidenceType: 'pricing',
      expiresAt: null,
      url: 'https://claude.com/pricing',
      verifiedAt: '2026-11-20'
    },
    {
      id: 'gemini-ai-pro-expired',
      service: 'gemini',
      plan: 'Google AI Pro 프로모션',
      region: 'peru',
      kind: 'promo',
      billing: 'monthly',
      listPriceUsd: 20,
      isFree: false,
      prepayUsd: 10,
      monthlyEquivalentUsd: 10,
      renewalPriceUsd: null,
      localPrice: { currency: 'PEN', amount: 37, includesVat: false },
      priceBasis: 'converted',
      savingDisplay: '첫 6개월 50%',
      eligibility: '신규 가입자',
      caveat: '프로모션 종료 후 정가로 갱신됩니다.',
      status: 'official',
      evidenceType: 'promo',
      expiresAt: '2020-01-01',
      url: 'https://one.google.com/about/google-ai-plans/',
      verifiedAt: '2026-01-01'
    }
  ],
  researchNotes: [
    { area: 'cashback', result: 'none', note: '카드사 캐시백은 확인하지 못했습니다.' },
    { area: 'payment', result: 'partial', note: '해외결제 수수료는 카드사별로 다릅니다.' }
  ]
};

const ERROR_MESSAGE = '요금 데이터를 불러오지 못했습니다. 새로고침 후 다시 확인하세요.';

async function mockDeals(page, { body = FIXTURE, status = 200 } = {}) {
  await page.route('**/deals.json*', (route) => route.fulfill({
    status,
    contentType: 'application/json',
    body: typeof body === 'string' ? body : JSON.stringify(body)
  }));
}

test('AI 구독 카드 3건과 결과 건수를 보여준다', async ({ page }) => {
  await mockDeals(page);
  await page.goto('/ai-subs/');
  await expect(page.locator('.subs-card')).toHaveCount(3);
  await expect(page.locator('#subsResultCount')).toHaveText('3개');
  await expect(page.locator('#totalCount')).toHaveText('3');
  await expect(page.locator('[data-subs-id="chatgpt-plus-korea"]')).toContainText('실질 월 비용');
  await expect(page.locator('[data-subs-id="gemini-ai-pro-expired"]')).toContainText('추정');
});

test('서비스 필터로 줄이고 초기화하면 전체로 돌아온다', async ({ page }) => {
  await mockDeals(page);
  await page.goto('/ai-subs/');
  await page.locator('#subsService').selectOption('chatgpt');
  await expect(page.locator('.subs-card')).toHaveCount(1);
  await page.locator('#subsReset').click();
  await expect(page.locator('.subs-card')).toHaveCount(3);
  await expect(page.locator('#subsService')).toHaveValue('');
  await expect(page.locator('#subsResultCount')).toHaveText('3개');
});

test('지역 필터는 global 항목을 한국과 페루 양쪽에 포함한다', async ({ page }) => {
  await mockDeals(page);
  await page.goto('/ai-subs/');
  await page.locator('#subsRegion').selectOption('korea');
  await expect(page.locator('.subs-card')).toHaveCount(2);
  await expect(page.locator('[data-subs-id="claude-pro-global"]')).toHaveCount(1);

  await page.locator('#subsReset').click();
  await page.locator('#subsRegion').selectOption('peru');
  await expect(page.locator('.subs-card')).toHaveCount(2);
  await expect(page.locator('[data-subs-id="claude-pro-global"]')).toHaveCount(1);
  await expect(page.locator('[data-subs-id="chatgpt-plus-korea"]')).toHaveCount(0);
});

test('만료 항목은 expired 필터와 지표에 반영된다', async ({ page }) => {
  await mockDeals(page);
  await page.goto('/ai-subs/');
  await expect(page.locator('#expiredCount')).toHaveText('1');
  await page.locator('#subsStatus').selectOption('expired');
  await expect(page.locator('.subs-card')).toHaveCount(1);
  await expect(page.locator('.subs-card')).toHaveAttribute('data-subs-id', 'gemini-ai-pro-expired');
  await expect(page.locator('.subs-card')).toContainText('만료');
});

test('deals.json이 404면 오류 문구를 표시한다', async ({ page }) => {
  await mockDeals(page, { status: 404, body: '' });
  await page.goto('/ai-subs/');
  await expect(page.locator('#subsEmpty')).toBeVisible();
  await expect(page.locator('#subsEmptyMessage')).toHaveText(ERROR_MESSAGE);
  await expect(page.locator('.subs-card')).toHaveCount(0);
});

test('잘못된 JSON이면 예외 없이 오류 문구를 표시한다', async ({ page }) => {
  await mockDeals(page, { body: 'not json' });
  await page.goto('/ai-subs/');
  await expect(page.locator('#subsEmptyMessage')).toHaveText(ERROR_MESSAGE);
  await expect(page.locator('.subs-card')).toHaveCount(0);
});

test('사이드 기그 확인 기록은 AI 구독 확인 상태에 영향을 주지 않는다', async ({ page }) => {
  await mockDeals(page);
  await page.goto('/side-gigs/');
  await page.evaluate(() => {
    localStorage.setItem('sideGigSeenIds', JSON.stringify([
      'chatgpt-plus-korea', 'claude-pro-global', 'gemini-ai-pro-expired'
    ]));
  });

  await page.goto('/ai-subs/');
  const card = page.locator('.subs-card').first();
  const id = await card.getAttribute('data-subs-id');
  await expect(card).toHaveClass(/is-unreviewed/);
  await card.hover();
  await expect(card).not.toHaveClass(/is-unreviewed/);
  await expect(card.locator('.seen-status')).toBeVisible();

  const stored = await page.evaluate(() => ({
    ai: JSON.parse(localStorage.getItem('aiSubsSeenIds') || '[]'),
    side: JSON.parse(localStorage.getItem('sideGigSeenIds') || '[]')
  }));
  expect(stored.ai).toContain(id);
  expect(stored.side).toContain('chatgpt-plus-korea');
});

test('390/760/761/1440px에서 가로 스크롤이 없다', async ({ page }) => {
  await mockDeals(page);
  for (const width of [390, 760, 761, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/ai-subs/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${width}px 가로 오버플로`).toBeLessThanOrEqual(0);
    await expect(page.locator('.subs-card').first()).toBeVisible();
  }
});

test('검색어로 플랜을 좁힌다', async ({ page }) => {
  await mockDeals(page);
  await page.goto('/ai-subs/');
  await page.locator('#subsQuery').fill('Claude');
  await expect(page.locator('.subs-card')).toHaveCount(1);
  await expect(page.locator('.subs-card')).toHaveAttribute('data-subs-id', 'claude-pro-global');
  await expect(page.locator('#subsResultCount')).toHaveText('1개');
});

test('혜택 유형과 결제 주기 필터가 각각 동작한다', async ({ page }) => {
  await mockDeals(page);
  await page.goto('/ai-subs/');

  await page.locator('#subsKind').selectOption('promo');
  await expect(page.locator('.subs-card')).toHaveCount(1);
  await expect(page.locator('.subs-card')).toHaveAttribute('data-subs-id', 'gemini-ai-pro-expired');

  await page.locator('#subsReset').click();
  await page.locator('#subsKind').selectOption('billing');
  await expect(page.locator('.subs-card')).toHaveCount(2);

  await page.locator('#subsReset').click();
  await page.locator('#subsBilling').selectOption('annual');
  await expect(page.locator('.subs-card')).toHaveCount(0);
  await expect(page.locator('#subsEmptyMessage')).toHaveText('표시할 항목이 없습니다.');
});

test('기본 정렬은 공식 확인 → 확인 필요 → 만료 순이다', async ({ page }) => {
  await mockDeals(page);
  await page.goto('/ai-subs/');
  await expect(page.locator('.subs-card')).toHaveCount(3);
  const order = await page.locator('.subs-card').evaluateAll((cards) => cards.map((card) => card.dataset.subsId));
  expect(order).toEqual(['chatgpt-plus-korea', 'claude-pro-global', 'gemini-ai-pro-expired']);
});

test('숨김 보기에서도 다른 필터가 함께 적용된다', async ({ page }) => {
  await mockDeals(page);
  await page.goto('/ai-subs/');
  await page.locator('[data-subs-id="claude-pro-global"] .card-hide').click();
  await expect(page.locator('[data-subs-id="claude-pro-global"]')).toHaveCount(0);

  await page.locator('#subsStatus').selectOption('hidden');
  await expect(page.locator('.subs-card')).toHaveCount(1);
  await expect(page.locator('.subs-card')).toHaveAttribute('data-subs-id', 'claude-pro-global');

  await page.locator('#subsService').selectOption('chatgpt');
  await expect(page.locator('.subs-card')).toHaveCount(0);
  await expect(page.locator('#subsEmptyMessage')).toHaveText('표시할 항목이 없습니다.');
});

test('USD 가격은 환율로 환산해 추정치를 함께 보여준다', async ({ page }) => {
  await mockDeals(page);
  await page.goto('/ai-subs/');
  await expect(page.locator('[data-subs-id="chatgpt-plus-korea"] .subs-approx')).toContainText('₩27,600');
  await expect(page.locator('#subsFxNote')).toContainText('1,380원');
  await expect(page.locator('#subsFxNote')).toContainText('출처');
});

test('확인하지 못한 영역을 하단에 표시한다', async ({ page }) => {
  await mockDeals(page);
  await page.goto('/ai-subs/');
  await expect(page.locator('#subsNotes')).toBeVisible();
  await expect(page.locator('#subsNoteList li')).toHaveCount(2);
  await expect(page.locator('#subsNoteList')).toContainText('캐시백 · 미확인');
  await expect(page.locator('#subsNoteList')).toContainText('결제 수수료·세금 · 부분 확인');
});

test('키보드 Tab으로 필터에 도달한다', async ({ page }) => {
  await mockDeals(page);
  await page.goto('/ai-subs/');
  const filterIds = ['subsQuery', 'subsService', 'subsKind', 'subsRegion', 'subsBilling', 'subsStatus', 'subsReset'];
  let reached = '';
  for (let i = 0; i < 20 && !reached; i += 1) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => document.activeElement?.id || '');
    if (filterIds.includes(id)) reached = id;
  }
  expect(filterIds).toContain(reached);
});
