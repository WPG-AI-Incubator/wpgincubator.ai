// Date helpers. Everything a visitor reads is Winnipeg wall-clock time.
//
// Manitoba stopped changing its clocks in 2026: since November 1, 2026 the
// province is on Manitoba Standard Time, UTC-5, all year
// (https://www.gov.mb.ca/timechange/). Every Issue since the first one in
// April 2026 falls in a UTC-5 period, so this site uses one fixed offset and
// does not depend on the time zone data that ships with the server, which on
// an older Node would still expect a fall-back and show times an hour off.
// If the law changes again, set "utcOffset" in content/site.json.

export const TZ = 'America/Winnipeg';

let offsetMinutes = -300;

// "-05:00" -> -300. Called once at start-up with the value from content/site.json.
export function setUtcOffset(text) {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(String(text ?? '').trim());
  if (!m) return false;
  offsetMinutes = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  return true;
}

export function utcOffsetText() {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n) {
  return String(n).padStart(2, '0');
}

// The wall-clock fields of an instant, as seen in Winnipeg.
export function partsIn(date) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay(),
  };
}

// "2026-11-25T18:00" or "2026-11-25" (Winnipeg wall-clock) -> Date.
// A bare date is placed at noon so it can never slip to the neighbouring day.
export function parseLocal(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = m[4] === undefined ? 12 : Number(m[4]);
  const minute = m[5] === undefined ? 0 : Number(m[5]);
  const second = Number(m[6] ?? 0);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wall);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null; // e.g. February 30
  return new Date(wall - offsetMinutes * 60 * 1000);
}

// "2026-11-25"
export function isoDate(date) {
  const p = partsIn(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

// "2026-11-25T18:00", for <time datetime>
export function isoLocal(date) {
  const p = partsIn(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

// "2026-11-25T18:00:00-05:00", for structured data
export function isoWithOffset(date) {
  return `${isoLocal(date)}:${pad(partsIn(date).second)}${utcOffsetText()}`;
}

// "Wednesday, November 25"
export function longDate(date) {
  const p = partsIn(date);
  return `${WEEKDAYS[p.weekday]}, ${MONTHS[p.month - 1]} ${p.day}`;
}

// "Wednesday, November 25, 2026"
export function longDateYear(date) {
  return `${longDate(date)}, ${partsIn(date).year}`;
}

// "November 25, 2026"
export function monthDayYear(date) {
  const p = partsIn(date);
  return `${MONTHS[p.month - 1]} ${p.day}, ${p.year}`;
}

// "Nov 25, 2026"
export function shortDate(date) {
  const p = partsIn(date);
  return `${MONTHS[p.month - 1].slice(0, 3)} ${p.day}, ${p.year}`;
}

export function monthName(date) {
  return MONTHS[partsIn(date).month - 1];
}

export function yearOf(date) {
  return partsIn(date).year;
}

function clockParts(date) {
  const p = partsIn(date);
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return { text: `${hour12}:${pad(p.minute)}`, meridiem: p.hour < 12 ? 'AM' : 'PM' };
}

// "6:00 PM"
export function clock(date) {
  const c = clockParts(date);
  return `${c.text} ${c.meridiem}`;
}

// "6:00 to 9:00 PM", or "11:00 AM to 1:00 PM" when the halves of the day differ
export function timeRange(start, end) {
  if (!end) return clock(start);
  const a = clockParts(start);
  const b = clockParts(end);
  if (a.meridiem === b.meridiem) return `${a.text} to ${b.text} ${b.meridiem}`;
  return `${a.text} ${a.meridiem} to ${b.text} ${b.meridiem}`;
}

// "18:30" -> "6:30" (the run of show drops AM/PM; the page states the evening hours once)
export function clock12(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? ''));
  if (!m) return String(hhmm ?? '');
  const hour = Number(m[1]);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${m[2]}`;
}

// 20261125T230000Z, for calendar files
export function icsUtc(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
