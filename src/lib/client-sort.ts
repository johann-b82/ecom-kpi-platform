// Vergleich für client-seitige Tabellensortierung. Zahlen numerisch, Strings über
// localeCompare (de), null/undefined stets ans Ende (unabhängig von der Richtung).
export function compareValues(a: string | number | null | undefined, b: string | number | null | undefined): number {
  const aEmpty = a === null || a === undefined;
  const bEmpty = b === null || b === undefined;
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'de');
}
