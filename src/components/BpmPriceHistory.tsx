'use client';
import { useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { ChartCard } from '@/components/charts/ChartCard';
import { BRAND, MUTED, TICK, TOOLTIP_LABEL_STYLE, eur, pct } from '@/components/charts/chart-style';
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
        <ChartCard title="Preis & Kosten (€)">
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" tick={TICK} minTickGap={24} />
                <YAxis tick={TICK} width={64} tickFormatter={(n) => eur(Number(n))} />
                <Tooltip formatter={(v, n) => [eur(Number(v)), n as string]} labelStyle={TOOLTIP_LABEL_STYLE} />
                <Legend />
                <Line type="monotone" dataKey="Preis (€)" stroke={BRAND} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="Kosten (€)" stroke={MUTED} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="Marge-Verlauf (%)">
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" tick={TICK} minTickGap={24} />
                <YAxis tick={TICK} width={48} tickFormatter={(n) => pct(Number(n))} />
                <Tooltip formatter={(v) => [pct(Number(v)), 'Marge']} labelStyle={TOOLTIP_LABEL_STYLE} />
                <Line type="monotone" dataKey="Marge (%)" stroke={BRAND} strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
