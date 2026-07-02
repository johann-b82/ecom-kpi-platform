'use client';
import { useState } from 'react';
import type { OAuthProviderStatus } from '@/lib/oauth/status';
import { guideSteps, GUIDE_INTRO, type StepState } from '@/lib/oauth/guide';
import { formatDeDate } from '@/lib/dates';

function defaultOpenFor(status: OAuthProviderStatus): number {
  const idx = guideSteps(status).findIndex((s) => s.state === 'current');
  return idx >= 0 ? idx : 0;
}

function Marker({ state, index }: { state: StepState; index: number }) {
  if (state === 'done') {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">
        ✓
      </span>
    );
  }
  const ring = state === 'current'
    ? 'border-brand text-brand'
    : 'border-neutral-300 text-neutral-400 dark:border-neutral-600';
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${ring}`}>
      {index + 1}
    </span>
  );
}

export function SetupGuide({ oauth }: { oauth: OAuthProviderStatus[] }) {
  const [selectedKey, setSelectedKey] = useState(oauth[0]?.key);
  const provider = oauth.find((o) => o.key === selectedKey) ?? oauth[0];
  const [openStep, setOpenStep] = useState(() => (provider ? defaultOpenFor(provider) : 0));

  if (!provider) return null;
  const steps = guideSteps(provider);

  function selectTab(status: OAuthProviderStatus) {
    setSelectedKey(status.key);
    setOpenStep(defaultOpenFor(status));
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="mb-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">Setup-Anleitung</h2>
      <p className="mb-4 text-neutral-600 dark:text-neutral-400">{GUIDE_INTRO}</p>

      <div role="tablist" aria-label="Anbieter" className="mb-4 flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {oauth.map((o) => {
          const active = o.key === provider.key;
          return (
            <button
              key={o.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => selectTab(o)}
              className={`-mb-px border-b-2 px-3 py-1.5 font-medium transition-colors ${
                active
                  ? 'border-brand text-brand'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <p className="mb-3 text-neutral-700 dark:text-neutral-300">
        {provider.connected ? (
          <span className="font-medium text-green-700 dark:text-green-500">
            ✓ Verbunden{provider.accountLabel ? ` (${provider.accountLabel})` : ''}
            {provider.expiresAt ? ` · läuft ab am ${formatDeDate(new Date(provider.expiresAt).toISOString())}` : ''}
          </span>
        ) : (
          <span className="text-neutral-500">Noch nicht verbunden — folge den Schritten:</span>
        )}
      </p>

      <ol className="space-y-1">
        {steps.map((step, i) => {
          const isOpen = openStep === i;
          return (
            <li key={i} className="rounded-md">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenStep(isOpen ? -1 : i)}
                className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
              >
                <Marker state={step.state} index={i} />
                <span className={`flex-1 font-medium ${step.state === 'current' ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-700 dark:text-neutral-300'}`}>
                  {step.title}
                </span>
                <span className="text-neutral-400">{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen && (
                <p className="whitespace-pre-line break-words pb-3 pl-9 pr-2 leading-relaxed text-neutral-600 dark:text-neutral-400 [overflow-wrap:anywhere]">
                  {step.body}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
