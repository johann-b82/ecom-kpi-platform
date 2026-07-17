'use client';
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { ChartCard } from '@/components/charts/ChartCard';
import { BRAND, MUTED, TICK, TOOLTIP_LABEL_STYLE, num } from '@/components/charts/chart-style';
import type { SeriesPoint } from '@/verfuegbarkeit/types';

// Bestands- und Verkaufsreihe auf gemeinsamer Zeitachse zusammenführen.
function merge(stock: SeriesPoint[], sales: SeriesPoint[]) {
  const byDate = new Map<string, { date: string; Bestand?: number; Verkauf?: number }>();
  for (const p of stock) byDate.set(p.date, { date: p.date, Bestand: p.value });
  for (const p of sales) {
    const row = byDate.get(p.date) ?? { date: p.date };
    row.Verkauf = p.value; byDate.set(p.date, row);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function StockSalesChart({ stock, sales }: { stock: SeriesPoint[]; sales: SeriesPoint[] }) {
  const data = merge(stock, sales);
  if (data.length === 0) {
    return (
      <ChartCard title="Bestands- & Verkaufsverlauf">
        <p className="mt-3 text-sm text-neutral-500">
          Noch keine Verlaufsdaten. Die Bestandskurve beginnt mit dem ersten täglichen Snapshot.
        </p>
      </ChartCard>
    );
  }
  return (
    <ChartCard title="Bestands- & Verkaufsverlauf">
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e2d9" vertical={false} />
            <XAxis dataKey="date" tick={TICK} minTickGap={24} />
            <YAxis tick={TICK} width={48} tickFormatter={(n) => num(Number(n))} />
            <Tooltip formatter={(v, n) => [num(Number(v)), n as string]} labelStyle={TOOLTIP_LABEL_STYLE} />
            <Legend />
            <Bar dataKey="Verkauf" fill={MUTED} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Line dataKey="Bestand" stroke={BRAND} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
