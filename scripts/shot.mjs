// Developer helper: screenshots of a running site.
//   node scripts/shot.mjs http://127.0.0.1:3000/ out-dir [width ...]
// Writes one full-page PNG per width, plus the page height and any console errors.

import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from '../test/browser/launch.mjs';

const [url = 'http://127.0.0.1:3000/', outDir = 'shots', ...widthArgs] = process.argv.slice(2);
const widths = widthArgs.length ? widthArgs.map(Number) : [1440, 390];
fs.mkdirSync(outDir, { recursive: true });

const browser = await launchBrowser();
try {
  for (const width of widths) {
    const height = width < 700 ? 844 : 900;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const problems = [];
    page.on('console', (msg) => msg.type() === 'error' && problems.push(msg.text()));
    page.on('pageerror', (error) => problems.push(String(error)));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    // lazy images load as they near the viewport: walk the page once
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 500) {
        window.scrollTo({ top: y, behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
      await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
    });
    await page.waitForLoadState('networkidle');
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const name = new URL(url).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
    const file = path.join(outDir, `${name}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${file}  ${width}x${pageHeight}${problems.length ? `  console: ${problems.join(' | ')}` : ''}`);
    await page.close();
  }
} finally {
  await browser.close();
}
