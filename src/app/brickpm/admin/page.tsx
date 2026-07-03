import { listProducts, listPromotions, listNotifications, listCompetitors, listAuditLog } from '@/brickpm/repository';
import { BpmExport } from '@/components/BpmExport';

export const dynamic = 'force-dynamic';

const th = 'px-3 py-2 text-left font-semibold text-neutral-500';
const td = 'px-3 py-2 text-neutral-800 dark:text-neutral-200';

export default async function AdminPage() {
  const [products, promotions, notifications, competitors, audit] = await Promise.all([
    listProducts(), listPromotions(), listNotifications(), listCompetitors(), listAuditLog(50),
  ]);
  const data = { products, promotions, notifications, competitors };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Admin &amp; Export</h2>
        <BpmExport data={data} />
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">Protokoll (Audit-Log)</h3>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full border-collapse text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider dark:border-neutral-800 dark:bg-neutral-950">
              <tr><th className={th}>Zeit</th><th className={th}>Akteur</th><th className={th}>Aktion</th><th className={th}>Detail</th></tr>
            </thead>
            <tbody>
              {audit.map((e) => (
                <tr key={e.id} className="border-b border-neutral-100 dark:border-neutral-800/60">
                  <td className={`${td} whitespace-nowrap text-xs text-neutral-500`}>{e.ts}</td>
                  <td className={td}>{e.actor ?? '—'}</td>
                  <td className={`${td} font-mono text-xs`}>{e.action}</td>
                  <td className={`${td} text-neutral-600 dark:text-neutral-400`}>{e.detail ?? '—'}</td>
                </tr>
              ))}
              {audit.length === 0 && <tr><td className={`${td} text-neutral-500`} colSpan={4}>Noch keine Einträge.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
