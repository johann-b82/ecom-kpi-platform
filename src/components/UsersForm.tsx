'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDeDate } from '@/lib/dates';
import type { AppUser } from '@/lib/users';

const inputClass =
  'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

export function UsersForm({ users, currentUserId }: { users: AppUser[]; currentUserId?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pwEdit, setPwEdit] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(method: string, body: object): Promise<boolean> {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/users', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? 'Fehler.');
      return false;
    }
    router.refresh();
    return true;
  }

  async function create() {
    if (await call('POST', { email, password })) {
      setEmail('');
      setPassword('');
      setMsg('Benutzer angelegt.');
    }
  }
  async function changePw(id: string) {
    if (await call('PATCH', { id, password: pwEdit[id] ?? '' })) {
      setPwEdit({ ...pwEdit, [id]: '' });
      setMsg('Passwort geändert.');
    }
  }
  async function del(id: string, mail: string) {
    if (!confirm(`Benutzer „${mail}" löschen?`)) return;
    if (await call('DELETE', { id })) setMsg('Benutzer gelöscht.');
  }

  return (
    <section>
      <h2 className="anno mb-3 text-neutral-500 dark:text-neutral-400">Benutzer</h2>
      <div className="space-y-4 rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-card dark:border-neutral-800 dark:bg-neutral-900">
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-2 last:border-0 dark:border-neutral-800">
              <span className="min-w-48 flex-1 text-sm text-neutral-900 dark:text-neutral-100">
                {u.email}
                {u.id === currentUserId && <span className="ml-2 text-xs text-neutral-500">(du)</span>}
              </span>
              <span className="text-xs text-neutral-500">seit {formatDeDate(u.createdAt)}</span>
              <input
                type="password"
                placeholder="neues Passwort"
                className={inputClass}
                value={pwEdit[u.id] ?? ''}
                onChange={(e) => setPwEdit({ ...pwEdit, [u.id]: e.target.value })}
              />
              <button
                type="button"
                disabled={busy || !(pwEdit[u.id] ?? '')}
                onClick={() => changePw(u.id)}
                className="text-xs text-neutral-700 hover:text-accent disabled:opacity-40 dark:text-neutral-300"
              >
                Passwort ändern
              </button>
              {u.id !== currentUserId && (
                <button type="button" disabled={busy} onClick={() => del(u.id, u.email)} className="text-xs text-danger hover:underline">
                  Löschen
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3 pt-1">
          <input type="email" placeholder="E-Mail" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder="Passwort (min. 6)" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" disabled={busy} onClick={create} className="rounded-md bg-accent px-3 py-1 text-sm text-white transition-colors hover:bg-accent-hover disabled:opacity-50">
            Anlegen
          </button>
          {msg && <span className="text-sm text-neutral-600 dark:text-neutral-400">{msg}</span>}
        </div>
      </div>
    </section>
  );
}
