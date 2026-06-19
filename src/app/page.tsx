import { loadDataset } from '@/kpi/repository';
import { computeKpis } from '@/kpi/index';
import { addDays } from '@/lib/dates';
import { PhaseColumn } from '@/components/PhaseColumn';
import { Filters } from '@/components/Filters';
import { createClient } from '@/lib/supabase/server';
import { UserMenu } from '@/components/UserMenu';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: { days?: string } }) {
  const days = [7, 30, 90].includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const end = new Date().toISOString().slice(0, 10);
  const range = { start: addDays(end, -(days - 1)), end };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const phases = computeKpis(await loadDataset(supabase), range);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bryx-logo.svg" alt="BRYX" className="h-9 w-auto" />
          <span className="h-8 w-px bg-neutral-300 dark:bg-neutral-700" />
          <div>
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">KPI-Dashboard · SEE–THINK–DO–CARE</h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">Steuerung entlang der Customer Journey · {range.start} – {range.end}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Filters />
          <UserMenu email={user?.email} />
        </div>
      </header>
      <div className="flex gap-4">
        {phases.map((p) => <PhaseColumn key={p.phase} phase={p} />)}
      </div>
    </main>
  );
}
