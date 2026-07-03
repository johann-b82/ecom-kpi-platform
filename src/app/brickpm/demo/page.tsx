import Link from 'next/link';

export const dynamic = 'force-dynamic';

const FLOWS = [
  { title: 'Limited Edition fast ausverkauft', href: '/brickpm/notifications',
    desc: 'Der Berliner Fernsehturm (P001) unterschreitet den Mindestbestand. Bearbeite die kritische Notification und starte eine Abverkaufsaktion.' },
  { title: 'Marge & Sales-Ziel berechnen', href: '/brickpm/marge',
    desc: 'Wähle P001, gib 10 % Rabatt und einen Zielumsatz ein — der Kalkulator zeigt Deckungsbeitrag, Marge und die empfohlene Maßnahme.' },
  { title: 'Goodie statt Rabatt', href: '/brickpm/goodies',
    desc: 'Vergleiche die Margen-Wirkung eines Goodies (z. B. Teiletrenner) mit einem gleichwertigen Rabatt.' },
  { title: 'Wettbewerb prüfen', href: '/brickpm/wettbewerb',
    desc: 'Sieh dir die Preisabweichung gegenüber dem Wettbewerb an und leite eine Preisentscheidung ab.' },
];

export default function DemoPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Demo-Skript</h2>
      <p className="text-sm text-neutral-500">Vier geführte Beispiel-Flows. Jeder verlinkt in den passenden Bereich mit echten Daten.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {FLOWS.map((f, i) => (
          <Link key={f.href} href={f.href} className="rounded-lg border border-neutral-200 bg-white p-4 transition-colors hover:border-brand dark:border-neutral-800 dark:bg-neutral-900">
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">{f.title}</span>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">{f.desc}</p>
            <span className="mt-2 inline-block text-sm text-brand">Zum Bereich →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
