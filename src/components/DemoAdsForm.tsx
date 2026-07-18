'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleDemoAdsAction } from '@/app/setup/actions';

export function DemoAdsForm({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const toggle = () => start(async () => {
    await toggleDemoAdsAction(!enabled);
    router.refresh();
  });
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Demo-Ads-Daten</h2>
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        Füllt <span className="font-mono">ad_spend</span> mit Demo-Werten für Google/Meta/TikTok (180 Tage), damit die
        Ads-Kennzahlen im E-Commerce-Dashboard vor der Live-Anbindung testbar sind. Kein echter API-Aufruf.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`anno rounded px-2 py-0.5 text-xs ${enabled
          ? 'bg-accent/15 text-accent' : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'}`}>
          {enabled ? 'aktiv' : 'inaktiv'}
        </span>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-white disabled:opacity-50"
        >
          {pending ? '…' : enabled ? 'Demo-Daten ausschalten' : 'Demo-Daten einschalten'}
        </button>
      </div>
    </section>
  );
}
