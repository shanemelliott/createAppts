// Calendar math in a fixed IANA timezone so a UTC host yields the same site-local dates as a VA workstation.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const formatterCache = new Map();

function formatter(tz) {
  if (!formatterCache.has(tz)) {
    formatterCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }));
  }
  return formatterCache.get(tz);
}

export function assertTimeZone(tz) {
  try {
    formatter(tz);
  } catch {
    throw new Error(`Invalid timezone "${tz}" (expected an IANA name such as America/New_York)`);
  }
}

export function zonedParts(instant, tz) {
  const parts = Object.fromEntries(formatter(tz).formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}

export function todayIn(tz, now = new Date()) {
  const { year, month, day } = zonedParts(now, tz);
  return { year, month, day };
}

export function nowHhmm(tz, now = new Date()) {
  const { hour, minute } = zonedParts(now, tz);
  return pad(hour) + pad(minute);
}

export function addDays(day, n) {
  const d = new Date(Date.UTC(day.year, day.month - 1, day.day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function daysBetween(from, to) {
  return Math.round((Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / 86400000);
}

// Calendar months; the day is clamped to the end of a shorter month (Jan 31 + 1 month = Feb 28).
export function addMonths(day, n) {
  const total = day.year * 12 + (day.month - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day: Math.min(day.day, lastDay) };
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function weekdayCode(day) {
  return WEEKDAYS[new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay()];
}

export function monthHeading(day) {
  return `${MONTHS[day.month - 1]} ${day.year}`;
}

// YYYY-MM-DD HH:MM wall time of an instant in the given zone.
export function formatZoned(instant, tz) {
  const p = zonedParts(instant, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

export function compareDays(a, b) {
  return daysBetween(b, a);
}

export function toIso(day) {
  return `${day.year}-${pad(day.month)}-${pad(day.day)}`;
}

export function fromIso(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
  if (!m) throw new Error(`Invalid date "${text}" (expected YYYY-MM-DD)`);
  const day = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  if (toIso(addDays(day, 0)) !== text) throw new Error(`Invalid date "${text}"`);
  return day;
}

export function fromFileman(fm) {
  const m = /^(\d{3})(\d{2})(\d{2})/.exec(String(fm || ''));
  if (!m) return null;
  return { year: 1700 + Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

// ARSET desired date: M/D/YYYY
export function toMdy(day) {
  return `${day.month}/${day.day}/${day.year}`;
}

// ARSET originating date/time: M/D/YYYY@HH:MM
export function requestDateTime(tz, now = new Date()) {
  const p = zonedParts(now, tz);
  return `${p.month}/${p.day}/${p.year}@${pad(p.hour)}:${pad(p.minute)}`;
}

// APPADD start/end: MON DD, YYYY@HH:MM
export function vistaDateTime(day, hhmm) {
  return `${MONTHS[day.month - 1]} ${pad(day.day)}, ${day.year}@${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;
}

export function hhmmToMinutes(hhmm) {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2, 4));
}

export function minutesToHhmm(minutes) {
  return pad(Math.floor(minutes / 60)) + pad(minutes % 60);
}

// UTC offset (e.g. -05:00 or -04:00) in effect at the given local wall-clock time.
export function utcOffset(day, hhmm, tz) {
  const wall = Date.UTC(day.year, day.month - 1, day.day, Number(hhmm.slice(0, 2)), Number(hhmm.slice(2, 4)));
  let instant = wall;
  let offsetMinutes = 0;
  for (let i = 0; i < 2; i += 1) {
    const p = zonedParts(new Date(instant), tz);
    offsetMinutes = (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - instant) / 60000;
    instant = wall - offsetMinutes * 60000;
  }
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}
