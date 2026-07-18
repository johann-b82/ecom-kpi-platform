'use client';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useShellNav } from '@/components/ShellNav';

export function ModuleSidebar({ children }: { children: ReactNode }) {
  const { open, close } = useShellNav();
  const [belowLg, setBelowLg] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1023px)');
    setBelowLg(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setBelowLg(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const offscreen = belowLg && !open;

  return (
    <>
      {/* Backdrop: nur <lg, nur wenn offen */}
      <div
        onClick={close}
        aria-hidden="true"
        className={`fixed inset-0 z-30 bg-neutral-950/40 transition-opacity lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      {/* Panel */}
      <aside
        className={[
          // <md: Fullscreen-Sheet von unten (top-16 = unter dem Top-Bar)
          'fixed inset-x-0 top-16 bottom-0 z-40 shrink-0 overflow-hidden bg-white shadow-xl transition-transform dark:bg-neutral-900',
          open ? 'translate-y-0' : 'translate-y-full',
          // md–lg: Drawer von links, neben der Rail (left-16 = 64px)
          'md:left-16 md:right-auto md:top-16 md:bottom-0 md:w-72',
          open ? 'md:translate-x-0 md:translate-y-0' : 'md:-translate-x-full md:translate-y-0',
          // ≥lg: statische Spalte, 224px, rechter Border, kein Transform/Shadow
          'lg:static lg:z-auto lg:w-56 lg:translate-x-0 lg:translate-y-0 lg:border-r lg:border-neutral-200 lg:shadow-none dark:lg:border-neutral-800',
        ].join(' ')}
        onClick={(e) => { if ((e.target as HTMLElement).closest('a')) close(); }}
        aria-hidden={offscreen || undefined}
        {...(offscreen ? ({ inert: '' } as any) : {})}
      >
        {children}
      </aside>
    </>
  );
}
