'use client';
import { usePathname } from 'next/navigation';
import { activeApp } from '@/lib/shell-nav';
import { useShellNav } from '@/components/ShellNav';

export function ModuleBar() {
  const pathname = usePathname();
  const { toggle } = useShellNav();
  const app = activeApp(pathname);
  if (!app) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`${app.label}-Menü`}
      className="flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800 lg:hidden"
    >
      {app.label}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
