# Design: Seite „Email-Marketing" unter Verkauf

Datum: 2026-07-24
Status: Approved (Design), bereit für Implementierungsplan

## Ziel

Eine neue Unterseite `/verkauf/email-marketing`, die den **Abmelde-Verlauf**
sowie **Anmeldungen** und **Netto-Wachstum** aus den bereits gespeicherten
`subscribers`-Daten (Mailchimp/Klaviyo) darstellt. Kein neuer API-Call, keine
neue Tabelle — reine Darstellung vorhandener Daten.

## Kontext

Die Tabelle `subscribers` (`date, source, signups, unsubscribes, nps_score`,
`db/schema.sql:57-64`) wird ausschließlich von den E-Mail/CRM-Connectoren
befüllt (Mailchimp: `src/connectors/mailchimp/`, Klaviyo: `src/connectors/klaviyo/`).
Der Mailchimp-Connector liest täglich `subs`/`unsubs` aus
`GET /lists/{id}/activity` und schreibt sie nach `subscribers` (source `mailchimp`).
Die Daten für den Abmelde-Verlauf liegen also bereits vor.

Aktuell nutzt nur die KPI-Ebene diese Daten: `newsletter_signups` (THINK,
`src/kpi/think.ts`) summiert `signups`. `unsubscribes` wird gespeichert, aber
von keiner KPI und keiner UI ausgewertet. Es existiert keine Marketing-/
E-Mail-Seite.

## Entscheidungen (aus Brainstorming)

- **Umfang:** Anmeldungen + Abmeldungen + Netto aus Bestandsdaten. Kein neuer
  API-Call, keine Kampagnen-Reports (das wäre ein separater späterer Schritt).
- **Quelle:** Alle E-Mail/CRM-Quellen zusammen aggregiert. Da `subscribers` nur
  von Mailchimp/Klaviyo befüllt wird, bedeutet das: alle Zeilen aggregieren,
  kein Quellenfilter.
- **Layout:** KPI-Kacheln oben + EIN kombinierter Chart darunter.
- **Abmeldungen als normale (positive) Balken**, nicht als negative Balken nach
  unten. Netto als überlagerte Linie.
- **Bucketing automatisch** nach Zeitbereich (Tag/Woche/Monat), wie die übrigen
  Verkauf-Charts.

## Architektur

### 1. Navigation & Route

- Neuer Eintrag in `ITEMS` von `src/components/VerkaufSidebar.tsx`:
  `{ href: '/verkauf/email-marketing', label: 'Email-Marketing' }`.
- Neue Seite `src/app/(shell)/verkauf/email-marketing/page.tsx`:
  - async Server Component, `export const dynamic = 'force-dynamic'`.
  - Zugriff ist bereits durch `src/app/(shell)/verkauf/layout.tsx`
    (`requireAppAccess('verkauf')`) gegated — kein eigener Access-Call nötig.
  - `activeApp()` (`src/lib/shell-nav.ts`) matcht den `/verkauf`-Prefix, Rail und
    ModuleBar funktionieren automatisch.

### 2. Datenfluss

- `createClient()` (`@/lib/supabase/server`) + `loadDataset(supabase)`
  (`src/kpi/repository.ts:9-26`) liefert `subscribers`
  (`date, source, signups, unsubscribes, npsScore`).
- Zeitbereich: `resolveRange(searchParams)` (`src/lib/range.ts`) aus
  `{ days, start, end }`; UI-Filter über `<Filters basePath="/verkauf/email-marketing">`
  mit den vorhandenen Presets (7/30/90/365/all).
- **Reine Aggregationsfunktion** in neuer Datei `src/verkauf/email-marketing.ts`:
  - `aggregateSubscribers(rows, range)`:
    - filtert Zeilen auf den Bereich (`inRange`, wie `src/kpi/think.ts:9`),
    - bucketet mit `pickBucket`/`bucketSum` aus `src/lib/series.ts`
      (Tag/Woche/Monat je nach Bereichslänge),
    - summiert je Bucket `signups` und `unsubscribes`, berechnet
      `netto = signups − unsubscribes`.
    - Rückgabe: `{ totals: { signups, unsubscribes, netto }, series: EmailMarketingPoint[] }`
      mit `EmailMarketingPoint = { date: string; signups: number; unsubscribes: number; netto: number }`.
  - Bewusst DB-frei und rein → unit-testbar ohne DB (die Verkauf-Suite läuft auf
    der Dev-DB nicht, Aggregationslogik muss davon unabhängig prüfbar sein).

### 3. Darstellung

- **KPI-Kacheln** (Summen über den Bereich): Anmeldungen, Abmeldungen, Netto.
  Umsetzung über `<KpiTrendRow>` (`src/components/KpiTrendRow.tsx`,
  `KpiTrendItem[]`) oder schlichte Tiles im gleichen Stil wie
  `src/app/(shell)/verkauf/page.tsx`.
- **Kombinierter Chart**: neue Komponente `src/components/EmailMarketingChart.tsx`,
  Vorlage `src/components/StockSalesChart.tsx` (recharts `ComposedChart`):
  - `Bar` Anmeldungen, `Bar` Abmeldungen (Kontrastfarbe), `Line` Netto.
  - Props: `{ series: EmailMarketingPoint[] }`.
  - Farben & Formatter ausschließlich aus `src/components/charts/chart-style.ts`
    (`BRAND`, `CATEGORICAL`, `MUTED`, `TICK`, `num`, `axisLabel`) — keine
    hardcodierten Farben, ERP-Design-Tokens, Dark-Mode inklusive.
  - Leerer-Daten-Fall behandeln (wie `KpiLineChart`).

### 4. Tests

- Vitest-Unit-Test für `aggregateSubscribers` (`tests/verkauf/email-marketing.test.ts`
  oder passend zur bestehenden Teststruktur):
  - Summenberechnung und Netto = signups − unsubscribes,
  - Bucketing für kurze vs. lange Bereiche,
  - leere Eingabe / Bereich ohne Daten,
  - Aggregation über mehrere Quellen (mailchimp + klaviyo) in denselben Bucket.
- TDD: Test zuerst, dann Implementierung.

### 5. Dokumentation

- Hilfe-Modul: Kurzabschnitt zur neuen Seite in der Verkauf-Hilfe
  (`src/lib/help/content.ts`) ergänzen (CLAUDE.md-Doku-Pflicht). Da es eine
  Unterseite des bestehenden `verkauf`-Apps ist und keine neue App, ist keine
  neue Registry-Hilfeseite nötig (der Registry-Test erzwingt nur eine Hilfeseite
  pro App).

## Bewusst weggelassen (YAGNI)

- Kein neuer Mailchimp-/Klaviyo-API-Call, keine neue Tabelle, kein Sync-Change.
- Kein Quellen-Split (Serie pro Quelle) — nur aggregiert.
- Keine Kampagnen-Reports (Öffnungs-/Klickraten, Umsatz je Kampagne). Das bleibt
  ein möglicher separater Folgeschritt (Connector erweitern: `GET /campaigns`,
  `GET /reports/{id}`, neue Tabelle, Sync).
- Keine negative Balkendarstellung für Abmeldungen.

## Betroffene/neue Dateien

- neu: `src/app/(shell)/verkauf/email-marketing/page.tsx`
- neu: `src/verkauf/email-marketing.ts`
- neu: `src/components/EmailMarketingChart.tsx`
- neu: `tests/verkauf/email-marketing.test.ts`
- geändert: `src/components/VerkaufSidebar.tsx` (ein `ITEMS`-Eintrag)
- geändert: `src/lib/help/content.ts` (Hilfetext)
