'use client';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { ChartCard } from './ChartCard';
import { BRAND, MUTED, TICK, TOOLTIP_LABEL_STYLE, num, eur } from './chart-style';
import { formatDeDate } from '@/lib/dates';
import type { SeriesPoint } from '@/verfuegbarkeit/types';

// Einlinige KPI-Verlaufskurve für die aufklappbaren KPI-Kacheln.
export function KpiLineChart({ title, series, format = 'num' }:
  { title: string; series: SeriesPoint[]; format?: 'num' | 'eur' }) {
  const fmt = format === 'eur' ? eur : num;
  if (series.length === 0) {
    return (
      <ChartCard title={title}>
        <p className="mt-3 text-sm text-neutral-500">Keine Verlaufsdaten im gewählten Zeitraum.</p>
      </ChartCard>
    );
  }
  return (
    <ChartCard title={title}>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={MUTED} strokeOpacity={0.25} vertical={false} />
            <XAxis dataKey="date" tick={TICK} minTickGap={24} tickFormatter={formatDeDate} />
            <YAxis tick={TICK} width={56} tickFormatter={(n) => fmt(Number(n))} />
            <Tooltip formatter={(v) => [fmt(Number(v)), title]} labelFormatter={formatDeDate} labelStyle={TOOLTIP_LABEL_STYLE} />
            <Line dataKey="value" stroke={BRAND} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
