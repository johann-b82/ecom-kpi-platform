'use client';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { ChartCard } from '@/components/charts/ChartCard';
import { BRAND, TICK, num } from '@/components/charts/chart-style';

const dm = (d: string) => d.slice(8) + '.' + d.slice(5, 7); // dd.mm

export function PhaseTrendChart({ series, metric }: { series: { date: string; value: number }[]; metric: string }) {
  return (
    <ChartCard title={`Verlauf: ${metric} (30 Tage)`} className="mt-6">
      <div className="mt-2 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="phaseArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
                <stop offset="100%" stopColor={BRAND} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={TICK} minTickGap={24} tickFormatter={dm} />
            <YAxis tick={TICK} width={48} tickFormatter={(n) => num(Number(n))} />
            <Tooltip formatter={(v) => [num(Number(v)), metric]} labelFormatter={(l) => String(l)} />
            <Area type="monotone" dataKey="value" stroke={BRAND} strokeWidth={2} fill="url(#phaseArea)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
