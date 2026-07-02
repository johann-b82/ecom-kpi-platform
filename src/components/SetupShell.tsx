'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { OAuthProviderStatus } from '@/lib/oauth/status';
import { SetupGuide } from './SetupGuide';

export function SetupShell({ oauth, children }: { oauth: OAuthProviderStatus[]; children: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <main className={`mx-auto p-6 ${show ? 'max-w-6xl' : 'max-w-3xl'}`}>
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Einstellungen</h1>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-expanded={show}
            className="text-sm text-brand hover:text-brand-dark"
          >
            {show ? 'Setupbeschreibung ausblenden' : 'Setupbeschreibung einblenden'}
          </button>
          <Link href="/" className="text-sm text-brand hover:text-brand-dark">← Zum Dashboard</Link>
        </div>
      </header>
      {show ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">{children}</div>
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <SetupGuide oauth={oauth} />
          </aside>
        </div>
      ) : (
        children
      )}
    </main>
  );
}
