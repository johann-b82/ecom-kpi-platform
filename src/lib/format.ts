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

export function formatDelta(deltaPct: number | null): string | null {
  if (deltaPct === null) return null;
  return `${pf.format(Math.abs(deltaPct))} %`;
}
