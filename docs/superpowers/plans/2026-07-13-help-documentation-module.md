# Hilfe/Dokumentations-Modul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein in die Shell integriertes Hilfe-Modul mit Nutzer-Doku (Funktionen je Modul, für alle) und Admin-Doku (Rollen/Gruppen, Datenmodell, Verbindungen, Branding — nur für Admins).

**Architecture:** Neue App `hilfe` im AppRail, immer sichtbar (wie `dashboard`). Inhalte als typisierte TS-Daten in `src/lib/help/content.ts` (keine neue Dependency), gerendert durch eine `DocArticle`-Blockkomponente im ERP-Design-System. Multi-Page unter `(shell)/hilfe/[slug]`; Admin-Seiten serverseitig per `redirect` geschützt.

**Tech Stack:** Next.js App Router (Server Components), TypeScript, Tailwind (ERP-Design-System), Vitest + @testing-library/react.

## Global Constraints

- Design-System verbindlich: Akzent nur via `--accent`; warme `neutral`-Palette (kein gray/slate/zinc/stone, kein pures white/black außer `neutral-0`/`neutral-950`); Fonts Plus Jakarta Sans (`font-sans`) + DM Mono via `.anno` (einziges sanktioniertes Uppercase); Dark-Mode (`dark:`) für alles Neue Pflicht.
- Keine neue npm-Dependency (Inhalte sind TS-Daten).
- Test-Alias `@` → `src`. Tests unter `tests/**/*.test.{ts,tsx}`. Node-Tests default; `tests/components/**` läuft in jsdom.
- Deploy/Run nur auf dem VPS (`root@194.164.204.249`, https://budp.lumeapps.de) — **nie** lokal starten. `npx vitest` läuft lokal.
- Conventional Commits; jeder Commit baut/grün.

---

### Task 1: `hilfe`-App registrieren und immer sichtbar machen

**Files:**
- Modify: `src/lib/apps.ts`
- Modify: `src/lib/groups.ts:153-155` (`accessibleApps`)
- Test: `tests/lib/help-access.test.ts` (Create)

**Interfaces:**
- Consumes: `AppKey`, `APPS`, `AppDef` aus `src/lib/apps.ts`; `accessibleApps(access: UserAccess): AppDef[]`, `UserAccess` aus `src/lib/groups.ts`.
- Produces: erweiterte `AppKey` (enthält `'hilfe'`); `APPS` enthält `{ key:'hilfe', label:'Hilfe', abbr:'HI', href:'/hilfe' }`; `accessibleApps` liefert `hilfe` für jeden Nutzer.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/help-access.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { APPS } from '@/lib/apps';
import { accessibleApps } from '@/lib/groups';

describe('hilfe app registration', () => {
  it('is registered in APPS with the expected shape', () => {
    const hilfe = APPS.find((a) => a.key === 'hilfe');
    expect(hilfe).toEqual({ key: 'hilfe', label: 'Hilfe', abbr: 'HI', href: '/hilfe' });
  });

  it('is visible to a non-admin user without any app grants', () => {
    const apps = accessibleApps({ apps: {}, isAdmin: false });
    expect(apps.map((a) => a.key)).toContain('hilfe');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/help-access.test.ts`
Expected: FAIL (kein `hilfe` in `APPS`; `accessibleApps` enthält es nicht).

- [ ] **Step 3: Register the app in `src/lib/apps.ts`**

Ändere die `AppKey`-Union und das `APPS`-Array:

```ts
export type AppKey = 'dashboard' | 'brickpm' | 'kontakte' | 'katalog' | 'hilfe';
```

Füge am Ende von `APPS` (nach dem `katalog`-Eintrag) hinzu:

```ts
  { key: 'hilfe', label: 'Hilfe', abbr: 'HI', href: '/hilfe' },
```

- [ ] **Step 4: Make it always visible in `src/lib/groups.ts`**

Ersetze den Body von `accessibleApps` (Zeile ~154):

```ts
export function accessibleApps(access: UserAccess): AppDef[] {
  return APPS.filter(
    (a) => a.key === 'dashboard' || a.key === 'hilfe' || access.isAdmin || !!access.apps[a.key],
  );
}
```

Aktualisiere den Doc-Kommentar darüber:

```ts
/** Apps to surface in the Rail/Launchpad. Dashboard + Hilfe are always shown (ungated baseline); others gated. */
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/help-access.test.ts`
Expected: PASS (beide Tests grün).

- [ ] **Step 6: Commit**

```bash
git add src/lib/apps.ts src/lib/groups.ts tests/lib/help-access.test.ts
git commit -m "feat(hilfe): register Hilfe app, always visible in rail"
```

---

### Task 2: Inhaltsmodell + Registry + Seed-Inhalt

**Files:**
- Create: `src/lib/help/content.ts`
- Test: `tests/lib/help-content.test.ts` (Create)

**Interfaces:**
- Consumes: `APPS`, `AppKey` aus `src/lib/apps.ts`.
- Produces:
  - Typen `DocBlock`, `DocSection`, `DocPage` (Feld `group: 'start'|'module'|'admin'`, optional `admin?: boolean`).
  - `HELP_PAGES: DocPage[]`.
  - `getHelpPage(slug: string): DocPage | undefined`.
  - `HELP_USER_PAGES: DocPage[]` (`group !== 'admin'`), `HELP_ADMIN_PAGES: DocPage[]` (`admin === true`).

- [ ] **Step 1: Write the failing test**

Create `tests/lib/help-content.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { APPS } from '@/lib/apps';
import {
  HELP_PAGES,
  HELP_USER_PAGES,
  HELP_ADMIN_PAGES,
  getHelpPage,
} from '@/lib/help/content';

describe('help content registry', () => {
  it('has unique, url-safe slugs', () => {
    const slugs = HELP_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  it('provides a module help page for every registered app except hilfe itself', () => {
    const moduleSlugs = new Set(
      HELP_PAGES.filter((p) => p.group === 'module').map((p) => p.slug),
    );
    for (const app of APPS) {
      if (app.key === 'hilfe') continue;
      expect(moduleSlugs.has(app.key)).toBe(true);
    }
  });

  it('flags admin pages consistently', () => {
    for (const p of HELP_PAGES) {
      if (p.group === 'admin') expect(p.admin).toBe(true);
      else expect(p.admin).not.toBe(true);
    }
    expect(HELP_ADMIN_PAGES.every((p) => p.admin === true)).toBe(true);
    expect(HELP_USER_PAGES.some((p) => p.admin === true)).toBe(false);
  });

  it('resolves pages by slug', () => {
    expect(getHelpPage('kontakte')?.title).toBeTruthy();
    expect(getHelpPage('does-not-exist')).toBeUndefined();
  });

  it('every page has at least one section with at least one block', () => {
    for (const p of HELP_PAGES) {
      expect(p.sections.length).toBeGreaterThan(0);
      for (const s of p.sections) expect(s.blocks.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/help-content.test.ts`
Expected: FAIL (`@/lib/help/content` existiert nicht).

- [ ] **Step 3: Create `src/lib/help/content.ts` (types + helpers)**

```ts
export type DocBlock =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'steps'; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'note'; text: string };

export interface DocSection {
  heading: string;
  blocks: DocBlock[];
}

export interface DocPage {
  slug: string;
  title: string;
  summary: string;
  group: 'start' | 'module' | 'admin';
  admin?: boolean;
  sections: DocSection[];
}

export const HELP_PAGES: DocPage[] = [
  /* Seed-Seiten folgen in Step 4 */
];

export function getHelpPage(slug: string): DocPage | undefined {
  return HELP_PAGES.find((p) => p.slug === slug);
}

export const HELP_USER_PAGES: DocPage[] = HELP_PAGES.filter((p) => p.group !== 'admin');
export const HELP_ADMIN_PAGES: DocPage[] = HELP_PAGES.filter((p) => p.admin === true);
```

- [ ] **Step 4: Fill `HELP_PAGES` with the seed content**

Ersetze das leere `HELP_PAGES`-Array durch die folgenden Seiten (Reihenfolge = Sidebar-Reihenfolge). Texte sind aus Code/Schema abgeleitet, knapp gehalten.

```ts
export const HELP_PAGES: DocPage[] = [
  // ── Erste Schritte ────────────────────────────────────────────────
  {
    slug: 'uebersicht',
    title: 'Übersicht & Navigation',
    summary: 'Aufbau der Plattform und wie man sich bewegt.',
    group: 'start',
    sections: [
      {
        heading: 'Was ist diese Plattform?',
        blocks: [
          { type: 'p', text: 'Eine modulare ERP-Plattform. Jedes Modul deckt einen Arbeitsbereich ab: Kennzahlen (Dashboard), Sortiments- und Preissteuerung (BrickPM), Geschäftspartner (Kontakte) und Produktkatalog (Katalog).' },
        ],
      },
      {
        heading: 'Navigation',
        blocks: [
          { type: 'list', items: [
            'Linke Leiste (AppRail): Wechsel zwischen den Modulen. Das aktive Modul ist hervorgehoben.',
            'Logo oben links: zurück zum Launchpad (Startseite).',
            'Benutzermenü oben rechts: Einstellungen, Theme wechseln (hell/dunkel), Abmelden.',
          ] },
          { type: 'note', text: 'Sichtbar sind nur die Module, für die deine Gruppe freigeschaltet ist. Dashboard und Hilfe sind immer verfügbar.' },
        ],
      },
    ],
  },

  // ── Module (Nutzer) ───────────────────────────────────────────────
  {
    slug: 'dashboard',
    title: 'Dashboard',
    summary: 'Kennzahlen-Überblick aus den angebundenen Quellen.',
    group: 'module',
    sections: [
      {
        heading: 'Was macht das Modul?',
        blocks: [
          { type: 'p', text: 'Das Dashboard bündelt Kennzahlen (KPIs) aus angebundenen Quellen wie Shop-, Ads- und E-Mail-Systemen zu einem Überblick.' },
        ],
      },
      {
        heading: 'Wichtige Funktionen',
        blocks: [
          { type: 'list', items: [
            'KPI-Kacheln mit Vergleich zum Vorzeitraum.',
            'Zeitraum- und Quellen-Filter.',
            'Daten stammen aus den unter „Verbindungen“ konfigurierten Connectors.',
          ] },
        ],
      },
    ],
  },
  {
    slug: 'brickpm',
    title: 'BrickPM',
    summary: 'Sortiment, Preise, Aktionen und Wettbewerb steuern.',
    group: 'module',
    sections: [
      {
        heading: 'Was macht das Modul?',
        blocks: [
          { type: 'p', text: 'BrickPM ist das Product-Management für das Sortiment: Produkte, Preise/Margen, Aktionen und Wettbewerbsbeobachtung an einem Ort.' },
        ],
      },
      {
        heading: 'Wichtige Funktionen',
        blocks: [
          { type: 'list', items: [
            'Sortiment: Produkte mit Preis, Kosten und Marge pflegen.',
            'Aktionen & Goodies: Promotions planen und deren Margeneffekt sehen.',
            'Wettbewerb & Preis-Historie: eigene Preise gegen Wettbewerber verfolgen.',
            'Benachrichtigungen: Hinweise und fällige Aufgaben im Blick behalten.',
          ] },
        ],
      },
    ],
  },
  {
    slug: 'kontakte',
    title: 'Kontakte',
    summary: 'Kunden und Lieferanten mit Adressen und Ansprechpartnern.',
    group: 'module',
    sections: [
      {
        heading: 'Was macht das Modul?',
        blocks: [
          { type: 'p', text: 'Kontakte verwaltet Geschäftspartner — Kunden und Lieferanten — mit Stammdaten, Adressen und Ansprechpartnern.' },
        ],
      },
      {
        heading: 'Wichtige Funktionen',
        blocks: [
          { type: 'list', items: [
            'Liste aller Kontakte mit Kennzeichnung Kunde/Lieferant.',
            'Detailansicht mit Rechnungs-/Lieferadressen und Ansprechpartnern.',
            'Steuer- und Zahlungsdaten (USt-IdNr., Zahlungsziel, Preisliste, Währung).',
            'Verbindungen: Anbindung an externe Systeme (Einstellungen › Verbindungen).',
          ] },
        ],
      },
    ],
  },
  {
    slug: 'katalog',
    title: 'Katalog',
    summary: 'Produkte, Varianten, Preise und Bundles.',
    group: 'module',
    sections: [
      {
        heading: 'Was macht das Modul?',
        blocks: [
          { type: 'p', text: 'Der Katalog pflegt Produkte samt Varianten (SKU/GTIN), Preisen je Preisliste, Bundles und Dokumenten.' },
        ],
      },
      {
        heading: 'Wichtige Funktionen',
        blocks: [
          { type: 'list', items: [
            'Produkte mit Lebenszyklus-Status (Konzept bis Eingestellt).',
            'Varianten mit SKU, GTIN, Einkaufspreis und Nachbestellpunkt.',
            'Preise je Preisliste inkl. Staffeln (Mindestmenge).',
            'Bundles und Produktdokumente.',
            'Verbindungen: Anbindung an externe Systeme (Einstellungen › Verbindungen).',
          ] },
        ],
      },
    ],
  },

  // ── Administration (nur Admin) ────────────────────────────────────
  {
    slug: 'rollen-gruppen',
    title: 'Rollen & Gruppen',
    summary: 'Zugriffssteuerung über Gruppen und App-Berechtigungen.',
    group: 'admin',
    admin: true,
    sections: [
      {
        heading: 'Konzept',
        blocks: [
          { type: 'p', text: 'Zugriff wird über Gruppen gesteuert. Ein Nutzer erbt die Rechte aller Gruppen, in denen er Mitglied ist. Es gibt keine Rechte direkt am Nutzer.' },
          { type: 'list', items: [
            'Admin-Gruppe (is_admin): sieht und darf alles, inkl. Administration.',
            'App-Zugriff je Gruppe: „view“ (lesen) oder „edit“ (bearbeiten) pro Modul.',
            'Dashboard und Hilfe sind ungated (für alle sichtbar).',
          ] },
        ],
      },
      {
        heading: 'Standardverhalten',
        blocks: [
          { type: 'list', items: [
            'Ist noch keine Gruppe vorhanden, gilt der erste Nutzer als Voll-Admin.',
            'Neue Nutzer werden der Standardgruppe „Alle Nutzer“ zugeordnet.',
            'Die letzte Admin-Gruppe kann nicht entzogen werden (Aussperr-Schutz).',
          ] },
          { type: 'note', text: 'Verwaltung unter Einstellungen (/setup): Nutzer, Gruppen, Zugriffe.' },
        ],
      },
    ],
  },
  {
    slug: 'datenmodell',
    title: 'Datenmodell',
    summary: 'Die wichtigsten Tabellen je Domäne.',
    group: 'admin',
    admin: true,
    sections: [
      {
        heading: 'Kontakte',
        blocks: [
          { type: 'table', head: ['Tabelle', 'Zweck', 'Wichtige Felder'], rows: [
            ['contacts', 'Geschäftspartner (Stammdaten)', 'number, name, is_customer, is_supplier, vat_id, payment_terms, price_list_id, status'],
            ['contact_addresses', 'Adressen je Kontakt', 'contact_id, type (rechnung/lieferung), street, zip, city, country, is_default'],
            ['contact_persons', 'Ansprechpartner je Kontakt', 'contact_id, name, email, phone, role'],
          ] },
        ],
      },
      {
        heading: 'Katalog',
        blocks: [
          { type: 'table', head: ['Tabelle', 'Zweck', 'Wichtige Felder'], rows: [
            ['products', 'Produkt-Stammdaten', 'name, lifecycle_status, category, brand, default_supplier_id'],
            ['product_variants', 'Varianten je Produkt', 'product_id, sku, gtin, purchase_price, reorder_point, status'],
            ['prices', 'Preise je Variante/Preisliste', 'variant_id, price_list_id, min_qty, amount, valid_from'],
            ['product_bundles', 'Bundle-Zusammensetzung', 'bundle_variant_id, component_variant_id, quantity'],
            ['product_documents', 'Dokumente je Produkt', 'product_id, type, file_url, expires_at'],
          ] },
        ],
      },
      {
        heading: 'Zugriff & Plattform',
        blocks: [
          { type: 'table', head: ['Tabelle', 'Zweck', 'Wichtige Felder'], rows: [
            ['groups', 'Gruppen', 'name, is_admin'],
            ['group_members', 'Gruppen-Mitgliedschaft', 'group_id, user_id'],
            ['group_app_access', 'App-Rechte je Gruppe', 'group_id, app, permission (view/edit)'],
            ['price_lists', 'Preislisten', 'name, currency, is_default'],
          ] },
        ],
      },
      {
        heading: 'Integrationen',
        blocks: [
          { type: 'table', head: ['Tabelle', 'Zweck', 'Wichtige Felder'], rows: [
            ['connector_credentials', 'Verschlüsselte Zugangsdaten', 'connector, field, ciphertext'],
            ['oauth_connections', 'OAuth-Tokens je Provider', 'provider, refresh_token_enc, expires_at, account_label'],
            ['integration_connections', 'Verbindungen je App/Provider', 'app, provider, label, status, last_synced_at'],
            ['external_references', 'ID-Mapping zu Fremdsystemen', 'entity_type, entity_id, source_system, external_id'],
            ['sync_state', 'Sync-Status je Connector', 'connector, last_run_at, status, detail'],
          ] },
          { type: 'note', text: 'BrickPM-Tabellen (bpm_*) sind hier noch nicht dokumentiert.' },
        ],
      },
    ],
  },
  {
    slug: 'verbindungen',
    title: 'Verbindungen & Connectors',
    summary: 'Externe Systeme anbinden und synchronisieren.',
    group: 'admin',
    admin: true,
    sections: [
      {
        heading: 'Konzept',
        blocks: [
          { type: 'p', text: 'Module binden externe Systeme über Verbindungen an. Zugangsdaten werden verschlüsselt gespeichert; OAuth-Provider laufen über den OAuth-Flow.' },
          { type: 'list', items: [
            'Zugangsdaten (connector_credentials): API-Keys/Secrets, verschlüsselt.',
            'OAuth (oauth_connections): Token-basierte Anbindung je Provider.',
            'Verbindungen je App (integration_connections): Status und letzter Sync.',
          ] },
        ],
      },
      {
        heading: 'Bedienung',
        blocks: [
          { type: 'list', items: [
            'Kontakte/Katalog: Einstellungen › Verbindungen.',
            'Plattform-Zugangsdaten & Sync: Einstellungen (/setup).',
          ] },
        ],
      },
    ],
  },
  {
    slug: 'branding',
    title: 'Branding / White-Label',
    summary: 'Logo und Titel je Mandant anpassen.',
    group: 'admin',
    admin: true,
    sections: [
      {
        heading: 'Was ist White-Label?',
        blocks: [
          { type: 'p', text: 'Logo und Titel der Plattform sind konfigurierbar und werden über getBranding() im Root-Layout angewendet. So erscheint die Plattform im Erscheinungsbild des Mandanten.' },
          { type: 'list', items: [
            'Logo: erscheint in AppRail und Top-Bar; Fallback ist das bryx-Logo.',
            'Titel: Anwendungsname (auch als Initiale, wenn kein Logo gesetzt ist).',
          ] },
          { type: 'note', text: 'Der Akzentton folgt dem Design-System-Token --accent (--brand).' },
        ],
      },
    ],
  },
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/help-content.test.ts`
Expected: PASS (alle 5 Tests grün).

- [ ] **Step 6: Commit**

```bash
git add src/lib/help/content.ts tests/lib/help-content.test.ts
git commit -m "feat(hilfe): help content model + seed pages (user + admin)"
```

---

### Task 3: `DocArticle`-Renderer

**Files:**
- Create: `src/components/help/DocArticle.tsx`
- Test: `tests/components/doc-article.test.tsx` (Create, jsdom)

**Interfaces:**
- Consumes: `DocPage`, `DocBlock` aus `@/lib/help/content`.
- Produces: `export function DocArticle({ page }: { page: DocPage })` — reine Darstellung, keine Client-Direktive nötig.

- [ ] **Step 1: Write the failing test**

Create `tests/components/doc-article.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DocArticle } from '@/components/help/DocArticle';
import type { DocPage } from '@/lib/help/content';

afterEach(cleanup);

const page: DocPage = {
  slug: 'demo', title: 'Demo Titel', summary: 'kurz', group: 'module',
  sections: [
    { heading: 'Abschnitt A', blocks: [
      { type: 'p', text: 'Ein Absatz.' },
      { type: 'list', items: ['Punkt eins', 'Punkt zwei'] },
    ] },
    { heading: 'Tabelle', blocks: [
      { type: 'table', head: ['Spalte'], rows: [['Zelle X']] },
    ] },
  ],
};

describe('DocArticle', () => {
  it('renders the title, section headings and block content', () => {
    render(<DocArticle page={page} />);
    expect(screen.getByText('Demo Titel')).toBeTruthy();
    expect(screen.getByText('Abschnitt A')).toBeTruthy();
    expect(screen.getByText('Ein Absatz.')).toBeTruthy();
    expect(screen.getByText('Punkt eins')).toBeTruthy();
    expect(screen.getByText('Spalte')).toBeTruthy();
    expect(screen.getByText('Zelle X')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/doc-article.test.tsx`
Expected: FAIL (`@/components/help/DocArticle` existiert nicht).

- [ ] **Step 3: Implement `src/components/help/DocArticle.tsx`**

```tsx
import type { DocBlock, DocPage } from '@/lib/help/content';

function Block({ block }: { block: DocBlock }) {
  switch (block.type) {
    case 'p':
      return <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{block.text}</p>;
    case 'list':
      return (
        <ul className="ml-5 list-disc space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
          {block.items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      );
    case 'steps':
      return (
        <ol className="ml-5 list-decimal space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
          {block.items.map((it, i) => <li key={i}>{it}</li>)}
        </ol>
      );
    case 'note':
      return (
        <div className="rounded-md border border-accent/30 bg-accent/[0.06] px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300">
          {block.text}
        </div>
      );
    case 'table':
      return (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                {block.head.map((h, i) => (
                  <th key={i} className="anno px-3 py-2 text-left text-neutral-500 dark:text-neutral-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 align-top text-neutral-700 dark:text-neutral-300">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function DocArticle({ page }: { page: DocPage }) {
  return (
    <article className="mx-auto max-w-3xl">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{page.title}</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{page.summary}</p>
      </header>
      <div className="space-y-10">
        {page.sections.map((s, si) => (
          <section key={si} className="space-y-3">
            <h2 className="anno text-neutral-500 dark:text-neutral-400">{s.heading}</h2>
            <div className="space-y-3">
              {s.blocks.map((b, bi) => <Block key={bi} block={b} />)}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/doc-article.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/help/DocArticle.tsx tests/components/doc-article.test.tsx
git commit -m "feat(hilfe): DocArticle block renderer"
```

---

### Task 4: `HilfeSidebar`

**Files:**
- Create: `src/components/help/HilfeSidebar.tsx`
- Test: `tests/components/hilfe-sidebar.test.tsx` (Create, jsdom)

**Interfaces:**
- Consumes: `HELP_PAGES` aus `@/lib/help/content`; `usePathname` aus `next/navigation`.
- Produces: `export function HilfeSidebar({ isAdmin }: { isAdmin: boolean })`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/hilfe-sidebar.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/hilfe' }));

import { HilfeSidebar } from '@/components/help/HilfeSidebar';

afterEach(cleanup);

describe('HilfeSidebar', () => {
  it('shows user pages but hides the admin group for non-admins', () => {
    render(<HilfeSidebar isAdmin={false} />);
    expect(screen.getByText('Kontakte')).toBeTruthy();
    expect(screen.queryByText('Datenmodell')).toBeNull();
    expect(screen.queryByText('Administration')).toBeNull();
  });

  it('shows the admin group for admins', () => {
    render(<HilfeSidebar isAdmin={true} />);
    expect(screen.getByText('Administration')).toBeTruthy();
    expect(screen.getByText('Datenmodell')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/hilfe-sidebar.test.tsx`
Expected: FAIL (Komponente fehlt).

- [ ] **Step 3: Implement `src/components/help/HilfeSidebar.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HELP_PAGES, type DocPage } from '@/lib/help/content';

const GROUPS: { key: DocPage['group']; label: string; adminOnly?: boolean }[] = [
  { key: 'start', label: 'Erste Schritte' },
  { key: 'module', label: 'Module' },
  { key: 'admin', label: 'Administration', adminOnly: true },
];

export function HilfeSidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="w-56 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-3 px-2 text-sm font-bold text-neutral-900 dark:text-neutral-100">Hilfe</p>
      <div className="space-y-4">
        {GROUPS.filter((g) => !g.adminOnly || isAdmin).map((g) => {
          const pages = HELP_PAGES.filter((p) => p.group === g.key);
          if (pages.length === 0) return null;
          return (
            <div key={g.key}>
              <p className="anno mb-1 px-2 text-neutral-400 dark:text-neutral-500">{g.label}</p>
              <ul className="space-y-1">
                {pages.map((p) => {
                  const href = `/hilfe/${p.slug}`;
                  const active = pathname === href;
                  return (
                    <li key={p.slug}>
                      <Link
                        href={href}
                        className={`block rounded-md px-3 py-1.5 text-sm ${active
                          ? 'bg-accent font-medium text-white'
                          : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'}`}
                      >
                        {p.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/hilfe-sidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/help/HilfeSidebar.tsx tests/components/hilfe-sidebar.test.tsx
git commit -m "feat(hilfe): sidebar with admin-gated group"
```

---

### Task 5: Routen (layout, Startseite, `[slug]`) mit Admin-Gate

**Files:**
- Create: `src/app/(shell)/hilfe/layout.tsx`
- Create: `src/app/(shell)/hilfe/page.tsx`
- Create: `src/app/(shell)/hilfe/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getUserAccess` aus `@/lib/groups`, `createClient` aus `@/lib/supabase/server`, `HilfeSidebar`, `DocArticle`, `HELP_USER_PAGES`, `HELP_ADMIN_PAGES`, `getHelpPage`.
- Produces: Route-Segment `/hilfe` und `/hilfe/[slug]`.

Hinweis: Diese Task hat keinen eigenen Unit-Test (Server-Komponenten mit Supabase; Gate ist trivialer Server-Code). Verifikation über `tsc`/Build + manuelle Browser-Prüfung im Verify-Schritt am Ende.

- [ ] **Step 1: `layout.tsx` — Sidebar + Admin-Flag**

Create `src/app/(shell)/hilfe/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/groups';
import { HilfeSidebar } from '@/components/help/HilfeSidebar';

export const dynamic = 'force-dynamic';

export default async function HilfeLayout({ children }: { children: ReactNode }) {
  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };

  return (
    <div className="flex flex-1 overflow-hidden">
      <HilfeSidebar isAdmin={access.isAdmin} />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: `page.tsx` — Startseite mit Karten**

Create `src/app/(shell)/hilfe/page.tsx`:

```tsx
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/groups';
import { HELP_USER_PAGES, HELP_ADMIN_PAGES, type DocPage } from '@/lib/help/content';

export const dynamic = 'force-dynamic';

function Card({ page }: { page: DocPage }) {
  return (
    <Link
      href={`/hilfe/${page.slug}`}
      className="block rounded-lg border border-neutral-200 bg-white p-4 hover:border-accent/40 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <p className="font-semibold text-neutral-900 dark:text-neutral-100">{page.title}</p>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{page.summary}</p>
    </Link>
  );
}

export default async function HilfeHome() {
  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Hilfe & Dokumentation</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Kurze Erklärungen zu den Modulen der Plattform.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {HELP_USER_PAGES.map((p) => <Card key={p.slug} page={p} />)}
      </div>

      {access.isAdmin && (
        <>
          <h2 className="anno mt-10 text-neutral-500 dark:text-neutral-400">Administration</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {HELP_ADMIN_PAGES.map((p) => <Card key={p.slug} page={p} />)}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `[slug]/page.tsx` — Detailseite mit Admin-Gate**

Create `src/app/(shell)/hilfe/[slug]/page.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/groups';
import { getHelpPage } from '@/lib/help/content';
import { DocArticle } from '@/components/help/DocArticle';

export const dynamic = 'force-dynamic';

export default async function HilfePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getHelpPage(slug);
  if (!page) notFound();

  if (page.admin) {
    const { data: { user } } = await createClient().auth.getUser();
    const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };
    if (!access.isAdmin) redirect('/hilfe');
  }

  return <DocArticle page={page} />;
}
```

- [ ] **Step 4: Typecheck & Build**

Run: `npx tsc --noEmit`
Expected: keine Fehler in den neuen Dateien.

Run: `npx next build`
Expected: Build erfolgreich; Route `/hilfe` und `/hilfe/[slug]` erscheinen in der Ausgabe.

> Falls das Projekt `next build` normalerweise nur im Deploy ausführt und lokal scheitert (Env), genügt `npx tsc --noEmit`; der Build wird im finalen VPS-Deploy verifiziert.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(shell)/hilfe"
git commit -m "feat(hilfe): routes with landing, [slug] page and admin gate"
```

---

### Task 6: CLAUDE.md-Regel „Dokumentation"

**Files:**
- Modify: `CLAUDE.md` (Projekt-Root)

**Interfaces:** keine (Prozess-Regel).

- [ ] **Step 1: Regel-Sektion ergänzen**

Füge in `/root/ecom-platform/CLAUDE.md` nach dem `## Design-Standard`-Block folgende Sektion an:

```markdown
## Dokumentation

- Das Hilfe-Modul (`/hilfe`, Inhalte in `src/lib/help/content.ts`) ist die
  gepflegte Nutzer- **und** Admin-Doku. Bei jeder relevanten Funktionsänderung
  mitpflegen:
  - Neues Modul/neue App → Modul-Hilfeseite ergänzen und in `content.ts`
    registrieren (der Registry-Test `tests/lib/help-content.test.ts` erzwingt,
    dass jede App eine Hilfeseite hat).
  - Änderung am Datenmodell → Admin-Seite `datenmodell` aktualisieren.
  - Neue Verbindung/Connector oder Zugriffslogik → `verbindungen` bzw.
    `rollen-gruppen` aktualisieren.
```

- [ ] **Step 2: Registry-Test erneut laufen lassen (Absicherung)**

Run: `npx vitest run tests/lib/help-content.test.ts tests/lib/help-access.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: require Hilfe module to be kept in sync on feature changes"
```

---

## Abschluss-Verifikation (nach allen Tasks)

- [ ] **Volle Test-Suite:** `npx vitest run` — alle neuen Tests grün; keine Regression (die bekannten RLS-Failures auf diesem Host sind erwartet, siehe Projekt-Memory).
- [ ] **Deploy auf dem VPS** gemäß Projekt-Regel (nicht lokal starten).
- [ ] **Browser-Check (Nutzer ohne Admin):** Hilfe-App im Rail sichtbar; Startseite zeigt nur Modul-Karten; Sidebar ohne „Administration"; direkter Aufruf von `/hilfe/datenmodell` → Redirect auf `/hilfe`.
- [ ] **Browser-Check (Admin):** Sidebar mit „Administration"; `/hilfe/datenmodell` zeigt die Tabellen; Dark-Mode und White-Label (Logo/Titel) unverändert korrekt.

---

## Self-Review (vom Plan-Autor)

**Spec-Abdeckung:**
- Nutzer-Doku je Modul → Task 2 (Seiten dashboard/brickpm/kontakte/katalog) + Task 3/5. ✔
- Admin-Doku inkl. Datenmodell → Task 2 (rollen-gruppen, datenmodell, verbindungen, branding). ✔
- Eigene App im AppRail, immer sichtbar → Task 1. ✔
- Admin-Gating (Sidebar + Route) → Task 4 + Task 5. ✔
- BrickPM aus Datenmodell ausgeklammert → Task 2 (note-Block). ✔
- Aktuell-halten via CLAUDE.md → Task 6. ✔
- Registry-Test → Task 2. ✔

**Placeholder-Scan:** Kein „TBD/TODO"; alle Code-Schritte enthalten vollständigen Code. ✔

**Typkonsistenz:** `DocPage`/`DocBlock`/`DocSection` in Task 2 definiert; in Tasks 3–5 identisch verwendet (`page.sections`, `block.type`, `HELP_USER_PAGES`, `HELP_ADMIN_PAGES`, `getHelpPage`). `accessibleApps`-Signatur unverändert. ✔
