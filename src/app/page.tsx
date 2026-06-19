import { loadDataset } from '@/kpi/repository';
import { computeKpis } from '@/kpi/index';
import { addDays } from '@/lib/dates';
import { PhaseColumn } from '@/components/PhaseColumn';
import { Filters } from '@/components/Filters';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: { days?: string } }) {
  const days = [7, 30, 90].includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const end = new Date().toISOString().slice(0, 10);
  const range = { start: addDays(end, -(days - 1)), end };
  const phases = computeKpis(await loadDataset(), range);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-emerald-400">KPI-Dashboard · SEE–THINK–DO–CARE</h1>
          <p className="text-sm text-neutral-400">Steuerung entlang der Customer Journey · {range.start} – {range.end}</p>
        </div>
        <div className="flex items-center gap-4">
          <Filters />
          <a href="/setup" className="text-sm text-neutral-400 hover:text-emerald-400">⚙ Setup</a>
        </div>
      </header>
      <div className="flex gap-4">
        {phases.map((p) => <PhaseColumn key={p.phase} phase={p} />)}
      </div>
    </main>
  );
}
