'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AppDef } from '@/lib/apps';

export function AppRail({ apps, logo, title }: { apps: AppDef[]; logo: string | null; title: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const home = pathname === '/';

  const kette = apps.filter((a) => a.group === 'kette');
  const zentral = apps.filter((a) => a.group === 'zentral');
  const renderApp = (a: AppDef) => {
    const active = isActive(a.href);
    return (
      <Link
        key={a.key}
        href={a.href}
        aria-label={a.label}
        aria-current={active ? 'page' : undefined}
        className={`flex h-9 w-11 items-center justify-center rounded-md font-mono text-[0.68rem] font-semibold ${
          active ? 'bg-accent text-white' : 'text-white/40 hover:bg-white/[0.07] hover:text-white/70'
        }`}
      >
        {a.abbr}
      </Link>
    );
  };

  return (
    <nav className="hidden w-16 shrink-0 flex-col items-center gap-1.5 bg-neutral-900 py-3 md:flex">
      <Link
        href="/"
        aria-label="Launchpad"
        aria-current={home ? 'page' : undefined}
        className={`mb-1 flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg ${
          home ? 'ring-1 ring-accent/40' : ''
        }`}
        style={{ background: 'var(--accent)' }}
      >
        {logo
          ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logo} alt={title} className="h-full w-full object-contain" />
          : <span className="text-base font-bold text-white">{title.slice(0, 1).toUpperCase()}</span>}
      </Link>
      <span className="my-1 h-px w-6 bg-white/10" />
      {kette.map(renderApp)}
      {kette.length > 0 && zentral.length > 0 && <span className="my-1 h-px w-6 bg-white/10" />}
      {zentral.map(renderApp)}
      <div className="flex-1" />
      <span className="mb-1 font-mono text-[0.55rem] tracking-wide text-white/45">lumeapps</span>
    </nav>
  );
}
