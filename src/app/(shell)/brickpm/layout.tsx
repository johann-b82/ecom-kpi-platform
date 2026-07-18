import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireAppAccess } from '@/lib/groups';
import { BpmSidebar } from '@/components/BpmSidebar';
import { ModuleSidebar } from '@/components/ModuleSidebar';

export const dynamic = 'force-dynamic';

export default async function BrickpmLayout({ children }: { children: ReactNode }) {
  let ok = false;
  try { await requireAppAccess('brickpm'); ok = true; } catch { /* no access */ }
  if (!ok) redirect('/');

  return (
    <div className="flex flex-1 overflow-hidden">
      <ModuleSidebar><BpmSidebar /></ModuleSidebar>
      <main className="flex-1 overflow-y-auto p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">{children}</main>
    </div>
  );
}
