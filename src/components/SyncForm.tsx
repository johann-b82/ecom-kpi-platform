'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SyncInterval } from '@/lib/settings';
import type { SyncStateRow } from '@/lib/sync/runner';
import { formatDeDate } from '@/lib/dates';

const selectClass =
  'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

const INTERVAL_LABELS: Record<SyncInterval, string> = {
  off: 'Aus (nur manuell)',
  hourly: 'Stündlich',
  '6h': 'Alle 6 Stunden',
  daily: 'Täglich',
};
const INTERVAL_ORDER: SyncInterval[] = ['off', 'hourly', '6h', 'daily'];

const th = 'anno px-3 py-2 text-left';
const td = 'px-3 py-2 text-neutral-800 dark:text-neutral-200';

function StatusChip({ row }: { row: SyncStateRow }) {
  let label: string;
  let cls: string;
  if (!row.configured) {
    label = 'nicht konfiguriert';
    cls = 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400';
  } else if (row.status === 'ok') {
    label = 'ok';
    cls = 'bg-success/15 text-success';
  } else if (row.status === 'fehler') {
    label = 'Fehler';
    cls = 'bg-danger/15 text-danger';
  } else {
    label = 'noch nie';
    cls = 'bg-warning/15 text-warning';
  }
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export function SyncForm({ interval, state }: { interval: SyncInterval; state: SyncStateRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'interval' | 'now'>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function post(body: object, kind: 'interval' | 'now') {
    setBusy(kind);
    setMsg(null);
    const res = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setMsg(data.error ?? 'Fehler.'); return; }
    if (kind === 'now') setMsg('Synchronisierung abgeschlossen.');
    router.refresh();
  }

  return (
    <section>
      <h2 className="anno mb-3 text-neutral-500 dark:text-neutral-400">Synchronisierung</h2>
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        Wie oft die verbundenen Datenquellen automatisch synchronisiert werden. „Jetzt synchronisieren" löst alle konfigurierten Quellen sofort aus.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="mb-1 block text-neutral-500">Intervall</span>
          <select
            className={selectClass}
            value={interval}
            disabled={busy !== null}
            onChange={(e) => post({ action: 'interval', value: e.target.value }, 'interval')}
          >
            {INTERVAL_ORDER.map((i) => <option key={i} value={i}>{INTERVAL_LABELS[i]}</option>)}
          </select>
        </label>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => post({ action: 'now' }, 'now')}
          className="rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-white disabled:opacity-50"
        >
          {busy === 'now' ? 'Synchronisiere…' : 'Jetzt synchronisieren'}
        </button>
        {msg && <span className="text-sm text-neutral-600 dark:text-neutral-400">{msg}</span>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
            <tr><th className={th}>Quelle</th><th className={th}>Status</th><th className={th}>Letzter Sync</th><th className={th}>Details</th></tr>
          </thead>
          <tbody>
            {state.map((row) => (
              <tr key={row.connector} className="border-b border-neutral-100 dark:border-neutral-800/60">
                <td className={td}>{row.label}</td>
                <td className={td}><StatusChip row={row} /></td>
                <td className={`${td} whitespace-nowrap text-neutral-500`}>{row.lastRunAt ? formatDeDate(row.lastRunAt) : '—'}</td>
                <td className={`${td} max-w-md text-xs text-neutral-500`}>{row.configured ? (row.detail ?? '—') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
