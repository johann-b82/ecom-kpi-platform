import { Card } from '@tremor/react';
import type { Kpi } from '@/kpi/types';
import { formatValue, formatDelta } from '@/lib/format';
import { NaBadge } from './NaBadge';

export function KpiCard({ kpi, hero = false }: { kpi: Kpi; hero?: boolean }) {
  const delta = formatDelta(kpi.deltaPct);
  const up = (kpi.deltaPct ?? 0) >= 0;
  return (
    <Card className="bg-white ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-emerald-900/40">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{kpi.label}</p>
      {kpi.available ? (
        <p className={hero ? 'mt-1 text-3xl font-semibold text-emerald-600 dark:text-emerald-400' : 'mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100'}>
          {formatValue(kpi)}
        </p>
      ) : (
        <div className="mt-2"><NaBadge /></div>
      )}
      {delta && (
        <p className={`mt-1 text-xs ${up ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-400'}`}>{delta}</p>
      )}
    </Card>
  );
}
