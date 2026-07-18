'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/verfuegbarkeit', label: 'Übersicht' },
  { href: '/verfuegbarkeit/liste', label: 'Bestandsliste' },
  { href: '/verfuegbarkeit/wareneingang', label: 'Wareneingang' },
  { href: '/verfuegbarkeit/meldebestand', label: 'Meldebestand' },
];

export function VerfuegbarkeitSidebar() {
  const pathname = usePathname();
  return (
    <nav className="h-full w-full overflow-y-auto bg-white p-3 dark:bg-neutral-900">
      <p className="mb-3 px-2 text-sm font-bold text-neutral-900 dark:text-neutral-100">Verfügbarkeit</p>
      <ul className="space-y-1">
        {ITEMS.map((it) => {
          const active = it.href === '/verfuegbarkeit'
            ? pathname === '/verfuegbarkeit'
            : pathname === it.href || pathname.startsWith(it.href + '/');
          return (
            <li key={it.href}>
              <Link href={it.href} className={`flex min-h-11 items-center rounded-md px-3 py-1.5 text-sm md:min-h-0 ${active
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
