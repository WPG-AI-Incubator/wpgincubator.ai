// Browser tests: the real pages in real Chrome.
//   npm run test:browser            (set CHROME_PATH if Chrome is somewhere unusual)
// Starts the site several times on local ports, with stand-ins for Eventbrite,
// the AI service and the form webhook. Nothing here talks to a real service.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { HtmlValidate } from 'html-validate';

import { ebEvent, messageBody, startMockAnthropic, startMockEventbrite, startWebhook } from '../helpers/mocks.js';
import { fakeClock, startSite } from '../helpers/site.js';
import { launchBrowser } from './launch.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outDir = path.join(here, 'out');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const axeSource = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

const WIDTHS = [320, 360, 390, 414, 480, 600, 768, 820, 1024, 1080, 1081, 1280, 1440, 1920];
const results = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? '' });
    console.log(`ok    ${name}${detail ? `  (${detail})` : ''}`);
  } catch (error) {
    results.push({ name, ok: false, detail: String(error.message).split('\n').slice(0, 6).join(' | ') });
    console.log(`FAIL  ${name}\n      ${String(error.message).split('\n').slice(0, 8).join('\n      ')}`);
  }
}

// ---------- the sites under test ----------

const AGENDA =
  '<p>6:00 PM – Doors open, coffee and networking</p><p>6:30 PM – Spotlight talk with Tad Einstein (about 45 min plus a short Q&amp;A)</p><p>7:20 PM – Quick break</p><p>7:25 PM – Breakout rooms: Dream / Build / Execute (about 35 min)</p><p>8:00 PM – Quick reset</p><p>8:05 PM – AI Show &amp; Tell</p><p>8:45 – 9:00 PM – Wrap</p>';

const ai = await startMockAnthropic({
  respond: (request) => {
    const said = /<visitor_message>\n([\s\S]*)\n<\/visitor_message>/.exec(request.body?.messages?.[0]?.content ?? '')?.[1] ?? '';
    const room = /ship|launch|users|customers/i.test(said) ? 'execute' : /idea|curious|learn/i.test(said) ? 'dream' : 'build';
    return { delayMs: 250, body: messageBody(JSON.stringify({ room, why: `Stand-in AI reply for the ${room} room.`, bring: 'What should the room help with?' })) };
  },
});
const hook = await startWebhook();
const eb = await startMockEventbrite({
  events: [
    ebEvent({ id: 3000000000015, title: 'WPG AI Incubator - Issue #15', start: '2026-12-23T18:00:00', end: '2026-12-23T21:00:00' }),
    ebEvent({ id: 3000000000014, title: 'WPG AI Incubator - Issue #14: Agents at work', start: '2026-12-09T18:00:00', end: '2026-12-09T21:00:00' }),
    ebEvent({ id: 1999778758098, title: 'WPG AI Incubator  - Issue #13', start: '2026-11-25T18:00:00', end: '2026-11-25T21:00:00', url: 'https://www.eventbrite.ca/e/wpg-ai-incubator-issue-13-tickets-1999778758098' }),
    ebEvent({ id: 1999776946680, title: 'WPG AI Incubator  - Issue #12', start: '2026-11-10T18:00:00', end: '2026-11-10T21:00:00', status: 'completed' }),
  ],
  descriptions: { 1999778758098: AGENDA },
});

// Deliberately awkward content: long names, long lines, a long cover hook.
const stressDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpg-stress-'));
const stressSite = JSON.parse(fs.readFileSync(path.join(root, 'content/site.json'), 'utf8'));
stressSite.organizers = [{ name: 'Maximilian Featherstonehaugh-Montgomery' }, { name: 'Anne-Marie Désirée Lévesque-Kowalczyk' }, { name: 'Li' }, { name: 'Curtis Dery' }];
fs.writeFileSync(path.join(stressDir, 'site.json'), JSON.stringify(stressSite));
fs.writeFileSync(
  path.join(stressDir, 'issues.json'),
  JSON.stringify({
    issues: [
      {
        number: 113,
        subtitle: 'Agents, Automation and the Art of Getting Unstuck Together',
        start: '2026-11-25T17:30',
        end: '2026-11-25T21:30',
        url: 'https://www.eventbrite.ca/e/x-1999778758098',
        spotlight: 'Dr. Maximilian Featherstonehaugh-Montgomery III',
        hook: 'Supercalifragilistic prototypes meet the unstoppable Winnipeg winter, live and unscripted.',
        schedule: [
          { time: '17:30', text: 'Doors open, coffee, networking, name tags, laptops out, and a very long sentence that keeps going to see what the layout does with it' },
          { time: '18:30', strong: 'Spotlight talk with Dr. Maximilian Featherstonehaugh-Montgomery III.', text: 'About 45 minutes, plus a short Q&A, plus Antidisestablishmentarianism-length-words-without-spaces.' },
          { time: '21:15', text: 'Wrap' },
        ],
      },
      { number: 112, subtitle: 'A back issue with an unusually long subtitle that has to wrap inside a narrow card', date: '2026-11-10', blurb: 'With a partner, an evening on a subject that takes a few more words than usual to describe properly.', url: 'https://www.eventbrite.ca/e/y-1999776946680' },
      { number: 111, date: '2026-10-28' },
      { number: 110, date: '2026-10-14' },
      { number: 109, date: '2026-09-16' },
      { number: 108, subtitle: 'An earlier Issue with a long title to check the list rows wrap without breaking', date: '2026-09-02', url: 'https://www.eventbrite.ca/e/z-1999771071106' },
    ],
  }),
);

const sites = {
  plain: await startSite(),
  full: await startSite({
    env: {
      ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_API_BASE: ai.url,
      SUBSCRIBE_WEBHOOK_URL: `${hook.url}/subscribe`, APPLY_WEBHOOK_URL: `${hook.url}/apply`,
      EVENTBRITE_TOKEN: 'test-token', EVENTBRITE_ORG_ID: 'org-1', EVENTBRITE_API_BASE: eb.base,
    },
  }),
  tba: await startSite({ now: fakeClock('2026-11-26T08:00') }),
  stress: await startSite({ contentDir: stressDir }),
};

const browser = await launchBrowser();
const version = browser.version();

// ---------- helpers that run in the page ----------

// Each browser context arrives from its own address, the way separate visitors do,
// so one check cannot use up another's rate limit. (The site trusts one proxy hop.)
let visitor = 0;
function newVisitor(options = {}) {
  visitor += 1;
  return browser.newContext({ ...options, extraHTTPHeaders: { 'x-forwarded-for': `203.0.113.${visitor % 250}` } });
}

async function open(context, url, { waitFor = 'networkidle' } = {}) {
  const page = await context.newPage();
  page.problems = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') page.problems.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (error) => page.problems.push(`error: ${error.message}`));
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.goto(url, { waitUntil: waitFor });
  return page;
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let y = 0; y < document.documentElement.scrollHeight; y += 500) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  });
}

const measure = () => {
  const doc = document.documentElement;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('.hp') && !el.closest('[hidden]');
  };
  const label = (el) => `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(' ')[0]}` : ''} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 32)}"`;

  // 1. tap targets
  const small = [];
  for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), textarea, summary')) {
    let target = el;
    if (el.matches('input[type=radio], input[type=checkbox]') && el.closest('label')) target = el.closest('label');
    if (!visible(target)) continue;
    const inSentence = target.matches('a') && getComputedStyle(target).display === 'inline' && target.parentElement.textContent.trim().length > target.textContent.trim().length;
    const r = target.getBoundingClientRect();
    if ((r.height < 44 || r.width < 44) && !inSentence) small.push(`${label(target)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }

  // 2. text that sticks out of the page sideways
  const clipped = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const el = node.parentElement;
    if (!node.textContent.trim() || seen.has(el) || !visible(el) || el.closest('script, .skip, .visually-hidden, .nav--narrow')) continue;
    seen.add(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    if (r.right > doc.clientWidth + 1 || r.left < -1) clipped.push(`${label(el)} leaves the page (${Math.round(r.left)}..${Math.round(r.right)} of ${doc.clientWidth})`);
  }

  // 3. headings do not skip a level
  const levels = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(visible).map((h) => Number(h.tagName[1]));
  const skips = levels.filter((level, i) => i > 0 && level > levels[i - 1] + 1).length;

  return {
    overflow: doc.scrollWidth - doc.clientWidth,
    small,
    clipped,
    h1: levels.filter((l) => l === 1).length,
    skips,
    brokenImages: [...document.images].filter((img) => !(img.complete && img.naturalWidth > 0)).map((img) => img.getAttribute('src')),
    fonts: ['400 1em Bangers', '400 1em Anton', '400 1em Archivo', '800 1em Archivo'].filter((f) => !document.fonts.check(f)),
    height: doc.scrollHeight,
    csp: window.__csp,
  };
};

// Is anything cut off by a box that clips its contents? Asked of the pixels, not the DOM:
// hide the decorative images (they are meant to be cropped), photograph the page, let every
// clipping box overflow, photograph again. If the two pictures differ, something was being cut.
async function cutOff(page) {
  await page.evaluate(() => {
    for (const img of document.images) img.style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  const before = await page.screenshot({ fullPage: true });
  const boxes = await page.evaluate(() => {
    const changed = [];
    for (const el of document.querySelectorAll('main *, footer *, header *, main, footer, header')) {
      const cs = getComputedStyle(el);
      if (!/hidden|clip/.test(`${cs.overflowX} ${cs.overflowY}`) || el.matches('.nav--narrow, .hp, .hp *, textarea, input')) continue;
      el.dataset.wasClipping = '1';
      el.style.overflow = 'visible';
      changed.push(el.className.split(' ')[0]);
    }
    return changed;
  });
  const after = await page.screenshot({ fullPage: true });
  if (before.equals(after)) return [];
  // find which box it was, one at a time
  const culprits = [];
  await page.evaluate(() => document.querySelectorAll('[data-was-clipping]').forEach((el) => (el.style.overflow = '')));
  const count = boxes.length;
  for (let i = 0; i < count; i += 1) {
    await page.evaluate((n) => (document.querySelectorAll('[data-was-clipping]')[n].style.overflow = 'visible'), i);
    const shot = await page.screenshot({ fullPage: true });
    await page.evaluate((n) => (document.querySelectorAll('[data-was-clipping]')[n].style.overflow = ''), i);
    if (!shot.equals(before)) culprits.push(await page.evaluate((n) => { const el = document.querySelectorAll('[data-was-clipping]')[n]; return `.${el.className.split(' ')[0]} "${el.textContent.trim().slice(0, 30)}"`; }, i));
  }
  return culprits.length ? culprits : ['a clipping box (not identified)'];
}

async function layoutCheck(name, url, widths = WIDTHS, { ignore = null } = {}) {
  await check(`layout: ${name} at ${widths.length} widths (${widths[0]} to ${widths.at(-1)}px)`, async () => {
    const faults = [];
    for (const width of widths) {
      const context = await newVisitor({ viewport: { width, height: width < 700 ? 844 : 900 } });
      const page = await open(context, url);
      await settle(page);
      const m = await page.evaluate(measure);
      if (m.overflow > 0) faults.push(`${width}px: page is ${m.overflow}px wider than the screen`);
      for (const item of m.small) faults.push(`${width}px: small tap target ${item}`);
      for (const item of m.clipped) faults.push(`${width}px: ${item}`);
      for (const item of await cutOff(page)) faults.push(`${width}px: content is cut off inside ${item}`);
      if (m.h1 !== 1) faults.push(`${width}px: ${m.h1} h1 elements`);
      if (m.skips) faults.push(`${width}px: heading levels skip`);
      if (m.brokenImages.length) faults.push(`${width}px: images not loaded ${m.brokenImages.join(', ')}`);
      if (m.fonts.length) faults.push(`${width}px: fonts not loaded ${m.fonts.join(', ')}`);
      if (m.csp.length) faults.push(`${width}px: content policy blocked ${m.csp.join(', ')}`);
      const problems = page.problems.filter((text) => !(ignore && ignore.test(text)));
      if (problems.length) faults.push(`${width}px: ${problems.join(' / ')}`);
      await context.close();
    }
    assert.equal(faults.length, 0, faults.slice(0, 14).join('\n'));
    return 'no sideways scroll, no clipped text, every tap target at least 44px, fonts and images loaded, no console or policy errors';
  });
}

async function axeCheck(name, url, { width = 1440, prepare } = {}) {
  await check(`accessibility scan: ${name} at ${width}px`, async () => {
    const context = await newVisitor({ viewport: { width, height: 900 }, bypassCSP: true });
    const page = await open(context, url);
    await settle(page);
    if (prepare) await prepare(page);
    await page.evaluate(axeSource);
    const report = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
    await context.close();
    const violations = report.violations.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}: ${v.nodes[0].target.join(' ')} (${v.help})`);
    assert.equal(violations.length, 0, violations.join('\n'));
    const review = report.incomplete.map((v) => `${v.id} x${v.nodes.length}`);
    return `${report.passes.length} rules passed, 0 violations${review.length ? `; needs a human look: ${review.join(', ')}` : ''}`;
  });
}

// ---------- 1. layout at every width, in every state ----------

await layoutCheck('home, no settings', `${sites.plain.url}/`);
await layoutCheck('home, everything on', `${sites.full.url}/`);
await layoutCheck('home, no Issue announced', `${sites.tba.url}/`);
await layoutCheck('home, awkward long content', `${sites.stress.url}/`, [320, 390, 768, 1081, 1440]);
await layoutCheck('privacy', `${sites.full.url}/privacy`, [320, 390, 768, 1440]);
await layoutCheck('take-the-stage form', `${sites.full.url}/apply`, [320, 390, 768, 1440]);
await layoutCheck('not-found page', `${sites.plain.url}/nope`, [320, 390, 1440], { ignore: /status of 404/ });

await check('hero: the main button is on the first screen (1440x900, 1280x720, 390x844, 360x740, 320x568)', async () => {
  const seen = [];
  for (const [width, height] of [[1440, 900], [1280, 720], [390, 844], [360, 740], [320, 568]]) {
    for (const site of [sites.plain, sites.tba]) {
      const context = await newVisitor({ viewport: { width, height } });
      const page = await open(context, `${site.url}/`);
      const bottom = await page.evaluate(() => Math.round(document.querySelector('.hero__cta .btn').getBoundingClientRect().bottom));
      assert.ok(bottom <= height, `${width}x${height}: button ends at ${bottom}px`);
      seen.push(`${width}:${bottom}`);
      await context.close();
    }
  }
  return `button bottom edge at ${seen.join(', ')}`;
});

await check('text at 200% size does not cause sideways scrolling (1280px wide)', async () => {
  const context = await newVisitor({ viewport: { width: 1280, height: 900 } });
  const page = await open(context, `${sites.full.url}/`);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await settle(page);
  const m = await page.evaluate(measure);
  const cut = await cutOff(page);
  await context.close();
  assert.equal(m.overflow, 0, `page is ${m.overflow}px wider than the screen`);
  assert.equal(m.clipped.length, 0, m.clipped.join('\n'));
  assert.equal(cut.length, 0, `content is cut off inside ${cut.join(', ')}`);
});

await check('the longest room word ("Execute.") fits its band in the answer card at 320, 390, 768 and 1440px', async () => {
  for (const width of [320, 390, 768, 1440]) {
    const context = await newVisitor({ viewport: { width, height: 900 } });
    const page = await open(context, `${sites.plain.url}/`);
    await settle(page);
    await page.getByRole('button', { name: 'I shipped something and need users' }).click();
    assert.equal(await page.locator('.reply__word').innerText(), 'EXECUTE.');
    const cut = await cutOff(page);
    await context.close();
    assert.equal(cut.length, 0, `${width}px: content is cut off inside ${cut.join(', ')}`);
  }
});

await check('self-test: the cut-off detector does notice a word that is deliberately cut off', async () => {
  const context = await newVisitor({ viewport: { width: 1440, height: 900 } });
  const page = await open(context, `${sites.plain.url}/`);
  await settle(page);
  assert.deepEqual(await cutOff(page), [], 'nothing is cut off to begin with');
  await page.reload({ waitUntil: 'networkidle' });
  await settle(page);
  await page.evaluate(() => {
    document.querySelector('.reply__band').style.height = '34px';
    document.querySelector('.issue__cover').style.width = '60px';
  });
  const found = await cutOff(page);
  await context.close();
  assert.ok(found.some((f) => f.startsWith('.reply__band')) && found.some((f) => f.startsWith('.issue__cover')), `detector reported: ${found.join(', ') || 'nothing'}`);
  return `reported ${found.length} boxes`;
});

await check('header links land with the section heading visible below the sticky header', async () => {
  const context = await newVisitor({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await open(context, `${sites.plain.url}/`);
  const out = [];
  for (const [label, id] of [['What happens', 'what-title'], ['Back issues', 'back-title'], ['Take the stage', 'stage-title'], ['About', 'about-title']]) {
    await page.locator('.nav--wide').getByRole('link', { name: label }).click();
    await page.waitForTimeout(80);
    const { top, header } = await page.evaluate((hid) => ({ top: document.getElementById(hid).getBoundingClientRect().top, header: document.querySelector('.site-header').getBoundingClientRect().bottom }), id);
    assert.ok(top >= header && top < 500, `${label}: heading at ${Math.round(top)}px, header ends at ${Math.round(header)}px`);
    out.push(Math.round(top));
  }
  await page.locator('.nav--wide').getByRole('link', { name: 'Next Issue' }).click();
  await page.waitForTimeout(80);
  assert.ok(await page.evaluate(() => { const r = document.querySelector('.hero__cta .btn').getBoundingClientRect(); return r.top >= document.querySelector('.site-header').getBoundingClientRect().bottom && r.bottom <= innerHeight; }), 'Next Issue shows the register button');
  await context.close();
  return `headings at ${out.join(', ')}px from the top`;
});

await check('links to the old site\'s sections (#join, #events, #showcase, #resources) land on the matching new section', async () => {
  const context = await newVisitor({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  for (const [hash, heading] of [['join', 'news-title'], ['events', 'back-title'], ['showcase', 'stage-title'], ['resources', 'what-title'], ['about', 'about-title']]) {
    const page = await open(context, `${sites.plain.url}/#${hash}`);
    await page.waitForTimeout(60);
    const { top, header } = await page.evaluate((id) => ({ top: document.getElementById(id).getBoundingClientRect().top, header: document.querySelector('.site-header').getBoundingClientRect().bottom }), heading);
    assert.ok(top >= header && top < 520, `#${hash}: heading at ${Math.round(top)}px`);
    await page.close();
  }
  await context.close();
});

await check('reduced motion is respected', async () => {
  const context = await newVisitor({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await open(context, `${sites.plain.url}/`);
  const state = await page.evaluate(() => ({ scroll: getComputedStyle(document.documentElement).scrollBehavior, button: getComputedStyle(document.querySelector('.btn')).transitionDuration }));
  await context.close();
  assert.deepEqual(state, { scroll: 'auto', button: '0s' });
});

await check('earlier Issues open and close, and the label follows', async () => {
  const context = await newVisitor({ viewport: { width: 390, height: 844 } });
  const page = await open(context, `${sites.plain.url}/`);
  const summary = page.locator('.earlier__summary');
  assert.equal(await page.locator('.earlier__list').isVisible(), false);
  assert.equal((await summary.locator('.earlier__toggle').innerText()).trim().toUpperCase(), 'SHOW');
  await summary.click();
  assert.equal(await page.locator('.earlier__list').isVisible(), true);
  assert.equal((await summary.locator('.earlier__toggle').innerText()).trim().toUpperCase(), 'HIDE');
  assert.equal(await page.locator('.earlier__row').count(), 5);
  await summary.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.earlier__list').isVisible(), false, 'closes from the keyboard');
  await context.close();
});

// ---------- 2. Find your room ----------

async function finderPage(width = 1440, site = sites.full) {
  const context = await newVisitor({ viewport: { width, height: width < 700 ? 844 : 900 } });
  const page = await open(context, `${site.url}/`);
  const posts = [];
  page.on('request', (req) => {
    if (req.method() === 'POST') posts.push({ url: new URL(req.url()).pathname, body: req.postData() });
  });
  return { context, page, posts };
}

const card = (page) =>
  page.evaluate(() => {
    const region = document.querySelector('[data-reply]');
    const c = region.querySelector('[data-card]');
    const slot = (n) => c.querySelector(`[data-slot="${n}"]`).textContent;
    return {
      cardShown: !c.hidden,
      message: region.querySelector('[data-msg]').hidden ? null : region.querySelector('[data-msg]').textContent,
      said: slot('said'), word: slot('word'), line: slot('line'), why: slot('why'), bring: slot('bring'), note: slot('note'),
      band: c.querySelector('[data-slot="band"]').className,
      pressed: [...document.querySelectorAll('[data-example]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.example),
      button: document.querySelector('[data-find]').textContent,
      busy: document.querySelector('[data-find]').getAttribute('aria-disabled'),
    };
  });

await check('Find your room: opens on "Just curious"; tapping an example swaps the answer without contacting the server', async () => {
  const { context, page, posts } = await finderPage();
  let c = await card(page);
  assert.deepEqual([c.said, c.word, c.pressed, c.cardShown], ['Just curious', 'Dream.', ['curious'], true]);
  await page.getByRole('button', { name: 'My prototype is half working' }).click();
  c = await card(page);
  assert.deepEqual([c.said, c.word, c.line, c.pressed], ['My prototype is half working', 'Build.', 'Start in the Build room.', ['half']]);
  assert.ok(c.band.includes('reply__band--build') && !c.band.includes('--dream'));
  assert.equal(c.why, 'Half working is the best time to bring it. Open the laptop and get unstuck next to people who have hit the same wall.');
  assert.equal(c.note, 'Example answer. Type your own and AI writes one for you.');
  await page.getByRole('button', { name: 'I shipped something and need users' }).click();
  c = await card(page);
  assert.deepEqual([c.word, c.pressed], ['Execute.', ['shipped']]);
  assert.ok(c.band.includes('reply__band--execute'));
  assert.equal(posts.length, 0);
  assert.equal(page.url().endsWith('/'), true, 'the page did not navigate');
  await context.close();
});

await check('Find your room: a typed sentence is answered by the AI service, with a busy state while waiting', async () => {
  const { context, page, posts } = await finderPage();
  const before = ai.state.requests.length;
  await page.getByLabel('What are you working on?').fill('A tool that reads our invoices and flags the odd ones');
  const click = page.getByRole('button', { name: 'Find my room' }).click();
  await page.waitForFunction(() => document.querySelector('[data-find]').getAttribute('aria-disabled') === 'true');
  const during = await card(page);
  assert.equal(during.button, 'Finding your room…');
  await click;
  await page.waitForFunction(() => document.querySelector('[data-find]').getAttribute('aria-disabled') === null);
  const c = await card(page);
  assert.deepEqual([c.said, c.word, c.pressed, c.button, c.cardShown], ['A tool that reads our invoices and flags the odd ones', 'Build.', [], 'Find my room', true]);
  assert.equal(c.why, 'Stand-in AI reply for the build room.');
  assert.equal(c.note, 'Written by AI from what you typed. If it missed, go with the room that sounds right to you.');
  assert.deepEqual(posts, [{ url: '/find-your-room', body: JSON.stringify({ text: 'A tool that reads our invoices and flags the odd ones' }) }]);
  assert.equal(ai.state.requests.length, before + 1);
  assert.equal(page.problems.length, 0, page.problems.join(' / '));
  await context.close();
});

await check('Find your room: an empty box asks for a sentence; two fast clicks send one request; Ctrl+Enter sends', async () => {
  const { context, page, posts } = await finderPage();
  await page.getByRole('button', { name: 'Find my room' }).click();
  let c = await card(page);
  assert.deepEqual([c.cardShown, c.message, c.pressed], [false, 'Type a sentence or tap an example. Your room shows up here.', []]);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'room-input');
  assert.equal(posts.length, 0);

  await page.getByLabel('What are you working on?').fill('we launched and need customers');
  await page.getByRole('button', { name: 'Find my room' }).dblclick();
  await page.waitForFunction(() => !document.querySelector('[data-card]').hidden);
  c = await card(page);
  assert.deepEqual([c.word, c.message], ['Execute.', null]);
  assert.equal(posts.length, 1);

  await page.getByLabel('What are you working on?').fill('just an idea for now');
  await page.keyboard.press('Control+Enter');
  await page.waitForFunction(() => document.querySelector('[data-slot="word"]').textContent === 'Dream.');
  assert.equal(posts.length, 2);
  await context.close();
});

await check('Find your room: too many tries, a server error and a lost connection each get a plain message, and the button comes back', async () => {
  const { context, page } = await finderPage();
  const input = page.getByLabel('What are you working on?');
  const go = page.getByRole('button', { name: 'Find my room' });
  const attempt = async (handler, text) => {
    await page.getByRole('button', { name: 'Just curious' }).click(); // back to a known state: card shown, no message
    assert.equal((await card(page)).message, null);
    await page.route('**/find-your-room', handler);
    await go.click();
    await page.waitForFunction((t) => { const m = document.querySelector('[data-msg]'); return !m.hidden && m.textContent === t; }, text);
    const c = await card(page);
    assert.deepEqual([c.cardShown, c.button, c.busy], [false, 'Find my room', null]);
    await page.unroute('**/find-your-room');
  };
  await input.fill('something');
  await attempt((route) => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: "That's a lot of tries in a row. Give it a minute, then try again." }) }), "That's a lot of tries in a row. Give it a minute, then try again.");
  await attempt((route) => route.fulfill({ status: 500, contentType: 'text/html', body: '<h1>oops</h1>' }), "That didn't go through. Check your connection and try again.");
  await attempt((route) => route.abort('internetdisconnected'), "That didn't go through. Check your connection and try again.");
  await go.click();
  await page.waitForFunction(() => !document.querySelector('[data-card]').hidden);
  assert.equal((await card(page)).word, 'Build.', 'works again afterwards');
  await context.close();
});

await check('Find your room: the real limit is reached after six typed tries in a minute', async () => {
  const { context, page } = await finderPage(1440, sites.plain);
  const input = page.getByLabel('What are you working on?');
  for (let i = 0; i < 6; i += 1) {
    await input.fill(`attempt number ${i}`);
    await page.getByRole('button', { name: 'Find my room' }).click();
    await page.waitForFunction((n) => document.querySelector('[data-slot="said"]').textContent === `attempt number ${n}`, i);
  }
  await input.fill('attempt number 6');
  await page.getByRole('button', { name: 'Find my room' }).click();
  await page.waitForFunction(() => !document.querySelector('[data-msg]').hidden);
  assert.equal((await card(page)).message, "That's a lot of tries in a row. Give it a minute, then try again.");
  await context.close();
});

await check('Find your room: markup typed by a visitor is shown as text and never runs', async () => {
  const { context, page } = await finderPage();
  let dialog = false;
  page.on('dialog', (d) => {
    dialog = true;
    d.dismiss();
  });
  const attack = '<img src=x onerror=alert(1)><script>alert(2)</script> building';
  await page.getByLabel('What are you working on?').fill(attack);
  await page.getByRole('button', { name: 'Find my room' }).click();
  await page.waitForFunction(() => document.querySelector('[data-slot="said"]').textContent.includes('<img'));
  assert.equal((await card(page)).said, attack);
  assert.equal(await page.locator('[data-reply] img, [data-reply] script').count(), 0);
  assert.equal(dialog, false);
  await context.close();
});

await check('Find your room on a phone: the answer is brought into view', async () => {
  const { context, page } = await finderPage(390);
  await page.getByLabel('What are you working on?').fill('my agent keeps looping');
  await page.getByRole('button', { name: 'Find my room' }).click();
  await page.waitForFunction(() => document.querySelector('[data-slot="said"]').textContent === 'my agent keeps looping');
  await page.waitForFunction(() => { const top = document.querySelector('[data-reply]').getBoundingClientRect().top; return top >= 0 && top < innerHeight * 0.5; }, null, { timeout: 4000 });
  const top = await page.evaluate(() => Math.round(document.querySelector('[data-reply]').getBoundingClientRect().top));
  await page.screenshot({ path: path.join(outDir, 'phone-find-your-room-answer.png') });
  await context.close();
  return `answer starts ${top}px from the top of the screen`;
});

await check('keyboard only: skip link, visible focus, and the whole Find your room flow', async () => {
  const context = await newVisitor({ viewport: { width: 1440, height: 900 } });
  const page = await open(context, `${sites.full.url}/`);
  const focus = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      const cs = getComputedStyle(el);
      return { text: (el.textContent || '').trim().slice(0, 40), id: el.id, outline: `${cs.outlineStyle} ${cs.outlineWidth}`, visible: el.matches(':focus-visible') };
    });
  await page.keyboard.press('Tab');
  let f = await focus();
  assert.equal(f.text, 'Skip to content');
  assert.ok((await page.evaluate(() => document.activeElement.getBoundingClientRect().top)) >= 0, 'the skip link comes on screen when focused');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'main');

  const order = [];
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press('Tab');
    f = await focus();
    assert.equal(f.outline, 'solid 3px', `focus ring on "${f.text || f.id}"`);
    order.push(f.id || f.text);
  }
  assert.deepEqual(order.slice(0, 8), ['Register for Issue #13', 'room-input', 'Find my room', 'Privacy', 'Just curious', 'I have an idea but no code yet', 'My prototype is half working', 'I shipped something and need users']);

  await page.locator('#room-input').focus();
  await page.keyboard.type('shipped it, need users');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-slot="word"]').textContent === 'Execute.');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  assert.deepEqual((await card(page)).pressed, ['curious'], 'Space activates an example');
  await context.close();
  return `tab order: ${order.slice(0, 8).join(' > ')}`;
});

// ---------- 3. Issue alerts form ----------

await check('newsletter: a sign-up is saved and confirmed in place; the browser blocks a malformed address', async () => {
  const { context, page, posts } = await finderPage();
  const before = hook.state.requests.length;
  const email = page.getByLabel('Email address');
  await email.fill('not-an-address');
  await page.getByRole('button', { name: 'Notify me' }).click();
  assert.equal(await email.evaluate((el) => el.validity.valid), false);
  assert.equal(posts.length, 0, 'nothing is sent while the address is malformed');

  await email.fill('curious@example.com');
  await page.getByRole('button', { name: 'Notify me' }).click();
  await page.waitForSelector('.news__done');
  assert.equal(await page.locator('.news__done').innerText(), "You're on the list. We'll email you when the next Issue date is live.");
  assert.equal(await page.locator('form[data-subscribe]').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.className), 'news__done', 'focus moves to the confirmation');
  assert.equal(hook.state.requests.length, before + 1);
  assert.equal(hook.state.requests.at(-1).body.email, 'curious@example.com');
  assert.deepEqual(posts.map((p) => p.url), ['/subscribe']);
  await context.close();
});

await check('newsletter: when saving fails the visitor is told, and the form stays', async () => {
  const { context, page } = await finderPage();
  hook.state.status = 500;
  try {
    await page.getByLabel('Email address').fill('unlucky@example.com');
    await page.getByRole('button', { name: 'Notify me' }).click();
    await page.waitForFunction(() => !document.querySelector('[data-status]').hidden);
    assert.equal(await page.locator('[data-status]').innerText(), "That didn't save. Something went wrong on our side. Try again in a minute, or write to hello@wpgincubator.ai.");
    assert.equal(await page.locator('form[data-subscribe]').count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Notify me' }).getAttribute('aria-disabled'), null);
    assert.equal(await page.getByLabel('Email address').inputValue(), 'unlucky@example.com');
  } finally {
    hook.state.status = 200;
  }
  await context.close();
});

// ---------- 4. JavaScript switched off ----------

await check('JavaScript off: Find your room, the newsletter and the application form all work as plain pages', async () => {
  const context = await newVisitor({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${sites.full.url}/`);
  assert.equal(await page.locator('.reply__word').innerText(), 'DREAM.', 'the default answer is in the HTML');

  await page.getByRole('button', { name: 'I have an idea but no code yet' }).click();
  await page.waitForURL('**/find-your-room');
  assert.equal(await page.locator('h1').innerText(), 'YOUR ROOM.');
  assert.ok((await page.locator('.reply__bring-q').innerText()).startsWith('Who has this problem today'));
  await page.getByRole('link', { name: 'Try another answer' }).click();
  await page.waitForURL('**/#find-your-room');

  await page.getByLabel('What are you working on?').fill('my prototype is stuck on a bug');
  await page.getByRole('button', { name: 'Find my room' }).click();
  await page.waitForURL('**/find-your-room');
  assert.equal(await page.locator('.reply__word').innerText(), 'BUILD.');
  assert.ok((await page.locator('.reply__said').innerText()).includes('my prototype is stuck on a bug'));

  await page.goto(`${sites.full.url}/`);
  const before = hook.state.requests.length;
  await page.getByLabel('Email address').fill('plain@example.com');
  await page.getByRole('button', { name: 'Notify me' }).click();
  await page.waitForURL('**/subscribe');
  assert.equal(await page.locator('h1').innerText(), "YOU'RE ON THE LIST.");
  assert.equal(hook.state.requests.length, before + 1);

  await page.goto(`${sites.full.url}/`);
  await page.getByRole('link', { name: 'Apply to speak' }).click();
  await page.waitForURL('**/apply?kind=talk');
  assert.equal(await page.getByLabel('Give a spotlight talk').isChecked(), true);
  await page.getByRole('button', { name: 'Send to the organizers' }).click();
  await page.waitForLoadState();
  assert.equal(await page.locator('.form-error').count(), 3);
  assert.equal(await page.getByLabel('Give a spotlight talk').isChecked(), true, 'the choice is kept');
  await page.getByLabel('Your name').fill('Ada Lovelace');
  await page.getByLabel('Email address').fill('ada@example.com');
  await page.getByLabel('What are you building?').fill('An engine that computes Bernoulli numbers.');
  await page.getByRole('button', { name: 'Send to the organizers' }).click();
  await page.waitForLoadState();
  assert.equal(await page.locator('h1').innerText(), 'GOT IT.');
  assert.equal(hook.state.requests.at(-1).body.name, 'Ada Lovelace');

  await page.goto(`${sites.full.url}/`);
  await page.locator('.earlier__summary').click();
  assert.equal(await page.locator('.earlier__list').isVisible(), true, 'earlier Issues open without JavaScript');
  await context.close();
});

await check('analytics: requested for an ordinary visitor, skipped for one who sends Global Privacy Control or Do Not Track', async () => {
  const measured = await startSite({ env: { GA_MEASUREMENT_ID: 'G-TEST12345' } });
  try {
    const visit = async (init) => {
      const context = await newVisitor({ viewport: { width: 1280, height: 800 } });
      if (init) await context.addInitScript(init);
      const asked = [];
      await context.route('https://www.googletagmanager.com/**', (route) => {
        asked.push(route.request().url());
        route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      });
      const page = await open(context, `${measured.url}/`);
      await page.waitForTimeout(150);
      const blocked = await page.evaluate(() => window.__csp);
      await context.close();
      return { asked, blocked };
    };
    const ordinary = await visit(null);
    assert.deepEqual(ordinary.asked, ['https://www.googletagmanager.com/gtag/js?id=G-TEST12345']);
    assert.deepEqual(ordinary.blocked, [], 'the content policy lets the analytics script through');
    const gpc = await visit(() => Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }));
    assert.deepEqual(gpc.asked, []);
    const dnt = await visit(() => Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1' }));
    assert.deepEqual(dnt.asked, []);
  } finally {
    await measured.close();
  }
});

// ---------- 5. accessibility scans ----------

await axeCheck('home, no settings', `${sites.plain.url}/`);
await axeCheck('home, no settings', `${sites.plain.url}/`, { width: 390 });
await axeCheck('home, everything on', `${sites.full.url}/`);
await axeCheck('home, no Issue announced', `${sites.tba.url}/`, { width: 390 });
await axeCheck('home with earlier Issues open and a typed answer', `${sites.full.url}/`, {
  prepare: async (page) => {
    await page.locator('.earlier__summary').click();
    await page.getByLabel('What are you working on?').fill('building a thing');
    await page.getByRole('button', { name: 'Find my room' }).click();
    await page.waitForFunction(() => document.querySelector('[data-slot="said"]').textContent === 'building a thing');
  },
});
await axeCheck('home with the empty-box message', `${sites.full.url}/`, {
  prepare: async (page) => {
    await page.getByRole('button', { name: 'Find my room' }).click();
  },
});
await axeCheck('privacy', `${sites.full.url}/privacy`);
await axeCheck('take-the-stage form', `${sites.full.url}/apply`);
await axeCheck('take-the-stage form with errors', `${sites.full.url}/apply`, {
  width: 390,
  prepare: async (page) => {
    await page.getByRole('button', { name: 'Send to the organizers' }).click();
    await page.waitForSelector('.form-error');
  },
});
await axeCheck('not-found page', `${sites.plain.url}/nope`);

// ---------- 6. valid HTML ----------

await check('HTML validity: every page type passes html-validate', async () => {
  const validator = new HtmlValidate({
    extends: ['html-validate:recommended'],
    rules: {
      'no-trailing-whitespace': 'off',
      'long-title': 'off',
      // the run of show and room cards are short lists and articles by design
      'no-inline-style': 'error',
      'require-sri': 'off',
    },
  });
  const pages = [
    ['home', await sites.plain.get('/')],
    ['home, everything on', await sites.full.get('/')],
    ['home, no Issue', await sites.tba.get('/')],
    ['home, long content', await sites.stress.get('/')],
    ['privacy', await sites.full.get('/privacy')],
    ['apply', await sites.full.get('/apply?kind=talk')],
    ['not found', await sites.plain.get('/nope')],
    ['room result', { text: await (await sites.plain.post('/find-your-room', { text: 'a "quoted" <b>thing</b> & more' }, { json: false })).text() }],
    ['apply with errors', { text: await (await sites.full.post('/apply', { kind: '', name: '', email: 'x', about: '' }, { json: false })).text() }],
  ];
  const faults = [];
  for (const [name, { text }] of pages) {
    const report = await validator.validateString(text);
    for (const result of report.results) for (const m of result.messages) faults.push(`${name}: ${m.ruleId} at ${m.line}:${m.column} ${m.message}`);
  }
  assert.equal(faults.length, 0, faults.slice(0, 15).join('\n'));
  return `${pages.length} pages`;
});

// ---------- 7. screenshots for the record ----------

await check('screenshots saved', async () => {
  const shots = [
    ['home-desktop', `${sites.plain.url}/`, 1440],
    ['home-phone', `${sites.plain.url}/`, 390],
    ['home-everything-on-desktop', `${sites.full.url}/`, 1440],
    ['home-no-issue-announced-phone', `${sites.tba.url}/`, 390],
    ['apply-phone', `${sites.full.url}/apply`, 390],
    ['privacy-desktop', `${sites.full.url}/privacy`, 1440],
    ['not-found-desktop', `${sites.plain.url}/nope`, 1440],
    ['home-long-content-phone', `${sites.stress.url}/`, 390],
  ];
  for (const [name, url, width] of shots) {
    const context = await newVisitor({ viewport: { width, height: width < 700 ? 844 : 900 } });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await settle(page);
    await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
    await context.close();
  }
  return `${shots.length} files in test/browser/out`;
});

// ---------- done ----------

await browser.close();
await Promise.all(Object.values(sites).map((site) => site.close()));
await Promise.all([ai.close(), hook.close(), eb.close()]);
fs.rmSync(stressDir, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ browser: `Chrome ${version}`, ran: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length} of ${results.length} browser checks passed (Chrome ${version})`);
process.exit(failed.length ? 1 : 0);
