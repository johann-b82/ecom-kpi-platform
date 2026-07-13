'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HELP_PAGES, type DocPage } from '@/lib/help/content';

const GROUPS: { key: DocPage['group']; label: string; adminOnly?: boolean }[] = [
  { key: 'start', label: 'Erste Schritte' },
  { key: 'module', label: 'Module' },
  { key: 'admin', label: 'Administration', adminOnly: true },
];

export function HilfeSidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="w-56 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-3 px-2 text-sm font-bold text-neutral-900 dark:text-neutral-100">Hilfe</p>
      <div className="space-y-4">
        {GROUPS.filter((g) => !g.adminOnly || isAdmin).map((g) => {
          const pages = HELP_PAGES.filter((p) => p.group === g.key);
          if (pages.length === 0) return null;
          return (
            <div key={g.key}>
              <p className="anno mb-1 px-2 text-neutral-400 dark:text-neutral-500">{g.label}</p>
              <ul className="space-y-1">
                {pages.map((p) => {
                  const href = `/hilfe/${p.slug}`;
                  const active = pathname === href;
                  return (
                    <li key={p.slug}>
                      <Link
                        href={href}
                        className={`block rounded-md px-3 py-1.5 text-sm ${active
                          ? 'bg-accent font-medium text-white'
                          : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'}`}
                      >
                        {p.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
