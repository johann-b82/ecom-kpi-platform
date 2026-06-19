import { Card } from '@tremor/react';
import type { Kpi } from '@/kpi/types';
import { formatValue, formatDelta } from '@/lib/format';
import { KPI_HELP } from '@/kpi/help';
import { NaBadge } from './NaBadge';

export function KpiCard({ kpi, hero = false }: { kpi: Kpi; hero?: boolean }) {
  const delta = formatDelta(kpi.deltaPct);
  const up = (kpi.deltaPct ?? 0) >= 0;
  const help = KPI_HELP[kpi.key];
  return (
    <Card className="overflow-visible bg-white ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
      <p className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400">
        {kpi.label}
        {help && (
          <span className="group relative inline-flex">
            <button
              type="button"
              aria-label={`${kpi.label}: Berechnung und Datenquelle`}
              className="cursor-help leading-none text-neutral-400 hover:text-brand"
            >
              ⓘ
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-64 -translate-x-1/2 rounded-md border border-neutral-700 bg-neutral-900 p-2 text-xs font-normal leading-snug text-neutral-100 shadow-lg group-hover:block group-focus-within:block"
            >
              <span className="block font-semibold text-neutral-100">Berechnung</span>
              <span className="mb-1 block text-neutral-200">{help.formula}</span>
              <span className="block font-semibold text-neutral-100">Quelle</span>
              <span className="block text-neutral-200">{help.source}</span>
            </span>
          </span>
        )}
      </p>
      {kpi.available ? (
        <p className={hero ? 'mt-1 text-3xl font-semibold text-neutral-900 dark:text-neutral-100' : 'mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100'}>
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
