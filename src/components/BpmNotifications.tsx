'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BpmNotification } from '@/brickpm/types';
import { BpmChip } from './BpmChip';
import { changeNotificationStatus } from '@/app/brickpm/actions';

const selectClass =
  'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

const STATI = ['offen', 'in Prüfung', 'Aktion gestartet', 'erledigt', 'verworfen'];
const PRIOS = ['kritisch', 'hoch', 'mittel', 'niedrig'];

export function BpmNotifications({ items }: { items: BpmNotification[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fStatus, setFStatus] = useState('');
  const [fPrio, setFPrio] = useState('');

  const rows = items.filter((n) => (!fStatus || n.status === fStatus) && (!fPrio || n.priority === fPrio));

  function change(id: string, status: string) {
    startTransition(async () => {
      await changeNotificationStatus(id, status);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <select className={selectClass} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Alle Status</option>
          {STATI.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={selectClass} value={fPrio} onChange={(e) => setFPrio(e.target.value)}>
          <option value="">Alle Prioritäten</option>
          {PRIOS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <ul className="space-y-2">
        {rows.map((n) => (
          <li key={n.id} className="rounded-lg border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-start gap-3">
              <BpmChip label={n.priority} />
              <div className="min-w-0 flex-1">
                <div className="text-neutral-800 dark:text-neutral-200">{n.msg}</div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {n.type} · fällig {n.due ?? '—'} · {n.role} · Ziel: {n.target}
                  {n.note ? ` · Notiz: ${n.note}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <BpmChip label={n.status} />
                <select
                  className={selectClass}
                  value={n.status}
                  disabled={pending}
                  onChange={(e) => change(n.id, e.target.value)}
                >
                  {STATI.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-neutral-500">Keine Notifications für diesen Filter.</li>}
      </ul>
    </div>
  );
}
