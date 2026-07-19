'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { OrderView, OrderStatus } from '@/verkauf/types';
import { Faden } from './Faden';
import { transitionOrderStatusAction, createReturnAction } from '@/app/(shell)/verkauf/actions';
import { contributionMargin } from '@/verkauf/marge';
import { COST_TYPE_LABEL, COST_SOURCE_LABEL } from '@/verkauf/labels';

const PRIMARY: Partial<Record<OrderStatus, { label: string; run: (id: string) => Promise<unknown> }>> = {
  angebot: { label: 'In Auftrag wandeln', run: (id) => transitionOrderStatusAction(id, 'auftrag') },
  versendet: { label: 'Rechnung stellen', run: (id) => transitionOrderStatusAction(id, 'rechnung_gestellt') },
  bezahlt: { label: 'Retoure anlegen', run: (id) => createReturnAction(id) },
};
const HINT: Partial<Record<OrderStatus, string>> = {
  auftrag: 'Wartet auf Versand', rechnung_gestellt: 'Wartet auf Zahlung',
};

export function VerkaufDetail({ order }: { order: OrderView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const primary = PRIMARY[order.status];
  const canCancel = order.status === 'angebot' || order.status === 'auftrag';

  const runPrimary = () => primary && start(async () => {
    const res = await primary.run(order.id);
    // Retoure erzeugt einen neuen Beleg → dorthin springen; sonst aktuellen aktualisieren.
    if (order.status === 'bezahlt' && res && typeof res === 'object' && 'id' in res) {
      router.push(`/verkauf/belege/${(res as { id: string }).id}`);
    } else router.refresh();
  });
  const cancel = () => start(async () => { await transitionOrderStatusAction(order.id, 'storniert'); router.refresh(); });

  const total = order.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const { db, dbProzent } = contributionMargin(total, order.costs);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold tracking-tight">{order.number}</h2>
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-sm dark:bg-neutral-800">{order.channel}</span>
        <span className={`rounded px-2 py-0.5 text-sm ${order.status === 'retoure'
          ? 'bg-danger text-white' : 'bg-neutral-100 dark:bg-neutral-800'}`}>{order.status}</span>
        <Link href={`/kontakte/${order.contactId}`} className="text-brand hover:text-brand-dark">{order.contactName}</Link>
        <div className="ml-auto flex items-center gap-2">
          {primary && (
            <button onClick={runPrimary} disabled={pending}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">
              {primary.label}
            </button>
          )}
          {!primary && HINT[order.status] && <span className="text-sm text-neutral-500">{HINT[order.status]}</span>}
          {canCancel && (
            <button onClick={cancel} disabled={pending}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
              Stornieren
            </button>
          )}
        </div>
      </div>

      <Faden events={order.events} />

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="anno text-left text-neutral-500">
              <th className="py-2">Artikel</th><th>SKU</th><th className="text-right">Menge</th>
              <th className="text-right">Einzelpreis</th><th className="text-right">Summe</th>
            </tr></thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={l.id} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-2">{l.productName}</td><td className="text-neutral-500">{l.sku}</td>
                  <td className="text-right">{l.quantity}</td>
                  <td className="text-right">{l.unitPrice.toFixed(2)} €</td>
                  <td className="text-right">{(l.quantity * l.unitPrice).toFixed(2)} €</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-300 font-medium dark:border-neutral-700">
                <td className="py-2" colSpan={4}>Gesamt</td><td className="text-right">{total.toFixed(2)} €</td>
              </tr>
              <tr>
                <td className="anno pt-1 text-neutral-500" colSpan={5}>Beträge netto, ohne MwSt</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {order.costs.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="anno mb-2 text-neutral-500">Deckungsbeitrag</p>
          {order.ekUnvollstaendig && (
            <p className="anno mb-2 text-neutral-400 dark:text-neutral-500">
              Wareneinsatz unvollständig — nicht alle Varianten haben einen EK
            </p>
          )}
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <td className="py-2">Umsatz netto</td><td /><td className="text-right">{total.toFixed(2)} €</td>
              </tr>
              {order.costs.map((c) => (
                <tr key={c.id}>
                  <td className="py-1 text-neutral-600 dark:text-neutral-400">− {COST_TYPE_LABEL[c.type]}</td>
                  <td className="text-neutral-400">
                    <span className="anno rounded bg-neutral-100 px-1.5 py-0.5 text-xs dark:bg-neutral-800">
                      {COST_SOURCE_LABEL[c.source]}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{(-c.amount).toFixed(2)} €</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-300 font-semibold dark:border-neutral-700">
                <td className="py-2">Deckungsbeitrag</td><td />
                <td className="text-right">
                  {db.toFixed(2)} €{dbProzent !== null && (
                    <span className="ml-2 text-neutral-500">({(dbProzent * 100).toFixed(1)} %)</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
