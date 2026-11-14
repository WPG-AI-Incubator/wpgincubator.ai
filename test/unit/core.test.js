import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readConfig } from '../../src/config.js';
import {
  clock12, icsUtc, isoDate, isoLocal, isoWithOffset, longDate, longDateYear, monthDayYear, parseLocal, partsIn, shortDate, timeRange,
} from '../../src/dates.js';
import { esc, html, jsonForHtml, raw } from '../../src/html.js';
import { buildIcs } from '../../src/ics.js';
import { createLimiter } from '../../src/ratelimit.js';

test('html: interpolated values are escaped', () => {
  const evil = `<img src=x onerror="alert(1)">'&`;
  const out = html`<p title="${evil}">${evil}</p>`.toString();
  assert.equal(out.includes('<img'), false);
  assert.equal(out, `<p title="${esc(evil)}">${esc(evil)}</p>`);
  assert.match(out, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&#39;&amp;/);
});

test('html: nested templates and raw() are not escaped twice; empty values vanish', () => {
  const inner = html`<b>${'a&b'}</b>`;
  assert.equal(html`<p>${inner}${raw('<i>x</i>')}${null}${false}${undefined}${[html`<u>1</u>`, '<2>']}</p>`.toString(), '<p><b>a&amp;b</b><i>x</i><u>1</u>&lt;2&gt;</p>');
});

test('html: JSON for attributes and data blocks cannot close a tag', () => {
  const text = jsonForHtml({ a: '</script><script>alert(1)</script>', b: 'R&D' });
  assert.equal(/[<>&]/.test(text), false);
  assert.deepEqual(JSON.parse(text), { a: '</script><script>alert(1)</script>', b: 'R&D' });
});

test('dates: Winnipeg wall-clock time is UTC-5 all year, whatever the server thinks', () => {
  // Manitoba stayed on UTC-5 after November 1, 2026 (gov.mb.ca/timechange).
  const start = parseLocal('2026-11-25T18:00');
  assert.equal(start.toISOString(), '2026-11-25T23:00:00.000Z');
  assert.equal(parseLocal('2026-07-08T18:00').toISOString(), '2026-07-08T23:00:00.000Z');
  assert.equal(parseLocal('2027-01-13T18:00').toISOString(), '2027-01-13T23:00:00.000Z');
  assert.deepEqual(partsIn(new Date('2026-12-10T04:59:59Z')), { year: 2026, month: 12, day: 9, hour: 23, minute: 59, second: 59, weekday: 3 });
});

test('dates: the formats the pages use', () => {
  const start = parseLocal('2026-11-25T18:00');
  const end = parseLocal('2026-11-25T21:00');
  assert.equal(longDate(start), 'Wednesday, November 25');
  assert.equal(longDateYear(start), 'Wednesday, November 25, 2026');
  assert.equal(monthDayYear(start), 'November 25, 2026');
  assert.equal(shortDate(start), 'Nov 25, 2026');
  assert.equal(timeRange(start, end), '6:00 to 9:00 PM');
  assert.equal(timeRange(parseLocal('2026-11-25T11:30'), parseLocal('2026-11-25T13:00')), '11:30 AM to 1:00 PM');
  assert.equal(timeRange(parseLocal('2026-11-25T12:00'), null), '12:00 PM');
  assert.equal(timeRange(parseLocal('2026-11-25T00:15'), parseLocal('2026-11-25T01:00')), '12:15 to 1:00 AM');
  assert.equal(isoDate(start), '2026-11-25');
  assert.equal(isoLocal(start), '2026-11-25T18:00');
  assert.equal(isoWithOffset(start), '2026-11-25T18:00:00-05:00');
  assert.equal(icsUtc(start), '20261125T230000Z');
  assert.equal(clock12('18:30'), '6:30');
  assert.equal(clock12('12:05'), '12:05');
  assert.equal(clock12('00:10'), '12:10');
});

test('dates: weekdays of the verified Issues', () => {
  const day = (d) => longDateYear(parseLocal(d));
  assert.equal(day('2026-11-10'), 'Tuesday, November 10, 2026');
  assert.equal(day('2026-10-28'), 'Wednesday, October 28, 2026');
  assert.equal(day('2026-10-14'), 'Wednesday, October 14, 2026');
  assert.equal(day('2026-09-16'), 'Wednesday, September 16, 2026');
  assert.equal(day('2026-04-02'), 'Thursday, April 2, 2026');
});

test('dates: bad input is rejected, not guessed', () => {
  for (const bad of ['', 'tomorrow', '2026-13-01', '2026-02-30', '2026-11-25T24:00', '2026-11-25 18:00', null, undefined]) {
    assert.equal(parseLocal(bad), null, String(bad));
  }
  // a bare date sits at noon so it cannot drift to the day before or after
  assert.equal(isoDate(parseLocal('2026-11-10')), '2026-11-10');
});

test('ics: a valid one-event calendar with escaping, folding and CRLF', () => {
  const issue = {
    number: 13,
    start: parseLocal('2026-11-25T18:00'),
    end: parseLocal('2026-11-25T21:00'),
    url: 'https://www.eventbrite.ca/e/wpg-ai-incubator-issue-13-tickets-1999778758098',
    free: true,
  };
  const ics = buildIcs({ issue, name: 'WPG AI Incubator Issue #13: Agents, tools; and more', location: '158 Commerce Drive, Winnipeg, MB', siteUrl: 'https://www.wpgincubator.ai', stamp: new Date('2026-11-13T16:00:00Z') });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n'));
  assert.equal(/[^\r]\n/.test(ics), false, 'every line ends with CRLF');
  assert.match(ics, /\r\nUID:issue-13@wpgincubator\.ai\r\n/);
  assert.match(ics, /\r\nDTSTAMP:20261113T160000Z\r\n/);
  assert.match(ics, /\r\nDTSTART:20261125T230000Z\r\n/);
  assert.match(ics, /\r\nDTEND:20261126T020000Z\r\n/);
  assert.match(ics, /SUMMARY:WPG AI Incubator Issue #13: Agents\\, tools\\; and more/);
  assert.match(ics, /LOCATION:158 Commerce Drive\\, Winnipeg\\, MB/);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line}`);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, /DESCRIPTION:Free to attend\.\\nRegister: https:\/\/www\.eventbrite\.ca\/e\/wpg-ai-incubator-issue-13-tickets-1999778758098\\nMore: https:\/\/www\.wpgincubator\.ai\//);
});

test('ics: no end time means three hours; multi-byte text folds on character boundaries', () => {
  const issue = { number: null, id: '42', start: parseLocal('2026-12-09T18:00'), end: null, url: '', free: false };
  const ics = buildIcs({ issue, name: 'Café ☕ '.repeat(20), location: 'Winnipeg', siteUrl: 'https://www.wpgincubator.ai', stamp: new Date('2026-11-13T16:00:00Z') });
  assert.match(ics, /DTEND:20261210T020000Z/);
  assert.match(ics, /UID:issue-42@wpgincubator\.ai/);
  assert.equal(ics.includes('Free to attend'), false);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.ok(ics.replace(/\r\n /g, '').includes('Café ☕ Café ☕'));
});

test('ratelimit: allows up to the limit, then says when to come back', () => {
  let t = 1_000_000;
  const limiter = createLimiter({ now: () => t });
  for (let i = 0; i < 3; i += 1) assert.equal(limiter.hit('a', 3, 60_000).ok, true);
  const blocked = limiter.hit('a', 3, 60_000);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfter, 60);
  assert.equal(limiter.hit('b', 3, 60_000).ok, true, 'other visitors are not affected');
  t += 59_000;
  assert.deepEqual(limiter.hit('a', 3, 60_000), { ok: false, retryAfter: 1 });
  t += 1_000;
  assert.equal(limiter.hit('a', 3, 60_000).ok, true, 'the window resets');
});

test('ratelimit: memory stays bounded under a flood of addresses', () => {
  let t = 0;
  const limiter = createLimiter({ now: () => t, maxKeys: 100 });
  for (let i = 0; i < 1000; i += 1) limiter.hit(`ip-${i}`, 5, 60_000);
  assert.ok(limiter.size() <= 100);
  t += 61_000;
  limiter.sweep();
  assert.equal(limiter.size(), 0);
});

test('config: safe defaults with an empty environment', () => {
  const c = readConfig({});
  assert.equal(c.port, 3000);
  assert.equal(c.siteUrl, 'https://www.wpgincubator.ai');
  assert.equal(c.ai.key, '');
  assert.equal(c.ai.model, 'claude-haiku-5-5');
  assert.equal(c.ai.version, '2023-06-01');
  assert.equal(c.ai.base, 'https://api.anthropic.com');
  assert.equal(c.ai.effort, 'low');
  assert.equal(c.eventbrite.base, 'https://www.eventbriteapi.com/v3');
  assert.equal(c.eventbrite.refreshMs, 15 * 60 * 1000);
  assert.equal(c.forms.fileStore, false);
  assert.equal(c.gaId, '');
});

test('config: values are cleaned and bounded', () => {
  const c = readConfig({
    PORT: '8080', SITE_URL: 'https://example.org///', TRUST_PROXY: '99', EVENTBRITE_REFRESH_MINUTES: '0',
    SUBSCRIBE_WEBHOOK_URL: 'javascript:alert(1)', APPLY_WEBHOOK_URL: ' https://hooks.example/abc ', FORMS_FILE_STORE: 'yes',
    GA_MEASUREMENT_ID: '"><script>', ANTHROPIC_EFFORT: '', FIND_ROOM_DAILY_CAP: '-5',
  });
  assert.equal(c.port, 8080);
  assert.equal(c.siteUrl, 'https://example.org');
  assert.equal(c.trustProxy, 5);
  assert.equal(c.eventbrite.refreshMs, 60 * 1000);
  assert.equal(c.forms.subscribeWebhook, '');
  assert.equal(c.forms.applyWebhook, 'https://hooks.example/abc');
  assert.equal(c.forms.fileStore, true);
  assert.equal(c.gaId, '');
  assert.equal(c.ai.effort, '');
  assert.equal(c.ai.dailyCap, 0);
  assert.equal(readConfig({ GA_MEASUREMENT_ID: 'G-CGCZPS611C' }).gaId, 'G-CGCZPS611C');
});
