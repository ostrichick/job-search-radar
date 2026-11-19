import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'public/shared/icons');

const radar = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#161c1a"/>
  <path d="M16 34h10l5-14 7 28 5-14h5" fill="none" stroke="#d8ff65" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const ogHtml = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1200px; height: 630px; background: #161c1a; color: #f8f5ea; font-family: "Malgun Gothic", "Noto Sans KR", sans-serif; }
  .board { position: relative; width: 100%; height: 100%; padding: 66px 78px; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
  .glow { position: absolute; right: -150px; top: -190px; width: 640px; height: 640px; border-radius: 50%; background: radial-gradient(circle, rgb(216 255 101 / 16%), transparent 68%); }
  .top { position: relative; display: flex; align-items: center; gap: 18px; }
  .mark { width: 76px; height: 76px; border-radius: 20px; border: 1px solid rgb(248 245 234 / 18%); background: #0f1412; display: grid; place-items: center; }
  .mark svg { width: 52px; height: 52px; }
  .eyebrow { margin: 0; color: #bfc9c4; font-size: 18px; font-weight: 800; letter-spacing: .22em; }
  h1 { position: relative; margin: 0; font-size: 78px; line-height: 1.12; letter-spacing: -.05em; font-weight: 800; }
  h1 em { color: #d8ff65; font-style: normal; }
  .sub { position: relative; margin: 20px 0 0; color: #bfc9c4; font-size: 27px; line-height: 1.5; }
  .bottom { position: relative; display: flex; justify-content: space-between; align-items: flex-end; color: #bfc9c4; font-size: 19px; }
  .tag { display: inline-flex; align-items: center; gap: 11px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #d8ff65; box-shadow: 0 0 0 8px rgb(216 255 101 / 12%); }
</style>
</head>
<body>
  <div class="board">
    <div class="glow"></div>
    <div class="top"><div class="mark">${radar}</div><p class="eyebrow">DIGITAL NOMAD · JEONJU</p></div>
    <div><h1>일과 생활을<br><em>한곳에서.</em></h1><p class="sub">구인 · 복지 · 강의 · 체험 · 실행</p></div>
    <div class="bottom"><span class="tag"><span class="dot"></span>전주·전북 생활 대시보드</span><span>ostrichick.github.io/job-search-radar</span></div>
  </div>
</body>
</html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['maskable-512.png', 512]]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<!doctype html><style>html,body{margin:0;width:${size}px;height:${size}px;background:#161c1a}svg{display:block;width:${size}px;height:${size}px}</style>${radar}`);
    await page.screenshot({ path: path.join(outputDir, name), clip: { x: 0, y: 0, width: size, height: size } });
    console.log(`wrote public/shared/icons/${name}`);
  }
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(ogHtml, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(outputDir, 'og-image.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log('wrote public/shared/icons/og-image.png');
} finally {
  await browser.close();
}
