import Link from 'next/link';
import { eur } from '@/finanzen/format';
import { formatGrowth } from '@/verkauf/growth';

export interface OverviewSignals {
  revenueGrowthPct?: number | null; // undefined ⇒ kein Verkauf-Zugriff; null ⇒ Vorperiode 0
  reichweite90?: number;
  cashflowIn?: number;
}

export function StartOverview({ signals }: { signals: OverviewSignals }) {
  const tiles: { label: string; value: string; href: string; danger?: boolean; sub?: string }[] = [];
  if (signals.revenueGrowthPct !== undefined)
    tiles.push({
      label: 'Umsatzwachstum', value: formatGrowth(signals.revenueGrowthPct), href: '/verkauf',
      sub: 'MTD VS. VORMONAT',
      danger: signals.revenueGrowthPct !== null && signals.revenueGrowthPct < 0,
    });
  if (signals.reichweite90 !== undefined)
    tiles.push({ label: 'Reichweite < 90 Tage', value: String(signals.reichweite90),
      href: '/verfuegbarkeit/meldebestand', danger: signals.reichweite90 > 0 });
  if (signals.cashflowIn !== undefined)
    tiles.push({ label: 'Operativer Cashflow', value: eur(signals.cashflowIn), href: '/finanzen',
      sub: 'EINZAHLUNGEN · LFD. MONAT' });
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
            {t.sub && <p className="anno mt-1 text-neutral-500">{t.sub}</p>}
          </Link>
        ))}
      </div>
    </section>
  );
}
