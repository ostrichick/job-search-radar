import { test, expect } from '@playwright/test';

const sourceStatus = [
  { source: '가상 출처', status: 'ok', count: 4, detail: '테스트 전용 공개 공고', checkedAt: '2026-10-19T01:00:00Z' },
  { source: '고용24', status: 'not_configured', count: 0, detail: 'WORK24_AUTH_KEY 미설정', checkedAt: '2026-10-19T01:00:00Z' },
];

const basic = { company: '가상회사', source: '가상 출처', sourceKind: 'public_api', verifiedAt: '2026-10-19T01:00:00Z',
  firstSeenAt: '2026-10-19T01:00:00Z', lastSeenAt: '2026-10-19T01:00:00Z',
  postedAt: '2026-10-18', deadline: '2026-11-18', languageRequirements: '스페인어', eligibilityStatus: 'unknown', eligibility: '확인 필요',
  collectionState: 'seen', pay: '', description: '수집 및 필터 UI 동작 검사에만 사용하는 가상 공고', workplaceMode: 'onsite' };

const feed = { updatedAt: '2026-10-19T01:00:00Z', sourceStatus, jobs: [
  { ...basic, id: 'fixture:online', title: 'Spanish social media strategist', category: 'marketing', location: 'Remote', market: 'online', workplaceMode: 'remote', url: 'https://example.org/jobs/online' },
  { ...basic, id: 'fixture:interpreting', title: 'Video interpreter (Spanish)', category: 'interpreting', location: 'Remote', market: 'online', workplaceMode: 'remote', url: 'https://example.org/jobs/interpreter' },
  { ...basic, id: 'fixture:jeonju', title: '전주 스페인어 마케팅', category: 'marketing', location: '전북 전주시 덕진구', market: 'offline', url: 'https://example.org/jobs/jeonju' },
  { ...basic, id: 'fixture:iksan', title: '익산 광고 콘텐츠', category: 'advertising', location: '전북 익산시', market: 'offline', url: 'https://example.org/jobs/iksan' },
  { ...basic, id: 'fixture:seoul', title: '서울 브랜드 마케터', category: 'marketing', location: '서울특별시 강남구', market: 'offline', url: 'https://example.org/jobs/seoul' },
  { ...basic, id: 'fixture:old', title: '서울 과거 공고', category: 'marketing', location: '서울특별시', market: 'offline',
    collectionState: 'not_seen', firstSeenAt: '2026-10-02T01:00:00Z', lastSeenAt: '2026-10-02T01:00:00Z', url: 'https://example.org/jobs/old' },
] };

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-19T12:00:00Z') });
  await page.route('**/feeds/dubu.json', (route) => route.fulfill({ json: feed }));
});

test('relative collection labels use an explicit clock at the 3-day and 7-day boundaries', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-10-23T12:00:00Z'));
  await page.goto('/dubu/');
  await expect(page.locator('#list-online .job-card').first()).toContainText('Added within 7 days');
  await page.clock.setSystemTime(new Date('2026-10-27T12:00:00Z'));
  await page.reload();
  await expect(page.locator('#list-online .job-card').first()).toContainText('Added 8 days ago');
  await expect(page.locator('#feed-message')).toContainText('over 24 hours');
});

test('two tabs preserve independent saves, explicit removal and concurrent manual additions', async ({ page, context }) => {
  await page.unroute('**/feeds/dubu.json');
  await context.route('**/feeds/dubu.json', (route) => route.fulfill({ json: { ...feed, jobs: [feed.jobs[0], { ...feed.jobs[0], id: 'fixture:second', title: 'Spanish Content Editor', url: 'https://example.org/second' }] } }));
  const other = await context.newPage();
  await Promise.all([page.goto('/dubu/'), other.goto('/dubu/')]);
  await Promise.all([page.locator('.bookmark-button').first().click(), other.locator('.bookmark-button').nth(1).click()]);
  for (const p of [page, other]) await expect(p.locator('.bookmark-button[aria-pressed=true]')).toHaveCount(2);
  await other.locator('.bookmark-button').first().click();
  await expect(page.locator('.bookmark-button[aria-pressed=true]')).toHaveCount(1);
  const add = async (p, name) => {
    await p.locator('#manual-entry > summary').click();
    await p.locator('#manual-title').fill(name);
    await p.locator('#manual-url').fill('https://example.org/' + name);
    await p.locator('#manual-category').selectOption('content');
    await p.locator('#manual-form button[type=submit]').click();
  };
  await Promise.all([add(page, 'First'), add(other, 'Second')]);
  await expect(page.locator('#manual-count')).toContainText('2');
  await expect(other.locator('#manual-count')).toContainText('2');
  await page.reload();
  await expect(page.locator('.bookmark-button[aria-pressed=true]')).toHaveCount(3);
  await expect(page.locator('#manual-count')).toContainText('2');
});

test('storage notifications preserve two-tab hiding and restoration without BroadcastChannel', async ({ page, context }) => {
  await context.addInitScript(() => { window.BroadcastChannel = undefined; });
  await page.unroute('**/feeds/dubu.json');
  await context.route('**/feeds/dubu.json', (route) => route.fulfill({ json: { ...feed, jobs: [feed.jobs[0], { ...feed.jobs[0], id: 'fixture:second', title: 'Spanish Content Editor', url: 'https://example.org/second' }] } }));
  const other = await context.newPage();
  await Promise.all([page.goto('/dubu/'), other.goto('/dubu/')]);
  await page.locator('#list-online .hide-toggle').first().click();
  const pendingHide = page.getByRole('button', { name: 'Hide this job', exact: true });
  await pendingHide.focus();
  await other.locator('#list-online .bookmark-button').first().click();
  await expect(page.locator('#list-online .bookmark-button').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#list-online .hide-menu').first()).toHaveAttribute('open', '');
  await expect(pendingHide).toBeFocused();
  await page.locator('#list-online .hide-toggle').first().click();
  await Promise.all([page.locator('#list-online .hide-toggle').first().click(), other.locator('#list-online .hide-toggle').nth(1).click()]);
  await Promise.all([page.getByRole('button', { name: 'Hide this job', exact: true }).click(), other.getByRole('button', { name: 'Hide this job', exact: true }).click()]);
  for (const p of [page, other]) await expect(p.locator('#hidden-count')).toHaveText('2 hidden');
  await page.getByRole('button', { name: /Restore hidden job.*social media/ }).click();
  await expect(other.locator('#hidden-count')).toHaveText('1 hidden');
  await other.getByRole('button', { name: /Restore hidden job.*Content Editor/ }).click();
  await expect(page.locator('#hidden-count')).toHaveText('0 hidden');
  await page.reload();
  await expect(page.locator('#list-online .job-card')).toHaveCount(2);
});

test('legacy state migrates once and source upgrades preserve saved and hidden IDs', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nicole-job-radar:watchlist:v1', '["old-index"]');
    localStorage.setItem('nicole-job-radar:hidden:v1', '{"jobs":["old-index"],"companies":[],"sources":[]}');
  });
  await page.route('**/feeds/dubu.json', (route) => route.fulfill({ json: { ...feed, jobs: [{ ...feed.jobs[0], id: 'curated:new', legacyIds: ['old-index'] }] } }));
  await page.goto('/dubu/');
  await expect(page.locator('#hidden-count')).toHaveText('1 hidden');
  await page.locator('#hidden-manager > summary').click();
  await page.getByRole('button', { name: /Restore hidden job/ }).click();
  await expect(page.locator('.bookmark-button')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.bookmark-button').click();
  await expect(page.locator('.bookmark-button')).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('.bookmark-button')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('nicole-job-radar:watchlist:v1'))).toBe('["old-index"]');
});

test('failed state writes leave committed bookmarks unchanged', async ({ page }) => {
  await page.goto('/dubu/');
  await expect(page.locator('#list-online .bookmark-button')).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => { IDBObjectStore.prototype.put = function () { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; });
  await page.locator('#list-online .bookmark-button').click();
  await expect(page.locator('#feed-message')).toContainText('Changes were not saved');
  await expect(page.locator('#list-online .bookmark-button')).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('#list-online .bookmark-button')).toHaveAttribute('aria-pressed', 'false');
});

test('unavailable IndexedDB still shows the feed and disables personal changes', async ({ page }) => {
  await page.addInitScript(() => { indexedDB.open = () => { throw Error('Storage unavailable'); }; });
  await page.goto('/dubu/');
  await expect(page.locator('#list-online .bookmark-button')).toBeDisabled();
  await expect(page.locator('#feed-message')).toContainText('read-only');
});

test('Dubu Job Radar is branded in English and foreign-friendly original-site links remain direct', async ({ page }) => {
  await page.goto('/dubu/');
  await expect(page).toHaveTitle(/Dubu Job Radar/);
  await expect(page.locator('.brand-words')).toContainText('DUBU');
  await expect(page.locator('#panel-online .collection-date-note')).toContainText('Added to Radar');
  await expect(page.locator('#list-online .job-card').first()).toContainText('Last collected 2026-10-19');
  await expect(page.locator('#list-online .job-card').first()).toContainText('Added to Radar 2026-10-19');
  await expect(page.locator('#list-online .job-card').first()).toContainText('Added recently');
  await page.locator('#tab-offline').click();
  const links = page.locator('#panel-offline .platform-grid a');
  await expect(links).toHaveCount(6);
  await expect(links.first()).toHaveAttribute('href', 'https://kowork.kr/en');
  await expect(page.locator('#panel-offline .platform-footnote')).toContainText('lightweight public-listing discovery');
});

test('manual original-page research distinguishes source review from repeated feed inclusion', async ({ page }) => {
  const researched = {
    ...basic, id: 'fixture:curated', source: 'Company Careers', sourceKind: 'curated_research',
    title: 'Spanish content intern', company: 'Example Studio', market: 'offline', category: 'content',
    location: 'Seoul', url: 'https://example.org/jobs/curated',
    postedAt: null, researchReviewedAt: '2026-10-16T00:00:00Z',
    firstSeenAt: '2026-10-17T00:00:00Z', lastSeenAt: '2026-10-19T01:00:00Z',
  };
  await page.route('**/feeds/dubu.json', (route) => route.fulfill({ json: {
    ...feed, jobs: [researched],
  } }));
  await page.goto('/dubu/');
  await page.locator('#tab-offline').click();
  const card = page.locator('#list-offline .job-card');
  await expect(card).toContainText('Source last reviewed 2026-10-16');
  await expect(card).toContainText('Added to Radar 2026-10-17');
  await expect(card).toContainText('Last included in feed 2026-10-19');
  await expect(card).toContainText('Posted');
  await expect(card).toContainText('Not listed');
});

test('online avoids live interpreting; offline includes nationwide and retains historical jobs', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/dubu/');
  await expect(page.locator('#tab-count-online')).toHaveText('1');
  await page.locator('#tab-offline').click();
  await expect(page.locator('#tab-count-offline')).toHaveText('4');
  await expect(page.locator('.region-nearby')).toHaveCount(1);
  await expect(page.locator('.region-expanded')).toHaveCount(1);
  await expect(page.locator('.region-relocation')).toHaveCount(2);
  await page.locator('#province-offline').selectOption('서울');
  await expect(page.locator('#list-offline .job-card')).toHaveCount(2);
  await page.locator('#archive-offline').selectOption('archived');
  await expect(page.locator('#list-offline .job-card')).toHaveCount(1);
  await expect(page.locator('#list-offline')).toContainText('서울 과거 공고');
  await expect(page.locator('#list-offline .job-card')).toContainText('Added 17 days ago');
  await expect(page.locator('#list-offline .job-card')).toContainText('Last collected 2026-10-02');
  await page.locator('#source-drawer > summary').click();
  await expect(page.locator('#source-list')).toContainText('WORK24_AUTH_KEY is not configured');
  expect(errors).toEqual([]);
});

test('manual Upwork lead appears immediately and survives reload', async ({ page }) => {
  await page.goto('/dubu/');
  await page.locator('#manual-entry > summary').click();
  await page.locator('#manual-title').fill('Spanish content microproject');
  await page.locator('#manual-url').fill('https://www.upwork.com/jobs/~fixture-only');
  await page.locator('#manual-category').selectOption('content');
  await page.locator('#manual-form button[type=submit]').click();
  await expect(page.locator('#list-online')).toContainText('Spanish content microproject');
  await page.reload();
  await expect(page.locator('#list-online')).toContainText('Spanish content microproject');
  await expect(page.locator('#manual-count')).toContainText('1');
});

test('hiding a job persists and restoring brings the listing back', async ({ page }) => {
  await page.goto('/dubu/');
  await expect(page.locator('#list-online .job-card')).toHaveCount(1);
  await page.locator('#list-online .hide-toggle').click();
  await page.getByRole('button', { name: 'Hide this job', exact: true }).click();
  await expect(page.locator('#list-online .job-card')).toHaveCount(0);
  await expect(page.locator('#hidden-count')).toHaveText('1 hidden');
  await page.reload();
  await expect(page.locator('#list-online .job-card')).toHaveCount(0);
  await page.locator('#hidden-manager > summary').click();
  await expect(page.locator('#hidden-list')).toContainText('Spanish social media strategist');
  await page.getByRole('button', { name: /Restore hidden job/ }).click();
  await expect(page.locator('#list-online .job-card')).toHaveCount(1);
  await expect(page.locator('#hidden-count')).toHaveText('0 hidden');
});

test('company and source blocks work across tabs and the saved-only filter', async ({ page }) => {
  await page.goto('/dubu/');
  await page.locator('#list-online .bookmark-button').click();
  await page.locator('#saved-online').check();
  await page.locator('#list-online .hide-toggle').click();
  await page.getByRole('button', { name: 'Hide this company', exact: true }).click();
  await expect(page.locator('#list-online .job-card')).toHaveCount(0);
  await page.locator('#tab-offline').click();
  await expect(page.locator('#tab-count-offline')).toHaveText('0');
  await expect(page.locator('#hidden-manager')).toHaveAttribute('open', '');
  await page.getByRole('button', { name: /Restore hidden company/ }).click();
  await expect(page.locator('#tab-count-offline')).toHaveText('4');
  await page.locator('#tab-online').click();
  await expect(page.locator('#list-online .job-card')).toHaveCount(1);
  await page.locator('#list-online .hide-toggle').click();
  await page.getByRole('button', { name: 'Hide this source/platform' }).click();
  await expect(page.locator('#list-online .job-card')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#tab-count-online')).toHaveText('0');
  await page.locator('#hidden-manager > summary').click();
  await page.getByRole('button', { name: /Restore hidden source/ }).click();
  await expect(page.locator('#tab-count-online')).toHaveText('1');
});

test('hiding Upwork hides only that manually saved platform and can be undone', async ({ page }) => {
  await page.goto('/dubu/');
  await page.locator('#manual-entry > summary').click();
  const add = async (title, url) => {
    await page.locator('#manual-title').fill(title);
    await page.locator('#manual-url').fill(url);
    await page.locator('#manual-form button[type=submit]').click();
  };
  await add('Upwork sample lead', 'https://www.upwork.com/jobs/~sample-only');
  await add('Workana sample lead', 'https://www.workana.com/job/sample-only');
  await expect(page.locator('#list-online .job-card')).toHaveCount(3);
  const card = page.locator('#list-online .job-card').filter({ hasText: 'Upwork sample lead' });
  await expect(card).toContainText('Upwork');
  await card.locator('.hide-toggle').click();
  await page.getByRole('button', { name: 'Hide this source/platform' }).click();
  await expect(page.locator('#list-online')).not.toContainText('Upwork sample lead');
  await expect(page.locator('#list-online')).toContainText('Workana sample lead');
  await page.reload();
  await expect(page.locator('#list-online')).not.toContainText('Upwork sample lead');
  await page.locator('#hidden-manager > summary').click();
  await page.getByRole('button', { name: /Restore hidden source/ }).click();
  await expect(page.locator('#list-online')).toContainText('Upwork sample lead');
  await expect(page.locator('#manual-count')).toContainText('2 saved');
});

test('narrow screen has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dubu/');
  await expect(page.locator('#tab-online')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('profile switch moves between Asul and Dubu on the same site', async ({ page }) => {
  await page.route('**/jobs.json?*', (route) => route.fulfill({ json: { updatedAt: '2026-10-19T11:00:00Z', jobs: [], sourceStatus: [] } }));
  await page.goto('/dubu/');
  const dubuSwitch = page.getByRole('navigation', { name: 'Choose whose jobs to view' });
  await expect(dubuSwitch.getByRole('link', { name: 'Dubu' })).toHaveAttribute('aria-current', 'page');
  await dubuSwitch.getByRole('link', { name: 'Asul' }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  const asulSwitch = page.getByRole('navigation', { name: '누구의 공고를 볼지 선택' });
  await expect(asulSwitch.getByRole('link', { name: 'Asul' })).toHaveAttribute('aria-current', 'page');
  await asulSwitch.getByRole('link', { name: 'Dubu' }).click();
  await expect(page).toHaveURL(/\/dubu\/$/);
  await expect(page.locator('#page-heading')).toBeVisible();
});
