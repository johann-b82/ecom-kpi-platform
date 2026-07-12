'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { ProductListItem } from '@/katalog/types';
import { LIFECYCLE_STATUSES, type LifecycleStatus } from '@/katalog/lifecycle';

export function KatalogList({ products }: { products: ProductListItem[] }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<LifecycleStatus | ''>('');

  const rows = products.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (status && p.lifecycleStatus !== status) return false;
    return true;
  });

  const chip = (v: LifecycleStatus | '', label: string) => (
    <button
      onClick={() => setStatus(v)}
      className={`rounded px-3 py-1 text-sm ${status === v
        ? 'bg-accent text-white'
        : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'}`}
    >{label}</button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen …"
          className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100"
        />
        {chip('', 'Alle')}
        {LIFECYCLE_STATUSES.map((s) => chip(s, s))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="anno text-left text-neutral-500">
            <th className="py-2">Bild</th><th>Name</th><th>Varianten</th><th>Status</th><th>EK ab</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2">
                {p.imageUrl
                  ? <img src={p.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
                  : <span className="text-neutral-400">—</span>}
              </td>
              <td>
                <Link href={`/katalog/${p.id}`} className="text-brand hover:text-brand-dark">{p.name}</Link>
              </td>
              <td>{p.variantCount}</td>
              <td>{p.lifecycleStatus}</td>
              <td className="text-neutral-500">{p.minPurchasePrice ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
