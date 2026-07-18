'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { SortableTh } from './SortableTh';
import { STOCK_SORT, type StockRow } from '@/verfuegbarkeit/types';

export function BestandListe(
  { rows, total, page, pageSize, search, filter }:
  { rows: StockRow[]; total: number; page: number; pageSize: number; search: string; filter: 'all' | 'below' },
) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(search);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const hrefWith = (overrides: Record<string, string>, resetPage = true) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(overrides)) { if (v) p.set(k, v); else p.delete(k); }
    if (resetPage) p.delete('page');
    const s = p.toString();
    return `${pathname}${s ? `?${s}` : ''}`;
  };
  const submitSearch = () => router.push(hrefWith({ q }));

  const chip = (active: boolean, label: string, href: string) => (
    <Link href={href} className={`rounded px-3 py-1 text-sm ${active
      ? 'bg-accent text-white'
      : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'}`}>{label}</Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitSearch(); }}
          placeholder="SKU oder Artikel …"
          className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100" />
        <button onClick={submitSearch}
          className="rounded bg-neutral-200 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-200">Suchen</button>
        {chip(filter === 'all', 'Alle', hrefWith({ filter: '' }))}
        {chip(filter === 'below', 'Unter Meldebestand', hrefWith({ filter: 'below' }))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-neutral-500">
            <SortableTh col="sku" label="SKU" allowed={STOCK_SORT.allowed} fallback={STOCK_SORT.fallback} className="py-2" />
            <SortableTh col="product" label="Artikel" allowed={STOCK_SORT.allowed} fallback={STOCK_SORT.fallback} />
            <SortableTh col="available" label="Verfügbar" allowed={STOCK_SORT.allowed} fallback={STOCK_SORT.fallback} className="text-right" />
            <SortableTh col="reserved" label="Reserviert" allowed={STOCK_SORT.allowed} fallback={STOCK_SORT.fallback} className="text-right" />
            <SortableTh col="reorder" label="Meldebestand" allowed={STOCK_SORT.allowed} fallback={STOCK_SORT.fallback} className="text-right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.variantId} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2">
                <Link href={`/verfuegbarkeit/${r.variantId}`} className="text-brand hover:text-brand-dark">{r.sku}</Link>
              </td>
              <td>{r.productName}</td>
              <td className="text-right">
                {r.belowReorder
                  ? <span className="rounded bg-danger/15 px-2 py-0.5 font-medium text-danger">{r.available}</span>
                  : r.available}
              </td>
              <td className="text-right text-neutral-500">{r.reserved}</td>
              <td className="text-right text-neutral-500">{r.reorderPoint > 0 ? r.reorderPoint : '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="py-6 text-center text-neutral-500">Keine Artikel.</td></tr>
          )}
        </tbody>
      </table>
      <div className="flex items-center gap-3 pt-1 text-sm text-neutral-500">
        {page > 1
          ? <Link href={hrefWith({ page: String(page - 1) }, false)} className="rounded bg-neutral-100 px-3 py-1 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200">← Zurück</Link>
          : <span className="rounded px-3 py-1 text-neutral-400 dark:text-neutral-600">← Zurück</span>}
        <span>{total.toLocaleString('de-DE')} Artikel · Seite {page.toLocaleString('de-DE')} von {totalPages.toLocaleString('de-DE')}</span>
        {page < totalPages
          ? <Link href={hrefWith({ page: String(page + 1) }, false)} className="rounded bg-neutral-100 px-3 py-1 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200">Weiter →</Link>
          : <span className="rounded px-3 py-1 text-neutral-400 dark:text-neutral-600">Weiter →</span>}
      </div>
    </div>
  );
}
