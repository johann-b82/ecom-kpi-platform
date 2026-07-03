'use client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { ChartCard } from '@/components/charts/ChartCard';
import { BRAND, MUTED, TICK, TOOLTIP_LABEL_STYLE, num } from '@/components/charts/chart-style';

export function BpmStockChart({ data }: { data: { name: string; Bestand: number; Mindestbestand: number }[] }) {
  return (
    <ChartCard title="Bestand vs. Mindestbestand">
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="name" tick={TICK} interval={0} />
            <YAxis tick={TICK} width={48} tickFormatter={(n) => num(Number(n))} />
            <Tooltip formatter={(v, n) => [num(Number(v)), n as string]} labelStyle={TOOLTIP_LABEL_STYLE} />
            <Legend />
            <Bar dataKey="Bestand" fill={BRAND} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="Mindestbestand" fill={MUTED} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
