// Turns Issues and settings into the exact words and links the pages show.
// Templates stay dumb: every decision about wording lives here.

import {
  clock12, isoDate, isoLocal, isoWithOffset, longDate, longDateYear, monthDayYear, monthName, shortDate, timeRange, yearOf,
} from './dates.js';
import { EXAMPLES, ROOMS } from './findroom.js';

export function issueName(issue) {
  return issue.number !== null ? `Issue #${issue.number}` : issue.title || 'WPG AI Incubator';
}

export function issueFullName(issue) {
  if (issue.number === null) return issueName(issue);
  return issue.subtitle ? `Issue #${issue.number}: ${issue.subtitle}` : `Issue #${issue.number}`;
}

function whenLine(issue, now) {
  const day = yearOf(issue.start) === yearOf(now) ? longDate(issue.start) : longDateYear(issue.start);
  return issue.dateOnly ? day : `${day}, ${timeRange(issue.start, issue.end)}`;
}

const GENERIC_ROWS = [
  { mark: '1', text: 'Doors open, coffee and networking' },
  { mark: '2', strong: 'Spotlight talk' },
  { mark: '3', strong: 'Breakout rooms: Dream, Build, Execute' },
  { mark: '4', strong: 'AI Show & Tell' },
  { mark: '5', text: 'Wrap-up' },
];

function earlierSummary(rest) {
  const numbers = rest.map((issue) => issue.number);
  const allNumbered = numbers.every((n) => n !== null);
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const contiguous = allNumbered && new Set(numbers).size === numbers.length && max - min + 1 === numbers.length;
  let label = 'Earlier Issues';
  if (contiguous) label = numbers.length === 1 ? `Issue #${min}` : `Issues #${min} to #${max}`;

  const oldest = rest[rest.length - 1].start;
  const newest = rest[0].start;
  let span;
  if (yearOf(oldest) !== yearOf(newest)) span = `${monthName(oldest)} ${yearOf(oldest)} to ${monthName(newest)} ${yearOf(newest)}`;
  else if (monthName(oldest) !== monthName(newest)) span = `${monthName(oldest)} to ${monthName(newest)} ${yearOf(newest)}`;
  else span = `${monthName(newest)} ${yearOf(newest)}`;
  return `${label}, ${span}`;
}

function noteFor(source, fellBack, aiEnabled) {
  if (source === 'example') {
    return aiEnabled
      ? 'Example answer. Type your own and AI writes one for you.'
      : 'Example answer. Type your own to get one matched to your words.';
  }
  if (source === 'ai') return 'Written by AI from what you typed. If it missed, go with the room that sounds right to you.';
  if (fellBack) return "AI didn't answer this time, so this one is matched by keyword.";
  return 'Matched by keyword from what you typed.';
}

export function shorten(text, max = 120) {
  const t = String(text ?? '');
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// What a reply card shows, whichever way the reply was produced.
export function replyView({ reply, said, aiEnabled }) {
  const room = ROOMS[reply.room];
  return {
    room: reply.room,
    word: room.word,
    line: room.line,
    why: reply.why,
    bring: reply.bring,
    said: shorten(said),
    source: reply.source,
    note: noteFor(reply.source, reply.fellBack, aiEnabled),
  };
}

export function exampleReplies(aiEnabled) {
  const out = {};
  for (const [key, ex] of Object.entries(EXAMPLES)) {
    out[key] = replyView({ reply: { ...ex, source: 'example', fellBack: false }, said: ex.label, aiEnabled });
  }
  return out;
}

export function buildModel({ site, issues, flags, now, home = true }) {
  const { upcoming: next, later, past } = issues;
  const anchor = (hash) => (home ? hash : `/${hash}`);
  const venueOf = (issue) => issue?.venue ?? site.venue;

  let upcoming = null;
  if (next) {
    const venue = venueOf(next);
    const range = next.dateOnly ? '' : timeRange(next.start, next.end);
    upcoming = {
      number: next.number,
      name: issueName(next),
      fullName: issueFullName(next),
      eventName: `${site.name} ${issueFullName(next)}`,
      url: next.url || site.eventbriteOrganizerUrl,
      when: whenLine(next, now),
      datetime: next.dateOnly ? isoDate(next.start) : isoLocal(next.start),
      place: `${venue.address}, ${venue.city}.`,
      address: venue.address,
      city: venue.city,
      free: next.free !== false,
      coverDate: shortDate(next.start),
      spotlight: next.spotlight || '',
      hook: next.hook || 'Find your next room.',
      schedule: next.schedule ?? [],
      range,
      start: next.start,
      end: next.end,
      dateOnly: next.dateOnly,
    };
  }

  const cta = upcoming
    ? {
        href: upcoming.url,
        label: `Register for ${upcoming.number !== null ? upcoming.name : 'the next Issue'}`,
        short: 'Register',
        named: true,
      }
    : { href: anchor('#newsletter'), label: 'Get notified about the next Issue', short: 'Notify me', named: false };

  const lastNumber = past.find((issue) => issue.number !== null)?.number ?? null;

  let what;
  if (upcoming?.schedule.length) {
    const usual = upcoming.range === site.usualHours && upcoming.address === site.venue.address;
    what = {
      lead: usual
        ? `Issues run from ${site.usualHours} at ${site.venue.address}. Here is what happens at ${upcoming.name}.`
        : `${upcoming.name} runs${upcoming.range ? ` from ${upcoming.range}` : ''} at ${upcoming.address}. Here is what happens.`,
      title: `${upcoming.name} run of show`,
      timed: true,
      rows: upcoming.schedule.map((row) => ({
        mark: clock12(row.time),
        datetime: row.time,
        strong: row.strong ?? '',
        text: row.text ?? '',
        until: row.end ? clock12(row.end) : '',
      })),
    };
  } else {
    what = {
      lead: `Issues run from ${site.usualHours} at ${site.venue.address}. Here is how an evening usually goes.`,
      title: 'A typical Issue',
      timed: false,
      rows: GENERIC_ROWS.map((row) => ({ strong: '', text: '', until: '', ...row })),
    };
  }

  const recent = past.slice(0, 4).map((issue, index) => ({
    tone: index % 2 === 0 ? 'orange' : 'ink',
    mark: issue.number !== null ? `#${issue.number}` : 'WPG',
    name: issueFullName(issue),
    date: longDateYear(issue.start),
    datetime: isoDate(issue.start),
    blurb: issue.blurb || '',
    url: issue.url || '',
    linkLabel: `Eventbrite page for ${issueName(issue)}`,
  }));

  const rest = past.slice(4);
  const earlier = rest.length
    ? {
        summary: earlierSummary(rest),
        items: rest.map((issue) => ({
          mark: issue.number !== null ? `#${issue.number}` : '',
          title: issue.number !== null ? issue.subtitle || issueName(issue) : issueName(issue),
          date: monthDayYear(issue.start),
          datetime: isoDate(issue.start),
          url: issue.url || '',
        })),
      }
    : null;

  const examples = exampleReplies(flags.aiEnabled);

  return {
    site,
    flags,
    home,
    anchor,
    year: yearOf(now),
    upcoming,
    cta,
    nextNumber: lastNumber === null ? null : lastNumber + 1,
    later: (later ?? []).map((issue) => ({
      name: issueFullName(issue),
      when: whenLine(issue, now),
      datetime: issue.dateOnly ? isoDate(issue.start) : isoLocal(issue.start),
      url: issue.url || '',
    })),
    what,
    recent,
    earlier,
    finder: {
      mode: flags.aiEnabled ? 'Answer written by AI' : 'Answer matched by keyword',
      examples,
      defaultKey: 'curious',
    },
  };
}

// schema.org data so search engines and AI assistants can read the facts without guessing.
export function structuredData({ site, model, siteUrl, badge }) {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${siteUrl}/#org`,
    name: site.name,
    url: `${siteUrl}/`,
    description: site.intro,
    email: site.contactEmail,
    slogan: site.tagline,
    areaServed: { '@type': 'City', name: 'Winnipeg' },
  };
  if (badge) org.logo = `${siteUrl}${badge}`;
  const sameAs = [site.eventbriteOrganizerUrl, ...site.social.map((s) => s.url)].filter(Boolean);
  if (sameAs.length) org.sameAs = sameAs;

  const blocks = [org];
  const next = model.upcoming;
  if (next) {
    const event = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: next.eventName,
      description: site.intro,
      startDate: next.dateOnly ? isoDate(next.start) : isoWithOffset(next.start),
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: {
        '@type': 'Place',
        name: next.address,
        address: {
          '@type': 'PostalAddress',
          streetAddress: next.address,
          addressLocality: next.city,
          addressRegion: site.venue.region,
          addressCountry: site.venue.country,
        },
      },
      organizer: { '@id': `${siteUrl}/#org` },
      image: [`${siteUrl}/img/og.png`],
      url: next.url,
    };
    if (next.end && !next.dateOnly) event.endDate = isoWithOffset(next.end);
    if (next.free) {
      event.isAccessibleForFree = true;
      event.offers = { '@type': 'Offer', price: '0', priceCurrency: 'CAD', url: next.url };
    }
    blocks.push(event);
  }
  return blocks;
}
