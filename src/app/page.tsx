import { loadDataset } from '@/kpi/repository';
import { computeKpis } from '@/kpi/index';
import { addDays } from '@/lib/dates';
import { PhaseColumn } from '@/components/PhaseColumn';
import { Filters } from '@/components/Filters';
import { createClient } from '@/lib/supabase/server';
import { UserMenu } from '@/components/UserMenu';
import { BrandHeader } from '@/components/BrandHeader';
import { getUserAccess } from '@/lib/groups';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: { days?: string } }) {
  const days = [7, 30, 90].includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const end = new Date().toISOString().slice(0, 10);
  const range = { start: addDays(end, -(days - 1)), end };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };
  const phases = computeKpis(await loadDataset(supabase), range);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <BrandHeader />
        <div className="flex items-center gap-4">
          <Filters range={range} />
          <UserMenu email={user?.email} canBrickPM={!!access.apps.brickpm} />
        </div>
      </header>
      <div className="flex gap-4">
        {phases.map((p) => <PhaseColumn key={p.phase} phase={p} />)}
      </div>
    </main>
  );
}
