import { test, expect } from '@playwright/test';

const job = (id, overrides = {}) => ({
  id, market: 'online', title: `Nicole test ${id}`, company: 'Example Studio', source: 'Job Platform',
  url: `https://example.org/${id}`, category: 'marketing', description: 'Marketing role',
  location: 'Remote', firstSeenAt: '2026-10-20T00:00:00Z', lastSeenAt: '2026-10-23T00:00:00Z',
  postedAt: '2026-10-19', languageRequirements: 'English', languageFitStatus: 'match',
  eligibilityStatus: 'unknown', collectionState: 'seen', ...overrides
});

test('freshness chip and unreviewed cards use readable neutral styling', async ({ page }) => {
  await page.route('**/tours.json*', (route) => route.fulfill({
    json: { updatedAt: new Date().toISOString(), items: [{ id: 'tour', checkedAt: new Date().toISOString() }], sourceStatus: [] }
  }));
  await page.goto('/tours/');
  await expect(page.locator('.freshness-chip')).toHaveText('전체 확인');
  const chipColor = await page.evaluate(() => getComputedStyle(document.querySelector('.freshness-chip')).color);
  expect(chipColor).toBe('rgb(23, 23, 23)');

  await page.goto('/action/');
  const card = page.locator('[data-action-id="outlier-korean-2026-11"]');
  await expect(card).toHaveClass(/is-unreviewed/);
  const shadow = await card.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).not.toContain('247, 228, 223');
});

test('Nicole unverified eligibility uses neutral color', async ({ page }) => {
  const jobs = [job('unverified', { eligibilityStatus: 'unknown', title: 'Unverified Eligibility Role' })];
  await page.route('**/feeds/dubu.json?*', (route) => route.fulfill({
    json: { updatedAt: new Date().toISOString(), jobs, sourceStatus: [] }
  }));
  await page.goto('/nicole/');
  const badge = (name) => page.locator('.eligibility-badge').filter({ hasText: name }).first();
  await expect(badge('Work eligibility unverified')).toBeVisible();
  expect(await badge('Work eligibility unverified').getAttribute('class')).not.toContain('eligible');
});

test('class details show verification date without source note and hide when both are absent', async ({ page }) => {
  const make = (id, sourceNote, verifiedAt) => ({
    id, title: id, provider: '기관', mode: 'online', costType: 'free', costLabel: '무료',
    level: '입문', audience: '누구나', schedule: '상시', location: '온라인',
    url: 'https://example.org', applyUrl: 'https://example.org', enrollment: 'open',
    sourceNote, verifiedAt
  });
  await page.route('**/data/classes.json', (route) => route.fulfill({
    json: {
      researchedAt: '2026-11-27T09:00:00+09:00',
      courses: [make('only-date', '', '2026-11-27T09:00:00+09:00'), make('nothing', '', null)],
      selfStudy: []
    }
  }));
  await page.goto('/classes/');
  const dated = page.locator('.class-card').filter({ hasText: 'only-date' });
  await expect(dated.locator('.class-details')).toBeVisible();
  await expect(dated.locator('.verify-note')).toContainText('2026.11.27');
  await expect(dated.locator('.source-note')).toBeHidden();
  const empty = page.locator('.class-card').filter({ hasText: 'nothing' });
  await expect(empty.locator('.class-details')).toBeHidden();
});

test('class titles stay aligned when cost chips wrap', async ({ page }) => {
  await page.goto('/classes/');
  await expect(page.locator('.class-card').first()).toBeVisible();
  const tops = await page.evaluate(() => [...document.querySelectorAll('.class-card')].map((card) => {
    const c = card.getBoundingClientRect();
    const t = card.querySelector('.class-title').getBoundingClientRect();
    return Math.round(t.top - c.top);
  }));
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);
});

test('side gig inline timestamp uses the shared date-time format', async ({ page }) => {
  await page.goto('/side-gigs/');
  await expect(page.locator('#gigUpdatedAtInline')).toHaveText(/^업데이트 \d{4}\.\d{2}\.\d{2} \d{2}:\d{2}$/);
});
