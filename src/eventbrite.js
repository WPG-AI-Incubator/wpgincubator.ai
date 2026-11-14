// Eventbrite API client. Read-only: lists the organization's events and reads
// one event's public description.
//
// Endpoints used (Eventbrite API v3):
//   GET /organizations/{organization_id}/events/     list events, newest first
//   GET /events/{event_id}/structured_content/       the listing description
// Auth: "Authorization: Bearer <private token>".

import { TZ, parseLocal } from './dates.js';
import { htmlToText } from './schedule.js';

export function safeHttpUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

// "https://www.eventbrite.ca/e/wpg-ai-incubator-issue-13-tickets-1999778758098" -> "1999778758098"
export function eventIdFromUrl(value) {
  const m = /(\d{9,})\/?(?:[?#].*)?$/.exec(String(value ?? ''));
  return m ? m[1] : '';
}

// "WPG AI Incubator - Issue #11: AI x IP" -> { number: 11, subtitle: "AI x IP" }
export function parseTitle(title) {
  const clean = String(title ?? '').replace(/\s+/g, ' ').trim();
  const m = /issue\s*#?\s*(\d{1,3})\b(?:\s*[:\-–—]\s*(.+))?/i.exec(clean);
  if (!m) return { number: null, subtitle: '' };
  return { number: Number(m[1]), subtitle: (m[2] ?? '').trim().slice(0, 120) };
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Eventbrite sends each time twice: "local", the wall-clock time the organizer
// typed, and "utc", converted with Eventbrite's own time zone rules. For a
// Winnipeg event the wall-clock time is the truth, so it is used whenever it is
// there. (Manitoba changed its clock rules in 2026; a stale conversion on either
// side must not move a 6:00 PM start to 5:00 or 7:00.)
function instant(when) {
  const zone = String(when?.timezone ?? '');
  if (!zone || zone === TZ) {
    const local = parseLocal(String(when?.local ?? '').slice(0, 19));
    if (local) return local;
  }
  return validDate(when?.utc);
}

export function mapEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.name?.text ?? '').replace(/\s+/g, ' ').trim();
  const start = instant(raw.start);
  if (!title || !start) return null;
  const end = instant(raw.end);
  const { number, subtitle } = parseTitle(title);
  const address = raw.venue?.address ?? {};
  const street = String(address.address_1 ?? '').trim();
  const city = String(address.city ?? '').trim();
  return {
    id: String(raw.id ?? '') || eventIdFromUrl(raw.url),
    number,
    subtitle,
    title,
    start,
    end: end && end > start ? end : null,
    dateOnly: false,
    url: safeHttpUrl(raw.url),
    free: typeof raw.is_free === 'boolean' ? raw.is_free : null,
    venue: street ? { address: street.slice(0, 120), city: city.slice(0, 80) } : null,
    status: String(raw.status ?? ''),
    source: 'eventbrite',
  };
}

async function getJson(url, { token, fetchImpl, timeoutMs }) {
  const res = await fetchImpl(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const error = new Error(`Eventbrite answered ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function listOrgEvents({ base, token, orgId, fetchImpl = fetch, timeoutMs = 6000, maxPages = 5 }) {
  const events = [];
  let continuation = '';
  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({
      status: 'live,started,ended,completed',
      order_by: 'start_desc',
      expand: 'venue',
      page_size: '50',
    });
    if (continuation) params.set('continuation', continuation);
    const url = `${base}/organizations/${encodeURIComponent(orgId)}/events/?${params}`;
    const data = await getJson(url, { token, fetchImpl, timeoutMs });
    if (Array.isArray(data?.events)) events.push(...data.events);
    const next = data?.pagination;
    if (!next?.has_more_items || !next.continuation) break;
    continuation = String(next.continuation);
  }
  return events;
}

export async function getListingText({ base, token, eventId, fetchImpl = fetch, timeoutMs = 6000 }) {
  const url = `${base}/events/${encodeURIComponent(eventId)}/structured_content/?purpose=listing`;
  const data = await getJson(url, { token, fetchImpl, timeoutMs });
  const modules = Array.isArray(data?.modules) ? data.modules : [];
  return modules
    .filter((mod) => mod?.type === 'text' && typeof mod?.data?.body?.text === 'string')
    .map((mod) => htmlToText(mod.data.body.text))
    .join('\n');
}
