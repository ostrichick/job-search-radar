import { test, expect } from '@playwright/test';

test('paid, free and unverified tour prices remain distinct, with existing hide controls intact', async ({ page }) => {
  const row = (id, price, priceStatus, overrides = {}) => ({
    id, title: `Test ${id}`, region: '전주', category: '체험', audience: '누구나',
    price, priceStatus, sourceName: 'Fixture institution',
    sourceUrl: `https://example.org/${id}`, checkedAt: '2026-11-20',
    availabilityStatus: 'unverified', ...overrides
  });
  await page.route('**/tours.json*', (route) => route.fulfill({ json: {
    updatedAt: '2026-11-21T01:00:00Z',
    sourceStatus: [{ source: 'fixture', status: 'partial', message: 'Fixture failure' }],
    items: [
      row('free', '무료', 'free'),
      row('paid', '1인 10,000원', 'paid', { contentIdea: '촬영 허용 확인 필요' }),
      row('unknown', '', 'unknown', { sourceVerificationState: 'source_error', checkedAt: '' }),
      row('conflict', '10,000원', undefined, { free: true, checkedAt: '' })
    ]
  } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tours/');
  await expect(page.getByRole('heading', { name: /투어·체험/ })).toBeVisible();
  await expect(page.locator('.tour-card')).toHaveCount(4);
  await expect(page.locator('.tour-badge.free')).toHaveCount(1);
  await expect(page.locator('.tour-badge.paid')).toHaveCount(1);
  await expect(page.locator('.tour-badge.unknown')).toHaveCount(2);
  await expect(page.locator('.tour-card').filter({ hasText: 'Test conflict' })).toContainText('비용 확인 필요');
  await expect(page.locator('.tour-card').filter({ hasText: 'Test unknown' })).toContainText('참가비 확인 필요');
  await expect(page.locator('.tour-card').filter({ hasText: 'Test paid' })).toContainText('1인 10,000원');
  await expect(page.locator('.tour-card').filter({ hasText: 'Test unknown' })).toContainText('원문 확인일 미상');
  await page.locator('#tourCost').selectOption('free');
  await expect(page.locator('.tour-card')).toHaveCount(1);
  await expect(page.locator('.tour-card')).toContainText('Test free');
  await page.locator('#tourCost').selectOption('paid');
  await expect(page.locator('.tour-card')).toHaveCount(1);
  await expect(page.locator('.tour-card')).toContainText('Test paid');
  await page.locator('#tourCost').selectOption('');
  await expect(page.locator('.tour-card')).toHaveCount(4);
  const paid = page.locator('.tour-card').filter({ hasText: 'Test paid' });
  await paid.locator('.card-hide').click();
  await expect(page.locator('.tour-card')).toHaveCount(3);
  await page.locator('#tourVisibility').selectOption('hidden');
  await expect(page.locator('.tour-card')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
