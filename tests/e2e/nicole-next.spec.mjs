import { test, expect } from '@playwright/test';

const job = (id, market = 'online', overrides = {}) => ({
  id, market, title: `Nicole test ${id}`, company: 'Example Studio', source: 'Job Platform',
  url: `https://example.org/${id}`, category: 'marketing', description: 'Marketing role',
  location: market === 'online' ? 'Remote' : '전북 전주시 덕진구',
  firstSeenAt: '2026-10-20T00:00:00Z', lastSeenAt: '2026-10-23T00:00:00Z',
  postedAt: '2026-10-19', languageRequirements: 'English', languageFitStatus: 'match',
  eligibilityStatus: 'unknown', collectionState: 'seen', ...overrides
});
const feed = { updatedAt: new Date().toISOString(), sourceStatus: [{ source: 'Job Platform', status: 'ok', count: 2 }], jobs: [
  job('online'), job('local', 'offline'), job('near', 'offline', { location: '전북 익산시', languageFitStatus: 'mismatch' }),
  job('old', 'offline', { collectionState: 'not_seen', location: '서울특별시' }),
  job('interpret', 'online', { category: 'interpreting', title: 'Live video interpreter' })
] };

test.beforeEach(async ({ page }) => {
  await page.route('**/feeds/dubu.json?*', (route) => route.fulfill({ json: feed }));
});

test('Nicole preview renders the shared app with her own feed and branding', async ({ page }) => {
  await page.goto('/nicole-next/');
  await expect(page).toHaveTitle("Nicole's Job Radar");
  await expect(page.locator('#marketOverseas')).toHaveText('Online');
  await expect(page.locator('#jobs .job-card')).toHaveCount(1);
  await expect(page.locator('#jobs')).toContainText('Nicole test online');
  await expect(page.locator('#jobs')).not.toContainText('Live video interpreter');
  await expect(page.locator('#jobs .compensation-value').first()).toHaveText('Pay not listed');
  await expect(page.locator('#jobs .distance-summary').first()).toBeHidden();
  await expect(page.locator('#jobs .eligibility-badge').first()).toHaveText('Work eligibility unverified');
  await expect(page.locator('#nicolePlatformLinks')).toContainText('KOWORK');
  await expect(page.locator('#nicoleHiddenManager')).toBeVisible();
});

test('Nicole filters retain language fit, commute, province and archived listings', async ({ page }) => {
  await page.goto('/nicole-next/');
  await page.locator('#marketDomestic').click();
  await expect(page.locator('#jobs .job-card')).toHaveCount(3);
  await page.locator('#languageFitFilter').selectOption('mismatch');
  await expect(page.locator('#jobs .job-card')).toHaveCount(1);
  await expect(page.locator('#jobs')).toContainText('near');
  await page.locator('#languageFitFilter').selectOption('all');
  await page.locator('#commuteFilter').selectOption('nearby');
  await expect(page.locator('#jobs')).toContainText('local');
  await expect(page.locator('#jobs .job-card')).toHaveCount(1);
  await page.locator('#commuteFilter').selectOption('all');
  await page.locator('#archiveFilter').selectOption('archived');
  await expect(page.locator('#jobs')).toContainText('old');
  await expect(page.locator('#jobs .job-card')).toHaveCount(1);
});

test('Nicole can save, hide company or source, restore and keep states after reload', async ({ page }) => {
  await page.goto('/nicole-next/');
  await page.locator('#jobs .favorite').first().click();
  await page.locator('#savedOnly').check();
  await expect(page.locator('#jobs .job-card')).toHaveCount(1);
  await page.locator('#jobs .mini-actions').getByRole('button', { name: 'Hide company' }).click();
  await expect(page.locator('#jobs .job-card')).toHaveCount(0);
  await expect(page.locator('#nicoleHiddenCount')).toHaveText('1 hidden');
  await page.locator('#nicoleHiddenList').getByRole('button', { name: /Restore hidden company/ }).click();
  await expect(page.locator('#jobs .job-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#jobs .favorite.active')).toHaveCount(1);
});

test('Manual Upwork and KOWORK jobs retain category, person market, source and saved state', async ({ page }) => {
  await page.goto('/nicole-next/');
  await page.locator('#addJobBtn').click();
  await page.locator('#addForm [name=title]').fill('Upwork test lead');
  await page.locator('#addForm [name=url]').fill('https://www.upwork.com/jobs/~test-lead');
  await page.locator('#addForm [name=nicoleCategory]').selectOption('content');
  await page.locator('#addForm button[value=default]').click();
  await expect(page.locator('#jobs')).toContainText('Upwork test lead');
  await expect(page.locator('#jobs')).toContainText('Upwork');
  await expect(page.locator('#nicoleManualEntries')).toContainText('Upwork test lead');
  await page.locator('#addJobBtn').click();
  await page.locator('#addForm [name=title]').fill('KOWORK test lead');
  await page.locator('#addForm [name=url]').fill('https://kowork.kr/en/jobs/test');
  await page.locator('#addForm [name=nicoleMarket]').selectOption('offline');
  await page.locator('#addForm [name=nicoleCategory]').selectOption('marketing');
  await page.locator('#addForm button[value=default]').click();
  await expect(page.locator('#marketDomestic')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#jobs')).toContainText('KOWORK test lead');
  await page.reload();
  await expect(page.locator('#jobs')).toContainText('KOWORK test lead');
  await page.locator('#marketOverseas').click();
  await expect(page.locator('#jobs')).toContainText('Upwork test lead');
});

test('Collection source drawer retains manual platform search links and states', async ({ page }) => {
  await page.route('**/feeds/dubu.json?*', (route) => route.fulfill({ json: {
    ...feed, sourceStatus: [{ source: 'Upwork', status: 'manual', count: 0, checkedAt: '2026-10-23T12:00:00Z',
      manualSearches: [{ label: 'Spanish translation', url: 'https://www.upwork.com/nx/search/jobs/?q=spanish%20translation' }] }]
  } }));
  await page.goto('/nicole-next/');
  await expect(page.locator('#nicoleSourceList')).toContainText('Upwork');
  await expect(page.locator('#nicoleSourceList')).toContainText('Manual search');
  await expect(page.locator('#nicoleSourceList').getByRole('link', { name: /Spanish translation/ })).toHaveAttribute('href', /upwork\.com/);
});

test('Two Nicole preview tabs share saved and hidden state without touching Munseong DB', async ({ page, context }) => {
  const other = await context.newPage();
  await Promise.all([page.goto('/nicole-next/'), other.goto('/nicole-next/')]);
  await page.locator('#jobs .favorite').click();
  await expect(other.locator('#jobs .favorite.active')).toHaveCount(1);
  await other.locator('#jobs .mini-actions').getByRole('button', { name: 'Hide source' }).click();
  await expect(page.locator('#nicoleHiddenCount')).toContainText('1 hidden');
  const dbNames = await page.evaluate(async () => (await indexedDB.databases()).map((item) => item.name));
  expect(dbNames).toContain('job-search-radar-nicole');
  expect(dbNames).not.toContain('job-search-radar');
});

test('Nicole preview remains read-only if IndexedDB fails', async ({ page }) => {
  await page.addInitScript(() => { indexedDB.open = () => { throw new Error('Storage denied'); }; });
  await page.goto('/nicole-next/');
  await expect(page.locator('#jobs .job-card')).toHaveCount(1);
  await expect(page.locator('#storageStatus')).toBeVisible();
  await expect(page.locator('#addJobBtn')).toBeDisabled();
});

test('Nicole preview has no horizontal overflow at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/nicole-next/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('English interface has no remaining Korean outside listing data', async ({ page }) => {
  await page.goto('/nicole-next/');
  await expect(page.locator('#jobs .job-card')).toHaveCount(1);
  const findUiKorean = () => page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const results = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const element = node.parentElement;
      if (!element || !/[가-힣]/.test(node.nodeValue || '')) continue;
      if (element.closest('script, style, template, noscript, .title, .company, .description, .meta, .tags, .tag, .source, .trust-badge, .compensation-value, #detailsDescription')) continue;
      if (element.closest('[hidden]')) continue;
      if (element.getClientRects().length === 0) continue;
      results.push({ element: element.outerHTML.slice(0, 140), text: node.nodeValue.trim().slice(0, 220) });
    }
    return results;
  });
  expect(await findUiKorean()).toEqual([]);
  await page.locator('#marketDomestic').click();
  expect(await findUiKorean()).toEqual([]);
  await page.locator('#jobs .details').first().click();
  expect(await findUiKorean()).toEqual([]);
});

test('first preview visit migrates original state once without modifying source document', async ({ page }) => {
  await page.route('**/munseong/app.js', (route) => route.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.goto('/nicole-next/');
  const original = {
    saved: ['online', 'manual:legacy'], hidden: { jobs: ['local'], companies: ['Example company'], sources: ['A platform'] },
    manual: [{ id: 'manual:legacy', title: 'Upwork research lead', url: 'https://www.upwork.com/jobs/~example', market: 'online', category: 'content', company: 'Test Client' }], revision: 4
  };
  await page.evaluate(async (doc) => {
    const request = indexedDB.open('dubu-job-radar', 1);
    await new Promise((resolve, reject) => { request.onupgradeneeded = () => request.result.createObjectStore('state'); request.onsuccess = resolve; request.onerror = reject; });
    const db = request.result;
    const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(doc, 'current');
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = reject; }); db.close();
  }, original);
  await page.unroute('**/munseong/app.js');
  await page.reload();
  await expect(page.locator('#nicoleHiddenCount')).toHaveText('3 hidden');
  await expect(page.locator('#nicoleManualEntries')).toContainText('Upwork research lead');
  const persisted = await page.evaluate(async () => {
    const read = (name) => new Promise((resolve, reject) => {
      const req = indexedDB.open(name); req.onsuccess = () => {
        const tx = req.result.transaction('state'); const get = tx.objectStore('state').get('current');
        get.onsuccess = () => { req.result.close(); resolve(get.result); }; get.onerror = reject;
      }; req.onerror = reject;
    });
    return { original: await read('dubu-job-radar'), next: await read('job-search-radar-nicole') };
  });
  expect(persisted.original).toEqual(original);
  expect(JSON.parse(persisted.next.values.jobFavorites)).toContain('online');
  expect(JSON.parse(persisted.next.values.manualJobs)[0].source).toBe('Upwork');
  expect(persisted.next.migrated).toBe(true);
  await page.evaluate(async () => {
    const req = indexedDB.open('dubu-job-radar');
    await new Promise((resolve) => { req.onsuccess = resolve; });
    const db = req.result;
    const tx = db.transaction('state', 'readwrite');
    tx.objectStore('state').put({ saved: ['changed-source'], hidden: { jobs: [], companies: [], sources: [] }, manual: [], revision: 5 }, 'current');
    await new Promise((resolve) => { tx.oncomplete = resolve; }); db.close();
  });
  await page.reload();
  expect(await page.evaluate(async () => new Promise((resolve) => {
    const req = indexedDB.open('job-search-radar-nicole'); req.onsuccess = () => {
      const tx = req.result.transaction('state'); const get = tx.objectStore('state').get('current');
      get.onsuccess = () => resolve(JSON.parse(get.result.values.jobFavorites));
    };
  }))).toContain('online');
});
