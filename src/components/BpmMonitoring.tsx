'use client';
import { useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import type { CompPoint } from '@/brickpm/history';
import type { BpmCompetitor } from '@/brickpm/types';
import { eur, pct, deviation } from '@/brickpm/format';
import { ChartCard } from '@/components/charts/ChartCard';
import { BRAND, MUTED, TICK, TOOLTIP_LABEL_STYLE, eur as eurAxis } from '@/components/charts/chart-style';

const selectClass =
  'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

export function BpmMonitoring({ points, alerts }: { points: CompPoint[]; alerts: BpmCompetitor[] }) {
  const combos = useMemo(() => {
    const seen = new Map<string, { key: string; productId: string; competitor: string }>();
    for (const p of points) {
      const key = `${p.productId}|${p.competitor}`;
      if (!seen.has(key)) seen.set(key, { key, productId: p.productId, competitor: p.competitor });
    }
    return [...seen.values()];
  }, [points]);

  const [sel, setSel] = useState(combos[0]?.key ?? '');
  const [productId, competitor] = sel.split('|');

  const rows = points
    .filter((p) => p.productId === productId && p.competitor === competitor)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({ date: p.date, 'Eigener Preis': p.ownPrice, Wettbewerb: p.compPrice }));

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Abweichungs-Alerts ({alerts.length})</h3>
        <ul className="space-y-2">
          {alerts.map((a) => {
            const dev = deviation(a.ownPrice, a.compPrice);
            return (
              <li key={a.id} className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
                <span className={`mt-0.5 rounded px-1.5 py-0.5 text-xs font-semibold ${dev > 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'}`}>
                  {dev > 0 ? '+' : ''}{pct(dev)}
                </span>
                <div className="flex-1">
                  <div className="text-neutral-800 dark:text-neutral-200"><span className="font-mono text-xs">{a.productId}</span> vs. {a.competitor} — {a.compProduct}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">Eigener {eur(a.ownPrice)} · Wettbewerb {eur(a.compPrice)} · {a.rec}</div>
                </div>
              </li>
            );
          })}
          {alerts.length === 0 && <li className="text-sm text-neutral-500">Keine Alerts über der Schwelle.</li>}
        </ul>
      </section>

      <section className="space-y-2">
        <label className="block max-w-sm text-sm">
          <span className="mb-1 block text-neutral-500">Produkt · Wettbewerber</span>
          <select className={`${selectClass} w-full`} value={sel} onChange={(e) => setSel(e.target.value)}>
            {combos.map((c) => <option key={c.key} value={c.key}>{c.productId} · {c.competitor}</option>)}
          </select>
        </label>
        <ChartCard title="Preisverlauf: eigener vs. Wettbewerb">
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" tick={TICK} minTickGap={24} />
                <YAxis tick={TICK} width={64} tickFormatter={(n) => eurAxis(Number(n))} />
                <Tooltip formatter={(v, n) => [eurAxis(Number(v)), n as string]} labelStyle={TOOLTIP_LABEL_STYLE} />
                <Legend />
                <Line type="monotone" dataKey="Eigener Preis" stroke={BRAND} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="Wettbewerb" stroke={MUTED} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </section>
    </div>
  );
}
