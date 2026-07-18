# Demo-Daten-Schalter für Ads-Kanäle — Design-Spec

*Datum: 2026-07-17 · Branch-Kontext: feat/phase-3-echte-kanaldaten*

## Problem

Das E-Commerce-Dashboard zeigt die Ads-Kennzahlen (Marketing-Effizienz je Ads-Kanal,
MER, ROAS, CPM, Impressions) nur, wenn `ad_spend`-Daten existieren. Solange die
Live-Connectoren (Google/Meta/TikTok) noch nicht angebunden sind, ist `ad_spend`
leer und das Dashboard zeigt überall „N/A — Quelle nicht verbunden". Es fehlt eine
Möglichkeit, die Ads-Ansichten mit realistischen Daten zu testen, ohne echte APIs.

## Ziel

Ein admin-gegateter Schalter im Einstellungsmenü (`/setup`), der Demo-`ad_spend`
für die drei Ads-Plattformen an- und ausschaltet. Scope bewusst **nur Ads-Kanäle**
(`ad_spend`) — GA4/Traffic (`daily_metrics`) bleibt unberührt.

## Datensicherheit: `is_demo`-Marker

`ad_spend` bekommt eine idempotente Spalte, damit Demo-Zeilen sauber von echten
API-Daten getrennt sind und das Ausschalten nie echte Daten trifft:

```sql
ALTER TABLE ad_spend ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
```

- Demo-Zeilen: `is_demo = true`. Echte Connector-Daten: `is_demo = false` (die drei
  `src/connectors/{meta,google,tiktok}/write.ts` setzen die Spalte NICHT → Default
  greift; **kein Eingriff in die Connectoren nötig**).
- Ausschalten löscht ausschließlich `WHERE is_demo = true` → echte Daten immer sicher.
- Die Reads (`loadDataset` via Supabase, `marginTotals`/`channelSummary` via pool)
  aggregieren weiterhin ALLE Zeilen im Zeitraum — `is_demo` ist nur ein
  Lösch-/Herkunfts-Marker, keine Filterspalte in den Reads.

Hinweis (dokumentiert): `ad_spend`-PK ist `(date, platform)`. **Ausschalten** ist
immer sicher (`DELETE WHERE is_demo = true` — nie echte Zeilen). **Einschalten**
überschreibt dank `ON CONFLICT (date, platform) DO NOTHING` keine echten Zeilen:
liegt für eine (Datum, Plattform) bereits eine echte Zeile (`is_demo=false`), bleibt
sie erhalten und die Demo-Zeile für genau diese Kombination wird übersprungen
(Demo füllt nur die freien Kombinationen). Kein PK-Crash, kein Datenverlust. Ein
echter Connector-Sync (DELETE WHERE platform=… + INSERT) räumt Demo-Zeilen derselben
Plattform ohnehin automatisch weg.

## Zustand: `app_settings`

Persistiert über den Key `demo_ads_enabled` ('true'/'false'). Neue Helfer in
`src/lib/settings.ts`, nach dem Muster von `getSyncInterval`/`setSyncInterval`:

- `getDemoAdsEnabled(): Promise<boolean>` — liest `app_settings`, `try/catch` mit
  Default `false` (falls Tabelle/Key fehlt).
- `setDemoAdsEnabled(enabled: boolean): Promise<void>` — `INSERT … ON CONFLICT (key)
  DO UPDATE`.

## Logik: `src/lib/demo-ads.ts`

- `enableDemoAds(): Promise<void>`
  - `range = { start: addDays(today, -179), end: today }` (180 Tage, wie der Seed).
  - `const { adSpend } = generateSeedData(range)` aus `src/connectors/seed/generator.ts`.
  - In einer Transaktion, je Plattform: `DELETE FROM ad_spend WHERE platform = $1 AND
    is_demo = true` (idempotentes Re-Enable), dann INSERT der Demo-Zeilen mit
    `is_demo = true` (chunked) und **`ON CONFLICT (date, platform) DO NOTHING`** —
    vorhandene echte Zeilen (`is_demo=false`) bleiben unangetastet, Demo füllt nur
    die freien (Datum, Plattform); kein PK-Crash.
  - `await setDemoAdsEnabled(true)`.
- `disableDemoAds(): Promise<void>`
  - `DELETE FROM ad_spend WHERE is_demo = true`.
  - `await setDemoAdsEnabled(false)`.

`today` wird ohne `Date.now()` aus einem übergebenen/aktuellen ISO-Datum abgeleitet
(die App darf `new Date()` — nur Workflow-Skripte nicht). Muster wie
`ecomSalesFacts`-Aufrufer (`new Date().toISOString().slice(0,10)`).

## Server-Action: `src/app/setup/actions.ts`

`toggleDemoAdsAction(enabled: boolean): Promise<void>` — exakt das Admin-Muster von
`simulateConnectAction`:

```ts
const { data: { user } } = await createClient().auth.getUser();
const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };
if (!access.isAdmin) throw new Error('Nur für Administratoren.');
if (enabled) await enableDemoAds(); else await disableDemoAds();
revalidatePath('/setup');
revalidatePath('/verkauf/dashboard');
```

## UI: `src/components/DemoAdsForm.tsx`

Neue Sektion in `src/app/setup/page.tsx`, gerendert nach `SyncForm` (Reihenfolge
minor). Client-Komponente, Prop `enabled: boolean` (aus `getDemoAdsEnabled()` in der
Server-Seite geladen). Zeigt:

- Überschrift + `.anno`-Micro-Label, Kurztext „Demo-Ads-Daten fürs Dashboard —
  kein echter API-Aufruf" (analog `ConnectionStubs`-Wording).
- Aktueller Zustand (an/aus) + ein Umschalt-Button, der `toggleDemoAdsAction(!enabled)`
  via `useTransition` aufruft und danach `router.refresh()`.
- Design-System: warme `neutral`-Palette, Akzent nur `bg-accent`/`text-accent`,
  `.anno` einziges Uppercase, `dark:`-Varianten.

Admin-Gating erfolgt über die Seite (`/setup` redirectet Nicht-Admins) — die Sektion
erbt das; zusätzlich prüft die Action serverseitig.

## Tests (TDD, gegen die saubere Sibling-DB `bryx_kosten_test`)

- `tests/lib/demo-ads.test.ts`:
  - `enableDemoAds()` schreibt Demo-Zeilen für alle drei Plattformen mit `is_demo=true`
    (Count > 0 je Plattform); `getDemoAdsEnabled()` danach `true`.
  - Vorher eine echte Zeile `is_demo=false` einfügen; nach `disableDemoAds()` sind alle
    `is_demo=true` weg, die echte Zeile bleibt; `getDemoAdsEnabled()` `false`.
  - Cleanup: `DELETE FROM ad_spend WHERE is_demo=true`, eingefügte Testzeile entfernen,
    `app_settings`-Key zurücksetzen.
- `tests/lib/settings.test.ts` (falls vorhanden erweitern, sonst neu): Roundtrip
  `setDemoAdsEnabled`/`getDemoAdsEnabled`.
- `tests/app/demo-ads-action.test.ts`: Admin-Gate der Action mocked (admin ok,
  non-admin wirft „Nur für Administratoren."), analog `tests/app/connection-stub.test.ts`.

## Doku

Kurzer Eintrag auf der Admin-Hilfeseite (`verbindungen` oder Setup-Abschnitt in
`src/lib/help/content.ts`): dass Admins Demo-Ads-Daten unter `/setup` an/ausschalten
können, um das Dashboard vor Live-Anbindung zu testen. Registry-Test bleibt grün.

## Bewusst nicht im Scope (YAGNI)

- Kein Demo-Modus für GA4/Traffic (`daily_metrics`), Subscriber oder Bestellungen —
  nur `ad_spend`.
- Keine Konfigurierbarkeit von Datumsbereich/Höhe der Demo-Werte (fixe 180 Tage,
  `generateSeedData`-Werte).
- Kein `is_demo`-Filter in den Reads (Dashboard zeigt Demo wie echte Daten — genau
  der Testzweck).
- Keine Änderung an den drei Ads-Connectoren.
