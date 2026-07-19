'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { OpenItemDetail, PaymentMethod } from '@/finanzen/types';
import { DIRECTION_LABEL, OI_STATUS_LABEL, METHOD_LABEL } from '@/finanzen/labels';
import { eur } from '@/finanzen/format';
import { recordPaymentAction } from '@/app/(shell)/finanzen/actions';

const METHODS: PaymentMethod[] = ['ueberweisung', 'lastschrift', 'kreditkarte', 'paypal', 'sonstige'];

export function OffenePostenDetail({ item }: { item: OpenItemDetail }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState(item.remaining > 0 ? String(item.remaining.toFixed(2)) : '');
  const [method, setMethod] = useState<PaymentMethod>('ueberweisung');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  const settled = item.status === 'bezahlt';
  const input = 'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

  const submit = () => {
    const a = Number(amount.replace(',', '.'));
    if (!Number.isFinite(a) || a <= 0) { setError('Betrag > 0 angeben.'); return; }
    setError(null);
    start(async () => {
      try {
        await recordPaymentAction(item.id, { amount: a, method, reference: reference || undefined });
        setReference(''); router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/finanzen" className="text-brand hover:text-brand-dark">← Offene Posten</Link>
        <h2 className="text-xl font-bold tracking-tight">{item.reference ?? DIRECTION_LABEL[item.direction]}</h2>
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-sm dark:bg-neutral-800">{DIRECTION_LABEL[item.direction]}</span>
        <span className={`rounded px-2 py-0.5 text-sm ${item.overdue ? 'bg-danger/15 text-danger' : 'bg-neutral-100 dark:bg-neutral-800'}`}>
          {item.overdue ? 'Überfällig' : OI_STATUS_LABEL[item.status]}
        </span>
        <span className="text-neutral-500">{item.contactName}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="anno text-neutral-500">Betrag</p><p className="mt-1 text-lg font-semibold">{eur(item.amount)}</p>
          <p className="anno mt-1 text-neutral-500">NETTO · OHNE MWST</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="anno text-neutral-500">Bezahlt</p><p className="mt-1 text-lg font-semibold">{eur(item.paid)}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="anno text-neutral-500">Rest · fällig {item.dueDate}</p><p className="mt-1 text-lg font-semibold">{eur(item.remaining)}</p>
        </div>
      </div>

      {item.orderId && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Beleg: <Link href={`/verkauf/belege/${item.orderId}`} className="text-brand hover:text-brand-dark">{item.orderNumber}</Link>
          {item.orderStatus === 'rechnung_gestellt' && ' — Vollausgleich setzt den Beleg auf „bezahlt".'}
        </p>
      )}

      {item.purchaseOrderId && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Bestellung: <Link href={`/verfuegbarkeit/wareneingang/${item.purchaseOrderId}`} className="text-brand hover:text-brand-dark">{item.purchaseOrderNumber ?? '—'}</Link>
        </p>
      )}

      {!settled && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="anno mb-2 text-neutral-500">Zahlung erfassen</p>
          <div className="flex flex-wrap items-end gap-2">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Betrag" className={`${input} w-28`} />
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={input}>
              {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </select>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Referenz (optional)" className={`${input} flex-1`} />
            <button onClick={submit} disabled={pending} className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Buchen</button>
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>
      )}

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="anno mb-2 text-neutral-500">Zahlungen</p>
        {item.payments.length === 0
          ? <p className="text-sm text-neutral-500">Noch keine Zahlungen.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {item.payments.map((p) => (
                    <tr key={p.id} className="border-t border-neutral-200 dark:border-neutral-800">
                      <td className="py-1 text-neutral-500">{p.paidAt.slice(0, 10)}</td>
                      <td>{eur(p.amount)}</td>
                      <td>{METHOD_LABEL[p.method]}</td>
                      <td className="text-neutral-500">{p.reference ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}
