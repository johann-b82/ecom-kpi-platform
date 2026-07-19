'use client';
import Link from 'next/link';
import { Filters } from '@/components/Filters';
import { DataTable, type Column } from '@/components/DataTable';
import { eur } from '@/verkauf/format';
import { formatDeDate } from '@/lib/dates';
import type { CustomerMetricRow } from '@/kontakte/analytics';
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

export function KundenAnalyse({ rows, range, segment }:
  { rows: CustomerMetricRow[]; range: DateRange; segment: 'geschaeft' | 'privat' | null }) {
  const active = rows.filter((r) => r.orders > 0);
  const revenue = active.reduce((s, r) => s + r.revenueNet, 0);
  const orders = active.reduce((s, r) => s + r.orders, 0);
  const returning = active.filter((r) => r.isReturning).length;

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
        <Tile label="Aktive Kunden" value={String(active.length)} />
        <Tile label="Umsatz" value={eur(revenue)} />
        <Tile label="Ø Warenkorb" value={eur(orders > 0 ? revenue / orders : 0)} />
        <Tile label="Wiederkäufer-Quote" value={active.length ? `${Math.round((returning / active.length) * 100)} %` : '—'} />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.contactId}
        initialSort={{ col: 'revenue', dir: 'desc' }} empty="Keine Kunden im Zeitraum." />
    </div>
  );
}
