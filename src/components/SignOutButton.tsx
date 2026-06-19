'use client';
import { signOut } from 'next-auth/react';

export function SignOutButton({ email }: { email?: string | null }) {
  return (
    <span className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
      {email && <span>{email}</span>}
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: '/' })}
        className="rounded bg-neutral-200 px-2 py-1 hover:text-emerald-600 dark:bg-neutral-800 dark:hover:text-emerald-400"
      >
        Abmelden
      </button>
    </span>
  );
}
