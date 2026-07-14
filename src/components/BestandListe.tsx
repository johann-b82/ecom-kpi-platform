'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { StockRow } from '@/verfuegbarkeit/types';

export function BestandListe({ rows, belowCount }: { rows: StockRow[]; belowCount: number }) {
  const [q, setQ] = useState('');
  const filtered = rows.filter((r) =>
    !q || `${r.sku} ${r.productName}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU oder Artikel …"
          className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100" />
        <span className="anno text-neutral-500">{belowCount} unter Meldebestand</span>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="anno text-left text-neutral-500">
          <th className="py-2">SKU</th><th>Artikel</th>
          <th className="text-right">Verfügbar</th><th className="text-right">Reserviert</th>
          <th className="text-right">Meldebestand</th>
        </tr></thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.variantId} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2">
                <Link href={`/verfuegbarkeit/${r.variantId}`} className="text-brand hover:text-brand-dark">{r.sku}</Link>
              </td>
              <td>{r.productName}</td>
              <td className="text-right">
                {r.belowReorder
                  ? <span className="rounded bg-accent/15 px-2 py-0.5 font-medium text-accent">{r.available}</span>
                  : r.available}
              </td>
              <td className="text-right text-neutral-500">{r.reserved}</td>
              <td className="text-right text-neutral-500">{r.reorderPoint > 0 ? r.reorderPoint : '—'}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={5} className="py-6 text-center text-neutral-500">Keine Artikel.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
