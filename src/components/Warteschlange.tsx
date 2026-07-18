'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { UnassignedPayment, OpenItemOption, PaymentMethod } from '@/finanzen/types';
import { METHOD_LABEL } from '@/finanzen/labels';
import { eur } from '@/finanzen/format';
import { assignPaymentAction, recordUnassignedPaymentAction } from '@/app/(shell)/finanzen/actions';

const METHODS: PaymentMethod[] = ['ueberweisung', 'lastschrift', 'kreditkarte', 'paypal', 'sonstige'];

export function Warteschlange({ payments, options }: { payments: UnassignedPayment[]; options: OpenItemOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // Neue nicht zugeordnete Zahlung
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('ueberweisung');
  const [reference, setReference] = useState('');

  const input = 'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

  const run = (fn: () => Promise<unknown>) => start(async () => {
    setError(null);
    try { await fn(); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
  });

  const doAssign = (paymentId: string) => {
    const openItemId = assign[paymentId];
    if (!openItemId) { setError('Zielposten wählen.'); return; }
    run(() => assignPaymentAction(paymentId, openItemId));
  };

  const addUnassigned = () => {
    const a = Number(amount.replace(',', '.'));
    if (!Number.isFinite(a) || a <= 0) { setError('Betrag > 0 angeben.'); return; }
    run(async () => { await recordUnassignedPaymentAction({ amount: a, method, reference: reference || undefined }); setAmount(''); setReference(''); });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="anno mb-2 text-neutral-500">Zahlung erfassen (ohne Zuordnung)</p>
        <div className="flex flex-wrap items-end gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Betrag" className={`${input} w-28`} />
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={input}>
            {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </select>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Verwendungszweck" className={`${input} flex-1`} />
          <button onClick={addUnassigned} disabled={pending} className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Erfassen</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="anno text-left text-neutral-500">
            <th className="py-2">Datum</th><th className="text-right">Betrag</th><th>Methode</th><th>Verwendungszweck</th><th>Zuordnen</th>
          </tr></thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-2 text-neutral-500">{p.paidAt.slice(0, 10)}</td>
                <td className="text-right">{eur(p.amount)}</td>
                <td>{METHOD_LABEL[p.method]}</td>
                <td className="text-neutral-500">{p.reference ?? ''}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <select value={assign[p.id] ?? ''} onChange={(e) => setAssign({ ...assign, [p.id]: e.target.value })} className={input}>
                      <option value="">— Posten wählen —</option>
                      {options.map((o) => <option key={o.id} value={o.id}>{o.label} · Rest {eur(o.remaining)}</option>)}
                    </select>
                    <button onClick={() => doAssign(p.id)} disabled={pending} className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Zuordnen</button>
                  </div>
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-neutral-500">Keine offenen Zahlungen in der Warteschlange.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
