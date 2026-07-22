import { getCredentials } from '@/lib/credentials';

export type HubProvider = 'amazon_ads' | 'amazon_sp';

export interface HubCredentials {
  accessToken: string;
  expiresAt: string | null;
  accountConfig: Record<string, string>;
  clientId?: string;
}

export type HubConnectionState = 'verbunden' | 'nicht verbunden' | 'neu verbinden' | 'nicht konfiguriert' | 'fehler';

export class HubNotConfiguredError extends Error {
  constructor() { super('Hub-URL/API-Key fehlen — bitte auf /setup hinterlegen.'); }
}

async function hubConfig(): Promise<{ url: string; apiKey: string }> {
  const cfg = await getCredentials('hub');
  if (!cfg.HUB_URL || !cfg.HUB_API_KEY) throw new HubNotConfiguredError();
  return { url: cfg.HUB_URL.replace(/\/$/, ''), apiKey: cfg.HUB_API_KEY };
}

export async function getHubCredentials(provider: HubProvider, fetchImpl: typeof fetch = fetch): Promise<HubCredentials> {
  const { url, apiKey } = await hubConfig();
  const res = await fetchImpl(`${url}/api/v1/credentials/${provider}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 404) throw new Error(`${provider} ist im Hub nicht verbunden — bitte auf /setup verbinden.`);
  if (res.status === 424) throw new Error(`${provider}-Verbindung im Hub abgelaufen — bitte neu verbinden.`);
  if (!res.ok) throw new Error(`Hub credentials ${provider} fehlgeschlagen: ${res.status} ${await res.text()}`);
  return (await res.json()) as HubCredentials;
}

export async function createHubConnectSession(provider: HubProvider, returnUrl: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const { url, apiKey } = await hubConfig();
  const res = await fetchImpl(`${url}/api/v1/connect-sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, returnUrl }),
  });
  if (!res.ok) throw new Error(`Hub connect-session ${provider} fehlgeschlagen: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { url: string }).url;
}

export async function probeHubConnection(provider: HubProvider, fetchImpl: typeof fetch = fetch): Promise<HubConnectionState> {
  try {
    await getHubCredentials(provider, fetchImpl);
    return 'verbunden';
  } catch (err) {
    if (err instanceof HubNotConfiguredError) return 'nicht konfiguriert';
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('nicht verbunden')) return 'nicht verbunden';
    if (msg.includes('neu verbinden')) return 'neu verbinden';
    return 'fehler';
  }
}
