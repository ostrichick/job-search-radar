import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const tabs = ['nicole', 'munseong', 'household', 'classes', 'tours', 'action'];

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

  const self = path.basename(path.dirname(file));
  if (!tabs.includes(self)) continue;

  const apple = links.find((tag) => /\brel\s*=\s*["']apple-touch-icon["']/i.test(tag));
  assert.ok(apple, `${relative} is missing apple-touch-icon`);
  await assertAsset(file, attribute(apple, 'href'), 'apple-touch-icon');

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
}

console.log(`site metadata checks passed (${htmlFiles.length} pages)`);
