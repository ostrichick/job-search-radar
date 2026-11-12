import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Optional local Chromium-family browser when Playwright's bundled browser is not installed.
if (process.env.HOUSEHOLD_BROWSER_PATH) test.use({ launchOptions: { executablePath: process.env.HOUSEHOLD_BROWSER_PATH } });

test('가구 지원 목록은 공식 링크와 신청기한을 구분한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/household/');
  await expect(page.getByRole('heading', { name: /우리 집에 맞는 혜택을/ })).toBeVisible();
  await expect(page.locator('#totalCount')).toHaveText('64');
  await expect(page.locator('#closedCount')).toHaveText('11');
  await expect(page.locator('.card')).toHaveCount(64);
  await expect(page.getByRole('link', { name: '공식 근거 ↗' })).toHaveCount(64);
  await page.locator('#period').selectOption('closed');
  await expect(page.locator('.card')).toHaveCount(11);
  await expect(page.locator('#programs')).toContainText('2026 전주시 청년월세 지원');
  await expect(page.locator('#programs')).not.toContainText('국민취업지원제도');
  await page.locator('#category').selectOption('tax');
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.locator('#empty')).toBeVisible();
  expect(errors).toEqual([]);
});

test('별도 IndexedDB로 가구 정보와 신청 메모를 저장하고 새로고침 후 복원한다', async ({ page }) => {
  await page.goto('/household/');
  const before = await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name));
  expect(before).toContain('jeonju-household-support-v1');
  expect(before).not.toContain('job-search-radar');
  expect(before).not.toContain('dubu-job-radar');
  await page.locator('#profileToggle').click();
  await page.locator('#selfBirthYear').fill('1988');
  await page.locator('#spouseBirthYear').fill('1999');
  await page.locator('[name=housing]').selectOption('monthly');
  await page.getByRole('button', { name: '이 기기에 저장' }).click();
  await expect(page.locator('#profileSummary')).toContainText('1988 / 1999');
  const program = page.locator('[data-program-id="earned-income-2025-late"]');
  await program.getByRole('combobox', { name: /신청 상태/ }).selectOption('preparing');
  await program.getByRole('textbox', { name: /개인 메모/ }).fill('국세청에 혼인 시점 문의');
  await program.getByRole('textbox', { name: /개인 메모/ }).blur();
  await expect(page.locator('#savedCount')).toHaveText('1');
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('jeonju-household-support-v1');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return new Promise((resolve) => {
      const tx = db.transaction('household', 'readonly');
      const r = tx.objectStore('household').get('current');
      r.onsuccess = () => { const result = r.result; db.close(); resolve(result?.tracking?.['earned-income-2025-late']?.note); };
    });
  })).toBe('국세청에 혼인 시점 문의');
  await page.reload();
  await expect(page.locator('#savedCount')).toHaveText('1');
  await expect(page.locator('#profileSummary')).toContainText('1988 / 1999');
  await expect(page.locator('[data-program-id="earned-income-2025-late"] textarea')).toHaveValue('국세청에 혼인 시점 문의');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportBtn').click()]);
  const backup = await readFile(await download.path());
  const parsed = JSON.parse(backup.toString('utf8'));
  expect(parsed.profile.selfBirthYear).toBe('1988');
  expect(parsed.tracking['earned-income-2025-late'].note).toBe('국세청에 혼인 시점 문의');
  await page.locator('[data-program-id="earned-income-2025-late"] select').selectOption('none');
  await expect(page.locator('#savedCount')).toHaveText('0');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#importFile').setInputFiles({ name: 'household-backup.json', mimeType: 'application/json', buffer: backup });
  await expect(page.locator('#savedCount')).toHaveText('1');
  await expect(page.locator('[data-program-id="earned-income-2025-late"] textarea')).toHaveValue('국세청에 혼인 시점 문의');
  const after = await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name));
  expect(after).toEqual(before);
});

test('모바일 390px 화면에서 가로 넘침 없이 목록 및 기존 프로필 이동', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/household/');
  await expect(page.getByRole('link', { name: 'Nicole · Jobs' })).toHaveAttribute('href', '../nicole/');
  await expect(page.locator('.card')).toHaveCount(64);
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  await page.goto('/munseong/');
  await expect(page.getByRole('link', { name: '우리 집 지원' })).toHaveAttribute('href', '../household/');
  const munseongWidth = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(munseongWidth).toBeLessThanOrEqual(0);
  await page.goto('/nicole/');
  await expect(page.getByRole('link', { name: 'Household benefits' })).toHaveAttribute('href', '../household/');
  const nicoleWidth = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(nicoleWidth).toBeLessThanOrEqual(0);
});

test('복지정보를 이미 확인함으로 표시하고 확인 여부로 필터링한다', async ({ page }) => {
  await page.goto('/household/');
  const card = page.locator('[data-program-id="earned-income-2025-late"]');
  await card.getByRole('button', { name: /이미 확인함/ }).click();
  await expect(card).toHaveClass(/is-checked/);
  await expect(card.getByRole('button', { name: /확인 취소/ })).toBeVisible();
  await expect(card.getByRole('button', { name: /확인 취소/ })).toBeFocused();
  await page.locator('#tracking').selectOption('checked');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('#programs')).toContainText('2025년 귀속 근로장려금');
  await page.locator('#tracking').selectOption('unchecked');
  await expect(page.locator('#programs')).not.toContainText('2025년 귀속 근로장려금');
  await page.locator('#tracking').selectOption('');
  await card.getByRole('button', { name: /확인 취소/ }).click();
  await expect(card).not.toHaveClass(/is-checked/);
});
