'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ContactAddress, ContactDetail, ContactPerson } from '@/kontakte/types';
import type { ViesResult } from '@/lib/vies';
import {
  updateContactAction, saveAddressAction, removeAddressAction,
  savePersonAction, removePersonAction, checkVatAction,
} from '@/app/(shell)/kontakte/actions';

const inputCls =
  'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

type AddrDraft = Omit<ContactAddress, 'id'> & { id?: string };
type PersonDraft = Omit<ContactPerson, 'id'> & { id?: string };

export function KontakteDetail({
  contact,
  priceLists = [],
}: {
  contact: ContactDetail;
  priceLists?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [vies, setVies] = useState<ViesResult | null>(null);

  const [form, setForm] = useState({
    name: contact.name,
    legalForm: contact.legalForm ?? '',
    isCustomer: contact.isCustomer,
    isSupplier: contact.isSupplier,
    vatId: contact.vatId ?? '',
    taxCountry: contact.taxCountry ?? '',
    paymentTerms: contact.paymentTerms,
    priceListId: contact.priceListId ?? '',
    currency: contact.currency,
    language: contact.language,
    status: contact.status,
    notes: contact.notes ?? '',
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const [addresses, setAddresses] = useState<AddrDraft[]>(contact.addresses);
  const [persons, setPersons] = useState<PersonDraft[]>(contact.persons);

  const saveContact = () =>
    start(async () => {
      await updateContactAction(contact.id, {
        name: form.name,
        legalForm: form.legalForm || null,
        isCustomer: form.isCustomer,
        isSupplier: form.isSupplier,
        vatId: form.vatId || null,
        taxCountry: form.taxCountry || null,
        paymentTerms: Number(form.paymentTerms),
        priceListId: form.priceListId || null,
        currency: form.currency,
        language: form.language,
        status: form.status,
        notes: form.notes || null,
      });
      router.refresh();
    });

  const checkVat = () => {
    if (!form.vatId) { setVies(null); return; }
    start(async () => setVies(await checkVatAction(form.vatId)));
  };

  const saveAddr = (a: AddrDraft) =>
    start(async () => { await saveAddressAction(a); router.refresh(); });
  const removeAddr = (a: AddrDraft) =>
    start(async () => {
      if (a.id) await removeAddressAction(a.id, contact.id);
      setAddresses((xs) => xs.filter((x) => x !== a));
      router.refresh();
    });
  const savePerson = (p: PersonDraft) =>
    start(async () => { await savePersonAction(p); router.refresh(); });
  const removePerson = (p: PersonDraft) =>
    start(async () => {
      if (p.id) await removePersonAction(p.id, contact.id);
      setPersons((xs) => xs.filter((x) => x !== p));
      router.refresh();
    });

  const patchAddr = (i: number, patch: Partial<AddrDraft>) =>
    setAddresses((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const patchPerson = (i: number, patch: Partial<PersonDraft>) =>
    setPersons((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const sectionCls = 'rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900';
  const anno = 'anno text-neutral-500';

  return (
    <div className="space-y-5">
      {/* Kopf */}
      <div className={sectionCls}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input className={`${inputCls} text-base font-semibold`} value={form.name}
              onChange={(e) => set('name', e.target.value)} />
            <span className="font-mono text-sm text-neutral-500">{contact.number}</span>
          </div>
          <button onClick={saveContact} disabled={pending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
            Speichern
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isCustomer}
              onChange={(e) => set('isCustomer', e.target.checked)} /> Kunde
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isSupplier}
              onChange={(e) => set('isSupplier', e.target.checked)} /> Lieferant
          </label>
          <input className={inputCls} placeholder="Rechtsform" value={form.legalForm}
            onChange={(e) => set('legalForm', e.target.value)} />
          <select className={inputCls} value={form.status}
            onChange={(e) => set('status', e.target.value as 'aktiv' | 'inaktiv')}>
            <option value="aktiv">aktiv</option>
            <option value="inaktiv">inaktiv</option>
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className={inputCls} placeholder="USt-IdNr." value={form.vatId}
            onChange={(e) => set('vatId', e.target.value)} onBlur={checkVat} />
          {vies && (vies.valid
            ? <span className="text-sm text-green-600 dark:text-green-500">✓ {vies.name ?? 'gültig'}</span>
            : <span className="text-sm text-amber-600 dark:text-amber-500">⚠ {vies.error ?? 'ungültig'}</span>)}
        </div>

        {form.isSupplier && (
          <div className="mt-3">
            <p className={`${anno} mb-1`}>Lieferant</p>
            <input className={inputCls} placeholder="Steuerland (ISO-2)" maxLength={2} value={form.taxCountry}
              onChange={(e) => set('taxCountry', e.target.value.toUpperCase())} />
          </div>
        )}
      </div>

      {/* Adressen */}
      <div className={sectionCls}>
        <div className="mb-2 flex items-center justify-between">
          <p className={anno}>Adressen</p>
          <button className="text-sm text-brand hover:text-brand-dark"
            onClick={() => setAddresses((xs) => [...xs, {
              contactId: contact.id, type: 'rechnung', street: '', zip: '', city: '', country: '', isDefault: false,
            }])}>+ Adresse</button>
        </div>
        <div className="space-y-2">
          {addresses.map((a, i) => (
            <div key={a.id ?? `new-${i}`} className="flex flex-wrap items-center gap-2">
              <select className={inputCls} value={a.type}
                onChange={(e) => patchAddr(i, { type: e.target.value as 'rechnung' | 'lieferung' })}>
                <option value="rechnung">Rechnung</option>
                <option value="lieferung">Lieferung</option>
              </select>
              <input className={inputCls} placeholder="Straße" value={a.street ?? ''}
                onChange={(e) => patchAddr(i, { street: e.target.value })} />
              <input className={`${inputCls} w-20`} placeholder="PLZ" value={a.zip ?? ''}
                onChange={(e) => patchAddr(i, { zip: e.target.value })} />
              <input className={inputCls} placeholder="Ort" value={a.city ?? ''}
                onChange={(e) => patchAddr(i, { city: e.target.value })} />
              <input className={`${inputCls} w-16`} placeholder="Land" maxLength={2} value={a.country ?? ''}
                onChange={(e) => patchAddr(i, { country: e.target.value.toUpperCase() })} />
              <button className="text-sm text-brand hover:text-brand-dark" disabled={pending}
                onClick={() => saveAddr(a)}>Speichern</button>
              <button className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                disabled={pending} onClick={() => removeAddr(a)}>Entfernen</button>
            </div>
          ))}
          {addresses.length === 0 && <p className="text-sm text-neutral-500">Keine Adressen.</p>}
        </div>
      </div>

      {/* Ansprechpartner */}
      <div className={sectionCls}>
        <div className="mb-2 flex items-center justify-between">
          <p className={anno}>Ansprechpartner</p>
          <button className="text-sm text-brand hover:text-brand-dark"
            onClick={() => setPersons((xs) => [...xs, {
              contactId: contact.id, name: '', email: '', phone: '', role: '',
            }])}>+ Ansprechpartner</button>
        </div>
        <div className="space-y-2">
          {persons.map((p, i) => (
            <div key={p.id ?? `new-${i}`} className="flex flex-wrap items-center gap-2">
              <input className={inputCls} placeholder="Name" value={p.name}
                onChange={(e) => patchPerson(i, { name: e.target.value })} />
              <input className={inputCls} placeholder="E-Mail" value={p.email ?? ''}
                onChange={(e) => patchPerson(i, { email: e.target.value })} />
              <input className={inputCls} placeholder="Telefon" value={p.phone ?? ''}
                onChange={(e) => patchPerson(i, { phone: e.target.value })} />
              <input className={inputCls} placeholder="Rolle" value={p.role ?? ''}
                onChange={(e) => patchPerson(i, { role: e.target.value })} />
              <button className="text-sm text-brand hover:text-brand-dark" disabled={pending}
                onClick={() => savePerson(p)}>Speichern</button>
              <button className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                disabled={pending} onClick={() => removePerson(p)}>Entfernen</button>
            </div>
          ))}
          {persons.length === 0 && <p className="text-sm text-neutral-500">Keine Ansprechpartner.</p>}
        </div>
      </div>

      {/* Konditionen */}
      <div className={sectionCls}>
        <p className={`${anno} mb-2`}>Konditionen</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            Zahlungsziel
            <input type="number" className={`${inputCls} w-20`} value={form.paymentTerms}
              onChange={(e) => set('paymentTerms', Number(e.target.value))} /> Tage
          </label>
          <label className="flex items-center gap-2 text-sm">
            Preisliste
            <select className={inputCls} value={form.priceListId}
              onChange={(e) => set('priceListId', e.target.value)}>
              <option value="">— keine —</option>
              {priceLists.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            Währung
            <input className={`${inputCls} w-20`} maxLength={3} value={form.currency}
              onChange={(e) => set('currency', e.target.value.toUpperCase())} />
          </label>
        </div>
      </div>

      {/* Historie */}
      <div className={sectionCls}>
        <p className={`${anno} mb-2`}>Historie</p>
        <p className="text-sm text-neutral-500">Historie ab Phase 2.</p>
      </div>
    </div>
  );
}
