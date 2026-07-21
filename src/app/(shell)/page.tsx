import { createClient } from '@/lib/supabase/server';
import { getUserAccess, accessibleApps } from '@/lib/groups';
import { Launchpad } from '@/components/Launchpad';
import { StartOverview, type OverviewSignals } from '@/components/StartOverview';
import { revenueNetTotal } from '@/verkauf/repository';
import { revenueGrowth, monthToDateRanges } from '@/verkauf/growth';
import { listReorderSuggestions } from '@/verfuegbarkeit/repository';
import { cashflowIn } from '@/finanzen/repository';

export const dynamic = 'force-dynamic';

export default async function LaunchpadPage() {
  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };

  const signals: OverviewSignals = {};
  const tasks: Promise<void>[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const { current, previous } = monthToDateRanges(today);
  if (access.apps.verkauf) {
    tasks.push(Promise.all([revenueNetTotal(current), revenueNetTotal(previous)]).then(([cur, prev]) => {
      signals.revenueGrowthPct = revenueGrowth(cur, prev);
    }));
  }
  if (access.apps.verfuegbarkeit) tasks.push(listReorderSuggestions().then((r) => { signals.reichweite90 = r.length; }));
  if (access.apps.finanzen) tasks.push(cashflowIn(current).then((v) => { signals.cashflowIn = v; }));
  await Promise.all(tasks);

  const hasOverview = signals.revenueGrowthPct !== undefined
    || signals.reichweite90 !== undefined || signals.cashflowIn !== undefined;

  return (
    <main className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
      <Launchpad
        apps={accessibleApps(access)}
        greeting="Willkommen zurück."
        overview={hasOverview ? <StartOverview signals={signals} /> : undefined}
      />
    </main>
  );
}
