'use client';
import Link from 'next/link';
import { Filters } from '@/components/Filters';
import { DataTable, type Column } from '@/components/DataTable';
import { eur } from '@/verkauf/format';
import { formatDeDate } from '@/lib/dates';
import type { CustomerMetricRow, CustomerKpis } from '@/kontakte/analytics';
import type { DateRange } from '@/lib/types';

const SEGMENTS = [
  { key: 'alle', label: 'Alle', href: '/kontakte/analyse' },
  { key: 'geschaeft', label: 'Geschäft', href: '/kontakte/analyse?segment=geschaeft' },
  { key: 'privat', label: 'Privat', href: '/kontakte/analyse?segment=privat' },
] as const;

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-card dark:border-neutral-800 dark:bg-neutral-900">
      <p className="anno text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
    </div>
  );
}

export function KundenAnalyse({ rows, kpis, limit, range, segment }:
  { rows: CustomerMetricRow[]; kpis: CustomerKpis; limit: number;
    range: DateRange; segment: 'geschaeft' | 'privat' | null }) {
  const capped = kpis.totalCustomers > rows.length;

  const columns: Column<CustomerMetricRow>[] = [
    { key: 'name', header: 'Kunde', sort: (r) => r.name.toLowerCase(),
      filter: { kind: 'text', value: (r) => r.name },
      cell: (r) => <Link href={`/kontakte/${r.contactId}`} className="text-brand hover:text-brand-dark">{r.name}</Link> },
    { key: 'segment', header: 'Segment', sort: (r) => r.segment,
      cell: (r) => r.segment === 'geschaeft' ? 'Geschäft' : 'Privat' },
    { key: 'orders', header: 'Bestellungen', className: 'text-right', sort: (r) => r.orders,
      filter: { kind: 'number', value: (r) => r.orders }, cell: (r) => String(r.orders) },
    { key: 'revenue', header: 'Umsatz', className: 'text-right', sort: (r) => r.revenueNet,
      filter: { kind: 'number', value: (r) => r.revenueNet }, cell: (r) => eur(r.revenueNet) },
    { key: 'aov', header: 'Ø Warenkorb', className: 'text-right', sort: (r) => r.avgOrderValueNet,
      cell: (r) => eur(r.avgOrderValueNet) },
    { key: 'last', header: 'Letzte Bestellung', sort: (r) => r.lastOrderAt ?? '',
      cell: (r) => r.lastOrderAt ? formatDeDate(r.lastOrderAt) : '—' },
    { key: 'status', header: 'Status', sort: (r) => (r.isReturning ? 1 : 0),
      filter: { kind: 'select', value: (r) => (r.isReturning ? 'wieder' : 'neu'),
        options: [{ value: 'wieder', label: 'Wiederkäufer' }, { value: 'neu', label: 'Neu' }] },
      cell: (r) => r.isReturning
        ? <span className="rounded bg-accent/15 px-2 py-0.5 text-accent">Wiederkäufer</span>
        : <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">Neu</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Kontakte · Analyse</h2>
        <Filters range={range} basePath="/kontakte/analyse" defaultKey="all" />
      </div>
      <div className="flex flex-wrap gap-2">
        {SEGMENTS.map((s) => {
          const on = (s.key === 'alle' && !segment) || s.key === segment;
          return (
            <Link key={s.key} href={s.href}
              className={`rounded-md px-3 py-1 text-sm ${on
                ? 'bg-brand font-medium text-white'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300'}`}>
              {s.label}
            </Link>
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Aktive Kunden" value={kpis.activeCustomers.toLocaleString('de-DE')} />
        <Tile label="Umsatz" value={eur(kpis.revenueNet)} />
        <Tile label="Ø Warenkorb" value={eur(kpis.orders > 0 ? kpis.revenueNet / kpis.orders : 0)} />
        <Tile label="Wiederkäufer-Quote"
          value={kpis.activeCustomers ? `${Math.round((kpis.returningCustomers / kpis.activeCustomers) * 100)} %` : '—'} />
      </div>
      {capped && (
        <p className="anno text-neutral-500">
          Top {rows.length.toLocaleString('de-DE')} nach Umsatz · von {kpis.totalCustomers.toLocaleString('de-DE')} Kunden
        </p>
      )}
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.contactId}
        initialSort={{ col: 'revenue', dir: 'desc' }} empty="Keine Kunden im Zeitraum." />
    </div>
  );
}
