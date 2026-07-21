'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Filters } from '@/components/Filters';
import { KpiTrendRow, type KpiTrendItem } from '@/components/KpiTrendRow';
import { DataTable, type Column } from '@/components/DataTable';
import { formatDeDate } from '@/lib/dates';
import type { OpenItemRow, OpenItemDirection } from '@/finanzen/types';
import { DIRECTION_LABEL, OI_STATUS_LABEL } from '@/finanzen/labels';
import { eur } from '@/finanzen/format';
import { exportBookingsAction } from '@/app/(shell)/finanzen/actions';

export function OffenePostenListe({ items, debitorOpen, kreditorOpen, overdue, range }:
  { items: OpenItemRow[]; debitorOpen: number; kreditorOpen: number; overdue: number;
    range: { start: string; end: string } }) {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [pending, start] = useTransition();
  const rows = items.filter((i) => !onlyOpen || i.status !== 'bezahlt');

  const kpis: KpiTrendItem[] = [
    { key: 'debitor', label: 'Offen Debitor', value: eur(debitorOpen), anno: 'NETTO · OHNE MWST' },
    { key: 'kreditor', label: 'Offen Kreditor', value: eur(kreditorOpen), anno: 'NETTO · OHNE MWST' },
    { key: 'overdue', label: 'Davon überfällig', value: eur(overdue), anno: 'NETTO · OHNE MWST' },
  ];

  const statusValue = (i: OpenItemRow) => (i.overdue ? 'ueberfaellig' : i.status);
  const columns: Column<OpenItemRow>[] = [
    { key: 'direction', header: 'Richtung', sort: (i) => DIRECTION_LABEL[i.direction],
      filter: { kind: 'select', value: (i) => i.direction,
        options: (['debitor', 'kreditor'] as OpenItemDirection[]).map((d) => ({ value: d, label: DIRECTION_LABEL[d] })) },
      cell: (i) => DIRECTION_LABEL[i.direction] },
    { key: 'contact', header: 'Kontakt', sort: (i) => i.contactName, filter: { kind: 'text', value: (i) => i.contactName },
      cell: (i) => i.contactName },
    { key: 'reference', header: 'Referenz', sort: (i) => i.reference, filter: { kind: 'text', value: (i) => i.reference ?? '' },
      cell: (i) => <Link href={`/finanzen/${i.id}`} className="text-brand hover:text-brand-dark">{i.reference ?? '—'}</Link> },
    { key: 'amount', header: 'Betrag', className: 'text-right', sort: (i) => i.amount,
      filter: { kind: 'number', value: (i) => i.amount }, cell: (i) => eur(i.amount) },
    { key: 'due', header: 'Fällig', sort: (i) => i.dueDate,
      cell: (i) => <span className={i.overdue ? 'text-danger' : 'text-neutral-500'}>{formatDeDate(i.dueDate)}</span> },
    { key: 'status', header: 'Status', sort: statusValue,
      filter: { kind: 'select', value: statusValue, options: [
        { value: 'ueberfaellig', label: 'Überfällig' },
        { value: 'offen', label: OI_STATUS_LABEL.offen },
        { value: 'teilweise_bezahlt', label: OI_STATUS_LABEL.teilweise_bezahlt },
        { value: 'bezahlt', label: OI_STATUS_LABEL.bezahlt },
      ] },
      cell: (i) => i.overdue
        ? <span className="rounded bg-danger/15 px-2 py-0.5 font-medium text-danger">Überfällig</span>
        : <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">{OI_STATUS_LABEL[i.status]}</span> },
    { key: 'remaining', header: 'Rest', className: 'text-right', sort: (i) => i.remaining,
      filter: { kind: 'number', value: (i) => i.remaining }, cell: (i) => eur(i.remaining) },
  ];

  const download = () => start(async () => {
    const csv = await exportBookingsAction();
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'buchungen.csv'; a.click();
    URL.revokeObjectURL(url);
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Finanzen · Offene Posten</h2>
        <Filters range={range} basePath="/finanzen" defaultKey="all" />
      </div>

      <KpiTrendRow items={kpis} gridClassName="grid gap-3 sm:grid-cols-3" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-300">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> nur offen
        </label>
        <div className="flex gap-2">
          <Link href="/finanzen/neu" className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">Lieferantenrechnung</Link>
          <button onClick={download} disabled={pending} className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Export CSV</button>
        </div>
      </div>

      <DataTable rows={rows} columns={columns} rowKey={(i) => i.id}
        initialSort={{ col: 'due', dir: 'asc' }} empty="Keine offenen Posten." />
    </div>
  );
}
