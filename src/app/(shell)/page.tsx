import { createClient } from '@/lib/supabase/server';
import { getUserAccess, accessibleApps } from '@/lib/groups';
import { Launchpad } from '@/components/Launchpad';
import { StartOverview, type OverviewSignals } from '@/components/StartOverview';
import { salesTotals } from '@/verkauf/repository';
import { listReorderSuggestions } from '@/verfuegbarkeit/repository';
import { listOpenItems } from '@/finanzen/repository';

export const dynamic = 'force-dynamic';

export default async function LaunchpadPage() {
  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };

  const signals: OverviewSignals = {};
  const tasks: Promise<void>[] = [];
  if (access.apps.verkauf) {
    const end = new Date().toISOString().slice(0, 10);
    const monthRange = { start: end.slice(0, 8) + '01', end };
    tasks.push(salesTotals(monthRange).then((t) => { signals.monthRevenue = t.revenueNet; }));
  }
  if (access.apps.verfuegbarkeit) tasks.push(listReorderSuggestions().then((r) => { signals.belowReorder = r.length; }));
  if (access.apps.finanzen) tasks.push(listOpenItems().then((items) => {
    signals.openItems = items.filter((i) => i.status !== 'bezahlt').reduce((s, i) => s + i.remaining, 0);
    signals.overdue = items.filter((i) => i.overdue).reduce((s, i) => s + i.remaining, 0);
  }));
  await Promise.all(tasks);

  const hasOverview = signals.monthRevenue !== undefined || signals.belowReorder !== undefined || signals.openItems !== undefined;

  return (
    <main className="flex-1 overflow-y-auto">
      <Launchpad
        apps={accessibleApps(access)}
        greeting="Willkommen zurück."
        overview={hasOverview ? <StartOverview signals={signals} /> : undefined}
      />
    </main>
  );
}
