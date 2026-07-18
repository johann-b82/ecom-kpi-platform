'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ProductListItem } from '@/katalog/types';
import { LIFECYCLE_STATUSES, type LifecycleStatus } from '@/katalog/lifecycle';
import { createProductAction } from '@/app/(shell)/katalog/actions';
import { useClientSort, ClientSortableTh } from '@/components/useClientSort';

export function KatalogList({ products }: { products: ProductListItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<LifecycleStatus | ''>('');
  // Neuer Artikel
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [newStatus, setNewStatus] = useState<LifecycleStatus>('konzept');
  const [error, setError] = useState<string | null>(null);

  const input = 'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

  const filtered = products.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (status && p.lifecycleStatus !== status) return false;
    return true;
  });
  const { sorted: rows, sort, onSort } = useClientSort(filtered, {
    name: (p) => p.name,
    variants: (p) => p.variantCount,
    status: (p) => p.lifecycleStatus,
    ek: (p) => p.minPurchasePrice ?? null,
  }, { col: 'name', dir: 'asc' });

  const create = () => {
    if (!name.trim()) { setError('Name angeben.'); return; }
    setError(null);
    start(async () => {
      try {
        const p = await createProductAction({ name: name.trim(), lifecycleStatus: newStatus });
        router.push(`/katalog/${p.id}`);
      } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    });
  };

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
      <div className="flex items-center justify-end">
        <button
          onClick={() => { setCreating((v) => !v); setError(null); }}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >{creating ? 'Abbrechen' : 'Neuer Artikel'}</button>
      </div>

      {creating && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="anno mb-2 text-neutral-500">Neuen Artikel anlegen</p>
          <div className="flex flex-wrap items-end gap-2">
            <input
              value={name} onChange={(e) => setName(e.target.value)} placeholder="Name"
              className={`${input} flex-1`}
            />
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as LifecycleStatus)} className={input}>
              {LIFECYCLE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              onClick={create} disabled={pending}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >Anlegen</button>
          </div>
          <p className="anno mt-2 text-neutral-500">Varianten, Preise und Bild fügst du danach im Detail hinzu.</p>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen …"
          className={input}
        />
        {chip('', 'Alle')}
        {LIFECYCLE_STATUSES.map((s) => chip(s, s))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-neutral-500">
            <th className="anno py-2">Bild</th>
            <ClientSortableTh col="name" label="Name" sort={sort} onSort={onSort} />
            <ClientSortableTh col="variants" label="Varianten" sort={sort} onSort={onSort} />
            <ClientSortableTh col="status" label="Status" sort={sort} onSort={onSort} />
            <ClientSortableTh col="ek" label="EK ab" sort={sort} onSort={onSort} />
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
