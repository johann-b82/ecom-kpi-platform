'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const GROUPS: { title: string; items: { slug: string; label: string }[] }[] = [
  {
    title: 'Bereiche',
    items: [
      { slug: '', label: 'Cockpit' },
      { slug: 'sortiment', label: 'Sortiment' },
      { slug: 'aktionen', label: 'Aktionen & Preorder' },
      { slug: 'marge', label: 'Marge & Sales-Ziele' },
      { slug: 'goodies', label: 'Goodies & Bundles' },
      { slug: 'wettbewerb', label: 'Wettbewerb' },
      { slug: 'notifications', label: 'Notifications' },
      { slug: 'schnittstellen', label: 'Schnittstellen' },
      { slug: 'admin', label: 'Admin & Export' },
      { slug: 'demo', label: 'Demo-Skript' },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { slug: 'analytics', label: 'Analytics & Reporting' },
      { slug: 'preis-historie', label: 'Preis- & Margen-Historie' },
      { slug: 'lager', label: 'Lager & Nachbestellung' },
      { slug: 'monitoring', label: 'Wettbewerbs-Monitoring' },
    ],
  },
];

export function BpmSidebar() {
  const pathname = usePathname();
  return (
    <nav className="w-56 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-3 px-2 text-sm font-bold text-neutral-900 dark:text-neutral-100">BrickPM</p>
      {GROUPS.map((g) => (
        <div key={g.title} className="mb-4">
          <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">{g.title}</p>
          <ul className="space-y-1">
            {g.items.map((s) => {
              const href = s.slug === '' ? '/brickpm' : `/brickpm/${s.slug}`;
              const isActive = pathname === href;
              return (
                <li key={s.slug}>
                  <Link
                    href={href}
                    className={`block rounded-md px-3 py-1.5 text-sm ${
                      isActive
                        ? 'bg-brand font-medium text-white'
                        : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
