import { listCompetitors } from '@/brickpm/repository';
import { eur, pct, deviation } from '@/brickpm/format';

export const dynamic = 'force-dynamic';

const th = 'px-3 py-2 text-left font-semibold text-neutral-500';
const td = 'px-3 py-2 text-neutral-800 dark:text-neutral-200';

export default async function WettbewerbPage() {
  const competitors = await listCompetitors();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Wettbewerb</h2>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider dark:border-neutral-800 dark:bg-neutral-950">
            <tr>
              <th className={th}>Produkt</th><th className={th}>Wettbewerber</th><th className={th}>dessen Produkt</th>
              <th className={th}>Eigener Preis</th><th className={th}>Wettb.-Preis</th><th className={th}>Abweichung</th>
              <th className={th}>Verfügbar</th><th className={th}>Datum</th><th className={th}>Empfehlung</th>
            </tr>
          </thead>
          <tbody>
            {competitors.map((c) => {
              const dev = deviation(c.ownPrice, c.compPrice);
              return (
                <tr key={c.id} data-focus={c.productId} className="border-b border-neutral-100 dark:border-neutral-800/60">
                  <td className={`${td} font-mono text-xs`}>{c.productId}</td>
                  <td className={td}>{c.competitor}</td>
                  <td className={td}>{c.compProduct}</td>
                  <td className={td}>{eur(c.ownPrice)}</td>
                  <td className={td}>{eur(c.compPrice)}</td>
                  <td className={`${td} font-medium ${dev > 0 ? 'text-red-600 dark:text-red-400' : dev < 0 ? 'text-green-600 dark:text-green-400' : ''}`}>
                    {dev > 0 ? '+' : ''}{pct(dev)}
                  </td>
                  <td className={td}>{c.avail ? 'ja' : 'nein'}</td>
                  <td className={td}>{c.date ?? '—'}</td>
                  <td className={`${td} max-w-xs text-xs text-neutral-500`}>{c.rec}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
