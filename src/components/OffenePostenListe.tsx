'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ChartCard } from '@/components/charts/ChartCard';
import type { OpenItemRow, OpenItemDirection } from '@/finanzen/types';
import { DIRECTION_LABEL, OI_STATUS_LABEL } from '@/finanzen/labels';
import { eur } from '@/finanzen/format';
import { exportBookingsAction } from '@/app/(shell)/finanzen/actions';
import { useClientSort, ClientSortableTh } from '@/components/useClientSort';

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <ChartCard>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
      <p className="anno mt-1 text-neutral-500">NETTO · OHNE MWST</p>
    </ChartCard>
  );
}

export function OffenePostenListe({ items, debitorOpen, kreditorOpen, overdue }:
  { items: OpenItemRow[]; debitorOpen: number; kreditorOpen: number; overdue: number }) {
  const [dir, setDir] = useState<OpenItemDirection | ''>('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [pending, start] = useTransition();

  const filtered = items.filter((i) =>
    (!dir || i.direction === dir) && (!onlyOpen || i.status !== 'bezahlt'));
  const { sorted, sort, onSort } = useClientSort(filtered, {
    direction: (i) => DIRECTION_LABEL[i.direction],
    contact: (i) => i.contactName,
    reference: (i) => i.reference,
    amount: (i) => i.amount,
    due: (i) => i.dueDate,
    status: (i) => (i.overdue ? 'ueberfaellig' : i.status),
    remaining: (i) => i.remaining,
  }, { col: 'due', dir: 'asc' });

  const download = () => start(async () => {
    const csv = await exportBookingsAction();
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'buchungen.csv'; a.click();
    URL.revokeObjectURL(url);
  });

  const chip = (active: boolean) =>
    `rounded px-3 py-1 text-sm ${active ? 'bg-accent text-white' : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Finanzen · Offene Posten</h2>
        <div className="flex gap-2">
          <Link href="/finanzen/neu" className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">Lieferantenrechnung</Link>
          <button onClick={download} disabled={pending} className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Export CSV</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Offen Debitor" value={eur(debitorOpen)} />
        <Tile label="Offen Kreditor" value={eur(kreditorOpen)} />
        <Tile label="Davon überfällig" value={eur(overdue)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['', 'debitor', 'kreditor'] as const).map((d) => (
          <button key={d} onClick={() => setDir(d)} className={chip(dir === d)}>
            {d === '' ? 'Alle' : DIRECTION_LABEL[d]}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-300">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> nur offen
        </label>
      </div>

      <table className="w-full text-sm">
        <thead><tr className="text-left text-neutral-500">
          <ClientSortableTh col="direction" label="Richtung" sort={sort} onSort={onSort} className="py-2" />
          <ClientSortableTh col="contact" label="Kontakt" sort={sort} onSort={onSort} />
          <ClientSortableTh col="reference" label="Referenz" sort={sort} onSort={onSort} />
          <ClientSortableTh col="amount" label="Betrag" sort={sort} onSort={onSort} className="text-right" />
          <ClientSortableTh col="due" label="Fällig" sort={sort} onSort={onSort} />
          <ClientSortableTh col="status" label="Status" sort={sort} onSort={onSort} />
          <ClientSortableTh col="remaining" label="Rest" sort={sort} onSort={onSort} className="text-right" />
        </tr></thead>
        <tbody>
          {sorted.map((i) => (
            <tr key={i.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2">{DIRECTION_LABEL[i.direction]}</td>
              <td>{i.contactName}</td>
              <td><Link href={`/finanzen/${i.id}`} className="text-brand hover:text-brand-dark">{i.reference ?? '—'}</Link></td>
              <td className="text-right">{eur(i.amount)}</td>
              <td className={i.overdue ? 'text-danger' : 'text-neutral-500'}>{i.dueDate}</td>
              <td>
                {i.overdue
                  ? <span className="rounded bg-danger/15 px-2 py-0.5 font-medium text-danger">Überfällig</span>
                  : <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">{OI_STATUS_LABEL[i.status]}</span>}
              </td>
              <td className="text-right">{eur(i.remaining)}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={7} className="py-6 text-center text-neutral-500">Keine offenen Posten.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
