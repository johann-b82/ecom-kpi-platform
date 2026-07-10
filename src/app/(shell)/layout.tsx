import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getUserAccess, accessibleApps } from '@/lib/groups';
import { getBranding } from '@/lib/settings';
import { AppRail } from '@/components/AppRail';

export const dynamic = 'force-dynamic';

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };
  const { logo, title } = await getBranding();

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      <AppRail apps={accessibleApps(access)} logo={logo} title={title} />
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
