import { diffDays, type ISODate } from "@/lib/domain/dates";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function shortDate(iso: ISODate, withYear = false): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ""}`;
}

export function longDate(iso: ISODate): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd]}, ${MONTHS[m - 1]} ${d}`;
}

/** "Today", "Tomorrow", "Yesterday", "in 5 days", "3 days ago", or a date. */
export function relativeDay(iso: ISODate, today: ISODate): string {
  const d = diffDays(today, iso);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  if (d > 1 && d < 7) return longDate(iso).split(",")[0];
  return shortDate(iso, iso.slice(0, 4) !== today.slice(0, 4));
}

export function timeOfDay(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

export function greeting(minutes: number): string {
  if (minutes < 5 * 60) return "Good night";
  if (minutes < 12 * 60) return "Good morning";
  if (minutes < 17 * 60) return "Good afternoon";
  return "Good evening";
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function pct(n: number | null): string {
  return n === null ? "—" : `${Math.round(n)}%`;
}
