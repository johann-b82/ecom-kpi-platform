'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { OrderRow, OrderChannel, OrderStatus } from '@/verkauf/types';
import { Spur } from './Spur';

const CHANNELS: (OrderChannel | '')[] = ['', 'shop', 'b2b_portal', 'telefon', 'marktplatz', 'manuell'];
const CH_LABEL: Record<string, string> = {
  '': 'Alle', shop: 'Shop', b2b_portal: 'B2B', telefon: 'Telefon', marktplatz: 'Marktplatz', manuell: 'Manuell',
};

export function VerkaufList({ rows }: { rows: OrderRow[] }) {
  const [q, setQ] = useState('');
  const [ch, setCh] = useState<OrderChannel | ''>('');

  const filtered = rows.filter((r) => {
    if (ch && r.channel !== ch) return false;
    if (q && !(`${r.number} ${r.contactName}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nummer oder Kunde …"
          className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100" />
        {CHANNELS.map((c) => (
          <button key={c} onClick={() => setCh(c)}
            className={`rounded px-3 py-1 text-sm ${ch === c
              ? 'bg-accent text-white'
              : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'}`}>{CH_LABEL[c]}</button>
        ))}
        <Link href="/verkauf/neu"
          className="ml-auto rounded bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent-hover">Neuer Beleg</Link>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="anno text-left text-neutral-500">
          <th className="py-2">Nummer</th><th>Kunde</th><th>Kanal</th><th>Status</th><th>Spur</th><th>Datum</th>
        </tr></thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2"><Link href={`/verkauf/${r.id}`} className="text-brand hover:text-brand-dark">{r.number}</Link></td>
              <td>{r.contactName}</td>
              <td>{CH_LABEL[r.channel]}</td>
              <td>{r.status}</td>
              <td><Spur stages={r.stages} /></td>
              <td className="text-neutral-500">{r.createdAt.slice(0, 10)}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={6} className="py-6 text-center text-neutral-500">Keine Belege.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
