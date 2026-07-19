'use client';
import { useState, type ReactNode } from 'react';
import type { OAuthProviderStatus } from '@/lib/oauth/status';
import { SetupGuide } from './SetupGuide';

export function SetupShell({ oauth, children }: { oauth: OAuthProviderStatus[]; children: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div className={`mx-auto w-full ${show ? 'max-w-6xl' : 'max-w-3xl'}`}>
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Einstellungen</h1>
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-expanded={show}
          className="rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {show ? 'Setupbeschreibung ausblenden' : 'Setupbeschreibung einblenden'}
        </button>
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
    </div>
  );
}
