'use client';
import Link from 'next/link';
import { num, eur } from '@/components/charts/chart-style';
import { KpiTrendRow, type KpiTrendItem } from '@/components/KpiTrendRow';
import { DataTable, type Column } from '@/components/DataTable';
import type { CategoryRollupRow, SeriesPoint } from '@/verfuegbarkeit/types';

export function VerfuegbarkeitDashboard({ kpis, rollup, stockSeries, warenwert, ekUnvollstaendig, warenwertSeries }: {
  kpis: { gesamtbestand: number; kritisch: number };
  rollup: CategoryRollupRow[];
  stockSeries: SeriesPoint[];
  warenwert: number;
  ekUnvollstaendig: boolean;
  warenwertSeries: SeriesPoint[];
}) {
  const items: KpiTrendItem[] = [
    { key: 'gesamt', label: 'Gesamtbestand', value: num(kpis.gesamtbestand), series: stockSeries, format: 'num' },
    { key: 'warenwert', label: 'Warenwert im Lager', value: eur(warenwert), series: warenwertSeries, format: 'eur',
      hint: ekUnvollstaendig ? 'EK unvollständig' : undefined },
    { key: 'kritisch', label: 'Reichweite < 90 Tage', value: num(kpis.kritisch), href: '/verfuegbarkeit/meldebestand' },
  ];

  const columns: Column<CategoryRollupRow>[] = [
    { key: 'category', header: 'Kategorie', sort: (r) => r.category, filter: { kind: 'text', value: (r) => r.category },
      cell: (r) => (
        <Link href={`/verfuegbarkeit/kategorie/${encodeURIComponent(r.category)}`}
          className="text-brand hover:text-brand-dark">{r.category}</Link>
      ) },
    { key: 'variantCount', header: 'Artikel', className: 'text-right tabular-nums',
      sort: (r) => r.variantCount, filter: { kind: 'number', value: (r) => r.variantCount },
      cell: (r) => num(r.variantCount) },
    { key: 'gesamtbestand', header: 'Bestand', className: 'text-right tabular-nums',
      sort: (r) => r.gesamtbestand, filter: { kind: 'number', value: (r) => r.gesamtbestand },
      cell: (r) => num(r.gesamtbestand) },
    { key: 'kritisch', header: 'Kritisch (< 90 T)', className: 'text-right tabular-nums',
      sort: (r) => r.anzahlKritisch, filter: { kind: 'number', value: (r) => r.anzahlKritisch },
      cell: (r) => <span className={r.anzahlKritisch > 0 ? 'font-semibold text-brand' : ''}>{num(r.anzahlKritisch)}</span> },
  ];

  return (
    <div className="space-y-6">
      <KpiTrendRow items={items} gridClassName="grid grid-cols-1 gap-4 sm:grid-cols-3" />
      <DataTable rows={rollup} columns={columns} rowKey={(r) => r.category}
        initialSort={{ col: 'category', dir: 'asc' }} empty="Keine Kategorien." />
    </div>
  );
}
