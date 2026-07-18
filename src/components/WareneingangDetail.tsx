'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { PurchaseOrderDetail, GoodsReceipt } from '@/verfuegbarkeit/types';
import { PO_STATUS_LABEL } from '@/verfuegbarkeit/labels';
import {
  markPurchaseOrderOrderedAction, receiveGoodsAction, cancelPurchaseOrderAction,
} from '@/app/(shell)/verfuegbarkeit/actions';

export function WareneingangDetail({ po }: { po: PurchaseOrderDetail }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>) => start(async () => {
    setError(null);
    try { await fn(); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
  });

  const receive = () => {
    const receipts: GoodsReceipt[] = po.lines
      .map((l) => ({ lineId: l.id, quantity: parseInt(qty[l.id] ?? String(l.quantityOrdered - l.quantityReceived), 10) }))
      .filter((r) => Number.isFinite(r.quantity) && r.quantity > 0);
    if (receipts.length === 0) { setError('Mindestens eine Eingangsmenge angeben.'); return; }
    run(async () => { await receiveGoodsAction(po.id, receipts); setQty({}); });
  };

  const canOrder = po.status === 'entwurf';
  const canReceive = po.status === 'bestellt' || po.status === 'teilweise_eingegangen';
  const canCancel = po.status === 'entwurf' || po.status === 'bestellt';
  const input = 'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/verfuegbarkeit/wareneingang" className="text-brand hover:text-brand-dark">← Wareneingang</Link>
        <h2 className="text-xl font-bold tracking-tight">{po.number}</h2>
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-sm dark:bg-neutral-800">{PO_STATUS_LABEL[po.status]}</span>
        <span className="text-neutral-500">{po.supplierName}</span>
        <div className="ml-auto flex items-center gap-2">
          {canOrder && (
            <button onClick={() => run(() => markPurchaseOrderOrderedAction(po.id))} disabled={pending}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Bestellung auslösen</button>
          )}
          {canCancel && (
            <button onClick={() => run(() => cancelPurchaseOrderAction(po.id))} disabled={pending}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">Stornieren</button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="anno text-left text-neutral-500">
              <th className="py-2">SKU</th><th>Artikel</th>
              <th className="text-right">Bestellt</th><th className="text-right">Eingegangen</th>
              {canReceive && <th className="text-right">Wareneingang</th>}
            </tr></thead>
            <tbody>
              {po.lines.map((l) => {
                const open = l.quantityOrdered - l.quantityReceived;
                return (
                  <tr key={l.id} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="py-2">{l.sku}</td>
                    <td>{l.productName}</td>
                    <td className="text-right">{l.quantityOrdered}</td>
                    <td className="text-right text-neutral-500">{l.quantityReceived}</td>
                    {canReceive && (
                      <td className="text-right">
                        {open > 0
                          ? <input type="number" min={0} max={open} value={qty[l.id] ?? String(open)}
                              onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })}
                              placeholder={String(open)} className={`${input} w-20 text-right`} />
                          : <span className="text-neutral-500">—</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {canReceive && (
          <div className="mt-3 flex items-center gap-3">
            <button onClick={receive} disabled={pending}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Wareneingang buchen</button>
            <span className="anno text-neutral-500">bucht ins Standardlager</span>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
