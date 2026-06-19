'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface FieldView {
  connector: string; field: string; label: string; secret: boolean; optional: boolean;
  isSet: boolean; updatedAt: string | null; value?: string;
}

export function CredentialsForm({ fields }: { fields: FieldView[] }) {
  const router = useRouter();
  const connectors = [...new Set(fields.map((f) => f.connector))];
  const [inputs, setInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) if (!f.secret && f.value) init[`${f.connector}:${f.field}`] = f.value;
    return init;
  });
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const k = (c: string, f: string) => `${c}:${f}`;

  async function save(connector: string) {
    const payload: Record<string, string> = {};
    for (const f of fields.filter((x) => x.connector === connector)) {
      payload[f.field] = inputs[k(connector, f.field)] ?? '';
    }
    await fetch('/api/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connector, fields: payload }) });
    setMsg(`${connector} gespeichert.`);
    router.refresh();
  }
  async function remove(connector: string, field: string) {
    await fetch('/api/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connector, fields: { [field]: null } }) });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {msg && <p className="text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}
      {connectors.map((connector) => (
        <section key={connector} className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-emerald-900/40 dark:bg-neutral-900">
          <h2 className="mb-3 text-lg font-semibold text-emerald-600 dark:text-emerald-400">{connector}</h2>
          <div className="space-y-3">
            {fields.filter((f) => f.connector === connector).map((f) => (
              <div key={f.field} className="flex items-center gap-3">
                <label className="w-56 text-sm text-neutral-700 dark:text-neutral-300">
                  {f.label}{f.optional && <span className="text-neutral-500"> (optional)</span>}
                </label>
                <input
                  className="flex-1 rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100"
                  type={f.secret && !show[k(connector, f.field)] ? 'password' : 'text'}
                  placeholder={f.secret && f.isSet ? `•••••••• (gesetzt am ${f.updatedAt?.slice(0, 10)})` : ''}
                  value={inputs[k(connector, f.field)] ?? ''}
                  onChange={(e) => setInputs({ ...inputs, [k(connector, f.field)]: e.target.value })}
                />
                {f.secret && (
                  <button type="button" className="text-xs text-neutral-600 dark:text-neutral-400" onClick={() => setShow({ ...show, [k(connector, f.field)]: !show[k(connector, f.field)] })}>
                    {show[k(connector, f.field)] ? 'verbergen' : 'anzeigen'}
                  </button>
                )}
                <span className={`text-xs ${f.isSet ? 'text-emerald-600 dark:text-emerald-500' : 'text-neutral-500'}`}>{f.isSet ? 'gesetzt ✓' : 'nicht gesetzt'}</span>
                {f.isSet && <button type="button" className="text-xs text-red-600 dark:text-red-400" onClick={() => remove(connector, f.field)}>Löschen</button>}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => save(connector)} className="mt-3 rounded bg-emerald-600 px-3 py-1 text-sm text-white">Speichern</button>
        </section>
      ))}
    </div>
  );
}
