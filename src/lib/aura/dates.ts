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

export function isDailyDueByRepeat(
  todayLocalDate: string,
  repeatEvery: number,
  repeatUnit: "day" | "week" | "month" | "year",
  anchorDate: string | null | undefined,
): boolean {
  const every = Math.max(1, Number.isFinite(repeatEvery) ? Math.floor(repeatEvery) : 1);
  const anchor = anchorDate && /^\d{4}-\d{2}-\d{2}$/.test(anchorDate) ? anchorDate : todayLocalDate;
  const [ay, am, ad] = anchor.split("-").map(Number);
  const [ty, tm, td] = todayLocalDate.split("-").map(Number);
  const aUtc = Date.UTC(ay, am - 1, ad);
  const tUtc = Date.UTC(ty, tm - 1, td);
  if (tUtc < aUtc) return false;

  if (repeatUnit === "day") {
    const days = Math.floor((tUtc - aUtc) / 86400000);
    return days % every === 0;
  }
  if (repeatUnit === "week") {
    const days = Math.floor((tUtc - aUtc) / 86400000);
    return days % (every * 7) === 0;
  }
  if (repeatUnit === "month") {
    const months = (ty - ay) * 12 + (tm - am);
    return months >= 0 && months % every === 0 && td === ad;
  }
  const years = ty - ay;
  return years >= 0 && years % every === 0 && tm === am && td === ad;
}
