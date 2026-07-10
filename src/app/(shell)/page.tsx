import { createClient } from '@/lib/supabase/server';
import { getUserAccess, accessibleApps } from '@/lib/groups';
import { Launchpad } from '@/components/Launchpad';

export const dynamic = 'force-dynamic';

export default async function LaunchpadPage() {
  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };
  return (
    <main className="flex-1 overflow-y-auto">
      <Launchpad apps={accessibleApps(access)} greeting="Willkommen zurück." />
    </main>
  );
}
