// Renders the link-preview card and the icons into public/.
// Run after changing the design of the card:  npm run build:images
// The results are committed, so the site itself never needs a browser.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchBrowser } from '../test/browser/launch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const fileUrl = (...parts) => pathToFileURL(path.join(pub, ...parts)).href;

const card = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Link preview</title>
<style>
@font-face{font-family:Bangers;src:url(${fileUrl('fonts', 'bangers-latin.woff2')}) format("woff2")}
@font-face{font-family:Anton;src:url(${fileUrl('fonts', 'anton-latin.woff2')}) format("woff2")}
@font-face{font-family:Archivo;font-weight:100 900;src:url(${fileUrl('fonts', 'archivo-latin.woff2')}) format("woff2")}
*{box-sizing:border-box}
body{margin:0}
.card{position:relative;overflow:hidden;width:1200px;height:630px;padding:28px;background:#FF6900;color:#111111;font-family:Archivo,Arial,sans-serif}
.frame{position:relative;height:100%;border:5px solid #111111;display:flex;flex-direction:column}
.mast{background:#111111;color:#FFF3E1;padding:14px 28px;display:flex;align-items:center;justify-content:space-between;gap:24px;font-family:Anton,Impact,sans-serif;text-transform:uppercase;letter-spacing:.05em;font-size:28px;line-height:1.1}
.art{position:relative;overflow:hidden;flex:1;display:flex;align-items:center;padding:0 48px}
.art img{position:absolute;right:0;bottom:0;width:560px;height:auto;opacity:.42}
.title{position:relative;margin:0;font-family:Bangers,Impact,sans-serif;font-weight:400;text-transform:uppercase;letter-spacing:.012em;font-size:148px;line-height:.9;color:#FFF3E1;transform:rotate(-3deg);-webkit-text-stroke:.085em #111111;paint-order:stroke fill;text-shadow:.012em .012em 0 #111111,.024em .024em 0 #111111,.036em .036em 0 #111111,.048em .048em 0 #111111,.06em .06em 0 #111111,.072em .072em 0 #111111}
.foot{border-top:5px solid #111111;padding:16px 28px;display:flex;align-items:center;justify-content:space-between;gap:24px}
.foot b{font-size:30px;line-height:1.2;font-weight:800}
.foot span{font-family:Anton,Impact,sans-serif;text-transform:uppercase;letter-spacing:.05em;font-size:26px;line-height:1.1}
</style></head>
<body><div class="card"><div class="frame">
<div class="mast"><span>WPG AI Incubator</span><span>Winnipeg</span></div>
<div class="art"><img src="${fileUrl('img', 'halftone-corner-ink.svg')}" alt=""><p class="title">A room for<br>the curious.</p></div>
<div class="foot"><b>Find your next room at wpgincubator.ai.</b><span>Dream. Build. Execute.</span></div>
</div></div></body></html>`;

// A .ico file that wraps one PNG (valid since Windows Vista, read by every current browser).
function icoFromPng(png, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(size, 6);
  header.writeUInt8(size, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

const tmp = path.join(root, 'scripts', '.card.html');
fs.writeFileSync(tmp, card);
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(tmp).href);
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => ['Bangers', 'Anton', 'Archivo'].every((f) => document.fonts.check(`16px ${f}`)));
  if (!loaded) throw new Error('Brand fonts did not load for the link-preview card');
  await page.screenshot({ path: path.join(pub, 'img', 'og.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } });

  const icon = async (size) => {
    const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await p.goto(fileUrl('favicon.svg'));
    const png = await p.screenshot({ clip: { x: 0, y: 0, width: size, height: size } });
    await p.close();
    return png;
  };
  fs.writeFileSync(path.join(pub, 'apple-touch-icon.png'), await icon(180));
  fs.writeFileSync(path.join(pub, 'favicon.ico'), icoFromPng(await icon(32), 32));
  console.log('wrote public/img/og.png, public/apple-touch-icon.png, public/favicon.ico');
} finally {
  await browser.close();
  fs.rmSync(tmp, { force: true });
}
