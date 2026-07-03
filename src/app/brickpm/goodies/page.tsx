import { listGoodies } from '@/brickpm/repository';
import { eur } from '@/brickpm/format';
import { BpmChip } from '@/components/BpmChip';

export const dynamic = 'force-dynamic';

const th = 'px-3 py-2 text-left font-semibold text-neutral-500';
const td = 'px-3 py-2 text-neutral-800 dark:text-neutral-200';

export default async function GoodiesPage() {
  const goodies = await listGoodies();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Goodies &amp; Bundles</h2>
      <p className="text-sm text-neutral-500">
        Ein Goodie kostet Marge in Höhe seiner Kosten (Spalte „Margen-Effekt") — oft günstiger als ein gleichwertiger Rabatt.
      </p>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider dark:border-neutral-800 dark:bg-neutral-950">
            <tr>
              <th className={th}>ID</th><th className={th}>Name</th><th className={th}>Typ</th><th className={th}>Kosten</th>
              <th className={th}>gilt für</th><th className={th}>Mind.-Warenkorb</th><th className={th}>Zeitraum</th>
              <th className={th}>Status</th><th className={th}>Margen-Effekt</th><th className={th}>Kommentar</th>
            </tr>
          </thead>
          <tbody>
            {goodies.map((g) => (
              <tr key={g.id} className="border-b border-neutral-100 dark:border-neutral-800/60">
                <td className={`${td} font-mono text-xs`}>{g.id}</td>
                <td className={td}>{g.name}</td>
                <td className={td}>{g.type}</td>
                <td className={td}>{eur(g.cost)}</td>
                <td className={`${td} font-mono text-xs`}>{g.products.join(', ')}</td>
                <td className={td}>{eur(g.minCart)}</td>
                <td className={td}>{g.validFrom ?? '—'} – {g.validTo ?? 'offen'}</td>
                <td className={td}><BpmChip label={g.status} /></td>
                <td className={`${td} ${g.mgnEffect < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{eur(g.mgnEffect)}</td>
                <td className={`${td} max-w-xs text-xs text-neutral-500`}>{g.comment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
