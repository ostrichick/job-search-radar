import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Optional local Chromium-family browser when Playwright's bundled browser is not installed.
if (process.env.HOUSEHOLD_BROWSER_PATH) test.use({ launchOptions: { executablePath: process.env.HOUSEHOLD_BROWSER_PATH } });

test('가구 지원 목록은 공식 링크와 신청기한을 구분한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/household/');
  await expect(page.getByRole('heading', { name: /우리 집에 맞는 혜택을/ })).toBeVisible();
  await expect(page.locator('#totalCount')).toHaveText('8');
  await expect(page.locator('.card')).toHaveCount(8);
  await expect(page.getByRole('link', { name: '공식 근거 ↗' })).toHaveCount(8);
  await expect(page.getByRole('link', { name: '신청·조회 페이지 ↗' })).toHaveCount(7);
  await expect(page.locator('[data-program-id="jeonju-exam-fee-2026"]')).toHaveCount(0);
  await expect(page.locator('[data-program-id="jeonju-marriage-migrant-ged-2026"]')).toHaveCount(0);
  await expect(page.locator('[data-program-id="jeonju-newlywed-wedding-cost-dec-2026"]')).toHaveCount(0);
  await expect(page.locator('[data-program-id="jeonju-wedding-in-jeonju-2026"]')).toHaveCount(0);
  await expect(page.locator('[data-program-id="employment-support-i-2026"]')).toHaveCount(1);
  await expect(page.locator('[data-program-id="earned-income-2025-late"]')).toHaveCount(0);
  await expect(page.locator('[data-program-id="rent-tax-credit-2025"]')).toHaveCount(0);
  await expect(page.locator('[data-program-id="jeonju-youth-mind-care-2026-nov"]')).toHaveCount(0);
  await expect(page.locator('[data-program-id="jeonju-saeil-women-intern-2026"]')).toHaveCount(0);
  await expect(page.locator('[data-program-id="jeonbuk-youth-daldali-savings-2026"]')).toHaveCount(0);
  await expect(page.locator('[data-program-id="mental-health-counseling-voucher-2026"]')).toHaveCount(0);
  await expect(page.locator('[data-program-id="jeonju-citizen-safety-insurance-2026"]')).toHaveCount(0);
  await expect(page.locator('[data-program-id="jeonju-multicultural-home-visit-education"]')).toHaveCount(0);
  await expect(page.locator('[data-program-id="jeonju-multicultural-child-language-development"]')).toHaveCount(0);
  await expect(page.locator('[data-program-id="jeonju-bilingual-family-environment"]')).toHaveCount(0);
  await expect(page.locator('#programs')).not.toContainText('스포츠강좌이용권');
  await expect(page.locator('#programs')).not.toContainText('문화누리카드');
  await expect(page.locator('#programs')).not.toContainText('소상공인 카드수수료');
  await expect(page.locator('#programs')).not.toContainText('아이돌봄서비스');
  await expect(page.locator('#programs')).not.toContainText('전세대출 이자');
  await expect(page.locator('#programs')).not.toContainText('난임부부');
  await expect(page.locator('[data-program-id="jeonju-family-center-topik-fall-2026"]').getByRole('link', { name: '프로그램 목록 ↗' })).toHaveCount(1);
  await page.locator('#category').selectOption('tax');
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.locator('#empty')).toBeVisible();
  expect(errors).toEqual([]);
});

test('허용 목록·신청 링크·마감 여부를 각각 검증한다', async ({ page }) => {
  const data = JSON.parse(await readFile(new URL('../../public/household/data/programs.json', import.meta.url), 'utf8'));
  const source = new Map(data.programs.map((program) => [program.id, program]));
  const open = structuredClone(source.get('employment-support-i-2026'));
  open.end = '2026-11-21';
  const noLink = structuredClone(source.get('tomorrow-learning-2026'));
  delete noLink.applyUrl;
  const closed = structuredClone(source.get('housing-benefit-2026'));
  closed.end = '2026-11-19';
  const notAllowed = structuredClone(source.get('jeonju-exam-fee-2026'));
  notAllowed.end = '2026-12-31';
  notAllowed.applyUrl = 'https://example.org/apply';

  await page.clock.install({ time: new Date('2026-11-20T12:00:00+09:00') });
  await page.route('**/household/data/programs.json*', (route) => route.fulfill({
    json: { researchedAt: '2026-11-20', programs: [open, noLink, closed, notAllowed] }
  }));
  await page.goto('/household/');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card')).toHaveAttribute('data-program-id', 'employment-support-i-2026');
  await page.locator('#query').fill('국민취업지원제도');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('#totalCount')).toHaveText('1');

  await page.clock.fastForward(2 * 24 * 60 * 60 * 1000);
  await page.locator('#query').dispatchEvent('input');
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.locator('#totalCount')).toHaveText('0');
  await expect(page.locator('#openCount')).toHaveText('0');
});

test('마감된 추적 프로그램의 상태와 메모를 잃지 않는다', async ({ page }) => {
  const data = JSON.parse(await readFile(new URL('../../public/household/data/programs.json', import.meta.url), 'utf8'));
  const source = new Map(data.programs.map((program) => [program.id, program]));
  const open = structuredClone(source.get('tomorrow-learning-2026'));
  open.end = '2026-12-31';
  const expired = structuredClone(open);
  expired.end = '2026-01-01';
  let showExpired = false;

  await page.route('**/household/data/programs.json*', (route) => route.fulfill({
    json: { researchedAt: '2026-11-20', programs: [showExpired ? expired : open] }
  }));
  await page.goto('/household/');
  const card = page.locator('[data-program-id="tomorrow-learning-2026"]');
  await card.getByRole('combobox', { name: /신청 상태/ }).selectOption('preparing');
  await card.getByRole('textbox', { name: /개인 메모/ }).fill('만료 후에도 보존');
  await card.getByRole('textbox', { name: /개인 메모/ }).blur();
  await expect(page.locator('#savedCount')).toHaveText('1');

  showExpired = true;
  await page.reload();
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.locator('#savedCount')).toHaveText('1');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportBtn').click()]);
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(backup.tracking['tomorrow-learning-2026'].status).toBe('preparing');
  expect(backup.tracking['tomorrow-learning-2026'].note).toBe('만료 후에도 보존');
});

test('별도 IndexedDB로 가구 정보와 신청 메모를 저장하고 새로고침 후 복원한다', async ({ page }) => {
  await page.goto('/household/');
  // The page opens IndexedDB asynchronously; a fast navigation can finish
  // before its first transaction starts, especially under parallel E2E load.
  await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name)))
    .toContain('jeonju-household-support-v1');
  const before = await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name));
  expect(before).not.toContain('job-search-radar');
  expect(before).not.toContain('dubu-job-radar');
  await page.locator('#profileToggle').click();
  await page.locator('#selfBirthYear').fill('1988');
  await page.locator('#spouseBirthYear').fill('1999');
  await page.locator('[name=housing]').selectOption('monthly');
  await page.getByRole('button', { name: '이 기기에 저장' }).click();
  await expect(page.locator('#profileSummary')).toContainText('1988 / 1999');
  const program = page.locator('[data-program-id="tomorrow-learning-2026"]');
  await program.getByRole('combobox', { name: /신청 상태/ }).selectOption('preparing');
  await program.getByRole('textbox', { name: /개인 메모/ }).fill('훈련과정 상담 문의');
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
      r.onsuccess = () => { const result = r.result; db.close(); resolve(result?.tracking?.['tomorrow-learning-2026']?.note); };
    });
  })).toBe('훈련과정 상담 문의');
  await page.reload();
  await expect(page.locator('#savedCount')).toHaveText('1');
  await expect(page.locator('#profileSummary')).toContainText('1988 / 1999');
  await expect(page.locator('[data-program-id="tomorrow-learning-2026"] textarea')).toHaveValue('훈련과정 상담 문의');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportBtn').click()]);
  const backup = await readFile(await download.path());
  const parsed = JSON.parse(backup.toString('utf8'));
  expect(parsed.profile.selfBirthYear).toBe('1988');
  expect(parsed.tracking['tomorrow-learning-2026'].note).toBe('훈련과정 상담 문의');
  await page.locator('[data-program-id="tomorrow-learning-2026"] select').selectOption('none');
  await expect(page.locator('#savedCount')).toHaveText('0');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#importFile').setInputFiles({ name: 'household-backup.json', mimeType: 'application/json', buffer: backup });
  await expect(page.locator('#savedCount')).toHaveText('1');
  await expect(page.locator('[data-program-id="tomorrow-learning-2026"] textarea')).toHaveValue('훈련과정 상담 문의');
  const after = await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name));
  expect(after).toEqual(before);
});

test('모바일 390px 화면에서 가로 넘침 없이 목록 및 기존 프로필 이동', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/household/');
  await expect(page.getByRole('link', { name: 'Nicole' })).toHaveAttribute('href', '../nicole/');
  await expect(page.locator('.card')).toHaveCount(8);
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  await page.goto('/munseong/');
  await expect(page.getByRole('link', { name: '우리 집 복지' })).toHaveAttribute('href', '../household/');
  const munseongWidth = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(munseongWidth).toBeLessThanOrEqual(0);
  await page.goto('/nicole/');
  await expect(page.getByRole('link', { name: 'Benefits' })).toHaveAttribute('href', '../household/');
  const nicoleWidth = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(nicoleWidth).toBeLessThanOrEqual(0);
});

test('복지카드에 머물면 확인 안 함 표시가 사라지고 확인 여부로 필터링한다', async ({ page }) => {
  await page.goto('/household/');
  const card = page.locator('[data-program-id="tomorrow-learning-2026"]');
  await expect(card).toHaveClass(/is-unreviewed/);
  await card.hover();
  await page.waitForTimeout(900);
  await expect(card).not.toHaveClass(/is-unreviewed/);
  await expect(card.locator('.seen-status')).toBeVisible();
  await page.locator('#tracking').selectOption('checked');
  await expect(page.locator('.card')).toHaveCount(0);
  await page.locator('#tracking').selectOption('unchecked');
  await expect(page.locator('#programs')).toContainText('국민내일배움카드');
  await page.reload();
  await page.locator('#tracking').selectOption('checked');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('#programs')).toContainText('국민내일배움카드');
  await page.locator('#tracking').selectOption('unchecked');
  await expect(page.locator('#programs')).not.toContainText('국민내일배움카드');
});

test('복지 카드를 숨기고 숨김 필터에서 복원한다', async ({ page }) => {
  await page.goto('/household/');
  await expect(page.locator('.card')).toHaveCount(8);
  const total = await page.locator('.card').count();
  await expect(page.locator('.card .card-hide')).toHaveCount(total);
  await page.locator('.card .card-hide').first().click();
  await expect(page.locator('.card')).toHaveCount(total - 1);
  await page.reload();
  await expect(page.locator('.card')).toHaveCount(total - 1);
  await page.locator('#tracking').selectOption('hidden');
  await expect(page.locator('.card')).toHaveCount(1);
  await page.locator('.card .card-hide').click();
  await expect(page.locator('.card')).toHaveCount(0);
  await page.locator('#tracking').selectOption('');
  await expect(page.locator('.card')).toHaveCount(total);
});
