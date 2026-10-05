// Calendar-date helpers operating on ISO "YYYY-MM-DD" strings.
// Day-bucketed facts are stored as local dates in the user's timezone, so all
// date maths here is timezone-free (UTC arithmetic on calendar dates).

export type ISODate = string;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string): boolean {
  if (!ISO_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUTC(iso: ISODate): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

/** Calendar date of `now` in the given IANA timezone. */
export function localDateInTz(timezone: string, now: Date = new Date()): ISODate {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    return parts; // en-CA formats as YYYY-MM-DD
  } catch {
    return fromUTC(now);
  }
}

/** Minutes since midnight of `now` in the given timezone. */
export function localMinutesInTz(timezone: string, now: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return h * 60 + m;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

/** Adds months, clamping the day to the target month's length (Jan 31 + 1 → Feb 28/29). */
export function addMonths(iso: ISODate, months: number): ISODate {
  const d = toUTC(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const dim = daysInMonth(d.getUTCFullYear(), d.getUTCMonth());
  d.setUTCDate(Math.min(day, dim));
  return fromUTC(d);
}

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** Whole days from a to b (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(iso: ISODate): number {
  return toUTC(iso).getUTCDay();
}

export function startOfWeek(iso: ISODate, weekStartsOn: number): ISODate {
  const wd = weekday(iso);
  const delta = (wd - weekStartsOn + 7) % 7;
  return addDays(iso, -delta);
}

export function startOfMonth(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: ISODate): ISODate {
  const d = toUTC(iso);
  return fromUTC(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function startOfQuarter(iso: ISODate): ISODate {
  const d = toUTC(iso);
  const q = Math.floor(d.getUTCMonth() / 3) * 3;
  return fromUTC(new Date(Date.UTC(d.getUTCFullYear(), q, 1)));
}

export function endOfQuarter(iso: ISODate): ISODate {
  const d = toUTC(iso);
  const q = Math.floor(d.getUTCMonth() / 3) * 3;
  return fromUTC(new Date(Date.UTC(d.getUTCFullYear(), q + 3, 0)));
}

export function startOfYear(iso: ISODate): ISODate {
  return `${iso.slice(0, 4)}-01-01`;
}

export function endOfYear(iso: ISODate): ISODate {
  return `${iso.slice(0, 4)}-12-31`;
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxISO(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

export function minISO(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

/** "HH:MM" or "HH:MM:SS" → minutes since midnight */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(total: number): string {
  const t = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 95 → "1h 35m", 45 → "45m", 120 → "2h" */
export function formatMinutes(total: number): string {
  const mins = Math.round(total);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Offset (ms) of `timezone` from UTC at instant `at`. */
function tzOffsetMs(timezone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUTC - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant at which the wall-clock `date time` occurs in `timezone`. */
export function zonedTimeToUtc(date: ISODate, time: string, timezone: string): Date {
  const [h, m] = time.split(":").map(Number);
  const [y, mo, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h || 0, m || 0, 0);
  try {
    let offset = tzOffsetMs(timezone, new Date(guess));
    let result = guess - offset;
    const offset2 = tzOffsetMs(timezone, new Date(result));
    if (offset2 !== offset) {
      offset = offset2;
      result = guess - offset;
    }
    return new Date(result);
  } catch {
    return new Date(guess);
  }
}
