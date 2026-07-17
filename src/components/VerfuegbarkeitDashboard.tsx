'use client';
import Link from 'next/link';
import { ChartCard } from '@/components/charts/ChartCard';
import { num } from '@/components/charts/chart-style';
import type { CategoryRollupRow } from '@/verfuegbarkeit/types';

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <ChartCard>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
    </ChartCard>
  );
}

export function VerfuegbarkeitDashboard({ kpis, rollup }: {
  kpis: { gesamtbestand: number; unterMeldebestand: number; kritisch: number };
  rollup: CategoryRollupRow[];
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold tracking-tight">Verfügbarkeit · Übersicht</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Gesamtbestand" value={num(kpis.gesamtbestand)} />
        <StatTile label="Unter Meldebestand" value={num(kpis.unterMeldebestand)} />
        <StatTile label="Reichweite < 90 Tage" value={num(kpis.kritisch)} />
      </div>

      <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
              <th className="px-4 py-2 font-medium">Kategorie</th>
              <th className="px-4 py-2 text-right font-medium">Artikel</th>
              <th className="px-4 py-2 text-right font-medium">Bestand</th>
              <th className="px-4 py-2 text-right font-medium">Unter Meldebestand</th>
              <th className="px-4 py-2 text-right font-medium">Kritisch (&lt; 90 T)</th>
            </tr>
          </thead>
          <tbody>
            {rollup.map((r) => (
              <tr key={r.category} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
                <td className="px-4 py-2">
                  <Link href={`/verfuegbarkeit/kategorie/${encodeURIComponent(r.category)}`}
                        className="text-brand hover:text-brand-dark">{r.category}</Link>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{num(r.variantCount)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{num(r.gesamtbestand)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{num(r.anzahlUnterMeldebestand)}</td>
                <td className={`px-4 py-2 text-right tabular-nums ${r.anzahlKritisch > 0 ? 'font-semibold text-brand' : ''}`}>
                  {num(r.anzahlKritisch)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
