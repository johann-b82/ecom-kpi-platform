export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ISO date or timestamp (e.g. "2026-06-19" or "2026-06-19 13:27:00+00")
// → German format DD.MM.YYYY. Empty input stays empty.
export const formatDeDate = (value: string): string => value.slice(0, 10).split('-').reverse().join('.');

export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000,
  );
}
