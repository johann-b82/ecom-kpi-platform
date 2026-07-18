'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ORDER_SORT, type OrderRow, type OrderChannel, type OrderStatus } from '@/verkauf/types';
import { STATUS_LABEL } from '@/verkauf/labels';
import { SortableTh } from './SortableTh';
import { Spur } from './Spur';

const CHANNELS: (OrderChannel | '')[] = ['', 'shop', 'b2b_portal', 'telefon', 'marktplatz', 'manuell'];
const CH_LABEL: Record<string, string> = {
  '': 'Alle', shop: 'Shop', b2b_portal: 'B2B', telefon: 'Telefon', marktplatz: 'Marktplatz', manuell: 'Manuell',
};
const STATUSES: OrderStatus[] = ['angebot', 'auftrag', 'versendet', 'rechnung_gestellt', 'bezahlt', 'retoure', 'storniert'];

function href(p: { channel: string; search: string; status: string; from: string; to: string; page: number; sort: string }) {
  const q = new URLSearchParams();
  if (p.channel) q.set('channel', p.channel);
  if (p.search) q.set('q', p.search);
  if (p.status) q.set('status', p.status);
  if (p.from) q.set('from', p.from);
  if (p.to) q.set('to', p.to);
  if (p.sort) q.set('sort', p.sort);
  if (p.page > 1) q.set('page', String(p.page));
  const s = q.toString();
  return `/verkauf/belege${s ? `?${s}` : ''}`;
}

export function VerkaufList({ rows, total, page, pageSize, channel, search, status, from, to }:
  { rows: OrderRow[]; total: number; page: number; pageSize: number; channel: OrderChannel | '';
    search: string; status: OrderStatus | ''; from: string; to: string }) {
  const router = useRouter();
  const sort = useSearchParams().get('sort') ?? '';
  const [q, setQ] = useState(search);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const base = { channel, status, from, to, sort };
  const go = (patch: Partial<Parameters<typeof href>[0]>) =>
    router.push(href({ ...base, search, from, to, page: 1, ...patch }));

  const dateInput =
    'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') go({ search: q, from: f, to: t }); }}
          placeholder="Nummer oder Kunde …"
          className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100" />
        <select value={status} onChange={(e) => go({ status: e.target.value })}
          className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100">
          <option value="">Alle Status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <input type="date" value={f} onChange={(e) => setF(e.target.value)} className={dateInput} aria-label="Von" />
        <span className="text-neutral-400">–</span>
        <input type="date" value={t} onChange={(e) => setT(e.target.value)} className={dateInput} aria-label="Bis" />
        <button onClick={() => go({ search: q, from: f, to: t })}
          className="rounded bg-neutral-200 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-200">Filtern</button>
        {CHANNELS.map((c) => (
          <Link key={c} href={href({ ...base, channel: c, search, from, to, page: 1 })}
            className={`rounded px-3 py-1 text-sm ${channel === c
              ? 'bg-accent text-white'
              : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'}`}>{CH_LABEL[c]}</Link>
        ))}
        <Link href="/verkauf/neu"
          className="ml-auto rounded bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent-hover">Neuer Beleg</Link>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-neutral-500">
          <SortableTh col="number" label="Nummer" allowed={ORDER_SORT.allowed} fallback={ORDER_SORT.fallback} className="py-2" />
          <SortableTh col="contact" label="Kunde" allowed={ORDER_SORT.allowed} fallback={ORDER_SORT.fallback} />
          <SortableTh col="channel" label="Kanal" allowed={ORDER_SORT.allowed} fallback={ORDER_SORT.fallback} />
          <SortableTh col="status" label="Status" allowed={ORDER_SORT.allowed} fallback={ORDER_SORT.fallback} />
          <th className="anno">Spur</th>
          <SortableTh col="placed" label="Datum" allowed={ORDER_SORT.allowed} fallback={ORDER_SORT.fallback} />
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2"><Link href={`/verkauf/belege/${r.id}`} className="text-brand hover:text-brand-dark">{r.number}</Link></td>
              <td>{r.contactName}</td>
              <td>{CH_LABEL[r.channel]}</td>
              <td>{STATUS_LABEL[r.status]}</td>
              <td><Spur stages={r.stages} /></td>
              <td className="text-neutral-500">{(r.placedAt ?? r.createdAt).slice(0, 10)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="py-6 text-center text-neutral-500">Keine Sales.</td></tr>
          )}
        </tbody>
      </table>
      <div className="flex items-center gap-3 pt-1 text-sm text-neutral-500">
        {page > 1
          ? <Link href={href({ ...base, search, from, to, page: page - 1 })} className="rounded bg-neutral-100 px-3 py-1 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200">← Zurück</Link>
          : <span className="rounded px-3 py-1 text-neutral-400 dark:text-neutral-600">← Zurück</span>}
        <span>{total.toLocaleString('de-DE')} Sales · Seite {page.toLocaleString('de-DE')} von {totalPages.toLocaleString('de-DE')}</span>
        {page < totalPages
          ? <Link href={href({ ...base, search, from, to, page: page + 1 })} className="rounded bg-neutral-100 px-3 py-1 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200">Weiter →</Link>
          : <span className="rounded px-3 py-1 text-neutral-400 dark:text-neutral-600">Weiter →</span>}
      </div>
    </div>
  );
}
