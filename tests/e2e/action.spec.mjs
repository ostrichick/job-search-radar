import { test, expect } from '@playwright/test';

test('실행 탭은 긴급 항목과 Munseong·Nicole 실행 링크를 분리해 보여준다', async ({ page }) => {
  await page.goto('/munseong/');
  await page.getByRole('link', { name: '실행' }).click();
  await expect(page).toHaveURL(/\/action\/$/);
  await expect(page.locator('.action-card')).toHaveCount(17);
  await expect(page.locator('#actionResultCount')).toHaveText('17개 실행 항목');
  await expect(page.locator('[data-action-id="coupang-cs-2026-11"]')).toContainText('쿠팡 고객서비스 전문가');
  await expect(page.locator('[data-action-id="coupang-cs-2026-11"] .action-deadline')).toContainText('마감');

  await page.locator('#actionFilters [data-filter="nicole"]').click();
  await expect(page.locator('.action-card')).toHaveCount(4);
  await expect(page.locator('[data-action-id="cellimax-latam-2026-11"]')).toContainText('셀리맥스');

  await page.locator('#actionFilters [data-filter="all"]').click();
  await page.locator('#actionQuery').fill('니콜');
  await expect(page.locator('.action-card')).toHaveCount(4);
  await page.locator('#actionQuery').fill('쿠팡');
  await expect(page.locator('.action-card')).toHaveCount(1);
  await expect(page.locator('.action-card')).toContainText('서울 송파');
});

test('마감 시각이 지나면 열린 화면에서도 자동으로 마감 처리된다', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-19T18:59:00+09:00') });
  await page.goto('/action/');
  const card = page.locator('[data-action-id="coupang-cs-2026-11"]');
  await expect(card).not.toHaveClass(/is-closed/);
  await expect(page.locator('#urgentCount')).toHaveText('1');
  await page.clock.fastForward(120000);
  await expect(card).toHaveClass(/is-closed/);
  await expect(card.locator('.action-deadline')).toContainText('마감');
  await expect(page.locator('#urgentCount')).toHaveText('0');
  await expect(page.locator('.action-card').last()).toHaveAttribute('data-action-id', 'coupang-cs-2026-11');
});

test('모든 탭의 최종 확인일 안내와 날짜 형식이 일치한다', async ({ page }) => {
  const feed = { updatedAt: new Date().toISOString(), jobs: [], sourceStatus: [] };
  await page.route('**/api/jobs', (route) => route.fulfill({ json: feed }));
  await page.route('**/jobs.json*', (route) => route.fulfill({ json: feed }));
  await page.route('**/tours.json*', (route) => route.fulfill({
    json: { updatedAt: new Date().toISOString(), items: [], sourceStatus: [] }
  }));
  const koreanCaveat = '최종 확인일 · 카드의 확인일 이후 모집·마감·자격이 바뀔 수 있으니 지원 전 공식 원문을 다시 확인하세요.';
  const englishCaveat = 'Last checked · Deadlines, eligibility, and pay may change after the check date; confirm the official source before applying.';
  const datePattern = /^\d{4}\.\d{2}\.\d{2}( \d{2}:\d{2})?$/;
  const pages = [
    ['/munseong/', '최종 확인일', '#feedUpdatedAt'],
    ['/household/', '최종 확인일', '#sourceDate'],
    ['/classes/', '최종 확인일', '#sourceDate'],
    ['/tours/', '목록 갱신 시각', '#tourUpdatedAt'],
    ['/action/', '최종 확인일', '#actionUpdatedAt']
  ];
  for (const [path, label, dateSelector] of pages) {
    await page.goto(path);
    await expect(page.locator('.data-caveat')).toHaveCount(1);
    await expect(page.locator('main > .data-caveat:first-child')).toHaveCount(1);
    await expect(page.locator('.data-caveat')).toHaveText(path === '/tours/'
      ? '가격·일정·참가 자격·촬영 허용 여부는 변동될 수 있습니다. 출처 확인일과 현재 예약 가능 여부는 별개이므로 기관에 재확인하세요.'
      : koreanCaveat);
    await expect(page.locator('.hero-aside')).toContainText(label);
    await expect(page.locator(dateSelector)).toHaveText(datePattern);
  }
  await page.route('**/feeds/dubu.json?*', (route) => route.fulfill({
    json: { updatedAt: new Date().toISOString(), jobs: [], sourceStatus: [] }
  }));
  await page.goto('/nicole/');
  await expect(page.locator('.data-caveat')).toHaveCount(1);
  await expect(page.locator('main > .data-caveat:first-child')).toHaveCount(1);
  await expect(page.locator('.data-caveat')).toHaveText(englishCaveat);
  await expect(page.locator('.hero-aside')).toContainText('Last checked');
  await expect(page.locator('#feedUpdatedAt')).toHaveText(datePattern);
});

test('실행 카드의 확인 표시와 체크리스트는 브라우저에 저장된다', async ({ page }) => {
  await page.goto('/action/');
  const card = page.locator('[data-action-id="outlier-korean-2026-11"]');
  await expect(card).toHaveClass(/is-unreviewed/);
  await expect(card.locator('.seen-status')).toBeHidden();
  await card.hover();
  await page.waitForTimeout(700);
  await expect(card).not.toHaveClass(/is-unreviewed/);
  await expect(card.locator('.seen-status')).toBeVisible();

  const firstCheck = page.locator('#actionChecklist input').first();
  await expect(firstCheck).not.toBeChecked();
  await firstCheck.check();
  await page.reload();
  await expect(page.locator('[data-action-id="outlier-korean-2026-11"] .seen-status')).toBeVisible();
  await expect(page.locator('[data-action-id="outlier-korean-2026-11"]')).not.toHaveClass(/is-unreviewed/);
  await expect(page.locator('#actionChecklist input').first()).toBeChecked();
});

test('실행 카드를 숨기고 숨김 필터에서 복원한다', async ({ page }) => {
  await page.goto('/action/');
  const total = await page.locator('.action-card').count();
  await expect(page.locator('.action-card .card-hide')).toHaveCount(total);
  await page.locator('.action-card .card-hide').first().click();
  await expect(page.locator('.action-card')).toHaveCount(total - 1);
  await page.reload();
  await expect(page.locator('.action-card')).toHaveCount(total - 1);
  await page.locator('#actionFilters [data-filter="hidden"]').click();
  await expect(page.locator('.action-card')).toHaveCount(1);
  await page.locator('.action-card .card-hide').click();
  await expect(page.locator('.action-card')).toHaveCount(0);
  await page.locator('#actionFilters [data-filter="all"]').click();
  await expect(page.locator('.action-card')).toHaveCount(total);
});
test('상단 nav와 eyebrow 간격이 데스크톱과 모바일에서 같다', async ({ page }) => {
  const gap = async (path) => {
    await page.goto(path);
    return page.evaluate(() => {
      const nav = document.querySelector('.profile-switch, .sites').getBoundingClientRect();
      const eyebrow = document.querySelector('.eyebrow').getBoundingClientRect();
      const h1 = document.querySelector('h1').getBoundingClientRect();
      return { gap: Math.round(eyebrow.top - nav.bottom), h1Width: h1.width, h1Height: h1.height };
    });
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopTopbar = await gap('/munseong/');
  const desktopHero = await gap('/classes/');
  expect(Math.abs(desktopTopbar.gap - desktopHero.gap)).toBeLessThanOrEqual(1);
  expect(desktopTopbar.gap).toBeGreaterThanOrEqual(23);
  expect(desktopTopbar.gap).toBeLessThanOrEqual(25);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileTopbar = await gap('/munseong/');
  const mobileHero = await gap('/classes/');
  expect(Math.abs(mobileTopbar.gap - mobileHero.gap)).toBeLessThanOrEqual(1);
  expect(mobileTopbar.h1Width).toBeGreaterThan(1);
  expect(mobileHero.h1Width).toBeGreaterThan(1);
});
