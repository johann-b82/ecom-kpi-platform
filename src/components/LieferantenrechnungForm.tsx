'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ContactOption } from '@/finanzen/types';
import { createKreditorInvoiceAction } from '@/app/(shell)/finanzen/actions';

export function LieferantenrechnungForm({ contacts }: { contacts: ContactOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [supplierId, setSupplierId] = useState(contacts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  const input = 'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

  const submit = () => {
    const a = Number(amount.replace(',', '.'));
    if (!supplierId || !Number.isFinite(a) || a <= 0 || !dueDate || !reference) {
      setError('Lieferant, Betrag > 0, Fälligkeit und Referenz angeben.'); return;
    }
    setError(null);
    start(async () => {
      try {
        const id = await createKreditorInvoiceAction({ supplierId, amount: a, dueDate, reference });
        router.push(`/finanzen/${id}`);
      } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    });
  };

  return (
    <div className="max-w-lg space-y-3 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <label className="block text-sm">
        <span className="anno text-neutral-500">Lieferant</span>
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={`${input} mt-1 w-full`}>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        <span className="anno text-neutral-500">Betrag (netto)</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className={`${input} mt-1 w-full`} />
      </label>
      <label className="block text-sm">
        <span className="anno text-neutral-500">Fällig am</span>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${input} mt-1 w-full`} />
      </label>
      <label className="block text-sm">
        <span className="anno text-neutral-500">Referenz (Rechnungsnr.)</span>
        <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="ER-…" className={`${input} mt-1 w-full`} />
      </label>
      <button onClick={submit} disabled={pending} className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Rechnung anlegen</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
