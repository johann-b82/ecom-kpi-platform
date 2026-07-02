export const dynamic = 'force-dynamic';

const LABELS: Record<string, string> = {
  sortiment: 'Sortiment', aktionen: 'Aktionen & Preorder', marge: 'Marge & Sales-Ziele',
  goodies: 'Goodies & Bundles', wettbewerb: 'Wettbewerb', notifications: 'Notifications',
  schnittstellen: 'Schnittstellen', admin: 'Admin & Export', demo: 'Demo-Skript',
};

export default function SectionPlaceholder({ params }: { params: { section: string } }) {
  const label = LABELS[params.section] ?? params.section;
  return (
    <div>
      <h2 className="mb-2 text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">{label}</h2>
      <p className="text-sm text-neutral-500">Dieser Bereich kommt in einer späteren Phase.</p>
    </div>
  );
}
