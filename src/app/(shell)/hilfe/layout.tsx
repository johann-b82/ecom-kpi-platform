import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/groups';
import { HilfeSidebar } from '@/components/help/HilfeSidebar';

export const dynamic = 'force-dynamic';

export default async function HilfeLayout({ children }: { children: ReactNode }) {
  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };

  return (
    <div className="flex flex-1 overflow-hidden">
      <HilfeSidebar isAdmin={access.isAdmin} />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
