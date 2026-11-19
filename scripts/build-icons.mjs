import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public/shared/icons/apple-touch-icon.png');

const icon = `
<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#161c1a"/>
  <path d="M16 34h10l5-14 7 28 5-14h5" fill="none" stroke="#d8ff65" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><style>html,body{margin:0;width:180px;height:180px;background:#161c1a}svg{display:block}</style>${icon}`);
  await page.screenshot({ path: output, clip: { x: 0, y: 0, width: 180, height: 180 } });
  console.log(`wrote ${path.relative(root, output)}`);
} finally {
  await browser.close();
}
