import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AppDef } from '@/lib/apps';

export function Launchpad({ apps, greeting, overview }: { apps: AppDef[]; greeting?: string; overview?: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl p-6">
      {greeting && <h1 className="mb-1 text-3xl font-bold text-neutral-900 dark:text-neutral-100">{greeting}</h1>}
      {overview}
      <p className="anno mb-6 mt-6">Apps — tippen zum Öffnen</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {apps.map((a) => (
          <Link
            key={a.key}
            href={a.href}
            aria-label={a.label}
            className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-card transition hover:border-accent dark:border-neutral-800 dark:bg-neutral-900"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent font-mono text-[10px] font-bold text-white">
              {a.abbr}
            </span>
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{a.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
