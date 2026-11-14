// What the site knows about Issues, and where it learned it.
//
//   content/issues.json   always loaded. A full fallback, plus the words
//                         Eventbrite cannot supply (cover hook, archive blurb).
//   Eventbrite            when a token and organization id are set. Facts from
//                         Eventbrite (date, time, link, agenda) win.
//
// If Eventbrite is down the last good answer is served for up to a day, then
// the site falls back to the content file. The page never waits long for it.

import fs from 'node:fs';
import { parseLocal, partsIn } from './dates.js';
import { eventIdFromUrl, getListingText, listOrgEvents, mapEvent, safeHttpUrl } from './eventbrite.js';
import { findSpotlight, parseSchedule } from './schedule.js';

const HOUR = 60 * 60 * 1000;
const MAX_STALE_MS = 24 * HOUR;
const RETRY_AFTER_FAILURE_MS = 60 * 1000;
const FIRST_LOAD_WAIT_MS = 4000;

const short = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function cleanSchedule(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && /^\d{2}:\d{2}$/.test(item.time ?? '') && (item.text || item.strong))
    .slice(0, 14)
    .map((item) => {
      const out = { time: item.time };
      if (item.strong) out.strong = short(item.strong, 200);
      if (item.text) out.text = short(item.text, 200);
      if (/^\d{2}:\d{2}$/.test(item.end ?? '')) out.end = item.end;
      return out;
    });
}

// One entry of content/issues.json -> the shape the pages use.
export function normalizeContentIssue(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const start = parseLocal(entry.start ?? entry.date);
  if (!start) return null;
  const end = entry.start && entry.end ? parseLocal(entry.end) : null;
  const number = Number.isInteger(entry.number) && entry.number > 0 ? entry.number : null;
  const url = safeHttpUrl(entry.url);
  return {
    id: eventIdFromUrl(url),
    number,
    subtitle: short(entry.subtitle, 120),
    title: '',
    start,
    end: end && end > start ? end : null,
    dateOnly: !entry.start,
    url,
    free: typeof entry.free === 'boolean' ? entry.free : null,
    venue: null,
    spotlight: short(entry.spotlight, 60),
    hook: short(entry.hook, 90),
    blurb: short(entry.blurb, 200),
    schedule: cleanSchedule(entry.schedule),
    status: '',
    source: 'content',
  };
}

export function loadContentIssues(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = Array.isArray(data?.issues) ? data.issues : [];
  return list.map(normalizeContentIssue).filter(Boolean);
}

const byNewest = (a, b) => b.start - a.start;

// Eventbrite facts win; the content file keeps its words and fills the gaps.
// Eventbrite is also the only authority on what is still to come: a future
// Issue that is in the content file but no longer on Eventbrite (cancelled,
// renumbered) is left out. Pass `now` to apply that rule.
export function mergeIssues(contentIssues, liveIssues, now = null) {
  const used = new Set();
  const merged = liveIssues.map((live) => {
    const match = contentIssues.find(
      (c) => !used.has(c) && ((live.id && c.id === live.id) || (live.number !== null && c.number === live.number)),
    );
    if (match) used.add(match);
    const base = match ?? {};
    return {
      ...live,
      number: live.number ?? base.number ?? null,
      subtitle: live.subtitle || base.subtitle || '',
      spotlight: live.spotlight || base.spotlight || '',
      hook: base.hook || '',
      blurb: base.blurb || '',
      schedule: live.schedule?.length ? live.schedule : base.schedule ?? [],
    };
  });
  for (const entry of contentIssues) {
    if (used.has(entry)) continue;
    if (now && endOf(entry) > now) continue;
    merged.push(entry);
  }
  return merged.sort(byNewest);
}

// When an Issue stops being "next". A day-only entry lasts until that evening.
export function endOf(issue) {
  if (issue.end) return issue.end;
  return new Date(issue.start.getTime() + (issue.dateOnly ? 11 : 3) * HOUR);
}

export function splitByTime(issues, now) {
  const future = issues.filter((issue) => endOf(issue) > now).sort((a, b) => a.start - b.start);
  const past = issues.filter((issue) => endOf(issue) <= now).sort(byNewest);
  return { upcoming: future[0] ?? null, later: future.slice(1, 4), past };
}

export function createIssueStore({ config, contentIssues, fetchImpl = fetch, now = () => new Date(), log = console }) {
  const eb = config.eventbrite;
  const enabled = Boolean(eb.token && eb.orgId);
  let cache = null; // { issues, at }
  let inFlight = null;
  let lastFailureAt = 0;

  async function load() {
    const rawEvents = await listOrgEvents({ base: eb.base, token: eb.token, orgId: eb.orgId, fetchImpl });
    const live = rawEvents
      .map(mapEvent)
      .filter((event) => event && (!eb.titleFilter || event.title.toLowerCase().includes(eb.titleFilter)));
    if (!live.length) {
      // Far more likely a wrong organization id or title filter than an empty calendar.
      const error = new Error('Eventbrite returned no matching events');
      error.status = 'no matching events';
      throw error;
    }

    // Read the agenda of the next Issue only: one extra request per refresh.
    const { upcoming } = splitByTime(live, now());
    if (upcoming?.id) {
      try {
        const text = await getListingText({ base: eb.base, token: eb.token, eventId: upcoming.id, fetchImpl });
        const schedule = parseSchedule(text, { startHour: partsIn(upcoming.start).hour });
        if (schedule.length) {
          upcoming.schedule = schedule;
          upcoming.spotlight = findSpotlight(schedule);
        }
      } catch (error) {
        log.warn(`[issues] agenda not read from Eventbrite (${error.status ?? error.name})`);
      }
    }
    return mergeIssues(contentIssues, live, now());
  }

  function refresh() {
    if (inFlight) return inFlight;
    inFlight = load()
      .then((issues) => {
        cache = { issues, at: now().getTime() };
        lastFailureAt = 0;
      })
      .catch((error) => {
        lastFailureAt = now().getTime();
        log.warn(`[issues] Eventbrite refresh failed (${error.status ?? error.name}); serving saved data`);
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  function view(issues, source, at) {
    return { ...splitByTime(issues, now()), source, fetchedAt: at ? new Date(at) : null };
  }

  const snapshot = () => view([...contentIssues].sort(byNewest), 'content', null);

  // Only the very first visitors after a start may wait for Eventbrite, and
  // only until this real-time deadline. After it, nobody waits: the saved copy
  // is served and the refresh carries on in the background.
  let firstWaitUntil = 0;

  async function get() {
    if (!enabled) return snapshot();
    const t = now().getTime();
    const age = cache ? t - cache.at : Infinity;
    if (age < eb.refreshMs) return view(cache.issues, 'eventbrite', cache.at);

    const mayRetry = t - lastFailureAt >= RETRY_AFTER_FAILURE_MS;
    const pending = mayRetry ? refresh() : inFlight;
    if (cache && age < MAX_STALE_MS) return view(cache.issues, 'eventbrite', cache.at);

    if (pending) {
      firstWaitUntil ||= Date.now() + FIRST_LOAD_WAIT_MS;
      const left = firstWaitUntil - Date.now();
      if (left > 0) {
        let timer;
        await Promise.race([pending, new Promise((resolve) => { timer = setTimeout(resolve, left); })]);
        clearTimeout(timer);
      }
    }
    if (cache && now().getTime() - cache.at < MAX_STALE_MS) return view(cache.issues, 'eventbrite', cache.at);
    return snapshot();
  }

  return { enabled, get, refresh };
}
