import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseLocal } from '../../src/dates.js';
import { eventIdFromUrl, mapEvent, parseTitle, safeHttpUrl } from '../../src/eventbrite.js';
import { endOf, loadContentIssues, mergeIssues, normalizeContentIssue, splitByTime } from '../../src/issues.js';
import { decodeEntities, findSpotlight, htmlToText, parseSchedule } from '../../src/schedule.js';
import { buildModel, structuredData } from '../../src/view.js';
import { ebEvent } from '../helpers/mocks.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const site = JSON.parse((await import('node:fs')).readFileSync(path.join(root, 'content/site.json'), 'utf8'));
const contentIssues = () => loadContentIssues(path.join(root, 'content/issues.json'));
const flags = { aiEnabled: false, subscribeEnabled: false, applyEnabled: false, gaEnabled: false };
const at = (text) => parseLocal(text);

// ---------- schedule ----------

test('schedule: the agenda lines as the organizers write them', () => {
  const text = [
    'Join us for Issue #13!',
    '6:00 PM – Doors open, coffee and networking',
    '6:30 PM – Spotlight talk with Tad Einstein (about 45 min plus a short Q&A)',
    '7:20 PM – Quick break',
    '7:25 PM – Breakout rooms: Dream / Build / Execute (about 35 min)',
    '8:00 PM – Quick reset',
    '8:05 PM – AI Show & Tell',
    '8:45 – 9:00 PM – Wrap',
    'See you there.',
  ].join('\n');
  assert.deepEqual(parseSchedule(text), [
    { time: '18:00', text: 'Doors open, coffee and networking' },
    { time: '18:30', strong: 'Spotlight talk with Tad Einstein', text: 'About 45 min plus a short Q&A.' },
    { time: '19:20', text: 'Quick break' },
    { time: '19:25', strong: 'Breakout rooms: Dream / Build / Execute', text: 'About 35 min.' },
    { time: '20:00', text: 'Quick reset' },
    { time: '20:05', text: 'AI Show & Tell' },
    { time: '20:45', text: 'Wrap', end: '21:00' },
  ]);
});

test('schedule: times without AM/PM, and the "8:45 9:00 PM – Wrap" line the old site produced', () => {
  const lines = ['6:00 Doors open, coffee and networking', '6:30 Spotlight talk with Tad Einstein (about 45 min plus a short Q&A)', '8:05 AI Show & Tell', '8:45 9:00 PM – Wrap'];
  const out = parseSchedule(lines.join('\n'));
  assert.deepEqual(out.map((row) => row.time), ['18:00', '18:30', '20:05', '20:45']);
  assert.deepEqual(out[3], { time: '20:45', text: 'Wrap', end: '21:00' });
});

test('schedule: bullets, dots, "to" ranges and a daytime event', () => {
  const text = '• 9.30am - Coffee\n- 10:00 to 11:30 - Workshop (bring a laptop)\n* 11:30 – 1:00 PM – Lunch and demos\n1:15 Wrap';
  assert.deepEqual(parseSchedule(text, { startHour: 9 }), [
    { time: '09:30', text: 'Coffee' },
    { time: '10:00', strong: 'Workshop', text: 'Bring a laptop.', end: '11:30' },
    { time: '11:30', text: 'Lunch and demos', end: '13:00' },
    { time: '13:15', text: 'Wrap' },
  ]);
});

test('schedule: prose is not mistaken for an agenda', () => {
  assert.deepEqual(parseSchedule('Doors at 6:00 PM. We wrap by 9:00.\n2026 was a big year.\n1.5 hours of building.\nSee you soon.'), []);
  assert.deepEqual(parseSchedule('6:00 PM – Doors\n6:30 PM – Talk'), [], 'two lines are not enough to call it an agenda');
  assert.deepEqual(parseSchedule(''), []);
  assert.deepEqual(parseSchedule(null), []);
});

test('schedule: impossible times are skipped and the list is capped', () => {
  assert.deepEqual(parseSchedule('25:00 Nope\n6:75 Nope\n13:00 PM Nope\n6:00 A\n6:10 B\n6:20 C').map((r) => r.time), ['18:00', '18:10', '18:20']);
  const many = Array.from({ length: 40 }, (_, i) => `6:${String(i).padStart(2, '0')} Item ${i}`).join('\n');
  assert.equal(parseSchedule(many).length, 14);
});

test('schedule: Eventbrite HTML becomes clean lines', () => {
  const markup = '<p>6:00 PM &ndash; Doors open, coffee &amp; networking</p><p><strong>6:30&nbsp;PM</strong> – Spotlight talk with Tad Einstein (about 45 min)</p><ul><li>8:05 PM – AI Show &#38; Tell</li><li>8:45 – 9:00 PM – Wrap</li></ul><script>alert(1)</script>';
  const text = htmlToText(markup);
  assert.equal(text.includes('<'), false);
  assert.equal(text.includes('alert'), false);
  assert.deepEqual(parseSchedule(text).map((r) => `${r.time} ${r.strong ?? r.text}`), [
    '18:00 Doors open, coffee & networking', '18:30 Spotlight talk with Tad Einstein', '20:05 AI Show & Tell', '20:45 Wrap',
  ]);
  assert.equal(decodeEntities('&lt;b&gt; &#x41;&#66; &unknown; &#0; &#99999999;'), '<b> AB &unknown;    ');
});

test('schedule: the spotlight speaker is read from the agenda', () => {
  assert.equal(findSpotlight([{ time: '18:30', strong: 'Spotlight talk with Tad Einstein', text: 'About 45 min.' }]), 'Tad Einstein');
  assert.equal(findSpotlight([{ time: '18:30', strong: 'Spotlight talk with Tad Einstein.', text: 'About 45 minutes, plus a short Q&A.' }]), 'Tad Einstein');
  assert.equal(findSpotlight([{ time: '18:30', text: 'Spotlight talk with Tad Einstein. About 45 minutes' }]), 'Tad Einstein');
  assert.equal(findSpotlight([{ time: '18:30', text: 'Spotlight: Dr. Ana María Peña-Łuk, on agents' }]), 'Dr. Ana María Peña-Łuk');
  assert.equal(findSpotlight([{ time: '18:30', text: 'Spotlight talk with J. R. Smith - founder of X' }]), 'J. R. Smith');
  assert.equal(findSpotlight([{ time: '18:30', text: 'Spotlight talk by Sam O’Neil-Wu' }]), 'Sam O’Neil-Wu');
  assert.equal(findSpotlight([{ time: '18:00', text: 'Doors open' }]), '');
  assert.equal(findSpotlight([]), '');
});

// ---------- Eventbrite mapping ----------

test('eventbrite: titles as they appear on the real listings', () => {
  assert.deepEqual(parseTitle('WPG AI Incubator  - Issue #13'), { number: 13, subtitle: '' });
  assert.deepEqual(parseTitle('WPG AI Incubator - Issue #11: AI x IP'), { number: 11, subtitle: 'AI x IP' });
  assert.deepEqual(parseTitle('WPG AI Incubator – Issue 14 — Agents at work'), { number: 14, subtitle: 'Agents at work' });
  assert.deepEqual(parseTitle('AI Incubator'), { number: null, subtitle: '' });
  assert.equal(eventIdFromUrl('https://www.eventbrite.ca/e/wpg-ai-incubator-issue-13-tickets-1999778758098'), '1999778758098');
  assert.equal(eventIdFromUrl('https://www.eventbrite.ca/e/1985175362950/?aff=x'), '1985175362950');
  assert.equal(eventIdFromUrl('https://www.eventbrite.ca/o/atlas-elevated-labs-121133795271x'), '');
  assert.equal(safeHttpUrl('javascript:alert(1)'), '');
  assert.equal(safeHttpUrl('https://www.eventbrite.ca/e/x-1'), 'https://www.eventbrite.ca/e/x-1');
});

test('eventbrite: the wall-clock time wins over a utc value converted with stale rules', () => {
  // An Eventbrite still expecting the November fall-back would send 00:00Z for a 6 PM start.
  const raw = ebEvent({ id: 1999778758098, title: 'WPG AI Incubator  - Issue #13', start: '2026-11-25T18:00:00', end: '2026-11-25T21:00:00', startUtc: '2026-11-26T00:00:00Z', endUtc: '2026-11-26T03:00:00Z' });
  const issue = mapEvent(raw);
  assert.equal(issue.start.toISOString(), '2026-11-25T23:00:00.000Z');
  assert.equal(issue.end.toISOString(), '2026-11-26T02:00:00.000Z');
  assert.equal(issue.number, 13);
  assert.equal(issue.id, '1999778758098');
  assert.equal(issue.free, true);
  assert.deepEqual(issue.venue, { address: '158 Commerce Drive', city: 'Winnipeg' });
});

test('eventbrite: an event in another time zone, or without a local time, uses utc', () => {
  const other = mapEvent(ebEvent({ id: 5, title: 'WPG AI Incubator on tour', start: '2026-12-01T18:00:00', end: '2026-12-01T21:00:00', timezone: 'America/Toronto', startUtc: '2026-12-01T23:00:00Z', endUtc: '2026-12-02T02:00:00Z' }));
  assert.equal(other.start.toISOString(), '2026-12-01T23:00:00.000Z');
  const bare = mapEvent({ id: '6', name: { text: 'WPG AI Incubator - Issue #20' }, start: { utc: '2027-03-01T23:00:00Z' }, end: { utc: '2027-03-02T02:00:00Z' } });
  assert.equal(bare.start.toISOString(), '2027-03-01T23:00:00.000Z');
  assert.equal(bare.venue, null);
  assert.equal(bare.free, null);
  assert.equal(bare.url, '');
});

test('eventbrite: broken records are dropped', () => {
  for (const bad of [null, {}, 'x', { name: { text: 'No date' } }, { name: { text: '' }, start: { utc: '2026-11-25T23:00:00Z' } }, { name: { text: 'Bad date' }, start: { utc: 'soon' } }]) {
    assert.equal(mapEvent(bad), null);
  }
  const noEnd = mapEvent({ id: '1', name: { text: 'Issue #2' }, start: { utc: '2026-11-25T23:00:00Z' }, end: { utc: '2026-11-25T22:00:00Z' }, url: 'ftp://x' });
  assert.equal(noEnd.end, null, 'an end before the start is ignored');
  assert.equal(noEnd.url, '');
});

// ---------- content file and merging ----------

test('content: the bundled Issues load, newest first, with the verified facts', () => {
  const issues = contentIssues();
  assert.deepEqual(issues.map((i) => i.number), [13, 12, 11, 10, 9, 5, 4, 3, 2, 1]);
  const [thirteen] = issues;
  assert.equal(thirteen.start.toISOString(), '2026-11-25T23:00:00.000Z');
  assert.equal(thirteen.end.toISOString(), '2026-11-26T02:00:00.000Z');
  assert.equal(thirteen.url, 'https://www.eventbrite.ca/e/wpg-ai-incubator-issue-13-tickets-1999778758098');
  assert.equal(thirteen.id, '1999778758098');
  assert.equal(thirteen.spotlight, 'Tad Einstein');
  assert.equal(thirteen.schedule.length, 7);
  assert.equal(thirteen.dateOnly, false);
  assert.equal(issues[1].dateOnly, true);
  assert.equal(issues.find((i) => i.number === 11).subtitle, 'AI x IP');
});

test('content: bad entries are skipped rather than breaking the site', () => {
  assert.equal(normalizeContentIssue({ number: 3 }), null);
  assert.equal(normalizeContentIssue({ number: 3, date: 'someday' }), null);
  assert.equal(normalizeContentIssue(null), null);
  const odd = normalizeContentIssue({ number: -2, date: '2026-05-01', url: 'javascript:x', schedule: [{ time: '6pm', text: 'x' }, { time: '18:00' }, { time: '18:30', text: 'ok' }], hook: 'x'.repeat(500) });
  assert.equal(odd.number, null);
  assert.equal(odd.url, '');
  assert.deepEqual(odd.schedule, [{ time: '18:30', text: 'ok' }]);
  assert.equal(odd.hook.length, 90);
});

test('time: an Issue is "next" until it ends', () => {
  const issues = contentIssues();
  const during = splitByTime(issues, at('2026-11-25T20:59'));
  assert.equal(during.upcoming.number, 13);
  const after = splitByTime(issues, at('2026-11-25T21:00'));
  assert.equal(after.upcoming, null);
  assert.equal(after.past[0].number, 13);
  // a day-only entry counts as next until 11 PM that day
  const dayOnly = [normalizeContentIssue({ number: 14, date: '2026-12-09' })];
  assert.equal(splitByTime(dayOnly, at('2026-12-09T22:59')).upcoming.number, 14);
  assert.equal(splitByTime(dayOnly, at('2026-12-09T23:01')).upcoming, null);
  assert.equal(endOf({ start: at('2026-12-09T18:00'), end: null, dateOnly: false }).toISOString(), at('2026-12-09T21:00').toISOString());
});

test('time: with several future Issues the soonest is next and the rest are listed', () => {
  const list = [15, 14, 16, 17, 18].map((n, i) => normalizeContentIssue({ number: n, start: `2026-12-${String(9 + i * 2).padStart(2, '0')}T18:00`, end: `2026-12-${String(9 + i * 2).padStart(2, '0')}T21:00` }));
  const split = splitByTime(list, at('2026-12-01T09:00'));
  assert.equal(split.upcoming.number, 15);
  assert.deepEqual(split.later.map((i) => i.number), [14, 16, 17], 'at most three more');
});

test('merge: Eventbrite facts win, the content file keeps its words', () => {
  const live = [mapEvent(ebEvent({ id: 1999778758098, title: 'WPG AI Incubator  - Issue #13', start: '2026-11-26T18:30:00', end: '2026-11-26T21:30:00', url: 'https://www.eventbrite.ca/e/moved-1999778758098', address: '200 Main Street' }))];
  live[0].schedule = [{ time: '18:30', text: 'Doors' }, { time: '19:00', text: 'Talk' }, { time: '20:00', text: 'Rooms' }];
  live[0].spotlight = 'Someone New';
  const merged = mergeIssues(contentIssues(), live, at('2026-11-13T10:00'));
  const thirteen = merged.find((i) => i.number === 13);
  assert.equal(thirteen.start.toISOString(), at('2026-11-26T18:30').toISOString(), 'date and time from Eventbrite');
  assert.equal(thirteen.url, 'https://www.eventbrite.ca/e/moved-1999778758098');
  assert.equal(thirteen.venue.address, '200 Main Street');
  assert.equal(thirteen.spotlight, 'Someone New');
  assert.equal(thirteen.schedule[0].text, 'Doors', 'the live agenda replaces the saved one');
  assert.equal(thirteen.hook, 'The Slurpee Capital gets a brain freeze.', 'the cover line still comes from the content file');
  assert.equal(merged.filter((i) => i.number === 13).length, 1);
  assert.deepEqual(merged.map((i) => i.number), [13, 12, 11, 10, 9, 5, 4, 3, 2, 1]);
});

test('merge: without a live agenda the saved one is used; matching also works by event id', () => {
  const live = [
    mapEvent(ebEvent({ id: 1999778758098, title: 'WPG AI Incubator  - Issue #13', start: '2026-11-25T18:00:00', end: '2026-11-25T21:00:00' })),
    mapEvent(ebEvent({ id: 1991071054121, title: 'AI Incubator', start: '2026-06-24T18:00:00', end: '2026-06-24T21:00:00', url: 'https://www.eventbrite.ca/e/ai-incubator-tickets-1991071054121', status: 'completed' })),
  ];
  const merged = mergeIssues(contentIssues(), live, at('2026-11-13T10:00'));
  assert.equal(merged.find((i) => i.number === 13).schedule.length, 7);
  const five = merged.filter((i) => i.number === 5);
  assert.equal(five.length, 1, 'the unnumbered "AI Incubator" listing is recognised as Issue #5 by its id');
  assert.equal(five[0].subtitle, '30-Day AI Briefing + Builder Lab');
  assert.equal(five[0].dateOnly, false);
});

test('merge: a future Issue that is no longer on Eventbrite is not shown as coming up', () => {
  const live = [mapEvent(ebEvent({ id: 1999776946680, title: 'WPG AI Incubator  - Issue #12', start: '2026-11-10T18:00:00', end: '2026-11-10T21:00:00', status: 'completed' }))];
  const merged = mergeIssues(contentIssues(), live, at('2026-11-13T10:00'));
  assert.equal(merged.some((i) => i.number === 13), false, 'Issue #13 was cancelled on Eventbrite');
  assert.equal(splitByTime(merged, at('2026-11-13T10:00')).upcoming, null);
  assert.equal(merged.some((i) => i.number === 1), true, 'past Issues that were never on Eventbrite stay');
});

// ---------- what the page says ----------

function model(now, issues = contentIssues(), extraFlags = {}) {
  const t = at(now);
  return buildModel({ site, issues: splitByTime(issues, t), flags: { ...flags, ...extraFlags }, now: t, home: true });
}

test('page model: before Issue #13', () => {
  const m = model('2026-11-13T10:00');
  assert.equal(m.upcoming.name, 'Issue #13');
  assert.equal(m.upcoming.when, 'Wednesday, November 25, 6:00 to 9:00 PM');
  assert.equal(m.upcoming.place, '158 Commerce Drive, Winnipeg.');
  assert.equal(m.upcoming.coverDate, 'Nov 25, 2026');
  assert.equal(m.upcoming.hook, 'The Slurpee Capital gets a brain freeze.');
  assert.deepEqual(m.cta, { href: 'https://www.eventbrite.ca/e/wpg-ai-incubator-issue-13-tickets-1999778758098', label: 'Register for Issue #13', short: 'Register', named: true });
  assert.equal(m.what.title, 'Issue #13 run of show');
  assert.equal(m.what.lead, 'Issues run from 6:00 to 9:00 PM at 158 Commerce Drive. Here is what happens at Issue #13.');
  assert.deepEqual(m.what.rows.map((r) => r.mark), ['6:00', '6:30', '7:20', '7:25', '8:00', '8:05', '8:45']);
  assert.deepEqual(m.recent.map((r) => r.name), ['Issue #12', 'Issue #11: AI x IP', 'Issue #10', 'Issue #9']);
  assert.equal(m.recent[0].date, 'Tuesday, November 10, 2026');
  assert.equal(m.earlier.summary, 'Issues #1 to #5, April to June 2026');
  assert.deepEqual(m.earlier.items.map((i) => `${i.mark} ${i.title} ${i.date}`), [
    '#5 30-Day AI Briefing + Builder Lab June 24, 2026', '#4 Builder Lab session June 3, 2026', '#3 Guest founder session May 13, 2026', '#2 Prompt engineering deep-dive April 16, 2026', '#1 Launch night April 2, 2026',
  ]);
  assert.equal(m.year, 2026);
});

test('page model: the morning after Issue #13, with nothing announced yet', () => {
  const m = model('2026-11-26T08:00');
  assert.equal(m.upcoming, null);
  assert.deepEqual(m.cta, { href: '#newsletter', label: 'Get notified about the next Issue', short: 'Notify me', named: false });
  assert.equal(m.nextNumber, 14);
  assert.equal(m.what.title, 'A typical Issue');
  assert.equal(m.what.timed, false);
  assert.equal(m.recent[0].name, 'Issue #13');
  assert.equal(m.earlier.summary, 'Earlier Issues, April to September 2026', 'a gap in the numbers is not papered over');
});

test('page model: an Issue next January shows its year; unusual hours and venue are stated', () => {
  const list = [normalizeContentIssue({ number: 16, start: '2027-01-13T17:30', end: '2027-01-13T20:30', schedule: [{ time: '17:30', text: 'A' }, { time: '18:00', text: 'B' }, { time: '19:00', text: 'C' }] }), ...contentIssues()];
  list[0].venue = { address: '200 Main Street', city: 'Winnipeg' };
  const m = model('2026-12-20T10:00', list);
  assert.equal(m.upcoming.when, 'Wednesday, January 13, 2027, 5:30 to 8:30 PM');
  assert.equal(m.what.lead, 'Issue #16 runs from 5:30 to 8:30 PM at 200 Main Street. Here is what happens.');
  assert.equal(m.upcoming.hook, 'Find your next room.', 'no cover line written yet');
  assert.equal(m.year, 2026);
});

test('page model: an event without an Issue number still works', () => {
  const special = mapEvent(ebEvent({ id: 77, title: 'WPG AI Incubator Holiday Social', start: '2026-12-16T18:00:00', end: '2026-12-16T21:00:00' }));
  const m = model('2026-12-01T10:00', [special, ...contentIssues()]);
  assert.equal(m.upcoming.name, 'WPG AI Incubator Holiday Social');
  assert.equal(m.cta.label, 'Register for the next Issue');
  assert.equal(m.upcoming.number, null);
});

test('structured data: the facts search engines read', () => {
  const m = model('2026-11-13T10:00');
  const [org, event] = structuredData({ site, model: m, siteUrl: 'https://www.wpgincubator.ai', badge: null });
  assert.equal(org['@type'], 'Organization');
  assert.equal(org.logo, undefined);
  assert.equal(event['@type'], 'Event');
  assert.equal(event.name, 'WPG AI Incubator Issue #13');
  assert.equal(event.startDate, '2026-11-25T18:00:00-05:00');
  assert.equal(event.endDate, '2026-11-25T21:00:00-05:00');
  assert.equal(event.location.address.streetAddress, '158 Commerce Drive');
  assert.equal(event.isAccessibleForFree, true);
  assert.equal(event.offers.price, '0');
  assert.equal(structuredData({ site, model: model('2026-11-26T08:00'), siteUrl: 'https://www.wpgincubator.ai', badge: null }).length, 1, 'no Event block when nothing is scheduled');
});
