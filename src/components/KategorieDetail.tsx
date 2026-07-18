'use client';
import Link from 'next/link';
import { StockSalesChart } from '@/components/StockSalesChart';
import { num } from '@/components/charts/chart-style';
import type { SeriesPoint, CategoryVariantRow } from '@/verfuegbarkeit/types';

export function KategorieDetail({ category, stock, sales, variants }: {
  category: string; stock: SeriesPoint[]; sales: SeriesPoint[]; variants: CategoryVariantRow[];
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/verfuegbarkeit" className="text-brand hover:text-brand-dark">← Übersicht</Link>
        <h2 className="text-xl font-bold tracking-tight">{category}</h2>
      </div>
      <StockSalesChart stock={stock} sales={sales} />
      <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
              <th className="px-4 py-2 font-medium">SKU</th>
              <th className="px-4 py-2 font-medium">Artikel</th>
              <th className="px-4 py-2 text-right font-medium">Bestand</th>
              <th className="px-4 py-2 text-right font-medium">Meldebestand</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.variantId} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
                <td className="px-4 py-2">
                  <Link href={`/verfuegbarkeit/${v.variantId}`} className="text-brand hover:text-brand-dark">{v.sku}</Link>
                </td>
                <td className="px-4 py-2">{v.productName}</td>
                <td className={`px-4 py-2 text-right tabular-nums ${v.belowReorder ? 'font-semibold text-brand' : ''}`}>
                  {num(v.onHand)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{v.reorderPoint > 0 ? num(v.reorderPoint) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
