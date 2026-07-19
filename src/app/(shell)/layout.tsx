import type { ReactNode } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getUserAccess, accessibleApps } from '@/lib/groups';
import { getBranding } from '@/lib/settings';
import { AppRail } from '@/components/AppRail';
import { BottomTabBar } from '@/components/BottomTabBar';
import { UserMenu } from '@/components/UserMenu';
import { ShellNavProvider } from '@/components/ShellNav';
import { ModuleBar } from '@/components/ModuleBar';

export const dynamic = 'force-dynamic';

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };
  const { logo, title } = await getBranding();

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      <AppRail apps={accessibleApps(access)} logo={logo} title={title} />
      <ShellNavProvider>
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-6 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center gap-2">
              <Link href="/" aria-label={title} className="flex items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo || '/bryx-logo.svg'} alt={title} className="h-7 w-auto" />
              </Link>
              <ModuleBar />
            </div>
            <UserMenu email={user?.email} isAdmin={access.isAdmin} />
          </header>
          <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
        </div>
      </ShellNavProvider>
      <BottomTabBar apps={accessibleApps(access)} />
    </div>
  );
}
