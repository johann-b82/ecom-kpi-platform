import type { DateRange } from './types';

// null ⇒ unbestimmt (Vorperiode 0). Sonst Prozent-Delta (current vs. previous).
export function revenueGrowth(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// Anzeige-Format der Wachstumskachel: Vorzeichen + eine Nachkommastelle + „ %".
// Echtes Minus (−, U+2212) statt Bindestrich; „–" bei unbestimmtem Wachstum.
export function formatGrowth(value: number | null): string {
  if (value === null) return '–';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const body = Math.abs(value).toLocaleString('de-DE', {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  });
  return `${sign}${body} %`;
}

// Periodengleiches MoM: laufender Monat 1.–heute vs. Vormonat 1.–gleicher Tag,
// wobei der Tag auf das Vormonatsende geklemmt wird (31. März ⇒ 28./29. Feb).
export function monthToDateRanges(today: string): { current: DateRange; previous: DateRange } {
  const [y, m, d] = today.split('-').map(Number);
  const iso = (yy: number, mm: number, dd: number) =>
    `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const daysInPrev = new Date(py, pm, 0).getDate(); // Tag 0 des Folgemonats = letzter Tag von pm
  const prevDay = Math.min(d, daysInPrev);
  return {
    current: { start: iso(y, m, 1), end: today },
    previous: { start: iso(py, pm, 1), end: iso(py, pm, prevDay) },
  };
}
