'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

type ShellNav = { open: boolean; toggle: () => void; close: () => void };
const Ctx = createContext<ShellNav | null>(null);

export function ShellNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Bei Navigation (Link-Auswahl) Drawer/Sheet schließen.
  useEffect(() => { setOpen(false); }, [pathname]);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);
  return <Ctx.Provider value={{ open, toggle, close }}>{children}</Ctx.Provider>;
}

export function useShellNav(): ShellNav {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useShellNav must be used within a ShellNavProvider');
  return ctx;
}
