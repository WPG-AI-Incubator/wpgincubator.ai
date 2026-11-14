// A one-event calendar file (RFC 5545) for the next Issue.

import { icsUtc } from './dates.js';

function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Lines are limited to 75 octets; longer ones continue on a line that starts with a space.
function fold(line) {
  const out = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const bytes = Buffer.byteLength(ch);
    if (size + bytes > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += bytes;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function buildIcs({ issue, name, location, siteUrl, stamp }) {
  const host = new URL(siteUrl).hostname.replace(/^www\./, '');
  const uid = `issue-${issue.number ?? issue.id ?? icsUtc(issue.start)}@${host}`;
  const details = [issue.free === false ? '' : 'Free to attend.', issue.url ? `Register: ${issue.url}` : '', `More: ${siteUrl}/`]
    .filter(Boolean)
    .join('\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WPG AI Incubator//wpgincubator.ai//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsUtc(stamp)}`,
    `DTSTART:${icsUtc(issue.start)}`,
    `DTEND:${icsUtc(issue.end ?? new Date(issue.start.getTime() + 3 * 60 * 60 * 1000))}`,
    `SUMMARY:${escapeText(name)}`,
    `LOCATION:${escapeText(location)}`,
    `DESCRIPTION:${escapeText(details)}`,
    `URL:${issue.url || `${siteUrl}/`}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
