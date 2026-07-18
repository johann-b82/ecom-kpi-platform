'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChartCard } from '@/components/charts/ChartCard';
import { KpiLineChart } from '@/components/charts/KpiLineChart';
import type { SeriesPoint } from '@/verfuegbarkeit/types';

export interface KpiTrendItem {
  key: string;
  label: string;
  value: string;
  anno?: string;
  series?: SeriesPoint[];       // undefined ⇒ Kachel nicht klickbar
  format?: 'num' | 'eur';       // Achsen-/Tooltip-Format der Kurve
  href?: string;                // Kachel navigiert statt Kurve (schließt series aus)
  hint?: string;                // dezenter Zusatztext unter dem Wert
}

export function KpiTrendRow({ items, gridClassName }:
  { items: KpiTrendItem[]; gridClassName?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const active = items.find((i) => i.key === open && i.series);

  return (
    <div className="space-y-3">
      <div className={gridClassName ?? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4'}>
        {items.map((i) => {
          const clickable = !!i.series;
          const isOpen = open === i.key && clickable;
          // transition-colors (nicht transition): Ring/box-shadow schaltet sofort,
          // sonst faden beim Kachelwechsel alter + neuer Ring kurz gleichzeitig (Flackern).
          const hover = (clickable || i.href) ? 'transition-colors hover:ring-2 hover:ring-accent/40' : '';
          const activeCls = isOpen
            ? 'ring-2 ring-accent ring-offset-2 ring-offset-neutral-0 dark:ring-offset-neutral-950 bg-accent/10 dark:bg-accent/15'
            : '';
          const body = (
            <>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{i.label}</p>
              <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{i.value}</p>
              {i.anno && <p className="anno mt-1 text-neutral-500">{i.anno}</p>}
              {i.hint && <p className="mt-1 text-xs text-neutral-500">{i.hint}</p>}
            </>
          );
          return (
            <ChartCard key={i.key} className={`${hover} ${activeCls}`}>
              {i.href ? (
                <Link href={i.href} className="block w-full cursor-pointer text-left">{body}</Link>
              ) : clickable ? (
                <button type="button" aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i.key)}
                  className="w-full cursor-pointer text-left">
                  {body}
                </button>
              ) : body}
            </ChartCard>
          );
        })}
      </div>
      {active && (
        <KpiLineChart title={`${active.label} · Verlauf`} series={active.series!} format={active.format ?? 'num'} />
      )}
    </div>
  );
}
