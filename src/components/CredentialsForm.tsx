'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDeDate } from '@/lib/dates';
import { CONNECTOR_GROUPS, CONNECTOR_LABELS, type Connector } from '@/lib/connector-fields';

export interface FieldView {
  connector: string; field: string; label: string; secret: boolean; optional: boolean;
  isSet: boolean; updatedAt: string | null; value?: string;
}

export function CredentialsForm({ fields }: { fields: FieldView[] }) {
  const router = useRouter();
  const [inputs, setInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) if (!f.secret && f.value) init[`${f.connector}:${f.field}`] = f.value;
    return init;
  });
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const k = (c: string, f: string) => `${c}:${f}`;

  async function save(connector: Connector) {
    const payload: Record<string, string> = {};
    for (const f of fields.filter((x) => x.connector === connector)) {
      payload[f.field] = inputs[k(connector, f.field)] ?? '';
    }
    await fetch('/api/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connector, fields: payload }) });
    setMsg(`${CONNECTOR_LABELS[connector]} gespeichert.`);
    router.refresh();
  }
  async function remove(connector: string, field: string) {
    await fetch('/api/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connector, fields: { [field]: null } }) });
    router.refresh();
  }

  return (
    <div className="space-y-10">
      {msg && <p className="text-sm text-neutral-900 dark:text-neutral-100">{msg}</p>}
      {CONNECTOR_GROUPS.map((group) => (
        <section key={group.title}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">{group.title}</h2>
          <div className="space-y-4">
            {group.connectors.map((connector) => (
              <div key={connector} className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <h3 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{CONNECTOR_LABELS[connector]}</h3>
                <div className="space-y-3">
                  {fields.filter((f) => f.connector === connector).map((f) => (
              <div key={f.field} className="flex items-center gap-3">
                <label className="w-56 text-sm text-neutral-700 dark:text-neutral-300">
                  {f.label}{f.optional && <span className="text-neutral-500"> (optional)</span>}
                </label>
                <input
                  className="flex-1 rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100"
                  type={f.secret && !show[k(connector, f.field)] ? 'password' : 'text'}
                  placeholder={f.secret && f.isSet ? `•••••••• (gesetzt am ${f.updatedAt ? formatDeDate(f.updatedAt) : ''})` : ''}
                  value={inputs[k(connector, f.field)] ?? ''}
                  onChange={(e) => setInputs({ ...inputs, [k(connector, f.field)]: e.target.value })}
                />
                {f.secret && (
                  <button
                    type="button"
                    aria-label={show[k(connector, f.field)] ? 'verbergen' : 'anzeigen'}
                    title={show[k(connector, f.field)] ? 'verbergen' : 'anzeigen'}
                    className="text-neutral-500 hover:text-brand"
                    onClick={() => setShow({ ...show, [k(connector, f.field)]: !show[k(connector, f.field)] })}
                  >
                    {show[k(connector, f.field)] ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                )}
                <span className={`text-xs ${f.isSet ? 'text-emerald-600 dark:text-emerald-500' : 'text-neutral-500'}`}>{f.isSet ? 'gesetzt ✓' : 'nicht gesetzt'}</span>
                {f.isSet && <button type="button" className="text-xs text-red-600 dark:text-red-400" onClick={() => remove(connector, f.field)}>Löschen</button>}
              </div>
            ))}
                </div>
                <button type="button" onClick={() => save(connector)} className="mt-3 rounded bg-brand px-3 py-1 text-sm text-white">Speichern</button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const eyeProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function EyeIcon() {
  return (
    <svg {...eyeProps}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg {...eyeProps}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
