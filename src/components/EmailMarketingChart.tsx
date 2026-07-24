'use client';
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { ChartCard } from '@/components/charts/ChartCard';
import { BRAND, MUTED, CATEGORICAL, TICK, TOOLTIP_LABEL_STYLE, num } from '@/components/charts/chart-style';
import type { EmailMarketingPoint } from '@/verkauf/email-marketing';

// Anmeldungen (Balken) und Abmeldungen (Balken) auf gemeinsamer Zeitachse,
// Netto als überlagerte Linie. Farben aus den geteilten Chart-Tokens.
export function EmailMarketingChart({ series }: { series: EmailMarketingPoint[] }) {
  if (series.length === 0) {
    return (
      <ChartCard title="Anmeldungen & Abmeldungen">
        <p className="mt-3 text-sm text-neutral-500">
          Noch keine Newsletter-Daten im gewählten Zeitraum.
        </p>
      </ChartCard>
    );
  }
  return (
    <ChartCard title="Anmeldungen & Abmeldungen">
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={MUTED} strokeOpacity={0.25} vertical={false} />
            <XAxis dataKey="date" tick={TICK} minTickGap={24} />
            <YAxis tick={TICK} width={48} tickFormatter={(n) => num(Number(n))} />
            <Tooltip formatter={(v, n) => [num(Number(v)), n as string]} labelStyle={TOOLTIP_LABEL_STYLE} />
            <Legend />
            <Bar dataKey="signups" name="Anmeldungen" fill={BRAND} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="unsubscribes" name="Abmeldungen" fill={MUTED} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Line dataKey="netto" name="Netto" stroke={CATEGORICAL[3]} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
