import Link from 'next/link';
import type { PhaseKpis } from '@/kpi/types';
import { KpiCard } from './KpiCard';

export function PhaseColumn({ phase }: { phase: PhaseKpis }) {
  const [hero, ...rest] = phase.kpis;
  return (
    <div className="flex flex-1 flex-col gap-3">
      <Link href={`/phase/${phase.phase}`} className="rounded-lg border border-neutral-300 bg-neutral-100 p-3 text-center hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-800/40 dark:hover:bg-neutral-800/70">
        <div className="text-lg font-bold tracking-wide text-neutral-900 dark:text-neutral-100">{phase.title}</div>
        <div className="text-xs text-neutral-600 dark:text-neutral-400">{phase.subtitle}</div>
      </Link>
      <KpiCard kpi={hero} hero />
      {rest.map((k) => <KpiCard key={k.key} kpi={k} />)}
    </div>
  );
}
