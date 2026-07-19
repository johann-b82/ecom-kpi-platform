import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export default function SetupLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex-1 overflow-y-auto p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">
      {children}
    </main>
  );
}
