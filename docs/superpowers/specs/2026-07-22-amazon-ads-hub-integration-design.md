# Amazon Ads über den social-platform-sync Hub

**Datum:** 2026-07-22
**Status:** genehmigt
**Kontext:** Erste echte Hub-Konsumption in ecom-platform. Der Hub
(social-platform-sync, hub.lumeapps.de) brokert seit PR #3 die Provider
`amazon_ads` und `amazon_sp` (LWA, EU-only) und liefert Credentials über seine
Maschinen-API (per-Install API-Key). ecom-platform konsumiert den Hub bisher
gar nicht; die Ads-Connectoren (Meta/Google/TikTok) laufen mit lokalen
Dev-Keys aus dem `connector_credentials`-Vault.

## Ziel

1. **Hub-Client-Schicht** in ecom-platform: Credentials-Bezug und
   Connect-Flow über den Hub — wiederverwendbar für alle Hub-Provider.
2. **Amazon Ads als System-A-Connector** (`src/connectors/amazon-ads/`):
   täglicher Ad-Spend → `ad_spend`/`daily_metrics`, Kanal `marktplatz`
   (bestehendes Mapping `amazon_ads → marktplatz` in
   `src/verkauf/ad-channel-map.ts` greift unverändert).
3. **`amazon_sp` als vorbereiteter Provider**: Connect-Flow + Statusanzeige,
   aber noch kein Daten-Sync (SP-API-Entwicklerfreigabe steht aus).

**Nicht im Scope:** SP-API-Daten-Sync (P6), Sponsored Brands/Display,
Phase-3-ERP-Pfad (`channel_costs`, P2/P7), Änderungen am Hub selbst
(dort ist alles Nötige gemerged und deployed).

## 1. Hub-Client (`src/lib/hub.ts`)

Dünner, typisierter Client für die Hub-Maschinen-API:

- `getHubCredentials(provider)` →
  `GET {hubUrl}/api/v1/credentials/{provider}`, `Authorization: Bearer {apiKey}`.
  Antwort: `{ accessToken, expiresAt, accountConfig, clientId? }`.
  Der Hub refresht Tokens selbst; ecom-platform speichert **keine**
  Amazon-Tokens — sie werden pro Sync-Lauf frisch geholt und nur im
  Speicher gehalten.
- `createHubConnectSession(provider, returnUrl)` →
  `POST {hubUrl}/api/v1/connect-sessions` → `{ url }` (Consent-URL für den
  Redirect).
- Fehler-Mapping: `404 not_connected` → „nicht verbunden";
  `424 reconnect_required` → „Neu verbinden erforderlich" (Connect-Button
  wieder aktiv); Netzwerkfehler/`401` → Konfigurationsfehler in der
  Verbindungen-UI.

**Konfiguration:** Hub-Basis-URL (`https://hub.lumeapps.de`) und API-Key
liegen als neuer Connector-Eintrag `hub` im bestehenden AES-Vault
(`connector_credentials`), gepflegt über dieselbe Settings-UI wie alle
anderen Connector-Credentials. Keine neuen Env-Vars, kein neuer
Secret-Mechanismus.

## 2. Connect-Flow (Verbindungen-UI)

Für `amazon_ads` und `amazon_sp` (gleicher Code-Pfad):

- „Verbinden"-Button → Server-Action ruft `createHubConnectSession` mit
  `returnUrl` zurück zur Settings-Seite → Redirect zum Hub → Nutzer wählt
  dort das Werbeprofil (bestehende Hub-Select-Seite) → Rückkehr mit
  `?connected=amazon_ads`.
- Verbindungsstatus in ecom = leichter Credentials-Probe gegen den Hub
  (200/404/424), **kein** lokaler Status — der Hub ist die einzige Quelle
  der Wahrheit für „verbunden".

## 3. Amazon-Ads-Connector (`src/connectors/amazon-ads/`)

Spiegelt den Meta-Connector-Aufbau (`client.ts`, `connector.ts`,
`types.ts`, `write.ts`):

- **Credentials:** `connector.ts` bezieht sie über
  `getHubCredentials('amazon_ads')` statt aus dem lokalen Vault.
  Header pro API-Call: `Authorization: Bearer {accessToken}`,
  `Amazon-Advertising-API-ClientId: {clientId}`,
  `Amazon-Advertising-API-Scope: {accountConfig.profileId}`.
- **`client.ts`:** Ads **Reporting API v3** (EU-Host
  `https://advertising-api-eu.amazon.com`), asynchrones Job-Modell:
  `POST /reporting/reports` (Tages-Granularität) → Status pollen bis
  `COMPLETED` (mit Poll-Obergrenze — hängender Job lässt den Sync-Lauf
  sauber fehlschlagen statt zu blockieren) → Ergebnis laden und
  entpacken (gzip JSON).
- **Scope erste Scheibe: nur Sponsored Products** (`spCampaigns`) — der
  Großteil des Spends, ein Report-Typ, ein Spaltensatz. Sponsored
  Brands/Display sind als weitere Report-Typen im Client vorgesehen
  (Follow-up, kein Redesign).
- **`write.ts`:** identisches Muster wie Meta — `ad_spend`
  (`platform='amazon_ads'`: date, spend, impressions, clicks, conversions,
  conv_value) + `daily_metrics`.
- **Runner:** Registrierung im Sync-Runner mit demselben
  Inkrement-Fenster/`sync_state`-Verhalten wie die übrigen Ads-Connectoren.

## 4. Fehlerbehandlung

- Hub-Fehler: siehe §1.
- Amazon-seitig (429/5xx, Report-Timeout): Sync-Lauf schlägt über den
  bestehenden `sync_state`-Fehlerpfad fehl; keine neue Retry-Maschinerie.

## 5. Tests (TDD, `npx vitest`)

- Hub-Client gegen gemocktes `fetch`: 200/404/424/401-Pfade,
  Connect-Session-Erzeugung.
- Report-Client: create → poll → download inkl. gzip-Payload und
  Timeout-Fall (gemocktes `fetch`).
- Write-Schicht gegen die Dev-Postgres (bestehendes Testmuster).
- Connect-Flow-Server-Action: Redirect-URL-Aufbau, Rückkehr-Handling.
- Hilfe-Modul: `verbindungen`-Seite um Hub/Amazon ergänzen
  (Registry-Test `tests/lib/help-content.test.ts` erzwingt Abdeckung).
- Browser-Verifikation der Verbindungen-UI vor Übergabe.

## 6. Rollout (nach dem PR)

1. Hub-Admin (hub.lumeapps.de): Amazon-Ads-LWA-Client-ID/-Secret in den
   Provider-Settings hinterlegen; Redirect-URI
   `https://hub.lumeapps.de/oauth/amazon_ads/callback` in der
   Amazon-Konsole whitelisten (**Operator-Task**).
2. Hub-Admin: API-Client für die budp-Instanz anlegen → API-Key in die
   budp-Connector-Settings.
3. Deploy auf den budp-VPS — **nur nach expliziter Bestätigung**
   (Produktionsumgebung).
4. Echten Amazon-Ads-Account über den neuen Flow verbinden, Sync laufen
   lassen, Spend in `ad_spend`/Verkauf verifizieren.

`amazon_sp`: Consent kann ab SP-API-Freigabe jederzeit nachgeholt werden;
der Daten-Sync (P6) ist ein eigenes Vorhaben.
