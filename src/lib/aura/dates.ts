/** Calendar date YYYY-MM-DD in a given IANA time zone (for dailies / streaks). */
export function calendarDateInTimeZone(timeZone: string, instant: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** JavaScript convention: 0=Sunday .. 6=Saturday, in the user's zone for `instant`. */
export function jsDayOfWeekInTimeZone(timeZone: string, instant: Date = new Date()): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  })
    .formatToParts(instant)
    .find((p) => p.type === "weekday")?.value;
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday ?? "Sun"] ?? 0;
}

export function addCalendarDays(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d) + deltaDays * 86400000;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(utc));
}

export function isSacredToday(
  sacredDaysMask: number,
  timeZone: string,
  instant: Date = new Date(),
): boolean {
  const dow = jsDayOfWeekInTimeZone(timeZone, instant);
  return ((sacredDaysMask >> dow) & 1) === 1;
}
