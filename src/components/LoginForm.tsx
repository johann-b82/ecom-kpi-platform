'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError('Login fehlgeschlagen. E-Mail oder Passwort prüfen.');
      return;
    }
    router.replace(params.get('redirectTo') ?? '/');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <h1 className="text-xl font-bold text-emerald-600 dark:text-emerald-400">Anmelden</h1>
      <label className="block text-sm text-neutral-700 dark:text-neutral-300">
        E-Mail
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
          className="mt-1 w-full rounded border border-neutral-300 bg-neutral-100 px-3 py-2 text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100" />
      </label>
      <label className="block text-sm text-neutral-700 dark:text-neutral-300">
        Passwort
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
          className="mt-1 w-full rounded border border-neutral-300 bg-neutral-100 px-3 py-2 text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100" />
      </label>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={busy}
        className="w-full rounded bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
        {busy ? '…' : 'Anmelden'}
      </button>
    </form>
  );
}
