'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { APPS } from '@/lib/apps';
import type { Group, Right } from '@/lib/groups';
import type { AppUser } from '@/lib/users';

const inputClass =
  'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

export function GroupsForm({ groups, users }: { groups: Group[]; users: AppUser[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function call(body: object) {
    const res = await fetch('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(data.error ?? 'Fehler.'); return; }
    setMsg(null);
    router.refresh();
  }

  const rightOf = (g: Group, app: string): Right | '' =>
    (g.access.find((a) => a.app === app)?.permission ?? '') as Right | '';

  return (
    <section>
      <h2 className="anno mb-3 text-neutral-500 dark:text-neutral-400">Gruppen</h2>
      {msg && <p className="mb-3 text-sm text-neutral-900 dark:text-neutral-100">{msg}</p>}

      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.id} className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-card dark:border-neutral-800 dark:bg-neutral-900">
            <div className="mb-3 flex items-center gap-3">
              <input
                className={`${inputClass} flex-1`}
                defaultValue={g.name}
                onBlur={(e) => e.target.value !== g.name && call({ action: 'rename', id: g.id, name: e.target.value })}
              />
              <label className="flex items-center gap-1.5 text-sm text-neutral-700 dark:text-neutral-300">
                <input type="checkbox" checked={g.isAdmin} onChange={(e) => call({ action: 'setAdmin', id: g.id, isAdmin: e.target.checked })} />
                Admin
              </label>
              <button type="button" className="text-xs text-danger hover:underline"
                onClick={() => { if (confirm(`Gruppe „${g.name}" löschen?`)) call({ action: 'delete', id: g.id }); }}>
                Löschen
              </button>
            </div>

            <div className="mb-3 flex flex-wrap gap-4">
              {APPS.map((app) => (
                <label key={app.key} className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                  <span className="w-24">{app.label}</span>
                  <select
                    className={inputClass}
                    value={rightOf(g, app.key)}
                    onChange={(e) => call({ action: 'setAppAccess', id: g.id, app: app.key, right: e.target.value === '' ? null : e.target.value })}
                  >
                    <option value="">kein Zugriff</option>
                    <option value="view">ansehen</option>
                    <option value="edit">bearbeiten</option>
                  </select>
                </label>
              ))}
            </div>

            <div>
              <p className="anno mb-1 text-neutral-500 dark:text-neutral-400">Mitglieder</p>
              <div className="flex flex-wrap gap-3">
                {users.map((u) => {
                  const member = g.memberIds.includes(u.id);
                  return (
                    <label key={u.id} className="flex items-center gap-1.5 text-sm text-neutral-700 dark:text-neutral-300">
                      <input
                        type="checkbox"
                        checked={member}
                        onChange={(e) => {
                          const next = e.target.checked ? [...g.memberIds, u.id] : g.memberIds.filter((id) => id !== u.id);
                          call({ action: 'setMembers', id: g.id, userIds: next });
                        }}
                      />
                      {u.email}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <input className={inputClass} placeholder="Gruppenname" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button
          type="button"
          className="rounded-md bg-accent px-3 py-1 text-sm text-white transition-colors hover:bg-accent-hover"
          onClick={() => { if (newName.trim()) { call({ action: 'create', name: newName.trim() }); setNewName(''); } }}
        >
          Neue Gruppe
        </button>
      </div>
    </section>
  );
}
