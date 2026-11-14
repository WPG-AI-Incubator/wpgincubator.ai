// Find your room through the running site: with and without the AI service,
// with and without JavaScript, limits, and the privacy promise.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { messageBody, startMockAnthropic } from '../helpers/mocks.js';
import { fakeClock, rawRequest, startSite } from '../helpers/site.js';

const SECRET = 'a quiet plan to rebuild the Jets ticket lottery with agents';

async function withAi(respond, run, env = {}) {
  const api = await startMockAnthropic({ respond });
  const site = await startSite({ env: { ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_API_BASE: api.url, FIND_ROOM_TIMEOUT_MS: '400', ...env } });
  try {
    await run(site, api);
  } finally {
    await site.close();
    await api.close();
  }
}

test('no API key: typed text gets a keyword reply, labelled as one', async () => {
  const site = await startSite();
  try {
    const res = await site.post('/find-your-room', { text: 'My prototype keeps crashing when I add a second agent' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), {
      room: 'build',
      word: 'Build.',
      line: 'Start in the Build room.',
      why: "Sounds like you're in the middle of making it. Open the laptop in the Build room and work on it next to people doing the same.",
      bring: 'Where am I stuck, and can I show it in two minutes?',
      said: 'My prototype keeps crashing when I add a second agent',
      source: 'rules',
      note: 'Matched by keyword from what you typed.',
    });
  } finally {
    await site.close();
  }
});

test('with the AI service: the reply is the model\'s, checked and labelled', async () => {
  await withAi(
    () => ({ body: messageBody(JSON.stringify({ room: 'execute', why: 'It is live and needs people, so go where the next steps get planned.', bring: 'Who should see it first?' })) }),
    async (site, api) => {
      const home = await site.get('/');
      assert.ok(home.text.includes('<span class="finder__mode">Answer written by AI</span>'));
      assert.ok(home.text.includes('Example answer. Type your own and AI writes one for you.'));
      assert.equal(api.state.requests.length, 0, 'loading the page does not call the AI');

      const res = await site.post('/find-your-room', { text: SECRET });
      const data = await res.json();
      assert.deepEqual([data.room, data.word, data.source], ['execute', 'Execute.', 'ai']);
      assert.equal(data.why, 'It is live and needs people, so go where the next steps get planned.');
      assert.equal(data.note, 'Written by AI from what you typed. If it missed, go with the room that sounds right to you.');
      assert.equal(data.said, SECRET);
      assert.equal(api.state.requests.length, 1);
      assert.ok(api.state.requests[0].body.messages[0].content.includes(SECRET));

      const privacy = await site.get('/privacy');
      assert.ok(privacy.text.includes('our server sends your text to Anthropic, the company that makes the AI model we use'));
    },
  );
});

test('privacy promise: what a visitor types is in no log line, on success or failure', async () => {
  for (const respond of [undefined, () => ({ status: 500 }), () => ({ raw: 'garbage' }), () => ({ delayMs: 700 })]) {
    await withAi(respond, async (site) => {
      await (await site.post('/find-your-room', { text: SECRET })).json();
      await (await site.post('/find-your-room', { text: SECRET }, { json: false })).text();
      const log = site.log.text();
      for (const word of ['quiet plan', 'Jets', 'lottery', 'agents']) assert.equal(log.includes(word), false, `"${word}" leaked into the log`);
      assert.match(log, /info POST \/find-your-room 200 \d+ms/);
    });
  }
});

test('AI trouble is invisible except for an honest note', async () => {
  await withAi(
    () => ({ status: 529 }),
    async (site) => {
      const data = await (await site.post('/find-your-room', { text: 'I launched and need customers' })).json();
      assert.deepEqual([data.room, data.source], ['execute', 'rules']);
      assert.equal(data.note, "AI didn't answer this time, so this one is matched by keyword.");
    },
  );
});

test('the four examples are fixed replies and never reach the AI', async () => {
  await withAi(undefined, async (site, api) => {
    const byKey = await (await site.post('/find-your-room', { example: 'half' })).json();
    assert.deepEqual([byKey.room, byKey.said, byKey.source], ['build', 'My prototype is half working', 'example']);
    assert.equal(byKey.why, 'Half working is the best time to bring it. Open the laptop and get unstuck next to people who have hit the same wall.');
    const typed = await (await site.post('/find-your-room', { text: 'just curious' })).json();
    assert.deepEqual([typed.room, typed.source], ['dream', 'example']);
    assert.equal(api.state.requests.length, 0);
  });
});

test('nothing typed: a prompt, not an error page', async () => {
  const site = await startSite();
  try {
    for (const body of [{ text: '' }, { text: '   \n ' }, {}, { example: 'nonsense' }, { text: '\u0000\u0007' }]) {
      const res = await site.post('/find-your-room', body);
      assert.equal(res.status, 422);
      assert.deepEqual(await res.json(), { error: 'Type a sentence or tap an example. Your room shows up here.' });
    }
    const form = await site.post('/find-your-room', { text: '' }, { json: false });
    assert.equal(form.status, 303);
    assert.equal(form.headers.get('location'), '/#find-your-room');
  } finally {
    await site.close();
  }
});

test('JavaScript off: the form posts and the answer comes back as a page', async () => {
  const site = await startSite();
  try {
    const typed = await site.post('/find-your-room', { text: 'I shipped <script>alert("x")</script> & need users' }, { json: false });
    const html = await typed.text();
    assert.equal(typed.status, 200);
    assert.equal(typed.headers.get('cache-control'), 'no-store');
    assert.ok(html.includes('<h1 id="page-title" class="sub__title">Your room.</h1>'));
    assert.ok(html.includes('<p class="reply__word" data-slot="word">Execute.</p>'));
    assert.ok(html.includes('I shipped &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; need users'));
    assert.equal(html.includes('<script>alert'), false, 'what the visitor typed is shown as text, never run');
    assert.ok(html.includes('<meta name="robots" content="noindex">'));
    assert.ok(html.includes('href="/#find-your-room">Try another answer</a>'));
    assert.ok(html.includes('>Register for Issue #13</a>'));

    const chip = await site.post('/find-your-room', { text: '', example: 'idea' }, { json: false });
    const chipHtml = await chip.text();
    assert.ok(chipHtml.includes('You said: “<span data-slot="said">I have an idea but no code yet</span>”'));
    assert.ok(chipHtml.includes('Who has this problem today, and what do they do about it now?'));
  } finally {
    await site.close();
  }
});

test('limits: six typed tries a minute per visitor, forty a day', async () => {
  const now = fakeClock('2026-11-13T10:00');
  const site = await startSite({ now });
  const from = (ip) => ({ headers: { 'x-forwarded-for': ip } });
  try {
    for (let i = 0; i < 6; i += 1) assert.equal((await site.post('/find-your-room', { text: `try ${i}` }, from('203.0.113.5'))).status, 200);
    const blocked = await site.post('/find-your-room', { text: 'one more' }, from('203.0.113.5'));
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get('retry-after'), '60');
    assert.deepEqual(await blocked.json(), { error: "That's a lot of tries in a row. Give it a minute, then try again." });

    assert.equal((await site.post('/find-your-room', { text: 'someone else' }, from('203.0.113.6'))).status, 200, 'other visitors are unaffected');
    assert.equal((await site.post('/find-your-room', { example: 'curious' }, from('203.0.113.5'))).status, 200, 'examples do not count against the typed limit');
    assert.equal((await site.post('/find-your-room', { text: 'spoof' }, { headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.5' } })).status, 429, 'only the address added by our own proxy is trusted');

    const page = await site.post('/find-your-room', { text: 'no javascript' }, { json: false, ...from('203.0.113.5') });
    assert.equal(page.status, 429);
    assert.ok((await page.text()).includes('<h1 id="page-title" class="sub__title">Give it a minute.</h1>'));

    now.advance(61_000);
    assert.equal((await site.post('/find-your-room', { text: 'back again' }, from('203.0.113.5'))).status, 200);

    // the daily ceiling: 40 typed tries, however slowly they come
    let ok = 0;
    for (let i = 0; i < 50; i += 1) {
      now.advance(11_000);
      if ((await site.post('/find-your-room', { text: `day ${i}` }, from('203.0.113.9'))).status === 200) ok += 1;
    }
    assert.equal(ok, 40);
  } finally {
    await site.close();
  }
});

test('only this site can post to it', async () => {
  const site = await startSite();
  const tryWith = async (headers) => (await site.post('/find-your-room', { text: 'building a thing' }, { headers })).status;
  try {
    assert.equal(await tryWith({ origin: 'https://evil.example' }), 403);
    assert.equal(await tryWith({ 'sec-fetch-site': 'cross-site', origin: 'https://www.wpgincubator.ai' }), 403);
    assert.equal(await tryWith({ 'sec-fetch-site': 'same-site' }), 403);
    assert.equal(await tryWith({ 'sec-fetch-site': 'same-origin' }), 200);
    assert.equal(await tryWith({ origin: 'https://www.wpgincubator.ai' }), 200, 'the public address is accepted behind a proxy that rewrites Host');
    assert.equal(await tryWith({ origin: site.url }), 200);
    assert.equal(await tryWith({}), 200, 'no Origin header at all (old browsers, plain forms)');
    const html = await site.post('/find-your-room', { text: 'x' }, { json: false, headers: { origin: 'https://evil.example' } });
    assert.equal(html.status, 404);
  } finally {
    await site.close();
  }
});

test('oversized, malformed and mistyped requests are refused cleanly', async () => {
  await withAi(undefined, async (site, api) => {
    const long = await (await site.post('/find-your-room', { text: `start ${'word '.repeat(400)}` })).json();
    assert.equal(long.source, 'ai');
    const sent = api.state.requests[0].body.messages[0].content;
    assert.ok(sent.length <= 500 + '<visitor_message>\n\n</visitor_message>'.length, 'at most 500 characters go to the AI');
    assert.ok(long.said.length <= 120);

    const huge = await rawRequest(`${site.url}/find-your-room`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(20000) }) });
    assert.equal(huge.status, 413);
    const badJson = await rawRequest(`${site.url}/find-your-room`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"text": "private words' });
    assert.equal(badJson.status, 400);
    assert.deepEqual(JSON.parse(badJson.body.toString()), { error: 'Bad request' });
    const array = await rawRequest(`${site.url}/find-your-room`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '["x"]' });
    assert.equal(array.status, 400);
    const xml = await rawRequest(`${site.url}/find-your-room`, { method: 'POST', headers: { 'content-type': 'text/xml' }, body: '<x/>' });
    assert.equal(xml.status, 415);
    assert.equal(site.log.text().includes('private words'), false, 'a broken body is not echoed into the log');
    assert.equal(api.state.requests.length, 1);
  });
});
