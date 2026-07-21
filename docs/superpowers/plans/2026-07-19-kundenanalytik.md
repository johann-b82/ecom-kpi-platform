# Kundenanalytik Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kundenzentrierte Auswertung aus vorhandenen Belegdaten — Top-Kunden-Übersicht unter `/kontakte/analyse` und Geschäftskennzahlen je Kunde auf der Kontakt-Detailseite — plus Bereinigung der aus WooCommerce importierten Junk-Kontaktnamen.

**Architecture:** Reiner Namens-Helfer (`kontakte/name.ts`) + Bestandsbereinigungs-Routine/Skript; ein neues Analytics-Repository (`kontakte/analytics.ts`) mit Aggregat-Queries (Perioden- + Lifetime-Kennzahlen); Server-Pages rendern über die bestehenden `Filters`/`DataTable`-Muster. Umsatzbasiert (Filter `status <> 'storniert'`); keine Schemaänderung.

**Tech Stack:** Next.js App Router (Server Components), TypeScript, PostgreSQL via `pg`, Vitest + Testing Library, bestehende Komponenten `DataTable`/`Filters`.

## Global Constraints

- **DB-Tests** gegen die saubere Sibling-Test-DB `bryx_kosten_test` (Dev-DB ist seed-verschmutzt). Vor DB-Befehlen: `set -a; source .env; set +a` und dann
  `export DATABASE_URL=$(node -e 'const u=new URL(process.env.DATABASE_URL);u.pathname="/bryx_kosten_test";process.stdout.write(u.toString())')`.
- **vitest typecheckt NICHT** → jede `.ts/.tsx`-Task endet mit `npx tsc --noEmit` (clean). Reine Tests (Task 1) brauchen keine DB/.env.
- **App NIE lokal starten** (kein `npm run dev`/`docker compose up`). Deploy nur auf bryx-test via `/opt/budp-dev/deploy.sh` und nur nach Nutzer-Freigabe (Browser-Verify + Cleanup-Lauf gebündelt in Task 8).
- **`git add` NUR die je Task gelisteten Pfade** — nie `git add -A`/`.`.
- **Bekannt-rot, NICHT blockierend:** `tests/db/rls.test.ts` (Host-Caveat).
- **Design-Standard:** warme `neutral`-Palette, `--accent`/`text-brand`, `dark:`-Varianten, `.anno` nur für UPPERCASE-Mikrolabels. Datum immer `formatDeDate`, Beträge immer `eur`.
- **Umsatz-Definition** (überall gleich): `SUM(quantity*unit_price)` mit `o.status <> 'storniert'`, Datum `COALESCE(o.placed_at, o.created_at)::date`.
- **Range-Semantik:** Perioden-Kennzahlen (Umsatz/#Bestellungen/AOV) zeitraumgefiltert; **Letzte Bestellung, erste Bestellung, CLV, Wiederkäufer-Status sind lifetime** (range-unabhängig).

---

### Task 1: Reiner Namens-Helfer (`src/kontakte/name.ts`)

**Files:**
- Create: `src/kontakte/name.ts`
- Test: `tests/kontakte/name.test.ts`

**Interfaces:**
- Produces:
  - `interface BillingName { first_name?, last_name?, company?, email? }` (alle `string | undefined`)
  - `realCompany(b: BillingName): string | null`
  - `cleanContactName(b: BillingName): string`

- [ ] **Step 1: Write the failing test**

Create `tests/kontakte/name.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { realCompany, cleanContactName } from '@/kontakte/name';

describe('realCompany', () => {
  it('behält einen echten Firmennamen', () => {
    expect(realCompany({ company: 'Autohaus Marnet GmbH' })).toBe('Autohaus Marnet GmbH');
  });
  it('verwirft Platzhalter, Bindestriche, numerisch, datumsartig', () => {
    for (const c of ['--', '-', '-- Anrede wählen --', 'Bitte auswählen', 'Auswahl',
                     'Auswahl: Anrede', 'Anrede', '  ', '12345', '05.07.2002', 'a']) {
      expect(realCompany({ company: c })).toBeNull();
    }
  });
});

describe('cleanContactName', () => {
  it('nimmt echten Firmennamen zuerst', () => {
    expect(cleanContactName({ company: 'A.T.U', first_name: 'Max', last_name: 'Muster' })).toBe('A.T.U');
  });
  it('fällt bei Junk-Firma auf den Personennamen zurück', () => {
    expect(cleanContactName({ company: '-- Anrede wählen --', first_name: 'Max', last_name: 'Muster' }))
      .toBe('Max Muster');
  });
  it('fällt ohne Namen auf E-Mail zurück, sonst Unbekannt', () => {
    expect(cleanContactName({ company: 'Auswahl', email: 'a@b.de' })).toBe('a@b.de');
    expect(cleanContactName({ company: '--' })).toBe('Unbekannt');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/kontakte/name.test.ts`
Expected: FAIL — `Failed to resolve import "@/kontakte/name"`.

- [ ] **Step 3: Write the implementation**

Create `src/kontakte/name.ts`:

```ts
export interface BillingName {
  first_name?: string; last_name?: string; company?: string; email?: string;
}

const PLACEHOLDERS = new Set([
  'anrede', 'anrede wählen', '-- anrede wählen --', 'bitte auswählen', 'auswählen',
  'bitte wählen', '-- bitte wählen --', 'auswahl', 'auswahl: anrede', 'firma', 'company',
  'keine angabe', 'n/a',
]);

// Echter Firmenname — oder null, wenn der company-Wert ein Import-Platzhalter ist.
export function realCompany(b: BillingName): string | null {
  const raw = (b.company ?? '').trim();
  if (raw.length < 2) return null;
  const norm = raw.toLowerCase();
  if (/^[-–—\s]*$/.test(raw)) return null;                 // nur Striche/Whitespace
  if (PLACEHOLDERS.has(norm)) return null;
  if (/^\d+$/.test(raw)) return null;                      // rein numerisch
  if (/^\d{1,4}[.\/-]\d{1,2}[.\/-]\d{1,4}$/.test(raw)) return null; // datumsartig
  return raw;
}

// Anzeigename: echter Firmenname > Personenname > E-Mail > 'Unbekannt'.
export function cleanContactName(b: BillingName): string {
  const full = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim();
  const email = (b.email ?? '').trim();
  return realCompany(b) || full || email || 'Unbekannt';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/kontakte/name.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Typecheck & Commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/kontakte/name.ts tests/kontakte/name.test.ts
git commit -m "feat(kontakte): reiner cleanContactName/realCompany-Helfer (Junk-Namen-Erkennung)"
```

---

### Task 2: Namensmapping im WooCommerce-Import nutzen

**Files:**
- Modify: `src/woocommerce/order-import.ts` (Funktion `mapBillingToContact`)
- Test: `tests/woocommerce/` (bestehende Order-Import-Tests laufen lassen; nur anpassen, falls eine Assertion am alten Junk-Namen hängt)

**Interfaces:**
- Consumes: `cleanContactName` aus `@/kontakte/name` (Task 1).
- `mapBillingToContact`'s `Billing`-Interface hat bereits `first_name/last_name/company/email` → strukturkompatibel zu `BillingName`.

- [ ] **Step 1: Ändere die Namenszeile**

In `src/woocommerce/order-import.ts` oben ergänzen:

```ts
import { cleanContactName } from '@/kontakte/name';
```

In `mapBillingToContact` die Namenszeile ersetzen:

```ts
// vorher:
//   const name = (b.company && b.company.trim()) || full || b.email || 'Unbekannt';
// nachher:
const name = cleanContactName(b);
```

Die lokale `const full` entfällt, wenn sie nur dort genutzt wurde — prüfen und nur dann entfernen (sonst stehen lassen). `billingSegment` bleibt **unverändert** (Segment-Korrektur ist nicht Scope; Namensfix genügt).

- [ ] **Step 2: Woocommerce-Tests laufen lassen**

Run (Test-DB-Env setzen wie in Global Constraints):
`npx vitest run tests/woocommerce`
Expected: grün. Falls ein Test den alten Namen (`company`-roh) erwartet, die Erwartung auf das `cleanContactName`-Verhalten anpassen (echter Firmenname bleibt; Platzhalter → Personenname).

- [ ] **Step 3: Typecheck & Commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/woocommerce/order-import.ts tests/woocommerce
git commit -m "fix(woo): Kontaktname über cleanContactName (Junk-company fällt auf Personenname zurück)"
```

---

### Task 3: Bestandsbereinigung — Routine + Skript

**Files:**
- Create: `src/kontakte/name-cleanup.ts` (importierbare DB-Routine)
- Create: `scripts/clean-contact-names.ts` (dünner CLI-Wrapper)
- Test: `tests/kontakte/name-cleanup.test.ts`

**Interfaces:**
- Consumes: `cleanContactName` (Task 1); `external_references(entity_type='contact', source_system='woocommerce', entity_id=contact.id, raw_payload=billing)` (Muster wie `scripts/backfill-contact-segment.ts`).
- Produces: `cleanContactNames(db: Pool | PoolClient): Promise<number>` — Anzahl geänderter Kontakte.

- [ ] **Step 1: Write the failing test**

Create `tests/kontakte/name-cleanup.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { cleanContactNames } from '@/kontakte/name-cleanup';
import { nextContactNumber } from '@/kontakte/number';

const ids: string[] = [];
afterAll(async () => {
  for (const id of ids) {
    await pool.query(`DELETE FROM external_references WHERE entity_id=$1`, [id]);
    await pool.query(`DELETE FROM contacts WHERE id=$1`, [id]);
  }
  await pool.end();
});

async function seedContact(name: string, billing: object): Promise<string> {
  const nums = (await pool.query<{ number: string }>('SELECT number FROM contacts')).rows.map((r) => r.number);
  const number = nextContactNumber(nums);
  const c = await pool.query<{ id: string }>(
    `INSERT INTO contacts (number, name, is_customer) VALUES ($1,$2,true) RETURNING id`, [number, name]);
  const id = c.rows[0].id; ids.push(id);
  await pool.query(
    `INSERT INTO external_references (entity_type, entity_id, source_system, external_id, raw_payload)
     VALUES ('contact', $1, 'woocommerce', $2, $3)`, [id, `TEST-${id}`, JSON.stringify(billing)]);
  return id;
}

describe('cleanContactNames', () => {
  it('bereinigt Junk-Namen und ist idempotent; echte Namen bleiben', async () => {
    const junk = await seedContact('-- Anrede wählen --',
      { first_name: 'Max', last_name: 'Muster', company: '-- Anrede wählen --' });
    const real = await seedContact('Autohaus Marnet GmbH',
      { first_name: 'X', last_name: 'Y', company: 'Autohaus Marnet GmbH' });

    const changed = await cleanContactNames(pool);
    expect(changed).toBeGreaterThanOrEqual(1);
    expect((await pool.query('SELECT name FROM contacts WHERE id=$1', [junk])).rows[0].name).toBe('Max Muster');
    expect((await pool.query('SELECT name FROM contacts WHERE id=$1', [real])).rows[0].name).toBe('Autohaus Marnet GmbH');

    const second = await cleanContactNames(pool);   // idempotent
    expect((await pool.query('SELECT name FROM contacts WHERE id=$1', [junk])).rows[0].name).toBe('Max Muster');
    expect(second).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (Test-DB-Env): `npx vitest run tests/kontakte/name-cleanup.test.ts`
Expected: FAIL — `Failed to resolve import "@/kontakte/name-cleanup"`.

- [ ] **Step 3: Write the routine**

Create `src/kontakte/name-cleanup.ts`:

```ts
import type { Pool, PoolClient } from 'pg';
import { cleanContactName, type BillingName } from './name';

// Rechnet je WooCommerce-Kontakt den Namen aus dem gespiegelten Billing neu und
// aktualisiert nur, wenn er sich ändert. Idempotent. Gibt die Anzahl der Änderungen zurück.
export async function cleanContactNames(db: Pool | PoolClient): Promise<number> {
  const r = await db.query<{ id: string; name: string; billing: BillingName }>(
    `SELECT c.id, c.name, er.raw_payload AS billing
       FROM contacts c
       JOIN external_references er
         ON er.entity_type = 'contact' AND er.source_system = 'woocommerce' AND er.entity_id = c.id`);
  let changed = 0;
  for (const row of r.rows) {
    const next = cleanContactName(row.billing ?? {});
    if (next && next !== row.name) {
      await db.query(`UPDATE contacts SET name = $2 WHERE id = $1`, [row.id, next]);
      changed++;
    }
  }
  return changed;
}
```

Create `scripts/clean-contact-names.ts`:

```ts
// Einmal/idempotent: bereinigt WooCommerce-Kontaktnamen (Junk aus dem company-Feld)
// aus dem gespiegelten Billing-Payload. Auf bryx-test (später Prod) ausführen.
import { pool } from '../src/lib/db';
import { cleanContactNames } from '../src/kontakte/name-cleanup';

async function main() {
  const changed = await cleanContactNames(pool);
  console.log(`Kontaktnamen bereinigt: ${changed}.`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Run test to verify it passes**

Run (Test-DB-Env): `npx vitest run tests/kontakte/name-cleanup.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck & Commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/kontakte/name-cleanup.ts scripts/clean-contact-names.ts tests/kontakte/name-cleanup.test.ts
git commit -m "feat(kontakte): Bestandsbereinigung der Kontaktnamen (Routine + idempotentes Skript)"
```

---

### Task 4: Analytics-Repository (`src/kontakte/analytics.ts`)

**Files:**
- Create: `src/kontakte/analytics.ts`
- Test: `tests/kontakte/analytics.test.ts`

**Interfaces:**
- Consumes: `pool` aus `@/lib/db`; `DateRange` aus `@/lib/types`; `OrderChannel`, `OrderStatus` aus `@/verkauf/types`.
- Produces:
  - `CustomerMetricRow`, `customerMetrics(range, opts?): Promise<CustomerMetricRow[]>`
  - `CustomerSummary`, `customerSummary(contactId): Promise<CustomerSummary>`
  - `CustomerOrderRow`, `customerOrders(contactId): Promise<CustomerOrderRow[]>`
  (Signaturen exakt wie in der Spec §1.)

- [ ] **Step 1: Write the failing test**

Create `tests/kontakte/analytics.test.ts` (Muster wie `tests/finanzen/repository.test.ts`: Seed + eigene Belege + Cleanup; Deltas gegen Vorher-Stand, weil DB geteilt):

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';
import { seedVerfuegbarkeit } from '../../scripts/seed-verfuegbarkeit';
import { createOrder, transitionOrderStatus } from '@/verkauf/repository';
import { customerMetrics, customerSummary, customerOrders } from '@/kontakte/analytics';

const MUELLER = 'c1c1c1c1-0000-4000-8000-000000000001';
const PL_HANDEL = 'a1a1a1a1-0000-4000-8000-000000000001';
const today = new Date().toISOString().slice(0, 10);
const ALL = { start: '2000-01-01', end: today };
const orderIds: string[] = [];

async function variantId(sku: string): Promise<string> {
  return (await pool.query<{ id: string }>('SELECT id FROM product_variants WHERE sku=$1', [sku])).rows[0].id;
}
async function order(qty: number, price: number): Promise<string> {
  const o = await createOrder({ contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
    lines: [{ variantId: await variantId('SJ-BLAU'), quantity: qty, unitPrice: price }] });
  orderIds.push(o.id); return o.id;
}

beforeAll(async () => { await seedKontakte(); await seedKatalog(); await seedVerfuegbarkeit(); });
afterAll(async () => {
  for (const id of orderIds) {
    await pool.query('DELETE FROM sales_order_lines WHERE order_id=$1', [id]);
    await pool.query('DELETE FROM open_items WHERE order_id=$1', [id]);
    await pool.query('DELETE FROM sales_orders WHERE id=$1', [id]);
  }
  await pool.end();
});

describe('kontakte analytics', () => {
  it('customerSummary: Umsatz/Orders lifetime, Storno ausgeschlossen, isReturning ab 2', async () => {
    const before = await customerSummary(MUELLER);
    await order(2, 10);                                  // +20, +1 Order
    await order(1, 30);                                  // +30, +1 Order
    const cancel = await order(5, 10); await transitionOrderStatus(cancel, 'storniert'); // zählt nicht
    const after = await customerSummary(MUELLER);
    expect(after.orders - before.orders).toBe(2);
    expect(after.revenueNet - before.revenueNet).toBeCloseTo(50, 2);
    expect(after.isReturning).toBe(true);
    expect(after.lastOrderAt).toBe(today);
  });

  it('customerMetrics: MUELLER erscheint mit Perioden-Umsatz und lifetime CLV; Segmentfilter greift', async () => {
    await order(3, 10);                                  // +30 heute
    const rows = await customerMetrics(ALL);
    const m = rows.find((r) => r.contactId === MUELLER);
    expect(m).toBeDefined();
    expect(m!.orders).toBeGreaterThanOrEqual(1);
    expect(m!.revenueNet).toBeGreaterThan(0);
    expect(m!.avgOrderValueNet).toBeCloseTo(m!.revenueNet / m!.orders, 2);
    expect(m!.clv).toBeGreaterThanOrEqual(m!.revenueNet);   // lifetime >= Periode
    // Segmentfilter: MUELLER ist 'geschaeft'
    const priv = await customerMetrics(ALL, { segment: 'privat' });
    expect(priv.find((r) => r.contactId === MUELLER)).toBeUndefined();
  });

  it('customerOrders: liefert die Belege des Kunden mit Betrag, neueste zuerst', async () => {
    await order(2, 15);
    const list = await customerOrders(MUELLER);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].revenueNet).toBeGreaterThan(0);
    expect(list[0].number).toMatch(/^(A|WC)-/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (Test-DB-Env): `npx vitest run tests/kontakte/analytics.test.ts`
Expected: FAIL — Import nicht auflösbar / Funktionen fehlen.

- [ ] **Step 3: Write the implementation**

Create `src/kontakte/analytics.ts`:

```ts
import { pool } from '@/lib/db';
import type { DateRange } from '@/lib/types';
import type { OrderChannel, OrderStatus } from '@/verkauf/types';

const REV = "o.status <> 'storniert'";
const ORDER_DATE = 'COALESCE(o.placed_at, o.created_at)::date';

export interface CustomerMetricRow {
  contactId: string; name: string; segment: 'geschaeft' | 'privat';
  orders: number; revenueNet: number; avgOrderValueNet: number;
  lastOrderAt: string | null; daysSinceLast: number | null;
  lifetimeOrders: number; clv: number; isReturning: boolean;
}

// Alle Kunden mit >=1 Lifetime-Beleg (optional segmentgefiltert): Perioden-Kennzahlen
// (Umsatz/#/AOV im Zeitraum) + Lifetime-Kennzahlen (letzte Bestellung, CLV, Wiederkäufer).
export async function customerMetrics(
  range: DateRange, opts: { segment?: 'geschaeft' | 'privat' } = {},
): Promise<CustomerMetricRow[]> {
  const r = await pool.query(
    `WITH lifetime AS (
       SELECT o.contact_id,
              COUNT(DISTINCT o.id) FILTER (WHERE ${REV}) AS lt_orders,
              COALESCE(SUM(l.quantity*l.unit_price) FILTER (WHERE ${REV}),0)::float8 AS clv,
              MAX(${ORDER_DATE}) FILTER (WHERE ${REV}) AS last_order
         FROM sales_orders o LEFT JOIN sales_order_lines l ON l.order_id=o.id
        GROUP BY o.contact_id
     ),
     period AS (
       SELECT o.contact_id,
              COUNT(DISTINCT o.id) FILTER (WHERE ${REV}) AS p_orders,
              COALESCE(SUM(l.quantity*l.unit_price) FILTER (WHERE ${REV}),0)::float8 AS p_revenue
         FROM sales_orders o LEFT JOIN sales_order_lines l ON l.order_id=o.id
        WHERE ${ORDER_DATE} BETWEEN $1 AND $2
        GROUP BY o.contact_id
     )
     SELECT c.id, c.name, c.segment,
            COALESCE(p.p_orders,0)::int AS orders,
            COALESCE(p.p_revenue,0)::float8 AS revenue,
            lt.last_order::text AS last_order,
            (CURRENT_DATE - lt.last_order)::int AS days_since_last,
            lt.lt_orders::int AS lifetime_orders,
            lt.clv::float8 AS clv
       FROM contacts c
       JOIN lifetime lt ON lt.contact_id=c.id AND lt.lt_orders >= 1
       LEFT JOIN period p ON p.contact_id=c.id
      WHERE c.is_customer = true
        AND ($3::text IS NULL OR c.segment = $3)
      ORDER BY revenue DESC, c.name`,
    [range.start, range.end, opts.segment ?? null]);
  return r.rows.map((x: any) => {
    const orders = Number(x.orders), revenueNet = Number(x.revenue);
    return {
      contactId: x.id, name: x.name, segment: x.segment,
      orders, revenueNet, avgOrderValueNet: orders > 0 ? revenueNet / orders : 0,
      lastOrderAt: x.last_order, daysSinceLast: x.days_since_last === null ? null : Number(x.days_since_last),
      lifetimeOrders: Number(x.lifetime_orders), clv: Number(x.clv),
      isReturning: Number(x.lifetime_orders) >= 2,
    };
  });
}

export interface CustomerSummary {
  orders: number; revenueNet: number; avgOrderValueNet: number;
  firstOrderAt: string | null; lastOrderAt: string | null;
  isReturning: boolean; clv: number;
}

export async function customerSummary(contactId: string): Promise<CustomerSummary> {
  const r = await pool.query(
    `SELECT COUNT(DISTINCT o.id) FILTER (WHERE ${REV})::int AS orders,
            COALESCE(SUM(l.quantity*l.unit_price) FILTER (WHERE ${REV}),0)::float8 AS revenue,
            MIN(${ORDER_DATE}) FILTER (WHERE ${REV})::text AS first_order,
            MAX(${ORDER_DATE}) FILTER (WHERE ${REV})::text AS last_order
       FROM sales_orders o LEFT JOIN sales_order_lines l ON l.order_id=o.id
      WHERE o.contact_id = $1`, [contactId]);
  const x = r.rows[0];
  const orders = Number(x.orders), revenueNet = Number(x.revenue);
  return {
    orders, revenueNet, avgOrderValueNet: orders > 0 ? revenueNet / orders : 0,
    firstOrderAt: x.first_order, lastOrderAt: x.last_order,
    isReturning: orders >= 2, clv: revenueNet,
  };
}

export interface CustomerOrderRow {
  id: string; number: string; placedAt: string; channel: OrderChannel;
  status: OrderStatus; revenueNet: number;
}

export async function customerOrders(contactId: string): Promise<CustomerOrderRow[]> {
  const r = await pool.query(
    `SELECT o.id, o.number, ${ORDER_DATE}::text AS placed_at, o.channel, o.status,
            COALESCE(SUM(l.quantity*l.unit_price),0)::float8 AS revenue
       FROM sales_orders o LEFT JOIN sales_order_lines l ON l.order_id=o.id
      WHERE o.contact_id=$1
      GROUP BY o.id
      ORDER BY ${ORDER_DATE} DESC, o.number DESC`, [contactId]);
  return r.rows.map((x: any) => ({
    id: x.id, number: x.number, placedAt: x.placed_at, channel: x.channel,
    status: x.status, revenueNet: Number(x.revenue),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (Test-DB-Env): `npx vitest run tests/kontakte/analytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck & Commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/kontakte/analytics.ts tests/kontakte/analytics.test.ts
git commit -m "feat(kontakte): analytics-Repository (customerMetrics/Summary/Orders)"
```

---

### Task 5: Übersicht `/kontakte/analyse` + Sidebar

**Files:**
- Modify: `src/components/KontakteSidebar.tsx` (Eintrag „Analyse")
- Create: `src/components/KundenAnalyse.tsx` (Client: KPI-Zeile + `Filters` + Segment-Chips + `DataTable`)
- Create: `src/app/(shell)/kontakte/analyse/page.tsx` (Server)

**Interfaces:**
- Consumes: `customerMetrics` (Task 4); `resolveRange` (`@/lib/range`); `Filters` (`@/components/Filters`); `DataTable`, `Column` (`@/components/DataTable`); `eur` (`@/verkauf/format`); `formatDeDate` (`@/lib/dates`). Muster: `src/components/OffenePostenListe.tsx`.

- [ ] **Step 1: Sidebar-Eintrag**

In `src/components/KontakteSidebar.tsx` das `ITEMS`-Array erweitern:

```ts
const ITEMS = [
  { slug: '', label: 'Liste' },
  { slug: 'analyse', label: 'Analyse' },
];
```

(Active-Logik bleibt: `pathname === href`.)

- [ ] **Step 2: Client-Komponente `KundenAnalyse.tsx`**

Create `src/components/KundenAnalyse.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { Filters } from '@/components/Filters';
import { DataTable, type Column } from '@/components/DataTable';
import { eur } from '@/verkauf/format';
import { formatDeDate } from '@/lib/dates';
import type { CustomerMetricRow } from '@/kontakte/analytics';
import type { DateRange } from '@/lib/types';

const SEGMENTS = [
  { key: 'alle', label: 'Alle', href: '/kontakte/analyse' },
  { key: 'geschaeft', label: 'Geschäft', href: '/kontakte/analyse?segment=geschaeft' },
  { key: 'privat', label: 'Privat', href: '/kontakte/analyse?segment=privat' },
] as const;

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-card dark:border-neutral-800 dark:bg-neutral-900">
      <p className="anno text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
    </div>
  );
}

export function KundenAnalyse({ rows, range, segment }:
  { rows: CustomerMetricRow[]; range: DateRange; segment: 'geschaeft' | 'privat' | null }) {
  const active = rows.filter((r) => r.orders > 0);
  const revenue = active.reduce((s, r) => s + r.revenueNet, 0);
  const orders = active.reduce((s, r) => s + r.orders, 0);
  const returning = active.filter((r) => r.isReturning).length;

  const columns: Column<CustomerMetricRow>[] = [
    { key: 'name', header: 'Kunde', sort: (r) => r.name.toLowerCase(),
      filter: { kind: 'text', value: (r) => r.name },
      cell: (r) => <Link href={`/kontakte/${r.contactId}`} className="text-brand hover:text-brand-dark">{r.name}</Link> },
    { key: 'segment', header: 'Segment', sort: (r) => r.segment,
      filter: { kind: 'select', value: (r) => r.segment,
        options: [{ value: 'geschaeft', label: 'Geschäft' }, { value: 'privat', label: 'Privat' }] },
      cell: (r) => r.segment === 'geschaeft' ? 'Geschäft' : 'Privat' },
    { key: 'orders', header: 'Bestellungen', className: 'text-right', sort: (r) => r.orders,
      filter: { kind: 'number', value: (r) => r.orders }, cell: (r) => String(r.orders) },
    { key: 'revenue', header: 'Umsatz', className: 'text-right', sort: (r) => r.revenueNet,
      filter: { kind: 'number', value: (r) => r.revenueNet }, cell: (r) => eur(r.revenueNet) },
    { key: 'aov', header: 'Ø Warenkorb', className: 'text-right', sort: (r) => r.avgOrderValueNet,
      cell: (r) => eur(r.avgOrderValueNet) },
    { key: 'last', header: 'Letzte Bestellung', sort: (r) => r.lastOrderAt ?? '',
      cell: (r) => r.lastOrderAt ? formatDeDate(r.lastOrderAt) : '—' },
    { key: 'status', header: 'Status', sort: (r) => (r.isReturning ? 1 : 0),
      filter: { kind: 'select', value: (r) => (r.isReturning ? 'wieder' : 'neu'),
        options: [{ value: 'wieder', label: 'Wiederkäufer' }, { value: 'neu', label: 'Neu' }] },
      cell: (r) => r.isReturning
        ? <span className="rounded bg-accent/15 px-2 py-0.5 text-accent">Wiederkäufer</span>
        : <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">Neu</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Kontakte · Analyse</h2>
        <Filters range={range} basePath="/kontakte/analyse" />
      </div>
      <div className="flex flex-wrap gap-2">
        {SEGMENTS.map((s) => {
          const on = (s.key === 'alle' && !segment) || s.key === segment;
          return (
            <Link key={s.key} href={s.href}
              className={`rounded-md px-3 py-1 text-sm ${on
                ? 'bg-brand font-medium text-white'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300'}`}>
              {s.label}
            </Link>
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Aktive Kunden" value={String(active.length)} />
        <Tile label="Umsatz" value={eur(revenue)} />
        <Tile label="Ø Warenkorb" value={eur(orders > 0 ? revenue / orders : 0)} />
        <Tile label="Wiederkäufer-Quote" value={active.length ? `${Math.round((returning / active.length) * 100)} %` : '—'} />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.contactId}
        initialSort={{ col: 'revenue', dir: 'desc' }} empty="Keine Kunden im Zeitraum." />
    </div>
  );
}
```

Note: verify the `initialSort` shape against `@/lib/sort`'s `Sort` type (see `OffenePostenListe`/`DataTable` usage) and adjust `{ col, dir }` to the real field names if they differ.

- [ ] **Step 3: Server-Page**

Create `src/app/(shell)/kontakte/analyse/page.tsx`:

```tsx
import { customerMetrics } from '@/kontakte/analytics';
import { resolveRange } from '@/lib/range';
import { KundenAnalyse } from '@/components/KundenAnalyse';

export const dynamic = 'force-dynamic';

export default async function KundenAnalysePage({ searchParams }:
  { searchParams: { days?: string; start?: string; end?: string; segment?: string } }) {
  const end = new Date().toISOString().slice(0, 10);
  const { range } = resolveRange(searchParams.days ?? 'all', end, { start: searchParams.start, end: searchParams.end });
  const segment = searchParams.segment === 'geschaeft' || searchParams.segment === 'privat'
    ? searchParams.segment : null;
  const rows = await customerMetrics(range, { segment: segment ?? undefined });
  return <KundenAnalyse rows={rows} range={range} segment={segment} />;
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` → clean. (Fix `initialSort`/`Sort`-Feldnamen falls tsc meckert.)

- [ ] **Step 5: Commit**

```bash
git add src/components/KontakteSidebar.tsx src/components/KundenAnalyse.tsx 'src/app/(shell)/kontakte/analyse/page.tsx'
git commit -m "feat(kontakte): Top-Kunden-Analyse-Übersicht (/kontakte/analyse)"
```

---

### Task 6: Kontakt-Detail anreichern

**Files:**
- Create: `src/components/KundenKennzahlen.tsx` (Server-Component: Kennzahlen-Kacheln + Bestellhistorie)
- Modify: `src/app/(shell)/kontakte/[id]/page.tsx` (Summary/Orders laden, Sektion rendern)

**Interfaces:**
- Consumes: `customerSummary`, `customerOrders` (Task 4); `getContact` (bestehend, liefert `isCustomer`); `eur`, `formatDeDate`, `STATUS_LABEL`/`CHANNEL_LABEL` (`@/verkauf/labels`).

- [ ] **Step 1: Kennzahlen-Komponente**

Create `src/components/KundenKennzahlen.tsx`:

```tsx
import Link from 'next/link';
import { eur } from '@/verkauf/format';
import { formatDeDate } from '@/lib/dates';
import { STATUS_LABEL, CHANNEL_LABEL } from '@/verkauf/labels';
import type { CustomerSummary, CustomerOrderRow } from '@/kontakte/analytics';

export function KundenKennzahlen({ summary, orders }:
  { summary: CustomerSummary; orders: CustomerOrderRow[] }) {
  const tiles: { label: string; value: string }[] = [
    { label: 'Umsatz gesamt', value: eur(summary.revenueNet) },
    { label: 'Bestellungen', value: String(summary.orders) },
    { label: 'Ø Warenkorb', value: eur(summary.avgOrderValueNet) },
    { label: 'CLV', value: eur(summary.clv) },
    { label: 'Erste Bestellung', value: summary.firstOrderAt ? formatDeDate(summary.firstOrderAt) : '—' },
    { label: 'Letzte Bestellung', value: summary.lastOrderAt ? formatDeDate(summary.lastOrderAt) : '—' },
  ];
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="anno text-neutral-500">Geschäftskennzahlen</p>
        {summary.isReturning && <span className="rounded bg-accent/15 px-2 py-0.5 text-xs text-accent">Wiederkäufer</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-neutral-200 bg-neutral-0 p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <p className="anno text-neutral-500">{t.label}</p>
            <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{t.value}</p>
          </div>
        ))}
      </div>
      {orders.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-neutral-500">
              <th className="anno px-3 py-2">Beleg</th><th className="anno px-3 py-2">Datum</th>
              <th className="anno px-3 py-2">Kanal</th><th className="anno px-3 py-2">Status</th>
              <th className="anno px-3 py-2 text-right">Betrag</th>
            </tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="px-3 py-1.5">
                    <Link href={`/verkauf/belege/${o.id}`} className="text-brand hover:text-brand-dark">{o.number}</Link>
                  </td>
                  <td className="px-3 py-1.5 text-neutral-500">{formatDeDate(o.placedAt)}</td>
                  <td className="px-3 py-1.5">{CHANNEL_LABEL[o.channel]}</td>
                  <td className="px-3 py-1.5">{STATUS_LABEL[o.status]}</td>
                  <td className="px-3 py-1.5 text-right">{eur(o.revenueNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

Note: verify `STATUS_LABEL` and `CHANNEL_LABEL` exist in `@/verkauf/labels` with those exact names (the Belege list uses `STATUS_LABEL`; the Kanal page uses `CHANNEL_LABEL`). If a name differs, use the real one.

- [ ] **Step 2: Detail-Page verdrahten**

Replace `src/app/(shell)/kontakte/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getContact } from '@/kontakte/repository';
import { customerSummary, customerOrders } from '@/kontakte/analytics';
import { KontakteDetail } from '@/components/KontakteDetail';
import { KundenKennzahlen } from '@/components/KundenKennzahlen';

export const dynamic = 'force-dynamic';

export default async function KontaktDetailPage({ params }: { params: { id: string } }) {
  const contact = await getContact(params.id);
  if (!contact) notFound();
  const analytics = contact.isCustomer
    ? await Promise.all([customerSummary(params.id), customerOrders(params.id)])
    : null;
  return (
    <div className="space-y-6">
      {analytics && <KundenKennzahlen summary={analytics[0]} orders={analytics[1]} />}
      <KontakteDetail contact={contact} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/KundenKennzahlen.tsx 'src/app/(shell)/kontakte/[id]/page.tsx'
git commit -m "feat(kontakte): Geschäftskennzahlen + Bestellhistorie auf der Kontakt-Detailseite"
```

---

### Task 7: Hilfe-Doku

**Files:**
- Modify: `src/lib/help/content.ts` (Kontakte-Modulseite)

- [ ] **Step 1: Kontakte-Hilfeseite ergänzen**

In `src/lib/help/content.ts` auf der Modulseite `slug: 'kontakte'` einen Abschnitt „Analyse / Kundenkennzahlen" ergänzen (additive `sections`/`blocks`, Blockstruktur wie bestehende Einträge):

- Was: Top-Kunden-Übersicht (`/kontakte/analyse`) — Ranking nach Umsatz, Ø Warenkorb, Wiederkäufer-Quote; Sortierung „Letzte Bestellung" bringt schlummernde Kunden nach oben; Segment-Filter (Geschäft/Privat) + Zeitraum.
- Detail: je Kunde Umsatz gesamt, Bestellungen, Ø Warenkorb, CLV, erste/letzte Bestellung, Wiederkäufer-Badge + Bestellhistorie.
- **Range-Semantik** klar benennen: Umsatz/#Bestellungen/AOV zeitraumbezogen, **Letzte Bestellung & CLV lifetime**.
- Hinweis: DB/Marge je Kunde folgt, sobald EK erfasst ist.

- [ ] **Step 2: Registry-Test**

Run (reiner Test, keine DB): `npx vitest run tests/lib/help-content.test.ts`
Expected: PASS (Slugs/Registry unverändert gültig).

- [ ] **Step 3: Typecheck & Commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/lib/help/content.ts
git commit -m "docs(hilfe): Kundenanalyse (Top-Kunden + Kontakt-Kennzahlen) dokumentieren"
```

---

### Task 8: Gesamtabnahme

- [ ] **Step 1: Volle Suite**

Run (Test-DB-Env): `npx vitest run`
Expected: grün außer bekannt-roter `tests/db/rls.test.ts` (Host-Caveat; auf sauberer Test-DB historisch grün — Ergebnis berichten). Neue Files: `name`, `name-cleanup`, `analytics`.

- [ ] **Step 2: Typecheck & Build**

Run: `npx tsc --noEmit` → clean.
Run: `npm run build` → erfolgreich; neue Route `/kontakte/analyse` erscheint in der Route-Liste.

- [ ] **Step 3: (Controller/VPS, nach Nutzer-Freigabe) Deploy + Cleanup-Lauf + Browser-Verify**

- Deploy: `/opt/budp-dev/deploy.sh`.
- Namen bereinigen (bryx-test Runtime-DB): `set -a; source .env; set +a; npx tsx scripts/clean-contact-names.ts` — Anzahl bereinigt loggen. (Prod separat, später.)
- Browser (Admin, Konsole clean prüfen):
  - `/kontakte/analyse`: KPI-Zeile + Top-Kunden-Tabelle, Default Umsatz ↓; Sortierung „Letzte Bestellung"; Segment-Chips (Geschäft/Privat) filtern; Zeitraum skaliert Umsatz/#/AOV; Namen sind bereinigt (kein „-- Anrede wählen --").
  - Kontakt-Detail eines Kunden: Geschäftskennzahlen + Bestellhistorie (Links ins Beleg-Detail); Lieferant ohne Sektion.

---

## Self-Review

**Spec coverage:**
- Namens-Cleanup (Helfer + Import-Einsatz + Bestandsbereinigung) → Task 1, 2, 3. ✓
- Repo customerMetrics/Summary/Orders → Task 4. ✓
- Übersicht `/kontakte/analyse` (KPI + Tabelle + Filter/Segment, Range-Semantik) → Task 5. ✓
- Detail-Anreicherung (Kennzahlen + Historie, nur is_customer) → Task 6. ✓
- Tests (pure + DB) → Task 1, 3, 4. ✓
- Hilfe-Doku → Task 7. ✓
- Nicht-Scope (DB/Marge, Segment-Korrektur Bestand, Kohorten) → nirgends implementiert. ✓

**Placeholder scan:** Kein TBD/TODO. Zwei „verify the real name/shape"-Hinweise (Sort-Feldnamen in Task 5; `STATUS_LABEL`/`CHANNEL_LABEL` in Task 6) sind bewusste Absicherungen gegen abweichende bestehende Signaturen mit klarer Anweisung — kein offener Platzhalter. Der `cleanContactName`-Ternary-Fehltritt in Task 1 ist explizit durch die „use the plain version" ersetzt.

**Type consistency:** `cleanContactName`/`realCompany`/`BillingName` (Task 1) durchgehend genutzt (Task 2, 3). `CustomerMetricRow`/`CustomerSummary`/`CustomerOrderRow` (Task 4) exakt in Task 5/6 konsumiert. `DateRange` aus `@/lib/types`, `OrderChannel/OrderStatus` aus `@/verkauf/types`. Range-Semantik (Perioden vs. lifetime) in Query, UI und Doku identisch.
