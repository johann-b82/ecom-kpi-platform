'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECTIONS: { slug: string; label: string }[] = [
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
];

export function BpmSidebar() {
  const pathname = usePathname();
  return (
    <nav className="w-56 shrink-0 border-r border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">BrickPM</p>
      <ul className="space-y-1">
        {SECTIONS.map((s) => {
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
    </nav>
  );
}
