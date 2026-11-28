import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const siteBase = 'https://ostrichick.github.io/job-search-radar';
const tabs = ['nicole', 'munseong', 'household', 'classes', 'tours', 'action', 'side-gigs', 'ai-subs'];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else files.push(target);
  }
  return files;
}

function attribute(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag);
  return match ? match[1] : '';
}

async function assertAsset(htmlFile, href, label) {
  assert.ok(href, `${label} href is empty in ${htmlFile}`);
  assert.ok(!href.startsWith('/'), `${label} must use a relative URL in ${htmlFile}: ${href}`);
  const clean = decodeURIComponent(href.split(/[?#]/)[0]);
  const asset = path.resolve(path.dirname(htmlFile), clean);
  await fs.access(asset).catch(() => assert.fail(`${label} asset is missing for ${htmlFile}: ${href}`));
  return asset;
}

async function pngSize(file) {
  const buffer = await fs.readFile(file);
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${file} is not a PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const tokens = await fs.readFile(path.join(publicDir, 'shared/tokens.css'), 'utf8');
const chrome = /--chrome-bg:\s*(#[0-9a-f]{6})\s*;/i.exec(tokens);
assert.ok(chrome, 'tokens.css is missing --chrome-bg');
const expectedTheme = chrome[1].toLowerCase();

const htmlFiles = (await walk(publicDir)).filter((file) => file.endsWith('.html'));
assert.ok(htmlFiles.length > 0, 'no HTML files found');

for (const file of htmlFiles) {
  const relative = path.relative(publicDir, file).replaceAll('\\', '/');
  const html = await fs.readFile(file, 'utf8');
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
  const icons = links.filter((tag) => /\brel\s*=\s*["']icon["']/i.test(tag));
  assert.ok(icons.length > 0, `${relative} is missing rel="icon"`);
  assert.ok(!icons.some((tag) => attribute(tag, 'href').startsWith('data:')), `${relative} still uses an inline data favicon`);
  const svgIcon = icons.find((tag) => /favicon\.svg(?:[?#]|$)/i.test(attribute(tag, 'href')));
  assert.ok(svgIcon, `${relative} is missing the shared SVG favicon`);
  assert.match(svgIcon, /type\s*=\s*["']image\/svg\+xml["']/i, `${relative} SVG favicon needs type="image/svg+xml"`);
  await assertAsset(file, attribute(svgIcon, 'href'), 'favicon');

  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const theme = metas.find((tag) => /\bname\s*=\s*["']theme-color["']/i.test(tag));
  assert.ok(theme, `${relative} is missing theme-color`);
  assert.equal(attribute(theme, 'content').toLowerCase(), expectedTheme, `${relative} theme-color does not match --chrome-bg`);

  const title = /<title>([\s\S]*?)<\/title>/i.exec(html);
  assert.ok(title && title[1].trim(), `${relative} needs a non-empty title`);

  // GitHub Pages는 /job-search-radar/ 하위에 배포되므로 로컬 자산은 상대 경로여야 하고,
  // 실제 파일이 있어야 한다. 선행 "/" 경로는 배포 후 404가 된다.
  for (const tag of html.matchAll(/<(?:link|script|img|source)\b[^>]*>/gi)) {
    const raw = tag[0];
    const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(raw)?.[1]
      ?? /\bsrc\s*=\s*["']([^"']*)["']/i.exec(raw)?.[1];
    if (!href) continue;
    if (/^(?:https?:)?\/\//i.test(href) || /^(?:data|mailto|tel):/i.test(href) || href.startsWith('#')) continue;
    assert.ok(!href.startsWith('/'), `${relative} must not use a root-absolute asset URL: ${href}`);
    await assertAsset(file, href, 'local asset');
  }

  const self = path.basename(path.dirname(file));
  if (!tabs.includes(self)) continue;

  const apple = links.find((tag) => /\brel\s*=\s*["']apple-touch-icon["']/i.test(tag));
  assert.ok(apple, `${relative} is missing apple-touch-icon`);
  await assertAsset(file, attribute(apple, 'href'), 'apple-touch-icon');

  const manifestLink = links.find((tag) => /\brel\s*=\s*["']manifest["']/i.test(tag));
  assert.ok(manifestLink, `${relative} is missing rel="manifest"`);
  const manifestFile = await assertAsset(file, attribute(manifestLink, 'href'), 'manifest');
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  assert.equal(manifest.theme_color?.toLowerCase(), expectedTheme, `${relative} manifest theme_color does not match --chrome-bg`);
  assert.equal(manifest.start_url, '../nicole/', `${relative} manifest start_url must target ../nicole/`);
  assert.equal(manifest.scope, '../', `${relative} manifest scope must be ../`);
  assert.ok(Array.isArray(manifest.icons), `${relative} manifest needs icons`);
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'any'), `${relative} manifest needs a purpose="any" icon`);
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'), `${relative} manifest needs a maskable icon`);
  for (const icon of manifest.icons) {
    const iconFile = path.resolve(path.dirname(manifestFile), icon.src);
    await fs.access(iconFile).catch(() => assert.fail(`${relative} manifest icon is missing: ${icon.src}`));
    const size = await pngSize(iconFile);
    assert.equal(`${size.width}x${size.height}`, icon.sizes, `${relative} manifest icon size mismatch: ${icon.src}`);
  }

  const meta = (key, value) => metas.find((tag) => new RegExp(`\\b${key}\\s*=\\s*["']${value}["']`, 'i').test(tag));
  const description = meta('name', 'description');
  assert.ok(description && attribute(description, 'content').trim(), `${relative} needs a non-empty description`);
  for (const property of ['og:type', 'og:title', 'og:description', 'og:image']) {
    assert.ok(meta('property', property), `${relative} is missing ${property}`);
  }
  assert.equal(attribute(meta('property', 'og:image'), 'content'), `${siteBase}/shared/icons/og-image.png`, `${relative} og:image does not use the shared image`);
  assert.equal(attribute(meta('property', 'og:image:width'), 'content'), '1200', `${relative} og:image width must be 1200`);
  assert.equal(attribute(meta('property', 'og:image:height'), 'content'), '630', `${relative} og:image height must be 630`);
  assert.equal(attribute(meta('name', 'twitter:card'), 'content'), 'summary_large_image', `${relative} needs twitter:card=summary_large_image`);
  const ogSize = await pngSize(path.join(publicDir, 'shared/icons/og-image.png'));
  assert.deepEqual(ogSize, { width: 1200, height: 630 }, 'og-image.png must be 1200x630');

  const nav = /<nav\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:sites|profile-switch)\b[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i.exec(html);
  assert.ok(nav, `${relative} is missing the shared tab navigation`);
  const anchors = [...nav[1].matchAll(/<a\b[^>]*>/gi)].map((match) => match[0]);
  assert.equal(anchors.length, tabs.length, `${relative} tab navigation must contain ${tabs.length} links`);
  const current = anchors.filter((tag) => attribute(tag, 'aria-current') === 'page');
  assert.equal(current.length, 1, `${relative} needs exactly one aria-current="page" tab`);
  assert.equal(attribute(current[0], 'href'), './', `${relative} current tab must link to ./`);
  const others = anchors.filter((tag) => tag !== current[0]).map((tag) => attribute(tag, 'href')).sort();
  const expected = tabs.filter((tab) => tab !== self).map((tab) => `../${tab}/`).sort();
  assert.deepEqual(others, expected, `${relative} tab destinations are incomplete or unexpected`);

  if (self === 'ai-subs') {
    const scriptSources = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
    assert.ok(scriptSources.includes('./ai-subs.js'), `${relative} must load ./ai-subs.js`);
    const source = await fs.readFile(path.join(publicDir, 'ai-subs/ai-subs.js'), 'utf8');
    assert.match(source, /fetch\(\s*['"]\.\/deals\.json['"]/, 'ai-subs.js must fetch ./deals.json with a relative URL');
  }
}

console.log(`site metadata checks passed (${htmlFiles.length} pages)`);
