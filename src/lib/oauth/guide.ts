import type { OAuthProviderStatus } from './status';
import type { ProviderKey } from './types';

export type StepState = 'done' | 'current' | 'todo';

export interface GuideStep {
  title: string;
  body: string;
  state: StepState;
}

/** Short, layperson intro shown above the steps for each provider. */
export const GUIDE_INTRO =
  'Damit die App deine Zahlen beim Anbieter lesen darf, erlaubst du ihr das einmalig direkt ' +
  'beim Anbieter — das nennt sich OAuth. Dein Passwort sieht die App dabei nie. Folge den ' +
  'Schritten von oben nach unten; erledigte Schritte werden abgehakt.';

interface ProviderCopy {
  where: string;      // where the user creates the OAuth app
  createExtra: string; // provider-specific note for step 1
  connectNote?: string; // extra note shown on the connect/finish steps
}

const COPY: Record<ProviderKey, ProviderCopy> = {
  google: {
    where: 'in der Google Cloud Console (console.cloud.google.com)',
    createExtra:
      'Aktiviere dort die „GA4 Data API" und die „Google Ads API". Eine einzige Google-Verbindung ' +
      'deckt Google Analytics und Google Ads gemeinsam ab.',
    connectNote:
      'Google fragt dich nach Analytics- und Ads-Zugriff — beides bestätigen. Der Zugang erneuert sich danach automatisch.',
  },
  meta: {
    where: 'bei „Meta for Developers" (developers.facebook.com)',
    createExtra: 'Lege eine App an und gib ihr die Berechtigung „ads_read".',
    connectNote:
      'Hinweis: Meta-Zugänge laufen nach etwa 60 Tagen ab. Läuft er ab, klickst du hier einfach erneut auf „Verbinden".',
  },
  tiktok: {
    where: 'bei „TikTok for Business" (business-api.tiktok.com)',
    createExtra: 'Lege eine App an und beantrage den Zugriff auf deine Werbedaten.',
    connectNote: 'Der Zugang erneuert sich nach dem Verbinden automatisch.',
  },
};

function callbackUrls(key: ProviderKey): string {
  // One URL per line (rendered with whitespace-pre-line) so the long strings
  // read as a list and wrap cleanly inside the narrow guide panel.
  return (
    `http://localhost:3000/api/oauth/${key}/callback\n` +
    `https://budp.lumeapps.de/api/oauth/${key}/callback`
  );
}

/**
 * Derive the layperson setup checklist for one provider, with each step's state
 * reflecting the real OAuth status. Steps 1–3 (create app, register URLs, enter
 * credentials) are treated as done once app credentials exist — you cannot have valid
 * credentials without them. Steps 4–5 (connect, finished) are done once connected.
 */
export function guideSteps(status: OAuthProviderStatus): GuideStep[] {
  const copy = COPY[status.key];
  const label = status.label;
  const configured = status.hasAppCreds || status.connected;

  const done: boolean[] = [
    configured, // 1 create app
    configured, // 2 register redirect URLs
    configured, // 3 enter client id/secret
    status.connected, // 4 connect + consent
    status.connected, // 5 finished
  ];
  const firstOpen = done.indexOf(false);
  const stateFor = (i: number): StepState =>
    done[i] ? 'done' : i === firstOpen ? 'current' : 'todo';

  const bodies: { title: string; body: string }[] = [
    {
      title: `Zugang bei ${label} anlegen`,
      body: `Erstelle einen OAuth-Zugang ${copy.where}. ${copy.createExtra}`,
    },
    {
      title: 'Weiterleitungs-Adressen eintragen',
      body:
        `Trage beim Anbieter beide Rücksprung-Adressen ein, sonst verweigert er die Verbindung:\n` +
        `${callbackUrls(status.key)}`,
    },
    {
      title: 'Zugangsdaten hier eintragen',
      body:
        `Kopiere die „OAuth Client ID" und das „Client Secret" (App-ID/Secret) in die Felder ` +
        `unten im Formular und speichere. Erst dann wird der „Mit ${label} verbinden"-Knopf aktiv.`,
    },
    {
      title: `Mit ${label} verbinden`,
      body:
        `Klicke auf „Mit ${label} verbinden", melde dich im geöffneten Fenster an und stimme zu.` +
        (copy.connectNote ? ` ${copy.connectNote}` : ''),
    },
    {
      title: 'Fertig',
      body: 'Oben erscheint „✓ Verbunden". Ab jetzt holt die App die Daten automatisch — du musst nichts weiter tun.',
    },
  ];

  return bodies.map((s, i) => ({ ...s, state: stateFor(i) }));
}
