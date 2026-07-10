import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadDataset, loadDailySeries } from '@/kpi/repository';
import { computeKpis, PHASE_META, type PhaseKey } from '@/kpi/index';
import { addDays } from '@/lib/dates';
import { KpiCard } from '@/components/KpiCard';
import { PhaseTrendChart } from '@/components/PhaseTrendChart';
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
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl p-6">
        <Link href="/dashboard" className="text-sm text-brand hover:text-brand-dark">← Zur Übersicht</Link>
        <h1 className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">{meta.title} · {meta.subtitle}</h1>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          {phase.kpis.map((k) => <KpiCard key={k.key} kpi={k} />)}
        </div>

        <PhaseTrendChart series={series} metric={meta.leadMetric} />
      </div>
    </main>
  );
}
