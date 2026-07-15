'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ContactOption, PurchaseOrderOption } from '@/finanzen/types';
import { createKreditorInvoiceAction } from '@/app/(shell)/finanzen/actions';

export function LieferantenrechnungForm({ contacts, purchaseOrders }:
  { contacts: ContactOption[]; purchaseOrders: PurchaseOrderOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [supplierId, setSupplierId] = useState(contacts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reference, setReference] = useState('');
  // Bestellung (optional) — auf den gewählten Lieferanten gefiltert + Suche auf die B-Nummer.
  const [poId, setPoId] = useState('');
  const [poSearch, setPoSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const input = 'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

  const supplierPOs = purchaseOrders.filter((po) => po.supplierId === supplierId);
  const filteredPOs = supplierPOs.filter((po) =>
    !poSearch || po.number.toLowerCase().includes(poSearch.toLowerCase()));

  const changeSupplier = (id: string) => { setSupplierId(id); setPoId(''); setPoSearch(''); };

  const submit = () => {
    const a = Number(amount.replace(',', '.'));
    if (!supplierId || !Number.isFinite(a) || a <= 0 || !dueDate || !reference) {
      setError('Lieferant, Betrag > 0, Fälligkeit und Referenz angeben.'); return;
    }
    setError(null);
    start(async () => {
      try {
        const id = await createKreditorInvoiceAction({
          supplierId, amount: a, dueDate, reference, purchaseOrderId: poId || null,
        });
        router.push(`/finanzen/${id}`);
      } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    });
  };

  return (
    <div className="max-w-lg space-y-3 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <label className="block text-sm">
        <span className="anno text-neutral-500">Lieferant</span>
        <select value={supplierId} onChange={(e) => changeSupplier(e.target.value)} className={`${input} mt-1 w-full`}>
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
      <div className="block text-sm">
        <span className="anno text-neutral-500">Bestellung (optional)</span>
        {supplierPOs.length === 0 ? (
          <p className="mt-1 text-neutral-500">Keine Bestellungen für diesen Lieferanten.</p>
        ) : (
          <div className="mt-1 space-y-2">
            <input
              value={poSearch} onChange={(e) => setPoSearch(e.target.value)} placeholder="B-Nummer suchen …"
              className={`${input} w-full`}
            />
            <select value={poId} onChange={(e) => setPoId(e.target.value)} className={`${input} w-full`}>
              <option value="">— keine Verknüpfung —</option>
              {filteredPOs.map((po) => (
                <option key={po.id} value={po.id}>{po.number} · {po.status}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <button onClick={submit} disabled={pending} className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Rechnung anlegen</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
