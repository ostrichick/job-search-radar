import { test, expect } from '@playwright/test';

test('한국어 강의 탭은 온라인·전주 오프라인 강의와 공식 링크를 보여준다', async ({ page }) => {
  await page.goto('/classes/');
  await expect(page.getByRole('heading', { name: /한국어·스페인어/ })).toBeVisible();
  await expect(page.locator('#sourceDate')).toHaveText('2026-11-17');
  await expect(page.locator('#totalCount')).toHaveText('9');
  await expect(page.locator('.class-card')).toHaveCount(9);
  await expect(page.locator('#courses')).toContainText('온라인 세종학당');
  await expect(page.locator('#courses')).toContainText('주시드니한국문화원');
  await expect(page.locator('#selfStudy .self-study-list li')).toHaveCount(10);
});

test('한국어 강의 탭은 390px에서 가로로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/classes/');
  await expect(page.locator('.class-card')).toHaveCount(9);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('스페인어 탭은 무료 온라인 강의를 우선 보여준다', async ({ page }) => {
  await page.goto('/classes/');
  await page.getByRole('tab', { name: '스페인어' }).click();
  await expect(page.locator('#totalCount')).toHaveText('1');
  await expect(page.locator('#onlineCount')).toHaveText('1');
  await expect(page.locator('#offlineCount')).toHaveText('0');
  await expect(page.locator('#freeCount')).toHaveText('1');
  await expect(page.locator('.class-card')).toHaveCount(1);
  await expect(page.locator('#selfStudy')).toContainText('Basic Spanish 1');
  await expect(page.locator('#selfStudy')).toContainText('Language Transfer');
  await page.locator('#cost').selectOption('free');
  await expect(page.locator('.class-card')).toHaveCount(1);
});

test('한국어 강의 탭은 무료·온라인·전주 오프라인 필터를 적용한다', async ({ page }) => {
  await page.goto('/classes/');
  await page.locator('#cost').selectOption('free');
  await expect(page.locator('.class-card')).toHaveCount(4);
  await expect(page.locator('#resultCount')).toHaveText('4개 강의');
  await page.locator('#cost').selectOption('');
  await page.locator('#mode').selectOption('offline');
  await expect(page.locator('.class-card')).toHaveCount(7);
  await expect(page.locator('#courses')).toContainText('전북대학교 한국어학당 정규과정');
  await page.locator('#mode').selectOption('');
  await page.locator('#query').fill('세종');
  await expect(page.locator('.class-card')).toHaveCount(3);
  await expect(page.locator('#courses')).toContainText('세종학당');
});
