import { Card } from '@tremor/react';
import type { Kpi } from '@/kpi/types';
import { formatValue, formatDelta } from '@/lib/format';
import { NaBadge } from './NaBadge';

export function KpiCard({ kpi, hero = false }: { kpi: Kpi; hero?: boolean }) {
  const delta = formatDelta(kpi.deltaPct);
  const up = (kpi.deltaPct ?? 0) >= 0;
  return (
    <Card className="bg-neutral-900 ring-emerald-900/40">
      <p className="text-sm text-neutral-400">{kpi.label}</p>
      {kpi.available ? (
        <p className={hero ? 'mt-1 text-3xl font-semibold text-emerald-400' : 'mt-1 text-xl font-semibold text-neutral-100'}>
          {formatValue(kpi)}
        </p>
      ) : (
        <div className="mt-2"><NaBadge /></div>
      )}
      {delta && (
        <p className={`mt-1 text-xs ${up ? 'text-emerald-500' : 'text-red-400'}`}>{delta}</p>
      )}
    </Card>
  );
}
