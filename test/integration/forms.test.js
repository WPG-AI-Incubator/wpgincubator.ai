// Newsletter sign-up and take-the-stage applications through the running site.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { startWebhook } from '../helpers/mocks.js';
import { fakeClock, startSite } from '../helpers/site.js';

async function withForms(run) {
  const hook = await startWebhook();
  const now = fakeClock('2026-11-13T10:00');
  const site = await startSite({ now, env: { SUBSCRIBE_WEBHOOK_URL: `${hook.url}/subscribe`, APPLY_WEBHOOK_URL: `${hook.url}/apply` } });
  try {
    await run(site, hook, now);
  } finally {
    await site.close();
    await hook.close();
  }
}

test('forms off: no form, no endpoint, email links instead', async () => {
  const site = await startSite();
  try {
    assert.equal((await site.post('/subscribe', { email: 'me@example.com' })).status, 404);
    assert.equal((await site.post('/apply', { kind: 'talk' })).status, 404);
    const apply = await site.request('/apply');
    assert.equal(apply.status, 302);
    assert.equal(apply.headers.get('location'), '/#take-the-stage');
  } finally {
    await site.close();
  }
});

test('newsletter: the form appears and a sign-up reaches the list tool', async () => {
  await withForms(async (site, hook) => {
    const home = await site.get('/');
    assert.ok(home.text.includes('<form class="news__form" method="post" action="/subscribe" data-subscribe'));
    assert.ok(home.text.includes('<input class="field" id="nl-email" name="email" type="email" required maxlength="254" autocomplete="email"'));
    assert.ok(home.text.includes('<label class="news__label" for="nl-email">Email address</label>'));
    assert.ok(home.text.includes('href="/apply?kind=talk">Apply to speak</a>'));
    const privacy = await site.get('/privacy');
    assert.ok(privacy.text.includes('If you ask for Issue alerts, we keep your email address'));

    const res = await site.post('/subscribe', { email: ' Curious.Person@Example.com ', website: '' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, message: "You're on the list. We'll email you when the next Issue date is live." });
    assert.equal(hook.state.requests.length, 1);
    assert.equal(hook.state.requests[0].path, '/subscribe');
    assert.deepEqual(hook.state.requests[0].body, {
      type: 'subscribe',
      email: 'Curious.Person@Example.com',
      consent: 'Asked to be emailed when new WPG AI Incubator Issue dates are announced.',
      submittedAt: '2026-11-13T15:00:00.000Z',
      site: 'https://www.wpgincubator.ai',
      text: 'New Issue alerts: Curious.Person@Example.com',
    });
    assert.equal(site.log.text().includes('Example.com'), false, 'addresses stay out of the log');
  });
});

test('newsletter: a bad address is explained; a filled trap field is thanked and dropped', async () => {
  await withForms(async (site, hook) => {
    const bad = await site.post('/subscribe', { email: 'not-an-address' });
    assert.equal(bad.status, 422);
    assert.deepEqual(await bad.json(), { error: 'Enter an email address, like name@example.com.' });

    const bot = await site.post('/subscribe', { email: 'bot@spam.example', website: 'http://spam.example' });
    assert.equal(bot.status, 200);
    assert.equal((await bot.json()).ok, true);
    assert.equal(hook.state.requests.length, 0, 'nothing was stored for either');
  });
});

test('newsletter: if it cannot be saved, the visitor is told so', async () => {
  await withForms(async (site, hook) => {
    hook.state.status = 503;
    const res = await site.post('/subscribe', { email: 'me@example.com' });
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: "That didn't save. Something went wrong on our side. Try again in a minute, or write to hello@wpgincubator.ai." });
    const page = await site.post('/subscribe', { email: 'me@example.com' }, { json: false });
    assert.equal(page.status, 502);
    assert.ok((await page.text()).includes('<h1 id="page-title" class="sub__title">That didn&#39;t save.</h1>'));
    assert.equal(site.log.text().includes('me@example.com'), false);
    assert.match(site.log.text(), /error \[forms\] subscribe delivery failed \(webhook answered 503\)/);
  });
});

test('newsletter: JavaScript off', async () => {
  await withForms(async (site, hook) => {
    const ok = await site.post('/subscribe', { email: 'plain@example.com', website: '' }, { json: false });
    const html = await ok.text();
    assert.equal(ok.status, 200);
    assert.ok(html.includes('<h1 id="page-title" class="sub__title">You&#39;re on the list.</h1>'));
    assert.ok(html.includes('href="/#newsletter">Back to the home page</a>'));
    assert.equal(hook.state.requests[0].body.email, 'plain@example.com');

    const bad = await site.post('/subscribe', { email: 'nope' }, { json: false });
    assert.equal(bad.status, 422);
    assert.ok((await bad.text()).includes('Check that address.'));
  });
});

test('newsletter: five sign-ups an hour per visitor', async () => {
  await withForms(async (site, hook, now) => {
    const from = { headers: { 'x-forwarded-for': '203.0.113.20' } };
    for (let i = 0; i < 5; i += 1) assert.equal((await site.post('/subscribe', { email: `p${i}@example.com` }, from)).status, 200);
    const blocked = await site.post('/subscribe', { email: 'p6@example.com' }, from);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get('retry-after'), '3600');
    assert.equal(hook.state.requests.length, 5);
    now.advance(60 * 60 * 1000 + 1000);
    assert.equal((await site.post('/subscribe', { email: 'p7@example.com' }, from)).status, 200);
  });
});

test('take the stage: the form page', async () => {
  await withForms(async (site) => {
    const { res, text } = await site.get('/apply?kind=show');
    assert.equal(res.status, 200);
    assert.ok(text.includes('<h1 id="page-title" class="sub__title">Take the stage.</h1>'));
    assert.ok(text.includes('<input type="radio" name="kind" value="show" checked>'));
    assert.ok(text.includes('<input type="radio" name="kind" value="talk">'));
    for (const id of ['apply-name', 'apply-email', 'apply-about', 'apply-link']) assert.ok(text.includes(`<label class="form__label" for="${id}">`), id);
    const odd = await site.get('/apply?kind="><script>alert(1)</script>');
    assert.equal(odd.text.includes('<script>alert'), false);
    const map = await site.get('/sitemap.xml');
    assert.ok(map.text.includes('<loc>https://www.wpgincubator.ai/apply</loc>'));
  });
});

test('take the stage: a complete application reaches the organizers', async () => {
  await withForms(async (site, hook) => {
    const res = await site.post('/apply', { kind: 'talk', name: 'Ada Lovelace', email: 'ada@example.com', about: 'An engine that computes Bernoulli numbers, and what broke along the way.', link: 'example.com/engine', website: '' }, { json: false });
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.ok(html.includes('<h1 id="page-title" class="sub__title">Got it.</h1>'));
    assert.ok(html.includes('Your note is with the organizers. One of them will reply by email.'));
    assert.equal(hook.state.requests.length, 1);
    assert.equal(hook.state.requests[0].path, '/apply');
    assert.deepEqual(hook.state.requests[0].body, {
      type: 'apply',
      kind: 'talk',
      kindLabel: 'Give a spotlight talk',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      about: 'An engine that computes Bernoulli numbers, and what broke along the way.',
      link: 'https://example.com/engine',
      submittedAt: '2026-11-13T15:00:00.000Z',
      site: 'https://www.wpgincubator.ai',
      text: 'Give a spotlight talk: Ada Lovelace <ada@example.com>. An engine that computes Bernoulli numbers, and what broke along the way. Link: https://example.com/engine',
    });
    for (const word of ['Ada', 'Lovelace', 'ada@example.com', 'Bernoulli']) assert.equal(site.log.text().includes(word), false, word);
  });
});

test('take the stage: mistakes come back with the form filled in and each problem named', async () => {
  await withForms(async (site, hook) => {
    const res = await site.post('/apply', { kind: '', name: 'A', email: 'ada@', about: 'short', link: 'not a link', website: '' }, { json: false });
    const html = await res.text();
    assert.equal(res.status, 422);
    assert.ok(html.includes('<p class="form__summary" role="alert">Almost there. Check the fields marked below.</p>'));
    assert.ok(html.includes('<p class="form-error" id="err-kind">Choose a talk or a demo.</p>'));
    assert.ok(html.includes('<p class="form-error" id="err-name">Enter your name.</p>'));
    assert.ok(html.includes('<p class="form-error" id="err-email">Enter an email address, like name@example.com.</p>'));
    assert.ok(html.includes('id="err-about"'));
    assert.ok(html.includes('<p class="form-error" id="err-link">That link does not look like a web address. Fix it or leave it empty.</p>'));
    assert.ok(html.includes('name="email" type="email" maxlength="254" autocomplete="email" value="ada@" aria-invalid="true" aria-describedby="hint-email err-email"'));
    assert.ok(html.includes('value="not a link" aria-invalid="true"'));
    assert.equal(hook.state.requests.length, 0);

    const xss = await site.post('/apply', { kind: 'talk', name: '"><script>alert(1)</script>', email: 'x', about: '</textarea><script>alert(2)</script>', website: '' }, { json: false });
    const xssHtml = await xss.text();
    assert.equal(xssHtml.includes('<script>alert'), false);
    assert.ok(xssHtml.includes('value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"'));
    assert.ok(xssHtml.includes('&lt;/textarea&gt;&lt;script&gt;alert(2)&lt;/script&gt;</textarea>'));
  });
});

test('take the stage: trap field, delivery failure and the JSON form', async () => {
  await withForms(async (site, hook) => {
    const good = { kind: 'show', name: 'Grace Hopper', email: 'grace@example.com', about: 'A compiler demo for the Show & Tell.' };
    const bot = await site.post('/apply', { ...good, website: 'spam' }, { json: false });
    assert.equal(bot.status, 200);
    assert.equal(hook.state.requests.length, 0);

    hook.state.status = 500;
    const failed = await site.post('/apply', good, { json: false });
    const html = await failed.text();
    assert.equal(failed.status, 502);
    assert.ok(html.includes("That didn't send. Something went wrong on our side, so nothing was saved. Try again in a minute, or write to hello@wpgincubator.ai."));
    assert.ok(html.includes('value="Grace Hopper"'), 'nothing the visitor wrote is lost');
    assert.ok(html.includes('A compiler demo for the Show &amp; Tell.</textarea>'));

    hook.state.status = 200;
    const api = await site.post('/apply', good);
    assert.deepEqual(await api.json(), { ok: true, message: 'Your note is with the organizers. One of them will reply by email.' });
    const apiBad = await site.post('/apply', { kind: 'show' });
    assert.equal(apiBad.status, 422);
    assert.deepEqual(Object.keys((await apiBad.json()).errors), ['name', 'email', 'about']);
    assert.equal((await site.post('/apply', good, { headers: { origin: 'https://evil.example' } })).status, 403);
  });
});

test('file storage: sign-ups are appended to a file when FORMS_FILE_STORE is on', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpg-site-'));
  const site = await startSite({ env: { FORMS_FILE_STORE: '1', DATA_DIR: dir } });
  try {
    assert.ok((await site.get('/')).text.includes('action="/subscribe"'));
    assert.equal((await site.post('/subscribe', { email: 'a@example.com' })).status, 200);
    assert.equal((await site.post('/subscribe', { email: 'b@example.com' })).status, 200);
    const lines = fs.readFileSync(path.join(dir, 'subscribe.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(lines.map((l) => l.email), ['a@example.com', 'b@example.com']);
    assert.equal((await site.request('/data/subscribe.jsonl')).status, 404, 'the file is not reachable from the web');
  } finally {
    await site.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
