import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AreaChart, Card } from '@tremor/react';
import { loadDataset, loadDailySeries } from '@/kpi/repository';
import { computeKpis, PHASE_META, type PhaseKey } from '@/kpi/index';
import { addDays } from '@/lib/dates';
import { KpiCard } from '@/components/KpiCard';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PhasePage({ params }: { params: { phase: string } }) {
  const key = params.phase as PhaseKey;
  if (!(key in PHASE_META)) notFound();
  const meta = PHASE_META[key];

  const end = new Date().toISOString().slice(0, 10);
  const range = { start: addDays(end, -29), end };
  const supabase = createClient();

  const [data, series] = await Promise.all([loadDataset(supabase), loadDailySeries(supabase, meta.leadMetric, range)]);
  const phase = computeKpis(data, range).find((p) => p.phase === key)!;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <Link href="/" className="text-sm text-emerald-600 dark:text-emerald-400">← Zur Übersicht</Link>
      <h1 className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{meta.title} · {meta.subtitle}</h1>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        {phase.kpis.map((k) => <KpiCard key={k.key} kpi={k} />)}
      </div>

      <Card className="mt-6 bg-white dark:bg-neutral-900">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Verlauf: {meta.leadMetric} (30 Tage)</p>
        <AreaChart
          className="mt-2 h-72"
          data={series}
          index="date"
          categories={['value']}
          colors={['emerald']}
          showLegend={false}
        />
      </Card>
    </main>
  );
}
