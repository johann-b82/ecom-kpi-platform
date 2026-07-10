import Link from 'next/link';
import { getCockpit } from '@/brickpm/repository';
import type { BpmNotification } from '@/brickpm/types';

export const dynamic = 'force-dynamic';

const NOTIF_DASHBOARD: Record<string, string> = {
  Bestand: '/brickpm/lager',
  Wettbewerb: '/brickpm/wettbewerb',
  Preorder: '/brickpm/aktionen',
  Aktion: '/brickpm/aktionen',
  Marge: '/brickpm/marge',
  Schnittstelle: '/brickpm/schnittstellen',
};

const notifHref = (n: BpmNotification) => {
  const base = NOTIF_DASHBOARD[n.type] ?? '/brickpm/notifications';
  return n.refId ? `${base}?focus=${encodeURIComponent(n.refId)}` : base;
};

const KPIS = (s: Awaited<ReturnType<typeof getCockpit>>['stats']) => [
  { label: 'Produkte', value: String(s.produkte) },
  { label: 'Kritisch', value: String(s.kritisch) },
  { label: 'Preorder aktiv', value: String(s.preorder) },
  { label: 'Aktive Aktionen', value: String(s.aktiveAktionen) },
  { label: 'Ø Marge', value: `${(s.avgMarge * 100).toFixed(1)} %` },
  { label: 'Offene Notifications', value: String(s.offeneNotifs) },
];

export default async function CockpitPage() {
  const { stats, heuteWichtig } = await getCockpit();
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Cockpit</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {KPIS(stats).map((k) => (
            <div key={k.label} className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{k.value}</div>
              <div className="mt-1 text-xs text-neutral-500">{k.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">Heute wichtig</h3>
        <ul className="space-y-2">
          {heuteWichtig.map((n) => (
            <li key={n.id}>
              <Link
                href={notifHref(n)}
                className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 dark:hover:bg-neutral-800/60"
              >
                <span className={`mt-0.5 rounded px-1.5 py-0.5 text-xs font-semibold ${
                  n.priority === 'kritisch' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  : n.priority === 'hoch' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>
                  {n.priority}
                </span>
                <div className="flex-1">
                  <div className="text-neutral-800 dark:text-neutral-200">{n.msg}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">{n.type} · fällig {n.due ?? '—'} · {n.role}</div>
                </div>
                <span className="mt-0.5 shrink-0 text-neutral-400" aria-hidden>→</span>
              </Link>
            </li>
          ))}
          {heuteWichtig.length === 0 && <li className="text-sm text-neutral-500">Keine offenen Notifications.</li>}
        </ul>
      </section>
    </div>
  );
}
