'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ReorderSuggestion, SupplierOption } from '@/verfuegbarkeit/types';
import { createDraftPurchaseOrderAction } from '@/app/(shell)/verfuegbarkeit/actions';

export function MeldebestandListe({ suggestions, suppliers }:
  { suggestions: ReorderSuggestion[]; suppliers: SupplierOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [qty, setQty] = useState('');
  const [error, setError] = useState<string | null>(null);

  const openForm = (s: ReorderSuggestion) => {
    setOpenId(s.variantId);
    setSupplierId(s.defaultSupplierId ?? suppliers[0]?.id ?? '');
    setQty(String(s.suggestedQty));
    setError(null);
  };

  const draft = (s: ReorderSuggestion) => {
    const q = parseInt(qty, 10);
    if (!supplierId || Number.isNaN(q) || q <= 0) { setError('Lieferant und Menge > 0 angeben.'); return; }
    setError(null);
    start(async () => {
      try {
        const poId = await createDraftPurchaseOrderAction({
          supplierId, lines: [{ variantId: s.variantId, quantityOrdered: q, unitCost: null }],
        });
        router.push(`/verfuegbarkeit/wareneingang/${poId}`);
      } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    });
  };

  const input = 'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

  if (suggestions.length === 0) {
    return <p className="text-sm text-neutral-500">Kein Artikel mit Reichweite unter 90 Tagen.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead><tr className="anno text-left text-neutral-500">
        <th className="py-2">SKU</th><th>Artikel</th>
        <th className="text-right">Bestand</th>
        <th className="text-right">Absatz 90T</th>
        <th className="text-right">Reichweite</th>
        <th className="text-right">Vorschlag</th>
        <th></th>
      </tr></thead>
      <tbody>
        {suggestions.map((s) => (
          <tr key={s.variantId} className="border-t border-neutral-200 dark:border-neutral-800 align-top">
            <td className="py-2">{s.sku}</td>
            <td>{s.productName}</td>
            <td className="text-right tabular-nums">{s.onHand}</td>
            <td className="text-right tabular-nums text-neutral-500">{s.units90d}</td>
            <td className="text-right">
              <span className="rounded bg-danger/15 px-2 py-0.5 font-medium text-danger tabular-nums">
                {s.reichweiteTage ?? '—'} T
              </span>
            </td>
            <td className="text-right tabular-nums">{s.suggestedQty}</td>
            <td className="text-right">
              {openId === s.variantId ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={input}>
                    {suppliers.map((sup) => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
                  </select>
                  <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className={`${input} w-20 text-right`} />
                  <button onClick={() => draft(s)} disabled={pending}
                    className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Entwurf anlegen</button>
                </div>
              ) : (
                <button onClick={() => openForm(s)} disabled={pending}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 disabled:opacity-50">Nachbestellung entwerfen</button>
              )}
              {openId === s.variantId && error && <p className="mt-1 text-sm text-danger">{error}</p>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
