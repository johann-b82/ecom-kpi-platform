import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserAccess, requireAppAccess } from '@/lib/groups';
import { KontakteSidebar } from '@/components/KontakteSidebar';
import { UserMenu } from '@/components/UserMenu';

export const dynamic = 'force-dynamic';

export default async function KontakteLayout({ children }: { children: ReactNode }) {
  let ok = false;
  try { await requireAppAccess('kontakte'); ok = true; } catch { /* no access */ }
  if (!ok) redirect('/');

  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };

  return (
    <div className="flex flex-1 overflow-hidden">
      <KontakteSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3 dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">Kontakte</h1>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-brand hover:text-brand-dark">← Dashboard</Link>
            <UserMenu email={user?.email} canBrickPM={!!access.apps.brickpm} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
