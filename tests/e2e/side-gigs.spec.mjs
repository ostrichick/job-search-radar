import { test, expect } from '@playwright/test';

test('사이드 기그 페이지는 큐레이션 목록과 정책 위험 안내를 보여준다', async ({ page }) => {
  await page.goto('/side-gigs/');
  await expect(page.locator('.gig-card')).toHaveCount(22);
  await expect(page.locator('#totalCount')).toHaveText('22');
  await expect(page.locator('#officialCount')).toHaveText('10');
  await expect(page.locator('#checkCount')).toHaveText('12');
  await expect(page.locator('.policy-warning')).toContainText('YouTube 구독');
  await expect(page.locator('.policy-warning')).toContainText('앱 별점');
  await expect(page.locator('.gig-card').first()).toContainText('공식 페이지');
  await expect(page.locator('.gig-card').first()).toContainText('한국 수령');
  await expect(page.locator('.gig-pay-source').first()).toBeVisible();

  await page.locator('#gigCategory').selectOption('ai-data');
  await expect(page.locator('.gig-card')).toHaveCount(5);
  await expect(page.locator('#gigCount')).toHaveText('5개');

  await page.locator('#gigReset').click();
  await page.locator('#gigLanguage').selectOption('es');
  await expect(page.locator('.gig-card')).toHaveCount(3);
  await expect(page.locator('.gig-card')).toContainText(['Fiverr', 'Upwork', 'Appen CrowdGen']);

  await page.locator('#gigReset').click();
  await page.locator('#gigRisk').selectOption('safe');
  await expect(page.locator('.gig-card')).toHaveCount(6);
});

test('모든 페이지의 상단 메뉴는 7개 탭을 서로 연결한다', async ({ page }) => {
  for (const tab of ['nicole', 'munseong', 'household', 'classes', 'tours', 'action', 'side-gigs']) {
    await page.goto(`/${tab}/`);
    const nav = page.locator('nav.profile-switch, nav.sites').first();
    await expect(nav.locator('a')).toHaveCount(7);
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
  }
});

test('사이드 기그 페이지는 390px에서 가로로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/side-gigs/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('.gig-card').first()).toBeVisible();
});
