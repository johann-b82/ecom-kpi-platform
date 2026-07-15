import Link from 'next/link';
import { eur } from '@/finanzen/format';

export interface OverviewSignals {
  openQuotes?: number;
  belowReorder?: number;
  openItems?: number;
  overdue?: number;
}

export function StartOverview({ signals }: { signals: OverviewSignals }) {
  const tiles: { label: string; value: string; href: string; danger?: boolean; sub?: string }[] = [];
  if (signals.openQuotes !== undefined)
    tiles.push({ label: 'Offene Angebote', value: String(signals.openQuotes), href: '/verkauf/belege' });
  if (signals.belowReorder !== undefined)
    tiles.push({ label: 'Unter Meldebestand', value: String(signals.belowReorder),
      href: '/verfuegbarkeit/meldebestand', danger: signals.belowReorder > 0 });
  if (signals.openItems !== undefined)
    tiles.push({ label: 'Offene Posten', value: eur(signals.openItems), href: '/finanzen',
      sub: (signals.overdue ?? 0) > 0 ? `davon ${eur(signals.overdue!)} überfällig` : undefined });
  if (tiles.length === 0) return null;

  return (
    <section className="mt-6">
      <p className="anno mb-3">Überblick</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href}
            className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-card transition hover:border-accent dark:border-neutral-800 dark:bg-neutral-900">
            <p className="anno text-neutral-500">{t.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${t.danger ? 'text-danger' : 'text-neutral-900 dark:text-neutral-100'}`}>{t.value}</p>
            {t.sub && <p className="mt-1 text-xs text-danger">{t.sub}</p>}
          </Link>
        ))}
      </div>
    </section>
  );
}
