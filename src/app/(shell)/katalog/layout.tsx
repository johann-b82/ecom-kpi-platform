import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireAppAccess } from '@/lib/groups';
import { KatalogSidebar } from '@/components/KatalogSidebar';

export const dynamic = 'force-dynamic';

export default async function KatalogLayout({ children }: { children: ReactNode }) {
  let ok = false;
  try { await requireAppAccess('katalog'); ok = true; } catch { /* no access */ }
  if (!ok) redirect('/');

  return (
    <div className="flex flex-1 overflow-hidden">
      <KatalogSidebar />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
