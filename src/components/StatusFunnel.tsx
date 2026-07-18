import type { StatusCount, OrderStatus } from '@/verkauf/types';
import { STATUS_LABEL } from '@/verkauf/labels';

const ORDER: OrderStatus[] =
  ['angebot', 'auftrag', 'versendet', 'rechnung_gestellt', 'bezahlt', 'retoure', 'storniert'];

export function StatusFunnel({ funnel }: { funnel: StatusCount[] }) {
  const by = new Map(funnel.map((f) => [f.status, f.count]));
  const max = Math.max(1, ...funnel.map((f) => f.count));
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="anno mb-3 text-neutral-500">Status-Funnel</p>
      <div className="space-y-1.5">
        {ORDER.map((s) => {
          const n = by.get(s) ?? 0;
          const pct = Math.round((n / max) * 100);
          return (
            <div key={s} className="flex items-center gap-3 text-sm">
              <span className="w-36 shrink-0 text-neutral-600 dark:text-neutral-400">{STATUS_LABEL[s]}</span>
              <div className="h-4 flex-1 rounded bg-neutral-100 dark:bg-neutral-800">
                <div className="h-4 rounded bg-accent" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right tabular-nums text-neutral-900 dark:text-neutral-100">{n}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
