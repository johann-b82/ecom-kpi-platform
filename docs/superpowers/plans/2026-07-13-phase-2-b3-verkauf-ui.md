# Phase 2 — B3 (Verkauf UI: Belegliste, Beleg-Detail mit Faden, manuelle Anlage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. UI-Feinschliff (Faden/Chips) folgt dem `frontend-design`-Skill.

**Goal:** Baue die erste Verkauf-Oberfläche — Belegliste (mit Spur), Beleg-Detail (mit dem horizontalen Faden) und die manuelle Beleganlage mit Auto-Vorbelegung — auf dem Beleg-Kern aus B1/B2.

**Architecture:** Server Components lesen über `src/verkauf/repository.ts` (raw `pg`), Client-Komponenten rendern und rufen die bestehenden B2-Server-Actions. Kein REST, kein neuer State-Layer. Der Faden ist eine reine Funktion aus `order_events`.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind (warme Neutrals + `--accent`), Vitest (`fileParallelism: false`).

## Global Constraints

- Zugriff: `requireAppAccess` hat **keinen Admin-Bypass** — `verkauf` muss als App registriert sein (APPS-Eintrag + `group_app_access`-Grant + Hilfeseite), sonst ist `/verkauf` für niemanden erreichbar.
- Datenzugriff = Server Components → `src/verkauf/repository.ts` (raw `pg`). Neue Funktionen sind **rein lesend**; `getOrder`/`listOrders`/`transitionOrderStatus`/`createReturn` aus B2 bleiben unverändert.
- UI-Muster spiegeln Kontakte/Katalog: `'use client'`, `useTransition` + `router.refresh()`, lokale Style-Consts, `.anno` für UPPERCASE-Mikrolabels, warme `neutral`-Skala + `--accent`, Dark-Mode-Varianten Pflicht. **Rot nur für „braucht Aufmerksamkeit"** (Retoure).
- Detail als eigene Route `/verkauf/[id]`, manuelle Anlage als eigene Route `/verkauf/neu` (kein Modal).
- Belegliste lebt unter `/verkauf`; Ebene-1-Aggregate sind B4 (nicht hier).
- Storno ist nur aus `angebot`/`auftrag` erlaubt (B2-Übergangslogik) — die UI bietet „Stornieren" nur dort an.
- **Env vor jedem DB-Befehl laden:** `set -a; source .env; set +a` (kein dotenv; `psql` nicht installiert → `node -e` mit `pg`).
- Belegnummer `A-<jahr>-####`. Verfügbare Menge überall `SUM(on_hand) − SUM(reserved)`.
- **Nach jeder UI-Task `npx tsc --noEmit`** laufen lassen — vitest (esbuild) typcheckt nicht; `next build` bricht sonst erst beim Deploy (in B2 so passiert).

---

## Dateistruktur

- Modify: `src/lib/apps.ts` — APPS-Eintrag `verkauf`.
- Modify: `db/schema.sql` — `'verkauf'` in die `group_app_access`-Seed-VALUES.
- Modify: `src/lib/help/content.ts` — Modul-Hilfeseite `slug:'verkauf'`.
- Modify: `src/verkauf/types.ts` — `OrderRow`, `OrderView`, `OrderViewLine`, `SellableVariant`, `CustomerOption`, `PriceEntry`.
- Modify: `src/verkauf/repository.ts` — reine Lese-Funktionen (Task 2).
- Create: `src/verkauf/faden.ts` — reine Faden-Perlen-Logik.
- Create: `src/app/(shell)/verkauf/{layout,page}.tsx`, `[id]/page.tsx`, `neu/page.tsx`.
- Create: `src/components/VerkaufSidebar.tsx`, `VerkaufList.tsx`, `Spur.tsx`, `VerkaufDetail.tsx`, `Faden.tsx`, `NeuerBeleg.tsx`.
- Test: `tests/verkauf/faden.test.ts`, erweitern `tests/verkauf/repository.test.ts`, `tests/lib/help-content.test.ts` (bleibt grün).

---

### Task 1: `verkauf` als App registrieren

Ohne diesen Schritt ist `/verkauf` für alle gesperrt. Macht die App im Rail sichtbar und für die `'Alle Nutzer'`-Gruppe zugänglich.

**Files:**
- Modify: `src/lib/apps.ts`
- Modify: `db/schema.sql`
- Modify: `src/lib/help/content.ts`
- Test: `tests/lib/help-content.test.ts` (bestehend)

- [ ] **Step 1: APPS-Eintrag**

In `src/lib/apps.ts`, im `APPS`-Array nach dem `katalog`-Eintrag:

```ts
  { key: 'verkauf', label: 'Verkauf', abbr: 'VK', href: '/verkauf' },
```

(Der `AppKey`-Union enthält `'verkauf'` bereits aus dem B2-Build-Fix.)

- [ ] **Step 2: Zugriff für 'Alle Nutzer' seeden**

In `db/schema.sql`, in der `group_app_access`-Seed-Anweisung, die VALUES-Liste um `('verkauf')` ergänzen:

```sql
INSERT INTO group_app_access (group_id, app, permission)
  SELECT g.id, a.app, 'edit' FROM groups g, (VALUES ('dashboard'),('brickpm'),('kontakte'),('katalog'),('verkauf')) AS a(app)
  WHERE g.name = 'Alle Nutzer'
  ON CONFLICT (group_id, app) DO NOTHING;
```

- [ ] **Step 3: Modul-Hilfeseite**

In `src/lib/help/content.ts`, im `HELP_PAGES`-Array nach der `katalog`-Seite (vor der ersten `group:'admin'`-Seite):

```ts
  {
    slug: 'verkauf',
    title: 'Verkauf',
    summary: 'Belege über alle Kanäle — mit Faden von Bestellung bis Zahlung.',
    group: 'module',
    sections: [
      {
        heading: 'Was macht das Modul?',
        blocks: [
          { type: 'p', text: 'Verkauf zeigt alle Belege (Angebote, Aufträge, Rechnungen, Gutschriften) über sämtliche Kanäle. Jeder Beleg trägt einen Faden: die Perlen bestellt, kommissioniert, Rechnung gestellt, bezahlt — und bei einer Retoure eine fünfte Perle.' },
        ],
      },
      {
        heading: 'Wichtige Funktionen',
        blocks: [
          { type: 'list', items: [
            'Belegliste über alle Kanäle mit Kurz-Spur je Zeile.',
            'Beleg-Detail mit vollständigem, klickbarem Faden (Perlen zeigen Zeitpunkt und Auslöser).',
            'Genau eine primäre Aktion je Status (z. B. In Auftrag wandeln, Rechnung stellen, Retoure anlegen).',
            'Beleg manuell anlegen: Kunde wählen, Positionen erfassen — Preis und Bestand werden vorbelegt.',
          ] },
        ],
      },
    ],
  },
```

- [ ] **Step 4: Migration anwenden (Grant landet auf Bestands-DB)**

Run: `set -a; source .env; set +a; npm run migrate`
Expected: ohne Fehler.

- [ ] **Step 5: Grant + Registry-Test prüfen**

Run:
```bash
set -a; source .env; set +a
node -e "const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"SELECT permission FROM group_app_access a JOIN groups g ON g.id=a.group_id WHERE g.name='Alle Nutzer' AND a.app='verkauf'\").then(r=>console.log(r.rows)).finally(()=>p.end())"
npx vitest run tests/lib/help-content.test.ts
```
Expected: `[ { permission: 'edit' } ]` und help-content 5/5 grün (die neue `verkauf`-Seite erfüllt „jede Modul-App hat eine Hilfeseite").

- [ ] **Step 6: Commit**

```bash
git add src/lib/apps.ts db/schema.sql src/lib/help/content.ts
git commit -m "feat(verkauf): register app (rail + Alle-Nutzer-Grant + Hilfeseite)"
```

---

### Task 2: Faden-Logik + Repository-Lesefunktionen + Typen

Der testbare Kern der UI. TDD: reine Faden-Logik zuerst, dann die Integrations-Lesefunktionen.

**Files:**
- Create: `src/verkauf/faden.ts`
- Modify: `src/verkauf/types.ts`
- Modify: `src/verkauf/repository.ts`
- Test: `tests/verkauf/faden.test.ts`, erweitern `tests/verkauf/repository.test.ts`

**Interfaces:**
- Produces: `beadsFromStages`, `FADEN_STAGES`; `listOrderRows`, `getOrderView`, `sellableVariants`, `priceForVariant`, `availableStock`, `listCustomerOptions`, `defaultPrices`; Typen `OrderRow`, `OrderView`, `OrderViewLine`, `SellableVariant`, `CustomerOption`, `PriceEntry`.

- [ ] **Step 1: Failing test — Faden-Perlen**

Create `tests/verkauf/faden.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { beadsFromStages } from '@/verkauf/faden';

describe('beadsFromStages', () => {
  it('füllt nur vorhandene Stufen, Rest offen, keine Retoure', () => {
    const b = beadsFromStages(['bestellt']);
    expect(b.map((x) => x.stage)).toEqual(['bestellt', 'kommissioniert', 'rechnung_gestellt', 'bezahlt']);
    expect(b.map((x) => x.filled)).toEqual([true, false, false, false]);
  });
  it('hängt eine gefüllte retoure-Perle an, wenn ein Retoure-Event existiert', () => {
    const b = beadsFromStages(['bestellt', 'kommissioniert', 'rechnung_gestellt', 'bezahlt', 'retoure']);
    expect(b).toHaveLength(5);
    expect(b[4]).toEqual({ stage: 'retoure', filled: true });
    expect(b.every((x) => x.filled)).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `npx vitest run tests/verkauf/faden.test.ts`
Expected: FAIL (`@/verkauf/faden` fehlt).

- [ ] **Step 3: Faden-Logik implementieren**

Create `src/verkauf/faden.ts`:

```ts
import type { EventStage } from './types';

export const FADEN_STAGES: EventStage[] = ['bestellt', 'kommissioniert', 'rechnung_gestellt', 'bezahlt'];

export interface Bead { stage: EventStage; filled: boolean }

/** Die feste Perlenreihe für einen Beleg; retoure erscheint als 5. Perle, sobald vorhanden. */
export function beadsFromStages(stages: EventStage[]): Bead[] {
  const has = new Set(stages);
  const beads: Bead[] = FADEN_STAGES.map((s) => ({ stage: s, filled: has.has(s) }));
  if (has.has('retoure')) beads.push({ stage: 'retoure', filled: true });
  return beads;
}
```

- [ ] **Step 4: Run → PASS**

Run: `npx vitest run tests/verkauf/faden.test.ts`
Expected: PASS (2).

- [ ] **Step 5: Typen ergänzen**

In `src/verkauf/types.ts` anhängen:

```ts
export interface OrderRow {
  id: string; number: string; contactId: string; contactName: string;
  channel: OrderChannel; status: OrderStatus; createdAt: string; stages: EventStage[];
}
export interface OrderViewLine {
  id: string; variantId: string; sku: string; productName: string; quantity: number; unitPrice: number;
}
export interface OrderView extends SalesOrder {
  contactName: string; lines: OrderViewLine[]; events: SalesOrderEvent[];
}
export interface SellableVariant { variantId: string; sku: string; productName: string; available: number }
export interface CustomerOption {
  id: string; name: string; priceListId: string | null; paymentTerms: number; deliveryLabel: string | null;
}
export interface PriceEntry { variantId: string; priceListId: string; amount: number }
```

- [ ] **Step 6: Failing test — Lesefunktionen**

An `tests/verkauf/repository.test.ts` anhängen (Import erweitern um die neuen Funktionen):

```ts
import {
  listOrderRows, getOrderView, sellableVariants, priceForVariant, availableStock,
} from '@/verkauf/repository';

describe('verkauf repository — Lesefunktionen für die UI', () => {
  it('listOrderRows liefert Kundenname und Stages in Reihenfolge', async () => {
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('BK-CLASSIC'), quantity: 1, unitPrice: 16.9 }],
    });
    orderIds.push(o.id);
    await transitionOrderStatus(o.id, 'versendet');
    const rows = await listOrderRows();
    const row = rows.find((r) => r.id === o.id)!;
    expect(row.contactName).toBe('Spielwaren Müller GmbH');
    expect(row.stages).toEqual(['bestellt', 'kommissioniert']);
  });

  it('getOrderView liefert Positions-Labels und Kundenname', async () => {
    const o = await createOrder({
      contactId: MUELLER, channel: 'b2b_portal', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 2, unitPrice: 11.9 }],
    });
    orderIds.push(o.id);
    const v = await getOrderView(o.id);
    expect(v!.contactName).toBe('Spielwaren Müller GmbH');
    expect(v!.lines[0].sku).toBe('SJ-BLAU');
    expect(v!.lines[0].productName).toBe('Sternenjäger');
  });

  it('availableStock = on_hand − reserved über alle Lager; priceForVariant wählt die Staffel', async () => {
    const av = await availableStock(await variantId('SJ-ROT'));
    expect(typeof av).toBe('number'); // SJ-ROT: 8 + 4 on_hand, minus Reservierungen aus anderen Tests
    // Staffel: SJ-ROT Handel min_qty=1 → 12.90, min_qty=10 → 11.90
    expect(await priceForVariant(await variantId('SJ-ROT'), PL_HANDEL, 1)).toBe(12.9);
    expect(await priceForVariant(await variantId('SJ-ROT'), PL_HANDEL, 10)).toBe(11.9);
  });

  it('sellableVariants enthält Produktname + verfügbare Menge', async () => {
    const vs = await sellableVariants();
    const bk = vs.find((v) => v.sku === 'BK-CLASSIC')!;
    expect(bk.productName).toBe('Bauklötze Classic');
    expect(typeof bk.available).toBe('number');
  });
});
```

- [ ] **Step 7: Run → FAIL**

Run: `set -a; source .env; set +a; npx vitest run tests/verkauf/repository.test.ts -t "Lesefunktionen"`
Expected: FAIL (Funktionen nicht exportiert).

- [ ] **Step 8: Lesefunktionen implementieren**

In `src/verkauf/repository.ts` die Typ-Importe um die neuen Typen erweitern und am Dateiende anfügen:

```ts
export async function listOrderRows(): Promise<OrderRow[]> {
  const r = await pool.query(
    `SELECT o.id, o.number, o.contact_id, c.name AS contact_name, o.channel, o.status,
            o.created_at::text AS created_at,
            COALESCE(array_agg(e.stage ORDER BY e.occurred_at) FILTER (WHERE e.stage IS NOT NULL), '{}') AS stages
       FROM sales_orders o
       JOIN contacts c ON c.id = o.contact_id
       LEFT JOIN sales_order_events e ON e.order_id = o.id
      GROUP BY o.id, c.name
      ORDER BY o.created_at DESC`);
  return r.rows.map((x: any) => ({
    id: x.id, number: x.number, contactId: x.contact_id, contactName: x.contact_name,
    channel: x.channel, status: x.status, createdAt: x.created_at, stages: x.stages,
  }));
}

export async function getOrderView(id: string): Promise<OrderView | null> {
  const base = await getOrder(id);
  if (!base) return null;
  const c = await pool.query(`SELECT name FROM contacts WHERE id = $1`, [base.contactId]);
  const lines = await pool.query(
    `SELECT l.id, l.variant_id, l.quantity, l.unit_price, v.sku, p.name AS product_name
       FROM sales_order_lines l
       JOIN product_variants v ON v.id = l.variant_id
       JOIN products p ON p.id = v.product_id
      WHERE l.order_id = $1 ORDER BY l.id`, [id]);
  return {
    ...base,
    contactName: c.rows[0]?.name ?? '',
    lines: lines.rows.map((x: any) => ({
      id: x.id, variantId: x.variant_id, sku: x.sku, productName: x.product_name,
      quantity: x.quantity, unitPrice: Number(x.unit_price),
    })),
    events: base.events,
  };
}

export async function sellableVariants(): Promise<SellableVariant[]> {
  const r = await pool.query(
    `SELECT v.id AS variant_id, v.sku, p.name AS product_name,
            COALESCE((SELECT SUM(quantity_on_hand) - SUM(quantity_reserved)
                        FROM stock_levels s WHERE s.variant_id = v.id), 0)::int AS available
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.status = 'aktiv'
      ORDER BY p.name, v.sku`);
  return r.rows.map((x: any) => ({
    variantId: x.variant_id, sku: x.sku, productName: x.product_name, available: x.available,
  }));
}

export async function priceForVariant(variantId: string, priceListId: string, qty = 1): Promise<number | null> {
  const r = await pool.query(
    `SELECT amount FROM prices
      WHERE variant_id = $1 AND price_list_id = $2 AND min_qty <= $3
      ORDER BY min_qty DESC LIMIT 1`, [variantId, priceListId, qty]);
  return r.rows.length ? Number(r.rows[0].amount) : null;
}

export async function availableStock(variantId: string): Promise<number> {
  const r = await pool.query(
    `SELECT COALESCE(SUM(quantity_on_hand) - SUM(quantity_reserved), 0)::int AS available
       FROM stock_levels WHERE variant_id = $1`, [variantId]);
  return r.rows[0].available;
}

export async function listCustomerOptions(): Promise<CustomerOption[]> {
  const r = await pool.query(
    `SELECT c.id, c.name, c.price_list_id, c.payment_terms,
            (SELECT street || ', ' || zip || ' ' || city FROM contact_addresses a
               WHERE a.contact_id = c.id AND a.type = 'lieferung'
               ORDER BY a.is_default DESC LIMIT 1) AS delivery_label
       FROM contacts c WHERE c.is_customer = true ORDER BY c.name`);
  return r.rows.map((x: any) => ({
    id: x.id, name: x.name, priceListId: x.price_list_id,
    paymentTerms: x.payment_terms, deliveryLabel: x.delivery_label,
  }));
}

export async function defaultPrices(): Promise<PriceEntry[]> {
  const r = await pool.query(`SELECT variant_id, price_list_id, amount FROM prices WHERE min_qty = 1`);
  return r.rows.map((x: any) => ({
    variantId: x.variant_id, priceListId: x.price_list_id, amount: Number(x.amount),
  }));
}
```

- [ ] **Step 9: Run → PASS**

Run: `set -a; source .env; set +a; npx vitest run tests/verkauf/repository.test.ts tests/verkauf/faden.test.ts`
Expected: alle grün (B2-Tests + neue Lesefunktionen + Faden).

- [ ] **Step 10: Typecheck + Commit**

Run: `set -a; source .env; set +a; npx tsc --noEmit` → sauber.

```bash
git add src/verkauf/faden.ts src/verkauf/types.ts src/verkauf/repository.ts tests/verkauf/faden.test.ts tests/verkauf/repository.test.ts
git commit -m "feat(verkauf): Faden-Logik + UI-Lesefunktionen (rows/view/variants/price/stock)"
```

---

### Task 3: Modul-Shell + Belegliste mit Spur

**Files:**
- Create: `src/app/(shell)/verkauf/layout.tsx`, `src/app/(shell)/verkauf/page.tsx`
- Create: `src/components/VerkaufSidebar.tsx`, `src/components/Spur.tsx`, `src/components/VerkaufList.tsx`

**Interfaces:**
- Consumes: `listOrderRows` (Task 2), `beadsFromStages` (Task 2).

- [ ] **Step 1: Sidebar**

Create `src/components/VerkaufSidebar.tsx` (analog `KontakteSidebar`, Items nur „Belege"):

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [{ slug: '', label: 'Belege' }];

export function VerkaufSidebar() {
  const pathname = usePathname();
  return (
    <nav className="w-56 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-3 px-2 text-sm font-bold text-neutral-900 dark:text-neutral-100">Verkauf</p>
      <ul className="space-y-1">
        {ITEMS.map((it) => {
          const href = it.slug === '' ? '/verkauf' : `/verkauf/${it.slug}`;
          const active = pathname === href;
          return (
            <li key={href}>
              <Link href={href} className={`block rounded-md px-3 py-1.5 text-sm ${active
                ? 'bg-accent font-medium text-white'
                : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'}`}>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: Layout (Gate)**

Create `src/app/(shell)/verkauf/layout.tsx` (analog Kontakte-Layout):

```tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireAppAccess } from '@/lib/groups';
import { VerkaufSidebar } from '@/components/VerkaufSidebar';

export const dynamic = 'force-dynamic';

export default async function VerkaufLayout({ children }: { children: ReactNode }) {
  let ok = false;
  try { await requireAppAccess('verkauf'); ok = true; } catch { /* no access */ }
  if (!ok) redirect('/');
  return (
    <div className="flex flex-1 overflow-hidden">
      <VerkaufSidebar />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Spur-Komponente**

Create `src/components/Spur.tsx` (kompakte, nicht-interaktive Perlenreihe):

```tsx
import type { EventStage } from '@/verkauf/types';
import { beadsFromStages } from '@/verkauf/faden';

export function Spur({ stages }: { stages: EventStage[] }) {
  const beads = beadsFromStages(stages);
  return (
    <span className="inline-flex items-center gap-1" aria-label="Fortschritt">
      {beads.map((b, i) => (
        <span key={i}
          title={b.stage}
          className={`inline-block h-2 w-2 rounded-full ${
            b.stage === 'retoure'
              ? 'bg-danger'
              : b.filled ? 'bg-accent' : 'bg-neutral-300 dark:bg-neutral-700'}`}
        />
      ))}
    </span>
  );
}
```

- [ ] **Step 4: Belegliste (Client)**

Create `src/components/VerkaufList.tsx`:

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { OrderRow, OrderChannel, OrderStatus } from '@/verkauf/types';
import { Spur } from './Spur';

const CHANNELS: (OrderChannel | '')[] = ['', 'shop', 'b2b_portal', 'telefon', 'marktplatz', 'manuell'];
const CH_LABEL: Record<string, string> = {
  '': 'Alle', shop: 'Shop', b2b_portal: 'B2B', telefon: 'Telefon', marktplatz: 'Marktplatz', manuell: 'Manuell',
};

export function VerkaufList({ rows }: { rows: OrderRow[] }) {
  const [q, setQ] = useState('');
  const [ch, setCh] = useState<OrderChannel | ''>('');

  const filtered = rows.filter((r) => {
    if (ch && r.channel !== ch) return false;
    if (q && !(`${r.number} ${r.contactName}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nummer oder Kunde …"
          className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100" />
        {CHANNELS.map((c) => (
          <button key={c} onClick={() => setCh(c)}
            className={`rounded px-3 py-1 text-sm ${ch === c
              ? 'bg-accent text-white'
              : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'}`}>{CH_LABEL[c]}</button>
        ))}
        <Link href="/verkauf/neu"
          className="ml-auto rounded bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent-hover">Neuer Beleg</Link>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="anno text-left text-neutral-500">
          <th className="py-2">Nummer</th><th>Kunde</th><th>Kanal</th><th>Status</th><th>Spur</th><th>Datum</th>
        </tr></thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2"><Link href={`/verkauf/${r.id}`} className="text-brand hover:text-brand-dark">{r.number}</Link></td>
              <td>{r.contactName}</td>
              <td>{CH_LABEL[r.channel]}</td>
              <td>{r.status}</td>
              <td><Spur stages={r.stages} /></td>
              <td className="text-neutral-500">{r.createdAt.slice(0, 10)}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={6} className="py-6 text-center text-neutral-500">Keine Belege.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Listen-Seite (Server)**

Create `src/app/(shell)/verkauf/page.tsx`:

```tsx
import { listOrderRows } from '@/verkauf/repository';
import { VerkaufList } from '@/components/VerkaufList';

export const dynamic = 'force-dynamic';

export default async function VerkaufPage() {
  const rows = await listOrderRows();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Verkauf</h2>
      <VerkaufList rows={rows} />
    </div>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `set -a; source .env; set +a; npx tsc --noEmit`
Expected: sauber.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(shell)/verkauf/layout.tsx" "src/app/(shell)/verkauf/page.tsx" src/components/VerkaufSidebar.tsx src/components/Spur.tsx src/components/VerkaufList.tsx
git commit -m "feat(verkauf): Modul-Shell + Belegliste mit Spur"
```

---

### Task 4: Beleg-Detail mit Faden

**Files:**
- Create: `src/app/(shell)/verkauf/[id]/page.tsx`
- Create: `src/components/Faden.tsx`, `src/components/VerkaufDetail.tsx`

**Interfaces:**
- Consumes: `getOrderView` (Task 2), `beadsFromStages`/`FADEN_STAGES` (Task 2), Actions `transitionOrderStatusAction`/`createReturnAction` (B2).

- [ ] **Step 1: Faden-Komponente (Client, klickbare Perlen)**

Create `src/components/Faden.tsx`:

```tsx
'use client';
import { useState } from 'react';
import type { SalesOrderEvent, EventStage } from '@/verkauf/types';
import { beadsFromStages } from '@/verkauf/faden';

const STAGE_LABEL: Record<EventStage, string> = {
  bestellt: 'bestellt', kommissioniert: 'kommissioniert',
  rechnung_gestellt: 'Rechnung gestellt', bezahlt: 'bezahlt', retoure: 'Retoure',
};

export function Faden({ events }: { events: SalesOrderEvent[] }) {
  const [open, setOpen] = useState<EventStage | null>(null);
  const beads = beadsFromStages(events.map((e) => e.stage));
  const evByStage = new Map(events.map((e) => [e.stage, e] as const));
  const sel = open ? evByStage.get(open) : undefined;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center">
        {beads.map((b, i) => (
          <div key={b.stage} className="flex items-center">
            <button
              onClick={() => setOpen(open === b.stage ? null : b.stage)}
              disabled={!b.filled}
              title={STAGE_LABEL[b.stage]}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs ${
                b.stage === 'retoure'
                  ? 'bg-danger text-white'
                  : b.filled ? 'bg-accent text-white' : 'border border-neutral-300 text-neutral-400 dark:border-neutral-700'}
                ${open === b.stage ? 'ring-2 ring-accent ring-offset-2 dark:ring-offset-neutral-900' : ''}`}>
              {i + 1}
            </button>
            {i < beads.length - 1 && (
              <span className={`h-0.5 w-10 ${beads[i + 1].filled ? 'bg-accent' : 'bg-neutral-300 dark:bg-neutral-700'}`} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
        {beads.map((b) => (
          <span key={b.stage} className="anno text-neutral-500" style={{ minWidth: '2rem' }}>{STAGE_LABEL[b.stage]}</span>
        ))}
      </div>
      {sel && (
        <div className="mt-3 rounded-md bg-neutral-100 p-3 text-sm dark:bg-neutral-800">
          <div className="font-medium">{STAGE_LABEL[sel.stage]}</div>
          <div className="text-neutral-500">{sel.occurredAt.replace('T', ' ').slice(0, 16)} · ausgelöst von {sel.sourceApp}</div>
          {sel.automated && <div className="text-neutral-500">automatisch ausgelöst</div>}
          {sel.note && <div className="mt-1">{sel.note}</div>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Detail-Komponente (Client, Aktionen)**

Create `src/components/VerkaufDetail.tsx`:

```tsx
'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { OrderView, OrderStatus } from '@/verkauf/types';
import { Faden } from './Faden';
import { transitionOrderStatusAction, createReturnAction } from '@/app/(shell)/verkauf/actions';

const PRIMARY: Partial<Record<OrderStatus, { label: string; run: (id: string) => Promise<unknown> }>> = {
  angebot: { label: 'In Auftrag wandeln', run: (id) => transitionOrderStatusAction(id, 'auftrag') },
  versendet: { label: 'Rechnung stellen', run: (id) => transitionOrderStatusAction(id, 'rechnung_gestellt') },
  bezahlt: { label: 'Retoure anlegen', run: (id) => createReturnAction(id) },
};
const HINT: Partial<Record<OrderStatus, string>> = {
  auftrag: 'Wartet auf Versand', rechnung_gestellt: 'Wartet auf Zahlung',
};

export function VerkaufDetail({ order }: { order: OrderView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const primary = PRIMARY[order.status];
  const canCancel = order.status === 'angebot' || order.status === 'auftrag';

  const runPrimary = () => primary && start(async () => {
    const res = await primary.run(order.id);
    // Retoure erzeugt einen neuen Beleg → dorthin springen; sonst aktuellen aktualisieren.
    if (order.status === 'bezahlt' && res && typeof res === 'object' && 'id' in res) {
      router.push(`/verkauf/${(res as { id: string }).id}`);
    } else router.refresh();
  });
  const cancel = () => start(async () => { await transitionOrderStatusAction(order.id, 'storniert'); router.refresh(); });

  const total = order.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold tracking-tight">{order.number}</h2>
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-sm dark:bg-neutral-800">{order.channel}</span>
        <span className={`rounded px-2 py-0.5 text-sm ${order.status === 'retoure'
          ? 'bg-danger text-white' : 'bg-neutral-100 dark:bg-neutral-800'}`}>{order.status}</span>
        <Link href={`/kontakte/${order.contactId}`} className="text-brand hover:text-brand-dark">{order.contactName}</Link>
        <div className="ml-auto flex items-center gap-2">
          {primary && (
            <button onClick={runPrimary} disabled={pending}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">
              {primary.label}
            </button>
          )}
          {!primary && HINT[order.status] && <span className="text-sm text-neutral-500">{HINT[order.status]}</span>}
          {canCancel && (
            <button onClick={cancel} disabled={pending}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
              Stornieren
            </button>
          )}
        </div>
      </div>

      <Faden events={order.events} />

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead><tr className="anno text-left text-neutral-500">
            <th className="py-2">Artikel</th><th>SKU</th><th className="text-right">Menge</th>
            <th className="text-right">Einzelpreis</th><th className="text-right">Summe</th>
          </tr></thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-2">{l.productName}</td><td className="text-neutral-500">{l.sku}</td>
                <td className="text-right">{l.quantity}</td>
                <td className="text-right">{l.unitPrice.toFixed(2)} €</td>
                <td className="text-right">{(l.quantity * l.unitPrice).toFixed(2)} €</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t border-neutral-300 font-medium dark:border-neutral-700">
            <td className="py-2" colSpan={4}>Gesamt</td><td className="text-right">{total.toFixed(2)} €</td>
          </tr></tfoot>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Detail-Seite (Server)**

Create `src/app/(shell)/verkauf/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getOrderView } from '@/verkauf/repository';
import { VerkaufDetail } from '@/components/VerkaufDetail';

export const dynamic = 'force-dynamic';

export default async function BelegPage({ params }: { params: { id: string } }) {
  const order = await getOrderView(params.id);
  if (!order) notFound();
  return <VerkaufDetail order={order} />;
}
```

- [ ] **Step 4: Typecheck**

Run: `set -a; source .env; set +a; npx tsc --noEmit`
Expected: sauber. (Prüft insbesondere die `createReturnAction`-Rückgabe-Nutzung und die Action-Importpfade.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(shell)/verkauf/[id]/page.tsx" src/components/Faden.tsx src/components/VerkaufDetail.tsx
git commit -m "feat(verkauf): Beleg-Detail mit klickbarem Faden + Statusaktionen"
```

---

### Task 5: Manuelle Beleganlage

**Files:**
- Create: `src/app/(shell)/verkauf/neu/page.tsx`, `src/components/NeuerBeleg.tsx`

**Interfaces:**
- Consumes: `listCustomerOptions`, `sellableVariants`, `defaultPrices` (Task 2), `createOrderAction` (B2).

- [ ] **Step 1: Anlage-Seite (Server, prefetch)**

Create `src/app/(shell)/verkauf/neu/page.tsx`:

```tsx
import { listCustomerOptions, sellableVariants, defaultPrices } from '@/verkauf/repository';
import { NeuerBeleg } from '@/components/NeuerBeleg';

export const dynamic = 'force-dynamic';

export default async function NeuerBelegPage() {
  const [customers, variants, prices] = await Promise.all([
    listCustomerOptions(), sellableVariants(), defaultPrices(),
  ]);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Neuer Beleg</h2>
      <NeuerBeleg customers={customers} variants={variants} prices={prices} />
    </div>
  );
}
```

- [ ] **Step 2: Anlage-Formular (Client)**

Create `src/components/NeuerBeleg.tsx`:

```tsx
'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CustomerOption, SellableVariant, PriceEntry } from '@/verkauf/types';
import { createOrderAction } from '@/app/(shell)/verkauf/actions';

interface Line { variantId: string; quantity: number; unitPrice: number }

export function NeuerBeleg({ customers, variants, prices }:
  { customers: CustomerOption[]; variants: SellableVariant[]; prices: PriceEntry[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [contactId, setContactId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [err, setErr] = useState('');

  const customer = customers.find((c) => c.id === contactId);
  const availByVariant = useMemo(() => new Map(variants.map((v) => [v.variantId, v.available])), [variants]);
  const priceFor = (variantId: string) =>
    customer?.priceListId
      ? prices.find((p) => p.variantId === variantId && p.priceListId === customer.priceListId)?.amount ?? 0
      : 0;

  const addLine = (variantId: string) => {
    if (!variantId || lines.some((l) => l.variantId === variantId)) return;
    setLines([...lines, { variantId, quantity: 1, unitPrice: priceFor(variantId) }]);
  };
  const setLine = (i: number, patch: Partial<Line>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines(lines.filter((_, j) => j !== i));

  const save = () => {
    setErr('');
    if (!customer) { setErr('Bitte einen Kunden wählen.'); return; }
    if (lines.length === 0) { setErr('Bitte mindestens eine Position hinzufügen.'); return; }
    start(async () => {
      const order = await createOrderAction({
        contactId: customer.id, channel: 'manuell', priceListId: customer.priceListId,
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })),
      });
      router.push(`/verkauf/${order.id}`);
    });
  };

  const INPUT = 'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm dark:border-transparent dark:bg-neutral-800';

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <label className="anno text-neutral-500">Kunde</label>
        <select value={contactId} onChange={(e) => { setContactId(e.target.value); setLines([]); }} className={`${INPUT} mt-1 block w-full`}>
          <option value="">— wählen —</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {customer && (
          <p className="mt-2 text-sm text-neutral-500">
            Zahlungsziel {customer.paymentTerms} Tage
            {customer.deliveryLabel ? ` · Lieferung: ${customer.deliveryLabel}` : ''}
          </p>
        )}
      </div>

      {customer && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 space-y-3">
          <div className="flex items-center gap-2">
            <select className={INPUT} defaultValue="" onChange={(e) => { addLine(e.target.value); e.currentTarget.value = ''; }}>
              <option value="">Artikel hinzufügen …</option>
              {variants.map((v) => <option key={v.variantId} value={v.variantId}>{v.productName} · {v.sku} (verfügbar {v.available})</option>)}
            </select>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="anno text-left text-neutral-500">
              <th className="py-1">Artikel</th><th className="text-right">Menge</th><th className="text-right">Einzelpreis</th>
              <th className="text-right">Verfügbar</th><th></th>
            </tr></thead>
            <tbody>
              {lines.map((l, i) => {
                const v = variants.find((x) => x.variantId === l.variantId)!;
                const short = l.quantity > (availByVariant.get(l.variantId) ?? 0);
                return (
                  <tr key={l.variantId} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="py-1">{v.productName} <span className="text-neutral-500">{v.sku}</span></td>
                    <td className="text-right">
                      <input type="number" min={1} value={l.quantity}
                        onChange={(e) => setLine(i, { quantity: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                        className={`${INPUT} w-20 text-right`} />
                    </td>
                    <td className="text-right">
                      <input type="number" step="0.01" value={l.unitPrice}
                        onChange={(e) => setLine(i, { unitPrice: parseFloat(e.target.value || '0') })}
                        className={`${INPUT} w-24 text-right`} />
                    </td>
                    <td className={`text-right ${short ? 'text-danger' : 'text-neutral-500'}`}>
                      {availByVariant.get(l.variantId) ?? 0}{short ? ' ⚠' : ''}
                    </td>
                    <td className="text-right">
                      <button onClick={() => removeLine(i)} className="text-sm text-neutral-500 hover:text-danger">Entfernen</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {lines.some((l) => l.quantity > (availByVariant.get(l.variantId) ?? 0)) && (
            <p className="text-sm text-danger">Hinweis: mindestens eine Position übersteigt den verfügbaren Bestand. Anlage ist trotzdem möglich.</p>
          )}
        </div>
      )}

      {err && <p className="text-sm text-danger">{err}</p>}
      <button onClick={save} disabled={pending}
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">
        Beleg anlegen
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `set -a; source .env; set +a; npx tsc --noEmit`
Expected: sauber.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(shell)/verkauf/neu/page.tsx" src/components/NeuerBeleg.tsx
git commit -m "feat(verkauf): manuelle Beleganlage mit Preis-/Bestands-Vorbelegung"
```

---

### Task 6: Deploy bryx-test + Browser-Verifikation + Handoff

**Files:** keine (Verifikation)

- [ ] **Step 1: Volle Suite + Typecheck lokal**

Run: `set -a; source .env; set +a; npx tsc --noEmit && npx vitest run tests/verkauf/ tests/lib/help-content.test.ts`
Expected: tsc sauber; verkauf-Suites + help-content grün. (Bekannte rls/groups-Failures bleiben — nicht neu.)

- [ ] **Step 2: Deploy auf bryx-test**

Run: `/opt/budp-dev/deploy.sh`
Expected: Build grün, `migrate` (inkl. verkauf-Grant) angewandt, `public /login -> 200`.

- [ ] **Step 3: Browser-Verifikation (selbst, vor Übergabe)**

Mit Claude in Chrome / Chrome-DevTools auf `https://bryx-test.lumeapps.de` (Login mit Test-Admin, siehe Projekt-Memory `test-accounts-bryx-test`):
- Rail zeigt „Verkauf" (VK); `/verkauf` listet die Seed-Belege mit Spur über ≥3 Kanäle.
- Ein Shop-Beleg im Detail zeigt den vollen Faden; Klick auf eine Perle öffnet die Detailbox; der bezahlte Beleg mit Retoure zeigt die 5. (rote) Perle.
- „Neuer Beleg": Kunde wählen belegt Zahlungsziel/Lieferung vor; Artikel hinzufügen zieht den Preis aus der Kundenpreisliste und zeigt „verfügbar"; Speichern springt auf das neue Beleg-Detail.
- Konsole ohne Fehler; Dark-Mode prüfen.

- [ ] **Step 4: Handoff**

B3 steht: Verkauf-UI (Liste mit Spur, Detail mit Faden, manuelle Anlage). Nächster Baustein: **B4 — Verkauf Ebene 1** (Kanal-Vergleich, Aggregate, `/dashboard`-Entscheidung). Vor B4 eigenen Detailplan schreiben. Danach B5 (Verfügbarkeit), B6 (Finanzen), B7 (Start), B8 (Verbindungen).

---

## Self-Review-Notiz

- **Spec-Abdeckung:** App-Registrierung (Task 1), Faden-Logik + Lese-Backbone (Task 2), Belegliste/Spur (Task 3), Detail/Faden + Primäraktionen (Task 4), manuelle Anlage mit Auto-Vorbelegung + Warn-statt-Blockade (Task 5), Deploy + Browser-Check (Task 6). Ebene-1/Kanal-Views bewusst B4.
- **Typkonsistenz:** `OrderRow`/`OrderView`/`SellableVariant`/`CustomerOption`/`PriceEntry` einheitlich zwischen Repository, Seiten und Komponenten; Actions-Signaturen (`createOrderAction` → `SalesOrderDetail`, `createReturnAction` → neuer Beleg) wie in B2.
- **UI-Risiko:** vitest typcheckt nicht → jede UI-Task endet mit `npx tsc --noEmit`, der finale Deploy-Build ist der echte Gate. Faden-Optik/Chips im Feinschliff über `frontend-design`.
