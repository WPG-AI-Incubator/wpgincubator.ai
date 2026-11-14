// Reads a run of show out of an Eventbrite description.
// Organizers write the agenda as plain lines that start with a time, e.g.
//   6:00 PM – Doors open, coffee and networking
//   6:30 Spotlight talk with Tad Einstein (about 45 min plus a short Q&A)
//   8:45 – 9:00 PM – Wrap
// Anything that does not look like that is ignored.

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', bull: '•',
};

export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 9 || code > 0x10ffff) return ' ';
      try {
        return String.fromCodePoint(code);
      } catch {
        return ' ';
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

// Eventbrite descriptions are HTML. Keep the line structure, drop the markup.
export function htmlToText(markup) {
  const text = String(markup ?? '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|ul|ol|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(text)
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const TIME = String.raw`(\d{1,2})[:.](\d{2})\s*(a\.?m\.?|p\.?m\.?)?`;
const LINE = new RegExp(
  String.raw`^\s*(?:[•·*\-–—]\s*)?${TIME}\s*(?:(?:[-–—]|to)\s*${TIME}\s*)?(?:[-–—:|]\s*)?(.*)$`,
  'i',
);
const LEADING_END = new RegExp(String.raw`^${TIME}\s*[-–—:|]\s*(.+)$`, 'i');

const pad = (n) => String(n).padStart(2, '0');

function meridiemOf(raw) {
  if (!raw) return '';
  return raw[0].toLowerCase() === 'a' ? 'am' : 'pm';
}

// A bare "6:30" means 18:30 at an evening event and 06:30 at a breakfast one.
function to24h(hourText, minuteText, meridiem, eventStartHour) {
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour > 23 || minute > 59) return null;
  let h = hour;
  if (meridiem === 'am') {
    if (hour > 12) return null;
    h = hour === 12 ? 0 : hour;
  } else if (meridiem === 'pm') {
    if (hour > 12) return null;
    h = hour === 12 ? 12 : hour + 12;
  } else if (hour < 12) {
    const earliest = Math.max(0, eventStartHour - 1);
    h = hour >= earliest ? hour : hour + 12;
  }
  return `${pad(h)}:${pad(minute)}`;
}

function tidy(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:|]+/, '')
    .replace(/[\s\-–—:|]+$/, '')
    .trim()
    .slice(0, 200);
}

const sentence = (text) => {
  const t = tidy(text);
  if (!t) return '';
  const capped = t[0].toUpperCase() + t.slice(1);
  return /[.!?…]$/.test(capped) ? capped : `${capped}.`;
};

// "Spotlight talk with X (about 45 min)" -> bold lead + plain detail.
function shape(text) {
  const t = tidy(text);
  const m = /^(.*?)\s*\(([^()]{2,})\)\s*\.?$/.exec(t);
  if (m && tidy(m[1])) return { strong: tidy(m[1]), text: sentence(m[2]) };
  return { text: t };
}

export function parseSchedule(text, { startHour = 18 } = {}) {
  const items = [];
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const m = LINE.exec(rawLine);
    if (!m) continue;
    let [, h1, m1, mer1, h2, m2, mer2, rest] = m;
    rest = rest ?? '';
    if (h2 === undefined) {
      // "8:45 9:00 PM – Wrap": an end time with no dash before it
      const lead = LEADING_END.exec(rest);
      if (lead) {
        [, h2, m2, mer2, rest] = lead;
      }
    }
    const endMeridiem = meridiemOf(mer2);
    const startMeridiem = meridiemOf(mer1);
    const end = h2 === undefined ? null : to24h(h2, m2, endMeridiem, startHour);
    let time = to24h(h1, m1, startMeridiem, startHour);
    if (time && end && !startMeridiem && endMeridiem && time > end) {
      // "11:30 – 1:00 PM" style: the start borrowed the wrong half of the day
      const flipped = to24h(h1, m1, endMeridiem === 'pm' ? 'am' : 'pm', startHour);
      if (flipped && flipped <= end) time = flipped;
    }
    const body = shape(rest);
    if (!time || (!body.text && !body.strong)) continue;
    const item = { time, ...body };
    if (end && end > time) item.end = end;
    items.push(item);
    if (items.length === 14) break;
  }
  return items.length >= 3 ? items : [];
}

// A period ends the name unless it belongs to a title or an initial ("Dr.", "J.").
function cutAtSentenceEnd(text) {
  const stop = /\.(?=\s|$)/g;
  let m;
  while ((m = stop.exec(text))) {
    const before = text.slice(0, m.index);
    if (/(?:^|[\s.])(?:Dr|Mr|Mrs|Ms|Prof|St|Jr|Sr|\p{Lu})$/u.test(before)) continue;
    return before;
  }
  return text;
}

function speakerIn(line) {
  const m = /spotlight(?:\s+talk)?\s*(?:with|by|from|:|[-–—])\s*(.+)$/i.exec(String(line ?? ''));
  if (!m) return '';
  const upToStop = m[1].split(/\s*[(,;:|]|\s+[-–—]\s+/)[0];
  const name = tidy(cutAtSentenceEnd(upToStop)).replace(/\.$/, '');
  return name.length >= 2 && name.length <= 60 && /\p{L}/u.test(name) ? name : '';
}

// "Spotlight talk with Tad Einstein" -> "Tad Einstein"
export function findSpotlight(schedule) {
  for (const item of schedule ?? []) {
    const name = speakerIn(item.strong) || speakerIn(item.text);
    if (name) return name;
  }
  return '';
}
