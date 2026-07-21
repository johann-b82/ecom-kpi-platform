import type { Kpi } from '@/kpi/types';

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const cf = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const pf = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatValue(kpi: Kpi): string {
  if (!kpi.available || kpi.value === null) return 'N/A';
  switch (kpi.unit) {
    case 'currency': return cf.format(kpi.value);
    case 'percent': return `${pf.format(kpi.value * 100)} %`;
    case 'ratio': return `${pf.format(kpi.value)}×`;
    default: return nf.format(kpi.value);
  }
}

// Gleiche Formatierung wie die KPI-Karten, für Werte die nicht als Kpi vorliegen
// (z. B. die Kopfzeile der Kampagnen-Detailsicht).
export const formatNumber = (value: number): string => nf.format(value);
export const formatCurrency = (value: number): string => cf.format(value);
export const formatPercent = (ratio: number): string => `${pf.format(ratio * 100)} %`;

export function formatDelta(deltaPct: number | null): string | null {
  if (deltaPct === null) return null;
  return `${pf.format(Math.abs(deltaPct))} %`;
}
