// Issues from Eventbrite through the running site, against a stand-in
// Eventbrite: normal service, paging, outages, bad settings, cancellations.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ebEvent, startMockEventbrite } from '../helpers/mocks.js';
import { fakeClock, startSite } from '../helpers/site.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const AGENDA_13 =
  '<p>Winnipeg’s AI community is back.</p><p>6:00 PM – Doors open, coffee and networking</p><p>6:30 PM – Spotlight talk with Rosa Okafor (about 45 min plus a short Q&amp;A)</p><p>7:25 PM – Breakout rooms: Dream / Build / Execute (about 35 min)</p><p>8:05 PM – AI Show &amp; Tell</p><p>8:45 – 9:00 PM – Wrap</p>';

const issue13 = () => ebEvent({ id: 1999778758098, title: 'WPG AI Incubator  - Issue #13', start: '2026-11-25T18:00:00', end: '2026-11-25T21:00:00', url: 'https://www.eventbrite.ca/e/wpg-ai-incubator-issue-13-tickets-1999778758098' });
const issue12 = () => ebEvent({ id: 1999776946680, title: 'WPG AI Incubator  - Issue #12', start: '2026-11-10T18:00:00', end: '2026-11-10T21:00:00', status: 'completed', url: 'https://www.eventbrite.ca/e/wpg-ai-incubator-issue-12-tickets-1999776946680' });
const issue14 = () => ebEvent({ id: 3000000000014, title: 'WPG AI Incubator - Issue #14: Agents at work', start: '2026-12-09T18:00:00', end: '2026-12-09T21:00:00' });
const unrelated = () => ebEvent({ id: 4000000000001, title: 'Atlas Elevated Labs: private workshop', start: '2026-11-18T09:00:00', end: '2026-11-18T12:00:00' });

async function withEventbrite(options, run, env = {}) {
  const eb = await startMockEventbrite(options);
  const now = fakeClock('2026-11-13T10:00');
  const site = await startSite({ now, env: { EVENTBRITE_TOKEN: 'test-token', EVENTBRITE_ORG_ID: 'org-1', EVENTBRITE_API_BASE: eb.base, ...env } });
  try {
    await run(site, eb, now);
  } finally {
    await site.close();
    await eb.close();
  }
}

test('live: the next Issue, its agenda and what follows come from Eventbrite', async () => {
  await withEventbrite({ events: [issue14(), issue13(), unrelated(), issue12()], descriptions: { 1999778758098: AGENDA_13 } }, async (site, eb) => {
    const { text } = await site.get('/');
    assert.ok(text.includes('>Register for Issue #13</a>'));
    assert.ok(text.includes('<time datetime="2026-11-25T18:00">Wednesday, November 25, 6:00 to 9:00 PM</time>'));
    // the agenda as written on Eventbrite today, not the copy saved in the content file
    assert.ok(text.includes('<strong>Spotlight talk with Rosa Okafor</strong> About 45 min plus a short Q&amp;A.'));
    assert.ok(text.includes('Spotlight:<br>Rosa Okafor'));
    assert.equal(text.includes('Tad Einstein'), false);
    assert.ok(text.includes('<time class="show__time" datetime="20:45">8:45</time><span class="show__what">Wrap, until 9:00</span>'));
    // the cover line only exists in the content file and is kept
    assert.ok(text.includes('The Slurpee Capital gets a brain freeze.'));
    // later Issues are listed; other events on the same Eventbrite account are not
    assert.ok(text.includes('Also on the calendar'));
    assert.ok(text.includes('Issue #14: Agents at work, <time datetime="2026-12-09T18:00">Wednesday, December 9, 6:00 to 9:00 PM</time>'));
    assert.equal(text.includes('private workshop'), false);
    assert.ok(text.includes('Issues #1 to #5, April to June 2026'), 'older Issues from the content file are still there');

    const [list, content] = eb.state.requests;
    assert.equal(list.path, '/v3/organizations/org-1/events/');
    assert.equal(list.auth, 'Bearer test-token');
    assert.deepEqual(list.query, { status: 'live,started,ended,completed', order_by: 'start_desc', expand: 'venue', page_size: '50' });
    assert.equal(content.path, '/v3/events/1999778758098/structured_content/');
    assert.deepEqual(content.query, { purpose: 'listing' });
    assert.equal(eb.state.requests.length, 2, 'two requests per refresh: the list and the next agenda');

    const api = JSON.parse((await site.get('/api/next-issue')).text);
    assert.equal(api.source, 'eventbrite');
    assert.equal(api.issue.spotlight, 'Rosa Okafor');
    assert.equal(eb.state.requests.length, 2, 'further page views are served from memory');
    assert.equal(site.log.text().includes('test-token'), false, 'the token is never logged');
  });
});

test('live: results are refreshed every fifteen minutes, in the background', async () => {
  await withEventbrite({ events: [issue13(), issue12()] }, async (site, eb, now) => {
    await site.get('/');
    now.advance(14 * MINUTE);
    await site.get('/');
    assert.equal(eb.state.requests.length, 2);

    eb.state.events = [ebEvent({ id: 1999778758098, title: 'WPG AI Incubator  - Issue #13', start: '2026-11-26T18:30:00', end: '2026-11-26T21:30:00' }), issue12()];
    now.advance(2 * MINUTE);
    const stale = await site.get('/');
    assert.ok(stale.text.includes('Wednesday, November 25, 6:00 to 9:00 PM'), 'this visitor is not kept waiting');
    await site.app.store.refresh();
    const fresh = await site.get('/');
    assert.ok(fresh.text.includes('Thursday, November 26, 6:30 to 9:30 PM'), 'the next visitor sees the new date');
  });
});

test('live: long archives are read page by page', async () => {
  const many = Array.from({ length: 7 }, (_, i) =>
    ebEvent({ id: 2000000000000 + i, title: `WPG AI Incubator - Issue #${20 - i}`, start: `2026-10-${String(28 - i * 2).padStart(2, '0')}T18:00:00`, end: `2026-10-${String(28 - i * 2).padStart(2, '0')}T21:00:00`, status: 'completed' }),
  );
  await withEventbrite({ events: [issue13(), ...many], pageSize: 3 }, async (site, eb) => {
    const { text } = await site.get('/');
    for (let n = 14; n <= 20; n += 1) assert.ok(text.includes(`Issue #${n}`), `Issue #${n} from a later page`);
    const lists = eb.state.requests.filter((r) => r.path.endsWith('/events/'));
    assert.deepEqual(lists.map((r) => r.query.continuation), [undefined, '3', '6']);
  });
});

test('outage at start-up: the site serves its own copy and says so in the log', async () => {
  await withEventbrite({ events: [issue14(), issue13()] }, async (site, eb, now) => {
    eb.state.failWith = 503;
    const { res, text } = await site.get('/');
    assert.equal(res.status, 200);
    assert.ok(text.includes('>Register for Issue #13</a>'));
    assert.ok(text.includes('Spotlight:<br>Tad Einstein'), 'the saved agenda is used');
    assert.equal(text.includes('Issue #14'), false);
    assert.equal(JSON.parse((await site.get('/api/next-issue')).text).source, 'content');
    assert.match(site.log.text(), /warn \[issues\] Eventbrite refresh failed \(503\); serving saved data/);

    const before = eb.state.requests.length;
    await site.get('/');
    assert.equal(eb.state.requests.length, before, 'no hammering: one retry a minute at most');

    eb.state.failWith = 0;
    now.advance(61 * 1000);
    const recovered = await site.get('/');
    assert.ok(recovered.text.includes('Issue #14: Agents at work'), 'back to live data once Eventbrite answers');
  });
});

test('outage later on: the last good answer is kept for a day, then the saved copy takes over', async () => {
  await withEventbrite({ events: [issue14(), issue13()] }, async (site, eb, now) => {
    assert.ok((await site.get('/')).text.includes('Issue #14: Agents at work'));
    eb.state.failWith = 500;

    now.advance(3 * HOUR);
    await site.get('/');
    await site.app.store.refresh();
    const stale = await site.get('/');
    assert.equal(stale.res.status, 200);
    assert.ok(stale.text.includes('Issue #14: Agents at work'), 'three hours in: still the last good data');

    now.advance(22 * HOUR);
    const old = await site.get('/');
    assert.equal(old.res.status, 200);
    assert.equal(old.text.includes('Issue #14'), false, 'after a day the saved copy is used instead of old data');
    assert.ok(old.text.includes('>Register for Issue #13</a>'));
  });
});

test('a slow Eventbrite does not hold the page for long', async () => {
  await withEventbrite({ events: [issue13()] }, async (site, eb) => {
    eb.state.hang = true;
    const started = Date.now();
    const { res, text } = await site.get('/');
    const took = Date.now() - started;
    assert.equal(res.status, 200);
    assert.ok(text.includes('>Register for Issue #13</a>'));
    assert.ok(took < 5500, `first page took ${took}ms`);
    const again = Date.now();
    await site.get('/');
    assert.ok(Date.now() - again < 500, 'later visitors do not wait at all');
  });
});

test('wrong settings fall back to the saved copy instead of an empty site', async () => {
  for (const [env, pattern] of [
    [{ EVENTBRITE_TOKEN: 'wrong' }, /refresh failed \(401\)/],
    [{ EVENTBRITE_ORG_ID: 'someone-else' }, /refresh failed \(404\)/],
    [{ EVENTBRITE_TITLE_FILTER: 'no such words' }, /refresh failed \(no matching events\)/],
  ]) {
    await withEventbrite({ events: [issue13(), issue12()] }, async (site) => {
      const { res, text } = await site.get('/');
      assert.equal(res.status, 200);
      assert.ok(text.includes('>Register for Issue #13</a>'));
      assert.match(site.log.text(), pattern);
    }, env);
  }
});

test('a cancelled Issue disappears from the site', async () => {
  // Issue #13 is in the content file but no longer on Eventbrite.
  await withEventbrite({ events: [issue12()] }, async (site) => {
    const { text } = await site.get('/');
    assert.ok(text.includes('<strong>Next date to be announced.</strong>'));
    assert.equal(text.includes('Register for Issue #13'), false);
    assert.equal(text.includes('Nov 25, 2026'), false);
    assert.equal((await site.get('/next-issue.ics')).res.status, 404);
  });
});

test('no readable agenda on Eventbrite: the saved one is used; none saved: the usual format', async () => {
  await withEventbrite({ events: [issue13()], descriptions: { 1999778758098: '<p>Come build with us. Doors at six.</p>' } }, async (site) => {
    const { text } = await site.get('/');
    assert.ok(text.includes('Wrap-up, done by 9:00 PM'));
    assert.ok(text.includes('Issue #13 run of show'));
  });
  await withEventbrite({ events: [issue14()] }, async (site) => {
    const { text } = await site.get('/');
    assert.ok(text.includes('>Register for Issue #14</a>'));
    assert.ok(text.includes('A typical Issue'));
    assert.ok(text.includes('Find your next room.'), 'the default cover line');
    assert.equal(text.includes('Spotlight:'), false);
  });
});

test('the agenda request failing does not lose the rest', async () => {
  const eb = await startMockEventbrite({ events: [issue13(), issue12()] });
  const realFetch = globalThis.fetch;
  const flaky = (url, options) => (String(url).includes('/structured_content/') ? Promise.reject(new TypeError('socket hang up')) : realFetch(url, options));
  const site = await startSite({ fetch: flaky, env: { EVENTBRITE_TOKEN: 'test-token', EVENTBRITE_ORG_ID: 'org-1', EVENTBRITE_API_BASE: eb.base } });
  try {
    const { text } = await site.get('/');
    assert.ok(text.includes('>Register for Issue #13</a>'));
    assert.ok(text.includes('Wrap-up, done by 9:00 PM'));
    assert.equal(JSON.parse((await site.get('/api/next-issue')).text).source, 'eventbrite');
    assert.match(site.log.text(), /warn \[issues\] agenda not read from Eventbrite \(TypeError\)/);
  } finally {
    await site.close();
    await eb.close();
  }
});

test('a stale conversion on Eventbrite\'s side cannot move the start time', async () => {
  // utc values as an Eventbrite still expecting the old November fall-back would send them
  const drifted = ebEvent({ id: 1999778758098, title: 'WPG AI Incubator  - Issue #13', start: '2026-11-25T18:00:00', end: '2026-11-25T21:00:00', startUtc: '2026-11-26T00:00:00Z', endUtc: '2026-11-26T03:00:00Z' });
  await withEventbrite({ events: [drifted] }, async (site) => {
    const { text } = await site.get('/');
    assert.ok(text.includes('Wednesday, November 25, 6:00 to 9:00 PM'));
    assert.ok((await site.get('/next-issue.ics')).text.includes('DTSTART:20261125T230000Z'));
  });
});
