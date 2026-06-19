import Link from 'next/link';
import type { PhaseKpis } from '@/kpi/types';
import { KpiCard } from './KpiCard';

export function PhaseColumn({ phase }: { phase: PhaseKpis }) {
  const [hero, ...rest] = phase.kpis;
  return (
    <div className="flex flex-1 flex-col gap-3">
      <Link href={`/phase/${phase.phase}`} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center hover:bg-emerald-100 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/60">
        <div className="text-lg font-bold tracking-wide text-emerald-600 dark:text-emerald-400">{phase.title}</div>
        <div className="text-xs text-neutral-600 dark:text-neutral-400">{phase.subtitle}</div>
      </Link>
      <KpiCard kpi={hero} hero />
      {rest.map((k) => <KpiCard key={k.key} kpi={k} />)}
    </div>
  );
}
