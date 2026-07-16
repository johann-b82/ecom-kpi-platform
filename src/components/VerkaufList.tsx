'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ORDER_SORT, type OrderRow, type OrderChannel } from '@/verkauf/types';
import { SortableTh } from './SortableTh';
import { Spur } from './Spur';

const CHANNELS: (OrderChannel | '')[] = ['', 'shop', 'b2b_portal', 'telefon', 'marktplatz', 'manuell'];
const CH_LABEL: Record<string, string> = {
  '': 'Alle', shop: 'Shop', b2b_portal: 'B2B', telefon: 'Telefon', marktplatz: 'Marktplatz', manuell: 'Manuell',
};

function href(params: { channel: string; search: string; page: number; sort: string }) {
  const q = new URLSearchParams();
  if (params.channel) q.set('channel', params.channel);
  if (params.search) q.set('q', params.search);
  if (params.sort) q.set('sort', params.sort);
  if (params.page > 1) q.set('page', String(params.page));
  const s = q.toString();
  return `/verkauf/belege${s ? `?${s}` : ''}`;
}

export function VerkaufList({ rows, total, page, pageSize, channel, search }:
  { rows: OrderRow[]; total: number; page: number; pageSize: number; channel: OrderChannel | ''; search: string }) {
  const router = useRouter();
  const sort = useSearchParams().get('sort') ?? '';
  const [q, setQ] = useState(search);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const submitSearch = () => router.push(href({ channel, search: q, page: 1, sort }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitSearch(); }}
          placeholder="Nummer oder Kunde …"
          className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100" />
        <button onClick={submitSearch}
          className="rounded bg-neutral-200 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-200">Suchen</button>
        {CHANNELS.map((c) => (
          <Link key={c} href={href({ channel: c, search, page: 1, sort })}
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
              <td>{r.status}</td>
              <td><Spur stages={r.stages} /></td>
              <td className="text-neutral-500">{(r.placedAt ?? r.createdAt).slice(0, 10)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="py-6 text-center text-neutral-500">Keine Belege.</td></tr>
          )}
        </tbody>
      </table>
      <div className="flex items-center gap-3 pt-1 text-sm text-neutral-500">
        {page > 1
          ? <Link href={href({ channel, search, page: page - 1, sort })} className="rounded bg-neutral-100 px-3 py-1 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200">← Zurück</Link>
          : <span className="rounded px-3 py-1 text-neutral-400 dark:text-neutral-600">← Zurück</span>}
        <span>{total.toLocaleString('de-DE')} Belege · Seite {page.toLocaleString('de-DE')} von {totalPages.toLocaleString('de-DE')}</span>
        {page < totalPages
          ? <Link href={href({ channel, search, page: page + 1, sort })} className="rounded bg-neutral-100 px-3 py-1 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200">Weiter →</Link>
          : <span className="rounded px-3 py-1 text-neutral-400 dark:text-neutral-600">Weiter →</span>}
      </div>
    </div>
  );
}
