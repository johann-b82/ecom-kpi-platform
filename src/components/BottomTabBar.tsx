'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AppDef } from '@/lib/apps';
import { activeApp, selectTabApps } from '@/lib/shell-nav';

export function BottomTabBar({ apps }: { apps: AppDef[] }) {
  const pathname = usePathname();
  const active = activeApp(pathname);
  const { tabs, showMore } = selectTabApps(apps, active?.key ?? null);
  const onLaunchpad = pathname === '/';

  const cell =
    'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 font-mono text-[0.6rem]';

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-neutral-800 bg-neutral-900 pb-[env(safe-area-inset-bottom)] md:hidden">
      {tabs.map((a) => {
        const isActive = active?.key === a.key;
        return (
          <Link
            key={a.key}
            href={a.href}
            aria-label={a.label}
            aria-current={isActive ? 'page' : undefined}
            className={`${cell} ${isActive ? 'text-accent' : 'text-white/50'}`}
          >
            <span className="text-sm font-semibold">{a.abbr}</span>
            <span>{a.label}</span>
          </Link>
        );
      })}
      {showMore && (
        <Link
          href="/"
          aria-label="Mehr"
          aria-current={onLaunchpad ? 'page' : undefined}
          className={`${cell} ${onLaunchpad ? 'text-accent' : 'text-white/50'}`}
        >
          <span className="text-sm font-semibold">•••</span>
          <span>Mehr</span>
        </Link>
      )}
    </nav>
  );
}
