import { test, expect } from '@playwright/test';
import { formatDateTime } from '../../public/shared/date-format.js';

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
    ['/tours/', '최종 확인일', '#tourUpdatedAt'],
    ['/action/', '최종 확인일', '#actionUpdatedAt'],
    ['/side-gigs/', '최종 확인일', '#gigUpdatedAt'],
    ['/ai-subs/', '최종 확인일', '#aiSubsUpdatedAt']
  ];
  for (const [path, label, dateSelector] of pages) {
    await page.goto(path);
    await expect(page.locator('.data-caveat')).toHaveCount(1);
    await expect(page.locator('main > .data-caveat:first-child')).toHaveCount(1);
    const caveat = path === '/tours/'
      ? '가격·일정·참가 자격·촬영 허용 여부는 변동될 수 있습니다. 출처 확인일과 현재 예약 가능 여부는 별개이므로 기관에 재확인하세요.'
      : path === '/side-gigs/'
        ? '최종 확인일 · 카드의 확인일 이후 보수·자격·모집 상태가 바뀔 수 있으니 신청 전 공식 원문을 다시 확인하세요.'
        : path === '/ai-subs/'
          ? '최종 확인일 · 요금·할인·캐시백은 수시로 바뀌므로 결제 전 공식 페이지에서 다시 확인하세요.'
          : koreanCaveat;
    await expect(page.locator('.data-caveat')).toHaveText(caveat);
    await expect(page.locator('.hero-aside')).toContainText(label);
    await expect(page.locator(dateSelector)).toHaveText(datePattern);
    await expect(page.locator('.hero-aside .freshness-kind')).not.toBeEmpty();
    await expect(page.locator('.hero-aside .freshness-chip')).not.toBeEmpty();
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
  await expect(page.locator('.hero-aside .freshness-kind')).not.toBeEmpty();
  await expect(page.locator('.hero-aside .freshness-chip')).not.toBeEmpty();
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

test('여덟 탭의 상단 높이와 탭 버튼 위치가 어긋나지 않는다', async ({ page }) => {
  const paths = ['/munseong/', '/nicole/', '/household/', '/classes/', '/tours/', '/action/', '/side-gigs/', '/ai-subs/'];
  for (const [width, height, padding] of [[1440, 900, 24], [761, 900, 24], [760, 900, 18], [390, 844, 18]]) {
    await page.setViewportSize({ width, height });
    const heights = [];
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const layout = await page.evaluate(() => {
        const header = document.querySelector('header').getBoundingClientRect();
        const firstLink = document.querySelector('.profile-switch a, .sites a');
        const aside = document.querySelector('.hero-aside');
        const links = [...document.querySelectorAll('.profile-switch a, .sites a')];
        const actions = [...document.querySelectorAll('.topbar .actions button')].filter((el) => el.getClientRects().length);
        const titles = [...document.querySelectorAll('header h1, header .lede, header .subtitle')].filter((el) => el.getClientRects().length);
        const inside = (r) => r.top >= header.top - 1 && r.bottom <= header.bottom + 1 && r.left >= header.left - 1 && r.right <= header.right + 1;
        const rectsInside = (els) => els.length > 0 && els.every((el) => inside(el.getBoundingClientRect()));
        return {
          height: Math.round(header.height),
          navExists: Boolean(firstLink),
          navTop: firstLink ? Math.round(firstLink.getBoundingClientRect().top - header.top) : -1,
          asideExists: Boolean(aside),
          asideInside: aside ? inside(aside.getBoundingClientRect()) : false,
          linksInside: rectsInside(links),
          actionsInside: actions.length ? rectsInside(actions) : true,
          titlesInside: rectsInside(titles),
          overflow: document.documentElement.scrollWidth > window.innerWidth
        };
      });
      heights.push(layout.height);
      expect(layout.navExists).toBe(true);
      expect(Math.abs(layout.navTop - padding)).toBeLessThanOrEqual(2);
      expect(layout.asideExists).toBe(true);
      expect(layout.asideInside).toBe(true);
      expect(layout.linksInside).toBe(true);
      expect(layout.actionsInside).toBe(true);
      expect(layout.titlesInside).toBe(true);
      expect(layout.overflow).toBe(false);
    }
    // 761~900px는 topbar가 액션 버튼과 탭 내비 폭을 나눠 쓰고, 1440px에서도 탭 8개가
    // 폰트에 따라 한 줄/두 줄로 갈린다. 두 구간은 최소 높이와 내부 배치를 확인하고,
    // min-height가 높이를 지배하는 760·390px에서만 정확한 높이 일치를 요구한다.
    if (width === 761) {
      for (const value of heights) expect(value).toBeGreaterThanOrEqual(430);
    } else if (width === 1440) {
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(46);
    } else {
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);
    }
  }
});


test('freshness status reflects provenance, partial checks, failures and timezone', async ({ page }) => {
  const feed = { updatedAt: new Date().toISOString(), jobs: [], sourceStatus: [] };
  await page.route('**/api/jobs', (route) => route.fulfill({ json: feed }));
  await page.route('**/jobs.json*', (route) => route.fulfill({ json: feed }));
  await page.goto('/action/');
  await expect(page.locator('.freshness-kind')).toHaveText('수동 확인');
  await expect(page.locator('.freshness-chip')).toHaveText('일부 확인 · 4건 미확인');
  const cleanTourFeed = { updatedAt: new Date().toISOString(), items: [{ id: 'tour', checkedAt: new Date().toISOString() }], sourceStatus: [] };
  await page.route('**/tours.json*', (route) => route.fulfill({ json: cleanTourFeed }));
  await page.goto('/tours/');
  await expect(page.locator('.freshness-kind')).toHaveText('자동 수집');
  await expect(page.locator('.freshness-chip')).toHaveText('전체 확인');
  await page.goto('/munseong/');
  await expect(page.locator('.freshness-chip')).toHaveText('확인 상태 미확인');
  await page.route('**/actions.json*', (route) => route.fulfill({ status: 500, body: '{}' }));
  await page.goto('/action/');
  await expect(page.locator('.freshness-chip')).toHaveText('확인 상태 미확인');
  expect(formatDateTime('2026-11-24')).toBe('2026.11.24');
  expect(formatDateTime('2026-11-25T15:30:00Z')).toBe('2026.11.26 00:30');
});

test('freshness reports unknown when tour collection fails or language switch fails', async ({ page }) => {
  const failedTourFeed = {
    updatedAt: new Date().toISOString(),
    items: [{ id: 'tour-failed', checkedAt: new Date().toISOString(), sourceVerificationState: 'source_error' }],
    sourceStatus: [{ source: 'tour-source', status: 'failed', message: 'offline' }]
  };
  await page.route('**/tours.json*', (route) => route.fulfill({ json: failedTourFeed }));
  await page.goto('/tours/');
  await expect(page.locator('.freshness-chip')).toHaveText('확인 상태 미확인');

  await page.goto('/classes/');
  await expect(page.locator('.freshness-chip')).not.toBeEmpty();
  await page.route('**/spanish-classes.json*', (route) => route.fulfill({ status: 500, body: '{}' }));
  await page.locator('[data-language="es"]').click();
  await expect(page.locator('.freshness-chip')).toHaveText('확인 상태 미확인');
});
