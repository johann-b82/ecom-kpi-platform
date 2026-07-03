'use client';
import { ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip } from 'recharts';
import type { NamedValue } from '@/brickpm/analytics';
import { ChartCard } from '@/components/charts/ChartCard';
import { BRAND, CATEGORICAL, TICK, TOOLTIP_LABEL_STYLE, eur, pct, num } from '@/components/charts/chart-style';

function BarCard({ title, data, yWidth, fmt }: { title: string; data: NamedValue[]; yWidth: number; fmt: (n: number) => string }) {
  return (
    <ChartCard title={title}>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="name" tick={TICK} interval={0} />
            <YAxis tick={TICK} width={yWidth} tickFormatter={(n) => fmt(Number(n))} />
            <Tooltip formatter={(v) => [fmt(Number(v)), title]} labelStyle={TOOLTIP_LABEL_STYLE} />
            <Bar dataKey="value" fill={BRAND} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function BpmAnalyticsCharts({
  revenue, marge, sell, status,
}: { revenue: NamedValue[]; marge: NamedValue[]; sell: NamedValue[]; status: NamedValue[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BarCard title="Aktions-Zielumsatz nach Kategorie" data={revenue} yWidth={72} fmt={eur} />
      <BarCard title="Ø Marge nach Serie" data={marge} yWidth={56} fmt={pct} />
      <BarCard title="Sell-through je Aktion" data={sell} yWidth={56} fmt={pct} />
      <ChartCard title="Produkt-Status">
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={status} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" isAnimationActive={false}>
                {status.map((_, i) => <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [num(Number(v)), n as string]} labelStyle={TOOLTIP_LABEL_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}
