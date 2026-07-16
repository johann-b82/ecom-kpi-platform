'use client';
import { useState } from 'react';
import type { Kpi } from '@/kpi/types';
import type { MarginTotals } from '@/verkauf/types';
import type { PlatformEfficiency } from '@/verkauf/marketing';
import { KpiCard } from './KpiCard';
import { eur } from '@/verkauf/format';

function delta(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}
function kpi(key: string, label: string, value: number | null, unit: Kpi['unit'], deltaPct: number | null): Kpi {
  return { key, label, phase: 'do', value, unit, available: value !== null, deltaPct };
}

export function MarketingMargin(
  { current, previous, efficiency }: { current: MarginTotals; previous: MarginTotals; efficiency: PlatformEfficiency[] },
) {
  const [perChannel, setPerChannel] = useState(false);
  const kpis: Kpi[] = [
    kpi('db_total', 'Deckungsbeitrag', current.db, 'currency', delta(current.db, previous.db)),
    kpi('db_prozent', 'DB-Marge', current.dbProzent, 'percent', delta(current.dbProzent, previous.dbProzent)),
    kpi('mer', 'MER (blended)', current.mer, 'ratio', delta(current.mer, previous.mer)),
  ];
  const blendedSpend = efficiency.reduce((s, e) => s + e.spend, 0);
  const blendedConv = efficiency.reduce((s, e) => s + e.convValue, 0);
  const rows = perChannel
    ? efficiency
    : [{ platform: 'Alle Ads-Kanäle', spend: blendedSpend, convValue: blendedConv,
         roas: blendedSpend > 0 ? blendedConv / blendedSpend : null }];

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map((k) => <KpiCard key={k.key} kpi={k} />)}
      </div>
      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-2 flex items-center justify-between">
          <p className="anno text-neutral-500">Marketing-Effizienz · <span className="text-accent">PLATTFORM-GEMELDET</span></p>
          <div className="flex gap-1 text-sm">
            <button onClick={() => setPerChannel(false)}
              className={`rounded px-2 py-0.5 ${!perChannel ? 'bg-accent text-white' : 'text-neutral-500'}`}>kombiniert</button>
            <button onClick={() => setPerChannel(true)}
              className={`rounded px-2 py-0.5 ${perChannel ? 'bg-accent text-white' : 'text-neutral-500'}`}>je Kanal</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="anno text-left text-neutral-500">
              <th className="py-1">Kanal</th><th className="text-right">Spend</th>
              <th className="text-right">ROAS*</th><th className="text-right">conv_value*</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.platform} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-1">{r.platform}</td>
                  <td className="text-right tabular-nums">{eur(r.spend)}</td>
                  <td className="text-right tabular-nums">{r.roas === null ? '—' : `${r.roas.toFixed(1)}×`}</td>
                  <td className="text-right tabular-nums">{eur(r.convValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="anno mt-2 text-xs text-neutral-400">
          * von der Werbeplattform berichtet — überlappend, nicht dedupliziert. Kein Umsatz je Ads-Kanal attribuiert.
        </p>
      </div>
    </section>
  );
}
