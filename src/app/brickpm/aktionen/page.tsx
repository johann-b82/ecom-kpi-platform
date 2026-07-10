import { listPromotions } from '@/brickpm/repository';
import { eur } from '@/brickpm/format';
import { BpmChip } from '@/components/BpmChip';

export const dynamic = 'force-dynamic';

const th = 'px-3 py-2 text-left font-semibold text-neutral-500';
const td = 'px-3 py-2 text-neutral-800 dark:text-neutral-200';

export default async function AktionenPage() {
  const promotions = await listPromotions();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Aktionen &amp; Preorder</h2>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider dark:border-neutral-800 dark:bg-neutral-950">
            <tr>
              <th className={th}>ID</th><th className={th}>Name</th><th className={th}>Produkt</th><th className={th}>Typ</th>
              <th className={th}>Zeitraum</th><th className={th}>Fortschritt</th><th className={th}>Zielumsatz</th>
              <th className={th}>Status</th><th className={th}>Notiz</th>
            </tr>
          </thead>
          <tbody>
            {promotions.map((a) => {
              const ratio = a.targetUnits > 0 ? Math.min(1, a.sold / a.targetUnits) : 0;
              return (
                <tr key={a.id} data-focus={`${a.id} ${a.productId}`} className="border-b border-neutral-100 dark:border-neutral-800/60">
                  <td className={`${td} font-mono text-xs`}>{a.id}</td>
                  <td className={td}>{a.name}</td>
                  <td className={`${td} font-mono text-xs`}>{a.productId}</td>
                  <td className={td}><BpmChip label={a.type} /></td>
                  <td className={td}>{a.startDate ?? '—'} – {a.endDate ?? '—'}</td>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${ratio * 100}%` }} />
                      </div>
                      <span className="text-xs text-neutral-500">{a.sold}/{a.targetUnits}</span>
                    </div>
                  </td>
                  <td className={td}>{eur(a.targetRev)}</td>
                  <td className={td}><BpmChip label={a.status} /></td>
                  <td className={`${td} max-w-xs text-xs text-neutral-500`}>{a.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
