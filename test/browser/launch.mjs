// Starts Chrome for the browser tests and the image build.
// Order: CHROME_PATH, then an installed Google Chrome, then Playwright's own Chromium
// (install that with `npx playwright install chromium`).

import { chromium } from 'playwright';

export async function launchBrowser() {
  const args = ['--no-sandbox'];
  const attempts = [];
  if (process.env.CHROME_PATH) attempts.push({ executablePath: process.env.CHROME_PATH, args });
  attempts.push({ channel: 'chrome', args });
  attempts.push({ args });
  let lastError;
  for (const options of attempts) {
    try {
      return await chromium.launch(options);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`No browser could be started. Set CHROME_PATH or run "npx playwright install chromium". (${lastError?.message?.split('\n')[0]})`);
}
