// Geteilte KPI-Kachel: warmes neutrales Kartendesign, .anno-Mikrolabel + Wert.
// size 'md' (Default, 2xl + shadow) für KPI-Zeilen, 'sm' (lg, kompakt) für Detail-Raster.
export function StatTile({ label, value, size = 'md' }:
  { label: string; value: string; size?: 'md' | 'sm' }) {
  return (
    <div className={`rounded-lg border border-neutral-200 bg-neutral-0 dark:border-neutral-800 dark:bg-neutral-900 ${
      size === 'sm' ? 'p-3' : 'p-4 shadow-card'}`}>
      <p className="anno text-neutral-500">{label}</p>
      <p className={`mt-1 font-semibold text-neutral-900 dark:text-neutral-100 ${
        size === 'sm' ? 'text-lg' : 'text-2xl'}`}>{value}</p>
    </div>
  );
}
