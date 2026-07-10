'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AppDef } from '@/lib/apps';

export function AppRail({ apps, logo, title }: { apps: AppDef[]; logo: string | null; title: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const home = pathname === '/';

  return (
    <nav className="flex w-[54px] shrink-0 flex-col items-center gap-1 bg-neutral-900 py-2.5">
      <Link
        href="/"
        aria-label="Launchpad"
        aria-current={home ? 'page' : undefined}
        className={`mb-1 flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg ${
          home ? 'ring-1 ring-accent/40' : ''
        }`}
        style={{ background: 'var(--accent)' }}
      >
        {logo
          ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logo} alt={title} className="h-full w-full object-contain" />
          : <span className="text-sm font-bold text-white">{title.slice(0, 1).toUpperCase()}</span>}
      </Link>
      <span className="my-1 h-px w-5 bg-white/10" />
      {apps.map((a) => {
        const active = isActive(a.href);
        return (
          <Link
            key={a.key}
            href={a.href}
            aria-label={a.label}
            aria-current={active ? 'page' : undefined}
            className={`flex h-[30px] w-9 items-center justify-center rounded-md font-mono text-[9px] font-semibold ${
              active ? 'bg-accent text-white' : 'text-white/35 hover:bg-white/[0.07] hover:text-white/60'
            }`}
          >
            {a.abbr}
          </Link>
        );
      })}
      <div className="flex-1" />
      <span className="mb-1 font-mono text-[6px] tracking-wide text-white/30">lumeapps</span>
    </nav>
  );
}
