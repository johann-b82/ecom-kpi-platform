import type { HubConnectionState } from '@/lib/hub';

const PROVIDER_LABELS: Record<string, string> = {
  amazon_ads: 'Amazon Ads',
  amazon_sp: 'Amazon Seller Central',
};

const STATE_STYLES: Record<HubConnectionState, string> = {
  'verbunden': 'text-success',
  'nicht verbunden': 'text-neutral-500 dark:text-neutral-400',
  'neu verbinden': 'text-warning',
  'nicht konfiguriert': 'text-neutral-500 dark:text-neutral-400',
  'fehler': 'text-danger',
};

export function HubConnections({ states }: { states: { provider: string; state: HubConnectionState }[] }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="anno mb-3 text-neutral-500 dark:text-neutral-400">Hub-Verbindungen (Amazon)</h3>
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        Amazon wird über den Verbindungs-Hub angebunden — Zugangsdaten und Token-Refresh liegen im Hub, nicht in dieser Instanz.
      </p>
      <ul className="space-y-2">
        {states.map(({ provider, state }) => (
          <li key={provider} className="flex items-center justify-between text-sm">
            <span className="text-neutral-900 dark:text-neutral-100">{PROVIDER_LABELS[provider] ?? provider}</span>
            <span className="flex items-center gap-4">
              <span className={STATE_STYLES[state]}>{state}</span>
              {(state === 'nicht verbunden' || state === 'neu verbinden') && (
                <a className="text-accent hover:text-accent-hover" href={`/api/hub/${provider}/connect`}>
                  Verbinden →
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
