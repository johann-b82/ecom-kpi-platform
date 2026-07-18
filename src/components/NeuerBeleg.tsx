'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CustomerOption, SellableVariant, PriceEntry } from '@/verkauf/types';
import { createOrderAction } from '@/app/(shell)/verkauf/actions';

interface Line { variantId: string; quantity: number; unitPrice: number }

export function NeuerBeleg({ customers, variants, prices }:
  { customers: CustomerOption[]; variants: SellableVariant[]; prices: PriceEntry[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [contactId, setContactId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [err, setErr] = useState('');

  const customer = customers.find((c) => c.id === contactId);
  const availByVariant = useMemo(() => new Map(variants.map((v) => [v.variantId, v.available])), [variants]);
  const priceFor = (variantId: string) =>
    customer?.priceListId
      ? prices.find((p) => p.variantId === variantId && p.priceListId === customer.priceListId)?.amount ?? 0
      : 0;

  const addLine = (variantId: string) => {
    if (!variantId || lines.some((l) => l.variantId === variantId)) return;
    setLines([...lines, { variantId, quantity: 1, unitPrice: priceFor(variantId) }]);
  };
  const setLine = (i: number, patch: Partial<Line>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines(lines.filter((_, j) => j !== i));

  const save = () => {
    setErr('');
    if (!customer) { setErr('Bitte einen Kunden wählen.'); return; }
    if (lines.length === 0) { setErr('Bitte mindestens eine Position hinzufügen.'); return; }
    start(async () => {
      const order = await createOrderAction({
        contactId: customer.id, channel: 'manuell', priceListId: customer.priceListId,
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })),
      });
      router.push(`/verkauf/belege/${order.id}`);
    });
  };

  const INPUT = 'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm dark:border-transparent dark:bg-neutral-800';

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <label className="anno text-neutral-500">Kunde</label>
        <select value={contactId} onChange={(e) => { setContactId(e.target.value); setLines([]); }} className={`${INPUT} mt-1 block w-full`}>
          <option value="">— wählen —</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {customer && (
          <p className="mt-2 text-sm text-neutral-500">
            Zahlungsziel {customer.paymentTerms} Tage
            {customer.deliveryLabel ? ` · Lieferung: ${customer.deliveryLabel}` : ''}
          </p>
        )}
      </div>

      {customer && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 space-y-3">
          <div className="flex items-center gap-2">
            <select className={INPUT} defaultValue="" onChange={(e) => { addLine(e.target.value); e.currentTarget.value = ''; }}>
              <option value="">Artikel hinzufügen …</option>
              {variants.map((v) => <option key={v.variantId} value={v.variantId}>{v.productName} · {v.sku} (verfügbar {v.available})</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="anno text-left text-neutral-500">
                <th className="py-1">Artikel</th><th className="text-right">Menge</th><th className="text-right">Einzelpreis</th>
                <th className="text-right">Verfügbar</th><th></th>
              </tr></thead>
              <tbody>
                {lines.map((l, i) => {
                  const v = variants.find((x) => x.variantId === l.variantId)!;
                  const short = l.quantity > (availByVariant.get(l.variantId) ?? 0);
                  return (
                    <tr key={l.variantId} className="border-t border-neutral-200 dark:border-neutral-800">
                      <td className="py-1">{v.productName} <span className="text-neutral-500">{v.sku}</span></td>
                      <td className="text-right">
                        <input type="number" min={1} value={l.quantity}
                          onChange={(e) => setLine(i, { quantity: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                          className={`${INPUT} w-20 text-right`} />
                      </td>
                      <td className="text-right">
                        <input type="number" step="0.01" value={l.unitPrice}
                          onChange={(e) => setLine(i, { unitPrice: parseFloat(e.target.value || '0') })}
                          className={`${INPUT} w-24 text-right`} />
                      </td>
                      <td className={`text-right ${short ? 'text-danger' : 'text-neutral-500'}`}>
                        {availByVariant.get(l.variantId) ?? 0}{short ? ' ⚠' : ''}
                      </td>
                      <td className="text-right">
                        <button onClick={() => removeLine(i)} className="text-sm text-neutral-500 hover:text-danger">Entfernen</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {lines.some((l) => l.quantity > (availByVariant.get(l.variantId) ?? 0)) && (
            <p className="text-sm text-danger">Hinweis: mindestens eine Position übersteigt den verfügbaren Bestand. Anlage ist trotzdem möglich.</p>
          )}
        </div>
      )}

      {err && <p className="text-sm text-danger">{err}</p>}
      <button onClick={save} disabled={pending}
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">
        Beleg anlegen
      </button>
    </div>
  );
}
