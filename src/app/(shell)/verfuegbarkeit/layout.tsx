import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireAppAccess } from '@/lib/groups';
import { VerfuegbarkeitSidebar } from '@/components/VerfuegbarkeitSidebar';

export const dynamic = 'force-dynamic';

export default async function VerfuegbarkeitLayout({ children }: { children: ReactNode }) {
  let ok = false;
  try { await requireAppAccess('verfuegbarkeit'); ok = true; } catch { /* no access */ }
  if (!ok) redirect('/');
  return (
    <div className="flex flex-1 overflow-hidden">
      <VerfuegbarkeitSidebar />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
