'use client';
import { useState } from 'react';
import { LineChart, Card } from '@tremor/react';
import type { BpmProduct } from '@/brickpm/types';
import type { PricePoint } from '@/brickpm/history';

const selectClass =
  'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

export function BpmPriceHistory({ products, history }: { products: BpmProduct[]; history: PricePoint[] }) {
  const [productId, setProductId] = useState(products[0]?.id ?? '');

  const rows = history
    .filter((h) => h.productId === productId)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((h) => ({
      date: h.date,
      'Preis (€)': h.price,
      'Kosten (€)': h.cost,
      'Marge (%)': h.price > 0 ? Math.round(((h.price - h.cost) / h.price) * 1000) / 10 : 0,
    }));

  return (
    <div className="space-y-4">
      <label className="block max-w-sm text-sm">
        <span className="mb-1 block text-neutral-500">Produkt</span>
        <select className={`${selectClass} w-full`} value={productId} onChange={(e) => setProductId(e.target.value)}>
          {products.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.name}</option>)}
        </select>
      </label>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-white dark:bg-neutral-900">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Preis &amp; Kosten (€)</p>
          <LineChart className="mt-3 h-64" data={rows} index="date" categories={['Preis (€)', 'Kosten (€)']}
            colors={['blue', 'gray']} valueFormatter={(n) => `${n.toLocaleString('de-DE')} €`} yAxisWidth={64} />
        </Card>
        <Card className="bg-white dark:bg-neutral-900">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Marge-Verlauf (%)</p>
          <LineChart className="mt-3 h-64" data={rows} index="date" categories={['Marge (%)']}
            colors={['emerald']} valueFormatter={(n) => `${n} %`} showLegend={false} yAxisWidth={48} />
        </Card>
      </div>
    </div>
  );
}
