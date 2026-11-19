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
  const koreanCaveat = '최종 확인일 · 카드의 확인일 이후 모집·마감·자격이 바뀔 수 있으니 지원 전 공식 원문을 다시 확인하세요.';
  const englishCaveat = 'Last checked · Deadlines, eligibility, and pay may change after the check date; confirm the official source before applying.';
  for (const path of ['/munseong/', '/household/', '/classes/', '/tours/', '/action/']) {
    await page.goto(path);
    await expect(page.locator('.data-caveat')).toHaveCount(1);
    await expect(page.locator('main > .data-caveat:first-child')).toHaveCount(1);
    await expect(page.locator('.data-caveat')).toHaveText(koreanCaveat);
  }
  await page.goto('/nicole/');
  await expect(page.locator('.data-caveat')).toHaveCount(1);
  await expect(page.locator('main > .data-caveat:first-child')).toHaveCount(1);
  await expect(page.locator('.data-caveat')).toHaveText(englishCaveat);
  await page.goto('/household/');
  await expect(page.locator('.hero-aside')).toContainText('최종 확인일');
  await page.goto('/classes/');
  await expect(page.locator('.hero-aside')).toContainText('최종 확인일');
  await expect(page.locator('#sourceDate')).toHaveText(/^\d{4}\.\d{2}\.\d{2}$/);
  await page.goto('/tours/');
  await expect(page.locator('.hero-aside')).toContainText('최종 수집 시각');
  await page.goto('/action/');
  await expect(page.locator('.hero-aside')).toContainText('최종 갱신');
  await expect(page.locator('#actionUpdatedAt')).toHaveText(/^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}$/);
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
