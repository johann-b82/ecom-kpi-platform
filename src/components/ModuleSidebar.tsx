'use client';
import type { ReactNode } from 'react';
import { useShellNav } from '@/components/ShellNav';

export function ModuleSidebar({ children }: { children: ReactNode }) {
  const { open, close } = useShellNav();
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
          // <md: Fullscreen-Sheet von unten (top-14 = unter dem Top-Bar)
          'fixed inset-x-0 top-14 bottom-0 z-40 shrink-0 overflow-hidden bg-white shadow-xl transition-transform dark:bg-neutral-900',
          open ? 'translate-y-0' : 'translate-y-full',
          // md–lg: Drawer von links, neben der Rail (left-16 = 64px)
          'md:left-16 md:right-auto md:top-14 md:bottom-0 md:w-72',
          open ? 'md:translate-x-0 md:translate-y-0' : 'md:-translate-x-full md:translate-y-0',
          // ≥lg: statische Spalte, 224px, rechter Border, kein Transform/Shadow
          'lg:static lg:z-auto lg:w-56 lg:translate-x-0 lg:translate-y-0 lg:border-r lg:border-neutral-200 lg:shadow-none dark:lg:border-neutral-800',
        ].join(' ')}
      >
        {children}
      </aside>
    </>
  );
}
