/** Minimal date-math helpers over plain ISO ("YYYY-MM-DD") strings.
 *
 * The scheduler works entirely in whole days, so everything here treats
 * dates as UTC-midnight to avoid DST/timezone drift when doing day-count
 * arithmetic.
 */

export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, days: number): string {
  const d = parseISO(s);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

export function isWeekend(s: string): boolean {
  const day = parseISO(s).getUTCDay();
  return day === 0 || day === 6;
}

export function today(): string {
  return toISO(new Date());
}

export function startOfWeek(s: string): string {
  const day = parseISO(s).getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  return addDays(s, diff);
}

export function formatDayLabel(s: string): string {
  return parseISO(s).getUTCDate().toString();
}

export function formatMonthLabel(s: string): string {
  return parseISO(s).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export function rangeOverlaps(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom <= bTo && aTo >= bFrom;
}

export function clampRange(from: string, to: string, min: string, max: string): [string, string] {
  return [from < min ? min : from, to > max ? max : to];
}
