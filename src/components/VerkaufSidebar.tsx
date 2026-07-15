'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/verkauf', label: 'Übersicht' },
  { href: '/verkauf/dashboard', label: 'E-Commerce' },
  { href: '/verkauf/belege', label: 'Belege' },
  { href: '/verkauf/neu', label: 'Neuer Beleg' },
];

export function VerkaufSidebar() {
  const pathname = usePathname();
  return (
    <nav className="w-56 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-3 px-2 text-sm font-bold text-neutral-900 dark:text-neutral-100">Verkauf</p>
      <ul className="space-y-1">
        {ITEMS.map((it) => {
          const active = it.href === '/verkauf'
            ? pathname === '/verkauf'
            : pathname === it.href || pathname.startsWith(it.href + '/');
          return (
            <li key={it.href}>
              <Link href={it.href} className={`block rounded-md px-3 py-1.5 text-sm ${active
                ? 'bg-accent font-medium text-white'
                : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'}`}>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
