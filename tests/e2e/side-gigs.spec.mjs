import { test, expect } from '@playwright/test';

test('사이드 기그 페이지는 큐레이션 목록과 필터를 보여준다', async ({ page }) => {
  await page.goto('/side-gigs/');
  await expect(page.locator('.gig-card')).toHaveCount(18);
  await expect(page.locator('#totalCount')).toHaveText('18');
  await expect(page.locator('#officialCount')).toHaveText('7');
  await expect(page.locator('#checkCount')).toHaveText('11');
  await expect(page.locator('.policy-warning')).toHaveCount(0);
  for (const duplicate of ['DataAnnotation', 'Mindrift', 'Prolific', 'Upwork']) {
    await expect(page.locator('.gig-platform').filter({ hasText: duplicate })).toHaveCount(0);
  }
  await expect(page.locator('.gig-card').first()).toContainText('공식 페이지');
  await expect(page.locator('.gig-card').first()).toContainText('한국 수령');
  await expect(page.locator('.gig-pay-source').first()).toBeVisible();

  await page.locator('#gigCategory').selectOption('ai-data');
  await expect(page.locator('.gig-card')).toHaveCount(3);
  await expect(page.locator('#gigCount')).toHaveText('3개');

  await page.locator('#gigReset').click();
  await page.locator('#gigLanguage').selectOption('es');
  await expect(page.locator('.gig-card')).toHaveCount(2);
  await expect(page.locator('.gig-card')).toContainText(['Fiverr', 'Appen CrowdGen']);

  await page.locator('#gigReset').click();
  await page.locator('#gigRisk').selectOption('safe');
  await expect(page.locator('.gig-card')).toHaveCount(5);
});

test('모든 페이지의 상단 메뉴는 8개 탭을 서로 연결한다', async ({ page }) => {
  for (const tab of ['nicole', 'munseong', 'household', 'classes', 'tours', 'action', 'side-gigs', 'ai-subs']) {
    await page.goto(`/${tab}/`);
    const nav = page.locator('nav.profile-switch, nav.sites').first();
    await expect(nav.locator('a')).toHaveCount(8);
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
  }
});

test('사이드 기그 카드에 머물면 확인 상태가 저장된다', async ({ page }) => {
  await page.goto('/side-gigs/');
  const card = page.locator('.gig-card').first();
  const id = await card.getAttribute('data-gig-id');
  await expect(card).toHaveClass(/is-unreviewed/);
  await card.hover();
  await expect(card).not.toHaveClass(/is-unreviewed/);
  await expect(card.locator('.seen-status')).toBeVisible();
  await page.reload();
  await expect(page.locator(`.gig-card[data-gig-id="${id}"]`)).not.toHaveClass(/is-unreviewed/);
  await expect(page.locator(`.gig-card[data-gig-id="${id}"] .seen-status`)).toBeVisible();
});

test('사이드 기그 카드를 숨기고 숨김 보기에서 복원한다', async ({ page }) => {
  await page.goto('/side-gigs/');
  const card = page.locator('.gig-card').first();
  const id = await card.getAttribute('data-gig-id');
  await card.locator('.card-hide').click();
  await expect(page.locator(`.gig-card[data-gig-id="${id}"]`)).toHaveCount(0);

  await page.locator('#gigCategory').selectOption('ai-data');
  await page.locator('#gigVisibility').selectOption('hidden');
  await expect(page.locator(`.gig-card[data-gig-id="${id}"]`)).toHaveCount(1);

  await page.locator(`.gig-card[data-gig-id="${id}"] .card-hide`).click();
  await expect(page.locator(`.gig-card[data-gig-id="${id}"]`)).toHaveCount(0);

  await page.locator('#gigReset').click();
  await expect(page.locator('#gigVisibility')).toHaveValue('active');
  await expect(page.locator(`.gig-card[data-gig-id="${id}"]`)).toHaveCount(1);
});

test('사이드 기그 페이지는 390px에서 가로로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/side-gigs/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('.gig-card').first()).toBeVisible();
});
