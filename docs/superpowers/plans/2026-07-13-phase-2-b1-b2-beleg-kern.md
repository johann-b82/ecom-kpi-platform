# Phase 2 — B1 (Datenmodell + Seed-Fundament) & B2 (Beleg-Kern + Übergangslogik) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lege das komplette Phase-2-Datenmodell an und baue den Beleg-Kern (`sales_orders/_lines/_events`) samt der einen zentralen `transitionOrderStatus()`-Funktion, die alle Zustandsübergänge inkl. Seiteneffekte auf Bestand und offene Posten kapselt.

**Architecture:** Server Actions → `src/verkauf/repository.ts` → raw `pg` Pool. Jeder Statuswechsel läuft ausschließlich durch `transitionOrderStatus()` (bzw. `createOrder`/`createReturn`), immer in einer DB-Transaktion, und schreibt automatisch die zugehörige `sales_order_events`-Perle sowie die Bestands-/Finanz-Seiteneffekte. Keine REST-Routes, keine Pagination, kein Supabase-Data-Client.

**Tech Stack:** Next.js 14 App Router, TypeScript, `pg` 8, Vitest. DB-Migration über idempotente `db/schema.sql` + `db/rls.sql` (`npm run migrate`).

## Global Constraints

- Neue Belegtabellen heißen **`sales_orders` / `sales_order_lines` / `sales_order_events`** — die Legacy-Tabellen `orders`/`customers` bleiben unberührt.
- Enums als **`CHECK`-Constraints**, nicht als PG-`ENUM`-Typen (Repo-Konvention).
- Jede Tabelle: `tenant_id UUID REFERENCES tenants(id)` (nullable, nicht gefiltert).
- Jede neue Tabelle bekommt in `db/rls.sql` `ENABLE ROW LEVEL SECURITY` **ohne Policy/Grant** (server-only Zugriff via `pool`).
- Repository-Muster: `X_COLS`-Konstante, `mapX(row)` snake→camel, `created_at::text AS created_at`, parametrisierte Queries, `RETURNING ${X_COLS}`.
- `sales_orders.status` wird **nirgends** außer in `createOrder`, `transitionOrderStatus` und `createReturn` geschrieben.
- Belegnummern: `A-<jahr>-####` (Verkauf) über reinen Helper.
- Verfügbare Menge ist überall `SUM(quantity_on_hand) − SUM(quantity_reserved)` über alle Lager.
- Deployment/Verifikation der laufenden App **nur auf der VPS** (`root@194.164.204.249`, `budp.lumeapps.de`) — nie lokal. Tests (`npx vitest`) laufen lokal.
- **Env laden vor jedem DB-Befehl:** `DATABASE_URL` liegt nur in `.env` und wird von nichts automatisch geladen (kein dotenv; die Fallback-Credentials in `src/lib/db.ts` sind falsch). Vor **jedem** `npm run migrate` / `npm run seed-*` / `npx vitest`, der die DB berührt, zuerst: `set -a; source .env; set +a`. `psql` ist **nicht** installiert — für Ad-hoc-DB-Abfragen `node -e` mit dem `pg`-Pool nutzen, nicht `psql`.
- **Bekannter Host-Caveat:** `tests/db/rls.test.ts` schlägt auf diesem Dev-Host vor (Projekt-Memory: 16 erwartete Failures, keine Regression), weil RLS-Rollen lokal nicht erzwungen werden. Neue RLS-Deny-Tests teilen dieses Verhalten. Lokal verifizierbar ist die **Migration** und **Tabellenexistenz**; die Deny-Semantik greift real erst in der Supabase/VPS-Umgebung.

---

## Dateistruktur

**B1**
- Modify: `db/schema.sql` — neun neue Tabellen unter Domain-Bannern.
- Modify: `db/rls.sql` — neun `ENABLE ROW LEVEL SECURITY`-Zeilen.
- Modify: `tests/db/rls.test.ts` — Deny-Loop über die neun Tabellen.
- Create: `src/verfuegbarkeit/seed-data.ts` — Lager + Bestände + eine Korrektur (Seed-DoD #10–#12).
- Create: `scripts/seed-verfuegbarkeit.ts` — Upsert-Skript.
- Modify: `package.json` — npm-Script `seed-verfuegbarkeit`.
- Modify: `src/lib/help/content.ts` — `datenmodell`-Admin-Seite um die neuen Tabellen ergänzen.

**B2**
- Create: `src/verkauf/types.ts` — Order-Typen.
- Create: `src/verkauf/number.ts` — `nextOrderNumber`.
- Create: `src/verkauf/repository.ts` — `listOrders/getOrder/createOrder/transitionOrderStatus/createReturn` + interne Seiteneffekt-Helfer.
- Create: `src/app/(shell)/verkauf/actions.ts` — Server Actions.
- Create: `src/verkauf/seed-data.ts` — Order-Seed-DoD #1–#5.
- Create: `scripts/seed-verkauf.ts` — erzeugt Belege **über die Repository-Funktionen**.
- Modify: `package.json` — npm-Script `seed-verkauf`.
- Create: `tests/verkauf/number.test.ts`, `tests/verkauf/repository.test.ts`, `tests/app/verkauf-actions.test.ts`.

---

# Baustein B1 — Datenmodell + Seed-Fundament

### Task 1: Phase-2-Schema anlegen

**Files:**
- Modify: `db/schema.sql` (ans Dateiende anhängen)

**Interfaces:**
- Produces: Tabellen `sales_orders`, `sales_order_lines`, `sales_order_events`, `warehouses`, `stock_levels`, `stock_adjustments`, `purchase_orders`, `purchase_order_lines`, `open_items`, `payments`.

- [ ] **Step 1: Tabellen an `db/schema.sql` anhängen**

```sql
-- ── Verkauf (Phase 2) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID REFERENCES tenants(id),
  number           TEXT UNIQUE NOT NULL,
  contact_id       UUID NOT NULL REFERENCES contacts(id),
  channel          TEXT NOT NULL CHECK (channel IN ('shop','b2b_portal','marktplatz','telefon','manuell')),
  status           TEXT NOT NULL CHECK (status IN ('angebot','auftrag','versendet','rechnung_gestellt','bezahlt','retoure','storniert')),
  price_list_id    UUID REFERENCES price_lists(id),
  related_order_id UUID REFERENCES sales_orders(id),
  currency         CHAR(3) NOT NULL DEFAULT 'EUR',
  placed_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_order_lines (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES tenants(id),
  order_id   UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  quantity   INT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_order_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),
  order_id    UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  stage       TEXT NOT NULL CHECK (stage IN ('bestellt','kommissioniert','rechnung_gestellt','bezahlt','retoure')),
  source_app  TEXT NOT NULL CHECK (source_app IN ('verkauf','verfuegbarkeit','finanzen')),
  note        TEXT,
  automated   BOOLEAN NOT NULL DEFAULT false,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_order_events_order_idx ON sales_order_events (order_id, occurred_at);

-- ── Verfügbarkeit (Phase 2) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES tenants(id),
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'eigen' CHECK (type IN ('eigen','konsignation')),
  is_default BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS stock_levels (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenants(id),
  variant_id        UUID NOT NULL REFERENCES product_variants(id),
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  quantity_on_hand  INT NOT NULL DEFAULT 0,
  quantity_reserved INT NOT NULL DEFAULT 0,
  UNIQUE (variant_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES tenants(id),
  variant_id   UUID NOT NULL REFERENCES product_variants(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  delta        INT NOT NULL,
  reason       TEXT NOT NULL CHECK (reason IN ('inventurdifferenz','bruch_schwund','korrektur_fehlbuchung')),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),
  number      TEXT UNIQUE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES contacts(id),
  status      TEXT NOT NULL DEFAULT 'entwurf' CHECK (status IN ('entwurf','bestellt','teilweise_eingegangen','abgeschlossen','storniert')),
  expected_at DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenants(id),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  variant_id        UUID NOT NULL REFERENCES product_variants(id),
  quantity_ordered  INT NOT NULL,
  quantity_received INT NOT NULL DEFAULT 0,
  unit_cost         NUMERIC(12,2)
);

-- ── Finanzen (Phase 2) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS open_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenants(id),
  direction         TEXT NOT NULL CHECK (direction IN ('debitor','kreditor')),
  contact_id        UUID NOT NULL REFERENCES contacts(id),
  reference         TEXT,
  order_id          UUID REFERENCES sales_orders(id),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  amount            NUMERIC(12,2) NOT NULL,
  due_date          DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','teilweise_bezahlt','bezahlt','ueberfaellig')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID REFERENCES tenants(id),
  open_item_id       UUID REFERENCES open_items(id),
  amount             NUMERIC(12,2) NOT NULL,
  paid_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  method             TEXT NOT NULL CHECK (method IN ('ueberweisung','lastschrift','kreditkarte','paypal','sonstige')),
  external_reference TEXT
);
```

- [ ] **Step 2: Migration ausführen**

Run: `npm run migrate`
Expected: läuft ohne Fehler durch (`schema.sql` dann `rls.sql`).

- [ ] **Step 3: Tabellenexistenz prüfen (idempotent)**

Run: `npm run migrate` (zweites Mal)
Expected: erneut ohne Fehler (`CREATE TABLE IF NOT EXISTS` ist idempotent).

- [ ] **Step 4: Commit**

```bash
git add db/schema.sql
git commit -m "feat(db): Phase-2 Belege/Verfügbarkeit/Finanzen Schema (sales_* namespaced)"
```

---

### Task 2: RLS aktivieren + Deny-Tests

**Files:**
- Modify: `db/rls.sql`
- Test: `tests/db/rls.test.ts`

- [ ] **Step 1: Failing test — Deny-Loop über die neun Tabellen**

In `tests/db/rls.test.ts`, innerhalb des `describe`-Blocks, nach der bestehenden `bpm_*`-Schleife einfügen:

```ts
  for (const t of ['sales_orders','sales_order_lines','sales_order_events','warehouses','stock_levels','stock_adjustments','purchase_orders','purchase_order_lines','open_items','payments']) {
    it(`authenticated is denied on ${t}`, async () => {
      const c = await pool.connect();
      try {
        await c.query('SET ROLE authenticated');
        await expect(c.query(`SELECT count(*) FROM ${t}`)).rejects.toThrow(/permission denied/i);
      } finally {
        await c.query('RESET ROLE');
        c.release();
      }
    });
  }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/rls.test.ts -t "denied on sales_orders"`
Expected: FAIL — die Tabelle hat noch keine RLS aktiviert, `SELECT` ist erlaubt (keine `permission denied`-Ausnahme). *(Hinweis: auf diesem Host teilt dieser Test den bekannten RLS-Failure aus Projekt-Memory; entscheidend ist, dass der Testfall existiert und in der Supabase/VPS-Umgebung grün wird.)*

- [ ] **Step 3: RLS in `db/rls.sql` aktivieren**

Am Ende des `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`-Blocks (vor der `daily_series`-Funktion) anhängen:

```sql
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE open_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: Migration ausführen**

Run: `npm run migrate`
Expected: ohne Fehler.

- [ ] **Step 5: Deny-Test in echter Umgebung bestätigen**

Run: `npx vitest run tests/db/rls.test.ts -t "denied on sales_orders"`
Expected (Supabase/VPS): PASS. Auf diesem Dev-Host: bekannter, erwarteter Failure (Projekt-Memory) — **keine** Regression, nicht weiter debuggen.

- [ ] **Step 6: Commit**

```bash
git add db/rls.sql tests/db/rls.test.ts
git commit -m "feat(db): RLS deny-all für Phase-2-Tabellen + Tests"
```

---

### Task 3: Verfügbarkeits-Seed (Lager + Bestände + Korrektur)

Erfüllt Seed-DoD §11 #10 (Korrektur mit Grund), #11 (≥3 Lager, eins `konsignation`, eins `is_default`), #12 (ein Artikel in mehreren Lagern). Variantenzuordnung per SKU-Lookup (robuster als hartcodierte Variant-UUIDs).

**Files:**
- Create: `src/verfuegbarkeit/seed-data.ts`
- Create: `scripts/seed-verfuegbarkeit.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `WAREHOUSES`, `STOCK` (SKU-basiert), `ADJUSTMENTS`; `seedVerfuegbarkeit()`.

- [ ] **Step 1: Seed-Daten anlegen**

Create `src/verfuegbarkeit/seed-data.ts`:

```ts
// DoD-Seed Verfügbarkeit: 3 Lager (eins is_default, eins konsignation), Bestände
// (SJ-ROT bewusst unter reorder_point=20 für die spätere Meldebestand-Story;
// SJ-ROT in ZWEI Lagern → Mehrlager-Aggregation), eine Korrektur mit Grund.
// Bestände referenzieren Varianten per SKU (Lookup im Seed-Skript).

export interface SeedWarehouse { id: string; name: string; type: 'eigen' | 'konsignation'; isDefault: boolean }
export interface SeedStock { sku: string; warehouseId: string; onHand: number; reserved: number }
export interface SeedAdjustment {
  sku: string; warehouseId: string; delta: number;
  reason: 'inventurdifferenz' | 'bruch_schwund' | 'korrektur_fehlbuchung'; note: string | null;
}

const WH_HAMBURG = '11111111-0000-4000-8000-000000000001';
const WH_MUENCHEN = '11111111-0000-4000-8000-000000000002';
const WH_KONSI = '11111111-0000-4000-8000-000000000003';

export const WAREHOUSES: SeedWarehouse[] = [
  { id: WH_HAMBURG, name: 'Lager Hamburg', type: 'eigen', isDefault: true },
  { id: WH_MUENCHEN, name: 'Lager München', type: 'eigen', isDefault: false },
  { id: WH_KONSI, name: 'Konsignation Sternenjäger', type: 'konsignation', isDefault: false },
];

export const STOCK: SeedStock[] = [
  { sku: 'SJ-ROT', warehouseId: WH_HAMBURG, onHand: 8, reserved: 0 },   // unter reorder_point
  { sku: 'SJ-ROT', warehouseId: WH_MUENCHEN, onHand: 4, reserved: 0 },  // Mehrlager (#12)
  { sku: 'SJ-BLAU', warehouseId: WH_HAMBURG, onHand: 40, reserved: 0 },
  { sku: 'BK-CLASSIC', warehouseId: WH_HAMBURG, onHand: 60, reserved: 0 },
  { sku: 'WB-01', warehouseId: WH_KONSI, onHand: 12, reserved: 0 },
];

export const ADJUSTMENTS: SeedAdjustment[] = [
  { sku: 'SJ-ROT', warehouseId: WH_HAMBURG, delta: -2, reason: 'bruch_schwund', note: 'Transportschaden Palette 7' },
];
```

- [ ] **Step 2: Seed-Skript anlegen**

Create `scripts/seed-verfuegbarkeit.ts`:

```ts
import { pool } from '../src/lib/db';
import { WAREHOUSES, STOCK, ADJUSTMENTS } from '../src/verfuegbarkeit/seed-data';

async function variantIdBySku(sku: string): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM product_variants WHERE sku = $1', [sku]);
  if (r.rows.length === 0) throw new Error(`Unbekannte SKU im Seed: ${sku}`);
  return r.rows[0].id;
}

export async function seedVerfuegbarkeit(): Promise<void> {
  for (const w of WAREHOUSES) {
    await pool.query(
      `INSERT INTO warehouses (id, name, type, is_default) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET name=excluded.name, type=excluded.type, is_default=excluded.is_default`,
      [w.id, w.name, w.type, w.isDefault]);
  }
  for (const s of STOCK) {
    const vid = await variantIdBySku(s.sku);
    await pool.query(
      `INSERT INTO stock_levels (variant_id, warehouse_id, quantity_on_hand, quantity_reserved)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (variant_id, warehouse_id)
       DO UPDATE SET quantity_on_hand=excluded.quantity_on_hand, quantity_reserved=excluded.quantity_reserved`,
      [vid, s.warehouseId, s.onHand, s.reserved]);
  }
  for (const a of ADJUSTMENTS) {
    const vid = await variantIdBySku(a.sku);
    await pool.query(
      `INSERT INTO stock_adjustments (variant_id, warehouse_id, delta, reason, note)
       VALUES ($1,$2,$3,$4,$5)`,
      [vid, a.warehouseId, a.delta, a.reason, a.note]);
  }
  console.log('Verfügbarkeit seed applied.');
}

if (process.argv[1] && process.argv[1].endsWith('seed-verfuegbarkeit.ts')) {
  seedVerfuegbarkeit().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 3: npm-Script registrieren**

In `package.json` unter `"scripts"`, nach `"seed-katalog"`:

```json
    "seed-verfuegbarkeit": "tsx scripts/seed-verfuegbarkeit.ts",
```

- [ ] **Step 4: Seed ausführen (setzt Kontakte- und Katalog-Seed voraus)**

Run: `set -a; source .env; set +a; npm run seed-kontakte && npm run seed-katalog && npm run seed-verfuegbarkeit`
Expected: `Verfügbarkeit seed applied.` ohne FK-Fehler.

- [ ] **Step 5: DoD prüfen** (`psql` ist nicht installiert — `node -e` mit `pg`)

Run:
```bash
set -a; source .env; set +a
node -e "const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"SELECT count(*) FILTER (WHERE is_default)::int AS defaults, count(*) FILTER (WHERE type='konsignation')::int AS konsi, count(*)::int AS lager FROM warehouses\").then(r=>console.log(r.rows[0])).finally(()=>p.end())"
```
Expected: `{ defaults: 1, konsi: 1, lager: 3 }` (bzw. `lager >= 3`).

- [ ] **Step 6: Commit**

```bash
git add src/verfuegbarkeit/seed-data.ts scripts/seed-verfuegbarkeit.ts package.json
git commit -m "feat(verfuegbarkeit): Seed-Fundament (3 Lager, Mehrlager-Bestand, Korrektur)"
```

---

### Task 4: Datenmodell-Hilfeseite ergänzen

CLAUDE.md-Pflicht: Modelländerung → Admin-Seite `datenmodell` aktualisieren.

**Files:**
- Modify: `src/lib/help/content.ts` (Seite mit `slug: 'datenmodell'`)
- Test: `tests/lib/help-content.test.ts` (bestehend, muss grün bleiben)

- [ ] **Step 1: Neuen Abschnitt in die `datenmodell`-Seite einfügen**

In `src/lib/help/content.ts`, im `sections`-Array der Seite `slug: 'datenmodell'`, eine zusätzliche `DocSection` ergänzen. Exakter Wortlaut der Blocks am bestehenden Stil orientieren; Mindestinhalt:

```ts
{
  heading: 'Phase 2 — Kette (Verkauf · Verfügbarkeit · Finanzen)',
  blocks: [
    { type: 'p', text: 'Der Beleg ist eine Tabelle mit Status: sales_orders (Angebot/Auftrag/Rechnung/Gutschrift). sales_order_lines hält die Positionen, sales_order_events den Faden (eine Zeile pro Perle). Gutschriften sind sales_orders-Zeilen mit status=retoure, negativen Mengen und related_order_id auf den Ursprung.' },
    { type: 'p', text: 'Verfügbarkeit: warehouses (inkl. Konsignation, is_default), stock_levels je Lager (quantity_on_hand/quantity_reserved), stock_adjustments mit Pflicht-Grund, purchase_orders/purchase_order_lines für den Einkauf.' },
    { type: 'p', text: 'Finanzen: open_items führt Debitoren und Kreditoren in einer Tabelle (direction-Flag); payments bucht Zahlungen, open_item_id ist nullable (nicht zugeordnete Zahlung landet in der Zuordnen-Warteschlange).' },
  ],
},
```

- [ ] **Step 2: Registry-/Content-Test bestätigen**

Run: `npx vitest run tests/lib/help-content.test.ts`
Expected: PASS (Seite hat weiterhin ≥1 Section mit ≥1 Block; keine Slug-Kollision).

- [ ] **Step 3: Commit**

```bash
git add src/lib/help/content.ts
git commit -m "docs(hilfe): datenmodell um Phase-2-Tabellen ergänzt"
```

---

# Baustein B2 — Beleg-Kern + Übergangslogik

### Task 5: Order-Typen + Belegnummer-Helper

**Files:**
- Create: `src/verkauf/types.ts`
- Create: `src/verkauf/number.ts`
- Test: `tests/verkauf/number.test.ts`

**Interfaces:**
- Produces: Typen `OrderChannel`, `OrderStatus`, `SalesOrder`, `SalesOrderLine`, `SalesOrderEvent`, `SalesOrderDetail`, `SalesOrderLineInput`, `SalesOrderInput`; `nextOrderNumber(existing: string[], year: number): string`.

- [ ] **Step 1: Typen anlegen**

Create `src/verkauf/types.ts`:

```ts
export type OrderChannel = 'shop' | 'b2b_portal' | 'marktplatz' | 'telefon' | 'manuell';
export type OrderStatus =
  | 'angebot' | 'auftrag' | 'versendet' | 'rechnung_gestellt' | 'bezahlt' | 'retoure' | 'storniert';
export type EventStage = 'bestellt' | 'kommissioniert' | 'rechnung_gestellt' | 'bezahlt' | 'retoure';
export type SourceApp = 'verkauf' | 'verfuegbarkeit' | 'finanzen';

export interface SalesOrder {
  id: string; tenantId: string | null; number: string; contactId: string;
  channel: OrderChannel; status: OrderStatus; priceListId: string | null;
  relatedOrderId: string | null; currency: string;
  placedAt: string | null; createdAt: string;
}
export interface SalesOrderLine {
  id: string; orderId: string; variantId: string; quantity: number; unitPrice: number;
}
export interface SalesOrderEvent {
  id: string; orderId: string; stage: EventStage; sourceApp: SourceApp;
  note: string | null; automated: boolean; occurredAt: string;
}
export interface SalesOrderDetail extends SalesOrder {
  lines: SalesOrderLine[]; events: SalesOrderEvent[];
}
export interface SalesOrderLineInput { variantId: string; quantity: number; unitPrice: number }
export interface SalesOrderInput {
  contactId: string; channel: OrderChannel; priceListId?: string | null;
  currency?: string; placedAt?: string | null; lines: SalesOrderLineInput[];
}
```

- [ ] **Step 2: Failing test für die Belegnummer**

Create `tests/verkauf/number.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nextOrderNumber } from '@/verkauf/number';

describe('nextOrderNumber', () => {
  it('startet bei A-<jahr>-0001', () => {
    expect(nextOrderNumber([], 2026)).toBe('A-2026-0001');
  });
  it('inkrementiert über bestehende Nummern desselben Jahres', () => {
    expect(nextOrderNumber(['A-2026-0001', 'A-2026-0007'], 2026)).toBe('A-2026-0008');
  });
  it('ignoriert Fremdformate und andere Jahre', () => {
    expect(nextOrderNumber(['B-2026-0009', 'A-2025-0005', 'kaputt'], 2026)).toBe('A-2026-0001');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/verkauf/number.test.ts`
Expected: FAIL — `nextOrderNumber` existiert noch nicht.

- [ ] **Step 4: Helper implementieren**

Create `src/verkauf/number.ts`:

```ts
/** Nächste Belegnummer A-<jahr>-#### aus dem bestehenden Satz (Fremdformate/andere Jahre ignoriert). */
export function nextOrderNumber(existing: string[], year: number): string {
  const re = new RegExp(`^A-${year}-(\\d+)$`);
  const nums = existing
    .map((n) => re.exec(n))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => parseInt(m[1], 10));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `A-${year}-${String(next).padStart(4, '0')}`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/verkauf/number.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 6: Commit**

```bash
git add src/verkauf/types.ts src/verkauf/number.ts tests/verkauf/number.test.ts
git commit -m "feat(verkauf): Order-Typen + Belegnummer-Helper A-JAHR-####"
```

---

### Task 6: Repository — `createOrder`, `getOrder`, `listOrders`, Seiteneffekt-Helfer

Baut die Belegerfassung und den Lese-Pfad (inkl. Faden). Die Reservierung beim Shop-/Marktplatz-Kanal ist der erste Seiteneffekt. **Phase-2-Vereinfachung (im Code-Kommentar festhalten):** Reservierungen werden auf dem Standardlager (`is_default`) gebucht — die Aggregatzahl `SUM(reserved)` bleibt korrekt, das Festnageln auf ein Lager erfolgt bewusst nicht (Fachspec §5).

**Files:**
- Create: `src/verkauf/repository.ts`
- Test: `tests/verkauf/repository.test.ts`

**Interfaces:**
- Consumes: `nextOrderNumber` (Task 5), Seed-Lager aus Task 3 (`is_default`-Lager muss existieren), `pool` aus `@/lib/db`.
- Produces: `listOrders(): Promise<SalesOrder[]>`, `getOrder(id): Promise<SalesOrderDetail | null>`, `createOrder(input: SalesOrderInput): Promise<SalesOrderDetail>`. Interne (nicht exportierte) Helfer `writeEvent`, `reserveStock`, die in Task 7 wiederverwendet werden — Task 7 erweitert dieselbe Datei.

- [ ] **Step 1: Failing test — createOrder + Kanal-Logik**

Create `tests/verkauf/repository.test.ts`:

```ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { pool } from '@/lib/db';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';
import { seedVerfuegbarkeit } from '../../scripts/seed-verfuegbarkeit';
import { createOrder, getOrder } from '@/verkauf/repository';

const MUELLER = 'c1c1c1c1-0000-4000-8000-000000000001'; // Spielwaren Müller, K-0001
const PL_HANDEL = 'a1a1a1a1-0000-4000-8000-000000000001';
const orderIds: string[] = [];

async function variantId(sku: string): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM product_variants WHERE sku = $1', [sku]);
  return r.rows[0].id;
}
async function reservedFor(sku: string): Promise<number> {
  const r = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(quantity_reserved),0)::text AS s FROM stock_levels
       WHERE variant_id = (SELECT id FROM product_variants WHERE sku=$1)`, [sku]);
  return parseInt(r.rows[0].s, 10);
}

beforeAll(async () => {
  await seedKontakte(); await seedKatalog(); await seedVerfuegbarkeit();
});
afterAll(async () => {
  for (const id of orderIds) await pool.query('DELETE FROM sales_orders WHERE id = $1', [id]);
  await pool.end();
});

describe('verkauf repository — createOrder', () => {
  it('b2b_portal startet als angebot, ohne Perle und ohne Reservierung', async () => {
    const before = await reservedFor('SJ-BLAU');
    const o = await createOrder({
      contactId: MUELLER, channel: 'b2b_portal', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 3, unitPrice: 11.9 }],
    });
    orderIds.push(o.id);
    expect(o.number).toMatch(/^A-\d{4}-\d{4}$/);
    expect(o.status).toBe('angebot');
    expect(o.events).toHaveLength(0);
    expect(await reservedFor('SJ-BLAU')).toBe(before);
  });

  it('shop startet als auftrag, mit automatischer bestellt-Perle und Reservierung', async () => {
    const before = await reservedFor('SJ-BLAU');
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 2, unitPrice: 11.9 }],
    });
    orderIds.push(o.id);
    expect(o.status).toBe('auftrag');
    expect(o.events).toHaveLength(1);
    expect(o.events[0].stage).toBe('bestellt');
    expect(o.events[0].automated).toBe(true);
    expect(await reservedFor('SJ-BLAU')).toBe(before + 2);
    const back = await getOrder(o.id);
    expect(back?.lines).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/verkauf/repository.test.ts`
Expected: FAIL — `@/verkauf/repository` existiert noch nicht.

- [ ] **Step 3: Repository implementieren**

Create `src/verkauf/repository.ts`:

```ts
import { pool } from '@/lib/db';
import type { PoolClient } from 'pg';
import { nextOrderNumber } from './number';
import type {
  SalesOrder, SalesOrderDetail, SalesOrderEvent, SalesOrderInput, SalesOrderLine,
  EventStage, SourceApp,
} from './types';

const ORDER_COLS = `id, tenant_id, number, contact_id, channel, status, price_list_id,
  related_order_id, currency, placed_at::text AS placed_at, created_at::text AS created_at`;

function mapOrder(x: any): SalesOrder {
  return {
    id: x.id, tenantId: x.tenant_id, number: x.number, contactId: x.contact_id,
    channel: x.channel, status: x.status, priceListId: x.price_list_id,
    relatedOrderId: x.related_order_id, currency: x.currency,
    placedAt: x.placed_at, createdAt: x.created_at,
  };
}
function mapLine(x: any): SalesOrderLine {
  return { id: x.id, orderId: x.order_id, variantId: x.variant_id, quantity: x.quantity, unitPrice: Number(x.unit_price) };
}
function mapEvent(x: any): SalesOrderEvent {
  return {
    id: x.id, orderId: x.order_id, stage: x.stage, sourceApp: x.source_app,
    note: x.note, automated: x.automated, occurredAt: x.occurred_at,
  };
}

export async function listOrders(): Promise<SalesOrder[]> {
  const r = await pool.query(`SELECT ${ORDER_COLS} FROM sales_orders ORDER BY number`);
  return r.rows.map(mapOrder);
}

export async function getOrder(id: string): Promise<SalesOrderDetail | null> {
  const r = await pool.query(`SELECT ${ORDER_COLS} FROM sales_orders WHERE id = $1`, [id]);
  if (r.rows.length === 0) return null;
  const order = mapOrder(r.rows[0]);
  const lines = await pool.query(
    `SELECT id, order_id, variant_id, quantity, unit_price FROM sales_order_lines WHERE order_id = $1 ORDER BY id`, [id]);
  const events = await pool.query(
    `SELECT id, order_id, stage, source_app, note, automated, occurred_at::text AS occurred_at
       FROM sales_order_events WHERE order_id = $1 ORDER BY occurred_at`, [id]);
  return { ...order, lines: lines.rows.map(mapLine), events: events.rows.map(mapEvent) };
}

// ── interne Seiteneffekt-Helfer (laufen innerhalb einer Transaktion) ──

async function writeEvent(
  c: PoolClient, orderId: string, stage: EventStage, sourceApp: SourceApp, automated = false, note: string | null = null,
): Promise<void> {
  await c.query(
    `INSERT INTO sales_order_events (order_id, stage, source_app, automated, note)
     VALUES ($1,$2,$3,$4,$5)`,
    [orderId, stage, sourceApp, automated, note]);
}

async function defaultWarehouseId(c: PoolClient): Promise<string> {
  const r = await c.query<{ id: string }>('SELECT id FROM warehouses WHERE is_default LIMIT 1');
  if (r.rows.length === 0) throw new Error('Kein Standardlager (is_default) definiert.');
  return r.rows[0].id;
}

// Phase-2-Vereinfachung: Reservierung auf dem Standardlager. Die Aggregatzahl
// SUM(reserved) bleibt korrekt; lagergenaues Festnageln erfolgt bewusst nicht (§5).
async function reserveStock(c: PoolClient, orderId: string): Promise<void> {
  const wh = await defaultWarehouseId(c);
  await c.query(
    `INSERT INTO stock_levels (variant_id, warehouse_id, quantity_reserved)
       SELECT variant_id, $2, quantity FROM sales_order_lines WHERE order_id = $1
     ON CONFLICT (variant_id, warehouse_id)
       DO UPDATE SET quantity_reserved = stock_levels.quantity_reserved + excluded.quantity_reserved`,
    [orderId, wh]);
}

export async function createOrder(input: SalesOrderInput): Promise<SalesOrderDetail> {
  const startsAsAuftrag = input.channel === 'shop' || input.channel === 'marktplatz';
  const status = startsAsAuftrag ? 'auftrag' : 'angebot';
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const existing = await c.query<{ number: string }>('SELECT number FROM sales_orders');
    const number = nextOrderNumber(existing.rows.map((x) => x.number), new Date().getFullYear());
    const ins = await c.query(
      `INSERT INTO sales_orders (number, contact_id, channel, status, price_list_id, currency, placed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [number, input.contactId, input.channel, status, input.priceListId ?? null,
       input.currency ?? 'EUR', input.placedAt ?? null]);
    const orderId = ins.rows[0].id as string;
    for (const l of input.lines) {
      await c.query(
        `INSERT INTO sales_order_lines (order_id, variant_id, quantity, unit_price) VALUES ($1,$2,$3,$4)`,
        [orderId, l.variantId, l.quantity, l.unitPrice]);
    }
    if (startsAsAuftrag) {
      await writeEvent(c, orderId, 'bestellt', 'verkauf', true);
      await reserveStock(c, orderId);
    }
    await c.query('COMMIT');
    const detail = await getOrder(orderId);
    return detail!;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
```

Die Helfer `writeEvent`, `reserveStock`, `defaultWarehouseId` bleiben **modul-lokal** (kein Export) — Tasks 7 und 8 erweitern dieselbe Datei und haben sie im Scope.

- [ ] **Step 4: Run test to verify it passes**

Run: `set -a; source .env; set +a; npx vitest run tests/verkauf/repository.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/verkauf/repository.ts tests/verkauf/repository.test.ts
git commit -m "feat(verkauf): createOrder/getOrder/listOrders + Reservierung"
```

---

### Task 7: `transitionOrderStatus` — die zentrale Übergangsfunktion

Der eine Flaschenhals. Erweitert `src/verkauf/repository.ts`. Validiert Übergänge über eine Map, schreibt automatisch die Perle und die Seiteneffekte, alles in einer Transaktion.

**Files:**
- Modify: `src/verkauf/repository.ts`
- Test: `tests/verkauf/repository.test.ts` (erweitern)

**Interfaces:**
- Consumes: `writeEvent`, `reserveStock`, `defaultWarehouseId` (Task 6), `getOrder`.
- Produces: `transitionOrderStatus(orderId: string, target: OrderStatus): Promise<SalesOrderDetail>`.

- [ ] **Step 1: Failing test — kompletter Lebenszyklus + Seiteneffekte**

An `tests/verkauf/repository.test.ts` anhängen (Import oben um `transitionOrderStatus` ergänzen):

```ts
import { createOrder, getOrder, transitionOrderStatus } from '@/verkauf/repository';

async function onHandFor(sku: string): Promise<number> {
  const r = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(quantity_on_hand),0)::text AS s FROM stock_levels
       WHERE variant_id = (SELECT id FROM product_variants WHERE sku=$1)`, [sku]);
  return parseInt(r.rows[0].s, 10);
}

describe('verkauf repository — transitionOrderStatus', () => {
  it('führt einen Beleg auftrag→versendet→rechnung_gestellt→bezahlt mit Perlen + Seiteneffekten', async () => {
    const vid = await variantId('BK-CLASSIC');
    const onHandBefore = await onHandFor('BK-CLASSIC');
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: vid, quantity: 5, unitPrice: 16.9 }],
    });
    orderIds.push(o.id);

    const shipped = await transitionOrderStatus(o.id, 'versendet');
    expect(shipped.status).toBe('versendet');
    expect(shipped.events.map((e) => e.stage)).toEqual(['bestellt', 'kommissioniert']);
    expect(shipped.events[1].sourceApp).toBe('verfuegbarkeit');
    expect(await onHandFor('BK-CLASSIC')).toBe(onHandBefore - 5);

    const invoiced = await transitionOrderStatus(o.id, 'rechnung_gestellt');
    expect(invoiced.status).toBe('rechnung_gestellt');
    const oi = await pool.query(
      `SELECT direction, status, amount::text AS amount FROM open_items WHERE order_id = $1`, [o.id]);
    expect(oi.rows).toHaveLength(1);
    expect(oi.rows[0].direction).toBe('debitor');
    expect(oi.rows[0].amount).toBe('84.50'); // 5 × 16.90

    const paid = await transitionOrderStatus(o.id, 'bezahlt');
    expect(paid.status).toBe('bezahlt');
    expect(paid.events[paid.events.length - 1].stage).toBe('bezahlt');
    const oi2 = await pool.query(`SELECT status FROM open_items WHERE order_id = $1`, [o.id]);
    expect(oi2.rows[0].status).toBe('bezahlt');
  });

  it('verweigert einen unerlaubten Übergang', async () => {
    const o = await createOrder({
      contactId: MUELLER, channel: 'b2b_portal', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 1, unitPrice: 11.9 }],
    });
    orderIds.push(o.id);
    // angebot → bezahlt ist nicht erlaubt
    await expect(transitionOrderStatus(o.id, 'bezahlt')).rejects.toThrow(/Übergang/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/verkauf/repository.test.ts -t transitionOrderStatus`
Expected: FAIL — `transitionOrderStatus` ist nicht exportiert.

- [ ] **Step 3: Implementierung ergänzen**

In `src/verkauf/repository.ts` die Import-Zeile um `OrderStatus` erweitern und am Ende der Datei anfügen (die modul-lokalen Helfer `writeEvent`/`reserveStock`/`defaultWarehouseId` aus Task 6 sind in Scope):

```ts
// Storniert nur aus angebot/auftrag: nur dort ist "Reservierung freigeben" (§3)
// die vollständige Kompensation. Aus versendet/rechnung_gestellt müsste Bestand
// zurückgebucht bzw. ein offener Posten storniert werden — nicht in Phase 2.
const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  angebot: ['auftrag', 'storniert'],
  auftrag: ['versendet', 'storniert'],
  versendet: ['rechnung_gestellt'],
  rechnung_gestellt: ['bezahlt'],
  bezahlt: [],       // Retoure läuft über createReturn (neuer Beleg), nicht über einen Statuswechsel
  retoure: [],
  storniert: [],
};

async function shipStock(c: PoolClient, orderId: string): Promise<void> {
  const wh = await defaultWarehouseId(c);
  const lines = await c.query<{ variant_id: string; quantity: number }>(
    `SELECT variant_id, quantity FROM sales_order_lines WHERE order_id = $1`, [orderId]);
  for (const l of lines.rows) {
    // Reservierung auf dem Standardlager freigeben ...
    await c.query(
      `UPDATE stock_levels SET quantity_reserved = quantity_reserved - $3
         WHERE variant_id = $1 AND warehouse_id = $2`, [l.variant_id, wh, l.quantity]);
    // ... und aus dem Lager mit dem höchsten Bestand entnehmen (Phase-2-simpel, überschreibbar später).
    const pick = await c.query<{ warehouse_id: string }>(
      `SELECT warehouse_id FROM stock_levels WHERE variant_id = $1 ORDER BY quantity_on_hand DESC LIMIT 1`,
      [l.variant_id]);
    const pickWh = pick.rows[0]?.warehouse_id ?? wh;
    await c.query(
      `INSERT INTO stock_levels (variant_id, warehouse_id, quantity_on_hand)
         VALUES ($1,$2,$3)
       ON CONFLICT (variant_id, warehouse_id)
         DO UPDATE SET quantity_on_hand = stock_levels.quantity_on_hand - $3`,
      [l.variant_id, pickWh, l.quantity]);
  }
}

async function createDebitorOpenItem(c: PoolClient, orderId: string): Promise<void> {
  await c.query(
    `INSERT INTO open_items (direction, contact_id, reference, order_id, amount, due_date, status)
     SELECT 'debitor', o.contact_id, o.number, o.id,
            (SELECT COALESCE(SUM(quantity * unit_price), 0) FROM sales_order_lines WHERE order_id = o.id),
            (CURRENT_DATE + (ct.payment_terms * INTERVAL '1 day'))::date, 'offen'
       FROM sales_orders o JOIN contacts ct ON ct.id = o.contact_id
      WHERE o.id = $1`,
    [orderId]);
}

async function releaseReservation(c: PoolClient, orderId: string): Promise<void> {
  const wh = await defaultWarehouseId(c);
  await c.query(
    `UPDATE stock_levels s SET quantity_reserved = s.quantity_reserved - l.quantity
       FROM sales_order_lines l
      WHERE l.order_id = $1 AND s.variant_id = l.variant_id AND s.warehouse_id = $2`,
    [orderId, wh]);
}

export async function transitionOrderStatus(orderId: string, target: OrderStatus): Promise<SalesOrderDetail> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const cur = await c.query<{ status: OrderStatus }>(
      `SELECT status FROM sales_orders WHERE id = $1 FOR UPDATE`, [orderId]);
    if (cur.rows.length === 0) throw new Error(`Beleg ${orderId} nicht gefunden.`);
    const from = cur.rows[0].status;
    if (!ALLOWED[from].includes(target)) {
      throw new Error(`Übergang ${from} → ${target} ist nicht erlaubt.`);
    }
    switch (target) {
      case 'auftrag':
        await writeEvent(c, orderId, 'bestellt', 'verkauf');
        await reserveStock(c, orderId);
        break;
      case 'versendet':
        await writeEvent(c, orderId, 'kommissioniert', 'verfuegbarkeit');
        await shipStock(c, orderId);
        break;
      case 'rechnung_gestellt':
        await writeEvent(c, orderId, 'rechnung_gestellt', 'verkauf');
        await createDebitorOpenItem(c, orderId);
        break;
      case 'bezahlt':
        await writeEvent(c, orderId, 'bezahlt', 'finanzen');
        await c.query(`UPDATE open_items SET status = 'bezahlt' WHERE order_id = $1 AND direction = 'debitor'`, [orderId]);
        break;
      case 'storniert':
        if (from === 'auftrag') await releaseReservation(c, orderId);
        break;
    }
    await c.query(`UPDATE sales_orders SET status = $2 WHERE id = $1`, [orderId, target]);
    await c.query('COMMIT');
    return (await getOrder(orderId))!;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/verkauf/repository.test.ts`
Expected: PASS (alle createOrder- + transitionOrderStatus-Tests).

- [ ] **Step 5: Commit**

```bash
git add src/verkauf/repository.ts tests/verkauf/repository.test.ts
git commit -m "feat(verkauf): zentrale transitionOrderStatus() mit Perlen + Seiteneffekten"
```

---

### Task 8: `createReturn` — Retoure als neuer Beleg (nicht-linearer Faden)

Erfüllt Fachspec §3 (Retoure) und Seed-DoD §11 #2. Die Retoure-Perle hängt am **Ursprungsbeleg**.

**Files:**
- Modify: `src/verkauf/repository.ts`
- Test: `tests/verkauf/repository.test.ts` (erweitern)

**Interfaces:**
- Consumes: `nextOrderNumber`, `writeEvent`, `defaultWarehouseId`, `getOrder`.
- Produces: `createReturn(originalOrderId: string): Promise<SalesOrderDetail>` — gibt den **neuen Gutschriftbeleg** zurück.

- [ ] **Step 1: Failing test**

An `tests/verkauf/repository.test.ts` anhängen (Import um `createReturn` erweitern):

```ts
describe('verkauf repository — createReturn', () => {
  it('legt einen Gutschriftbeleg an, hängt die retoure-Perle an den Ursprung und bucht Bestand zurück', async () => {
    const vid = await variantId('BK-CLASSIC');
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: vid, quantity: 4, unitPrice: 16.9 }],
    });
    orderIds.push(o.id);
    await transitionOrderStatus(o.id, 'versendet');
    await transitionOrderStatus(o.id, 'rechnung_gestellt');
    await transitionOrderStatus(o.id, 'bezahlt');

    const onHandBefore = await onHandFor('BK-CLASSIC');
    const credit = await createReturn(o.id);
    // credit NICHT in orderIds pushen: die FK related_order_id → o.id verlangt,
    // dass die Gutschrift VOR dem Ursprung gelöscht wird. Das erledigt die
    // gezielte DELETE-Zeile am Testende; o.id bleibt für afterAll in orderIds.

    expect(credit.status).toBe('retoure');
    expect(credit.relatedOrderId).toBe(o.id);
    expect(credit.lines[0].quantity).toBe(-4);              // negative Menge
    expect(await onHandFor('BK-CLASSIC')).toBe(onHandBefore + 4);

    const original = await getOrder(o.id);
    expect(original!.events[original!.events.length - 1].stage).toBe('retoure'); // Perle am Ursprung

    // Gutschrift zuerst entfernen (FK related_order_id), Ursprung räumt afterAll ab.
    await pool.query('DELETE FROM sales_orders WHERE related_order_id = $1', [o.id]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/verkauf/repository.test.ts -t createReturn`
Expected: FAIL — `createReturn` nicht exportiert.

- [ ] **Step 3: Implementierung ergänzen**

In `src/verkauf/repository.ts` am Ende der Datei anfügen:

```ts
export async function createReturn(originalOrderId: string): Promise<SalesOrderDetail> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const orig = await c.query(
      `SELECT ${ORDER_COLS} FROM sales_orders WHERE id = $1 FOR UPDATE`, [originalOrderId]);
    if (orig.rows.length === 0) throw new Error(`Beleg ${originalOrderId} nicht gefunden.`);
    const o = mapOrder(orig.rows[0]);
    if (o.status !== 'bezahlt') throw new Error('Retoure nur aus Status bezahlt möglich.');

    const existing = await c.query<{ number: string }>('SELECT number FROM sales_orders');
    const number = nextOrderNumber(existing.rows.map((x) => x.number), new Date().getFullYear());
    const ins = await c.query(
      `INSERT INTO sales_orders (number, contact_id, channel, status, price_list_id, related_order_id, currency)
       VALUES ($1,$2,$3,'retoure',$4,$5,$6) RETURNING id`,
      [number, o.contactId, o.channel, o.priceListId, originalOrderId, o.currency]);
    const creditId = ins.rows[0].id as string;

    // Positionen des Ursprungs gespiegelt mit negativer Menge
    await c.query(
      `INSERT INTO sales_order_lines (order_id, variant_id, quantity, unit_price)
         SELECT $2, variant_id, -quantity, unit_price FROM sales_order_lines WHERE order_id = $1`,
      [originalOrderId, creditId]);

    // Retoure-Perle am URSPRUNGSBELEG
    await writeEvent(c, originalOrderId, 'retoure', 'verkauf');

    // Bestand zurückbuchen (Standardlager)
    const wh = await defaultWarehouseId(c);
    await c.query(
      `INSERT INTO stock_levels (variant_id, warehouse_id, quantity_on_hand)
         SELECT variant_id, $2, quantity FROM sales_order_lines WHERE order_id = $1
       ON CONFLICT (variant_id, warehouse_id)
         DO UPDATE SET quantity_on_hand = stock_levels.quantity_on_hand + excluded.quantity_on_hand`,
      [originalOrderId, wh]);

    await c.query('COMMIT');
    return (await getOrder(creditId))!;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/verkauf/repository.test.ts`
Expected: PASS (alle Tests der Datei).

- [ ] **Step 5: Commit**

```bash
git add src/verkauf/repository.ts tests/verkauf/repository.test.ts
git commit -m "feat(verkauf): createReturn – Gutschriftbeleg, Retoure-Perle am Ursprung"
```

---

### Task 9: Server Actions

Dünne, gegatete Hülle über dem Repository — der einzige Weg, über den die UI (B3) schreibt.

**Files:**
- Create: `src/app/(shell)/verkauf/actions.ts`
- Test: `tests/app/verkauf-actions.test.ts`

**Interfaces:**
- Consumes: `createOrder`, `transitionOrderStatus`, `createReturn` (Repository), `requireAppAccess` (`@/lib/groups`), `revalidatePath` (`next/cache`).
- Produces: `createOrderAction`, `transitionOrderStatusAction`, `createReturnAction`.

- [ ] **Step 1: Failing test — Gate + Delegation + Revalidate**

Create `tests/app/verkauf-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/groups', () => ({ requireAppAccess: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/verkauf/repository', () => ({
  createOrder: vi.fn(async () => ({ id: 'o1' })),
  transitionOrderStatus: vi.fn(async () => ({ id: 'o1', status: 'versendet' })),
  createReturn: vi.fn(async () => ({ id: 'c1' })),
}));

import { requireAppAccess } from '@/lib/groups';
import { revalidatePath } from 'next/cache';
import { createOrder, transitionOrderStatus } from '@/verkauf/repository';
import { createOrderAction, transitionOrderStatusAction } from '@/app/(shell)/verkauf/actions';

beforeEach(() => vi.clearAllMocks());

describe('verkauf actions', () => {
  it('createOrderAction gated auf verkauf/edit, delegiert, revalidiert', async () => {
    await createOrderAction({ contactId: 'k1', channel: 'manuell', lines: [] });
    expect(requireAppAccess).toHaveBeenCalledWith('verkauf', 'edit');
    expect(createOrder).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith('/verkauf');
  });

  it('transitionOrderStatusAction revalidiert Liste und Detail', async () => {
    await transitionOrderStatusAction('o1', 'versendet');
    expect(requireAppAccess).toHaveBeenCalledWith('verkauf', 'edit');
    expect(transitionOrderStatus).toHaveBeenCalledWith('o1', 'versendet');
    expect(revalidatePath).toHaveBeenCalledWith('/verkauf/o1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/verkauf-actions.test.ts`
Expected: FAIL — Actions-Modul existiert nicht.

- [ ] **Step 3: Actions implementieren**

Create `src/app/(shell)/verkauf/actions.ts`:

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireAppAccess } from '@/lib/groups';
import { createOrder, transitionOrderStatus, createReturn } from '@/verkauf/repository';
import type { SalesOrderDetail, SalesOrderInput, OrderStatus } from '@/verkauf/types';

export async function createOrderAction(input: SalesOrderInput): Promise<SalesOrderDetail> {
  await requireAppAccess('verkauf', 'edit');
  const o = await createOrder(input);
  revalidatePath('/verkauf');
  return o;
}

export async function transitionOrderStatusAction(id: string, target: OrderStatus): Promise<SalesOrderDetail> {
  await requireAppAccess('verkauf', 'edit');
  const o = await transitionOrderStatus(id, target);
  revalidatePath('/verkauf');
  revalidatePath(`/verkauf/${id}`);
  return o;
}

export async function createReturnAction(originalOrderId: string): Promise<SalesOrderDetail> {
  await requireAppAccess('verkauf', 'edit');
  const credit = await createReturn(originalOrderId);
  revalidatePath('/verkauf');
  revalidatePath(`/verkauf/${originalOrderId}`);
  return credit;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/verkauf-actions.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(shell)/verkauf/actions.ts" tests/app/verkauf-actions.test.ts
git commit -m "feat(verkauf): Server Actions (create/transition/return) mit Gate + Revalidate"
```

---

### Task 10: Order-Seed-DoD über die Repository-Funktionen

Erzeugt die Beleg-Datensätze aus Fachspec §11 **durch Aufruf der Repository-Funktionen** — zugleich der End-to-End-Beweis, dass Faden + Seiteneffekte korrekt entstehen. Deckt #1 (voller Faden bis bezahlt), #2 (Retoure auf #1), #3 (B2B-Angebot), #4 (Belege in auftrag/versendet/rechnung_gestellt), #5 (≥3 Kanäle).

**Files:**
- Create: `src/verkauf/seed-data.ts`
- Create: `scripts/seed-verkauf.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createOrder`, `transitionOrderStatus`, `createReturn`; Varianten per SKU-Lookup.
- Produces: `seedVerkauf()`.

- [ ] **Step 1: Seed-Spezifikation als Daten**

Create `src/verkauf/seed-data.ts`:

```ts
// DoD-Seed Verkauf (§11 #1–#5). Belege entstehen im Skript über die
// Repository-Funktionen (nicht per direktem Insert) — nur so schreibt sich der
// Faden mit allen Perlen und Seiteneffekten. Varianten per SKU aufgelöst.
import type { OrderChannel } from './types';

export interface SeedOrderLine { sku: string; quantity: number; unitPrice: number }
export interface SeedOrder {
  ref: string;                 // interne Referenz für Log
  contactNumber: string;       // K-#### des Kunden
  channel: OrderChannel;
  lines: SeedOrderLine[];
  advanceTo: 'angebot' | 'auftrag' | 'versendet' | 'rechnung_gestellt' | 'bezahlt';
  withReturn?: boolean;        // Retoure auf diesen Beleg anlegen (#2)
}

export const SEED_ORDERS: SeedOrder[] = [
  // #1 voller Faden bis bezahlt (+ #2 Retoure)  — Kanal shop
  { ref: 'shop-voll', contactNumber: 'K-0001', channel: 'shop',
    lines: [{ sku: 'BK-CLASSIC', quantity: 3, unitPrice: 16.9 }], advanceTo: 'bezahlt', withReturn: true },
  // #3 B2B-Angebot (Einstiegsstatus durch Kanal)
  { ref: 'b2b-angebot', contactNumber: 'K-0001', channel: 'b2b_portal',
    lines: [{ sku: 'SJ-BLAU', quantity: 10, unitPrice: 11.5 }], advanceTo: 'angebot' },
  // #4 Teil-Fortschritt: auftrag / versendet / rechnung_gestellt (+ #5 dritter Kanal telefon)
  { ref: 'shop-auftrag', contactNumber: 'K-0001', channel: 'shop',
    lines: [{ sku: 'SJ-BLAU', quantity: 2, unitPrice: 11.9 }], advanceTo: 'auftrag' },
  { ref: 'telefon-versendet', contactNumber: 'K-0001', channel: 'telefon',
    lines: [{ sku: 'BK-CLASSIC', quantity: 1, unitPrice: 16.9 }], advanceTo: 'versendet' },
  { ref: 'b2b-rechnung', contactNumber: 'K-0001', channel: 'b2b_portal',
    lines: [{ sku: 'SJ-BLAU', quantity: 5, unitPrice: 11.5 }], advanceTo: 'rechnung_gestellt' },
];
```

- [ ] **Step 2: Seed-Skript anlegen**

Create `scripts/seed-verkauf.ts`:

```ts
import { pool } from '../src/lib/db';
import { SEED_ORDERS } from '../src/verkauf/seed-data';
import { createOrder, transitionOrderStatus, createReturn } from '../src/verkauf/repository';
import type { OrderStatus } from '../src/verkauf/types';

const PL_HANDEL = 'a1a1a1a1-0000-4000-8000-000000000001';
const CHAIN: OrderStatus[] = ['angebot', 'auftrag', 'versendet', 'rechnung_gestellt', 'bezahlt'];

async function lookup(table: 'contacts' | 'product_variants', col: string, val: string): Promise<string> {
  const r = await pool.query<{ id: string }>(`SELECT id FROM ${table} WHERE ${col} = $1`, [val]);
  if (r.rows.length === 0) throw new Error(`Nicht gefunden: ${table}.${col}=${val}`);
  return r.rows[0].id;
}

export async function seedVerkauf(): Promise<void> {
  for (const s of SEED_ORDERS) {
    const contactId = await lookup('contacts', 'number', s.contactNumber);
    const lines = [];
    for (const l of s.lines) {
      lines.push({ variantId: await lookup('product_variants', 'sku', l.sku), quantity: l.quantity, unitPrice: l.unitPrice });
    }
    const o = await createOrder({ contactId, channel: s.channel, priceListId: PL_HANDEL, lines });
    // Vom Einstiegsstatus schrittweise bis advanceTo hochfahren.
    const start = CHAIN.indexOf(o.status as OrderStatus);
    const end = CHAIN.indexOf(s.advanceTo);
    for (let i = start + 1; i <= end; i++) {
      await transitionOrderStatus(o.id, CHAIN[i]);
    }
    if (s.withReturn) await createReturn(o.id);
    console.log(`Seed-Beleg ${s.ref}: ${o.number} → ${s.advanceTo}${s.withReturn ? ' (+Retoure)' : ''}`);
  }
  console.log('Verkauf seed applied.');
}

if (process.argv[1] && process.argv[1].endsWith('seed-verkauf.ts')) {
  seedVerkauf().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}
```

Hinweis: Dieser Seed ist **nicht idempotent** (jeder Lauf erzeugt neue Belege mit neuen Nummern), anders als die Stammdaten-Seeds. Das ist bewusst — Belege sind Vorgänge, keine Stammdaten. Für einen sauberen Neuaufbau die `sales_*`-Tabellen vorher leeren.

- [ ] **Step 3: npm-Script registrieren**

In `package.json` unter `"scripts"`, nach `"seed-verfuegbarkeit"`:

```json
    "seed-verkauf": "tsx scripts/seed-verkauf.ts",
```

- [ ] **Step 4: Seed ausführen und DoD prüfen** (`node -e`, `psql` fehlt)

Run: `set -a; source .env; set +a; npm run seed-kontakte && npm run seed-katalog && npm run seed-verfuegbarkeit && npm run seed-verkauf`
Expected: Log listet 5 Belege + Retoure, endet mit `Verkauf seed applied.`

Run:
```bash
set -a; source .env; set +a
node -e "const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('SELECT count(DISTINCT channel)::int AS kanaele FROM sales_orders').then(r=>console.log(r.rows[0])).finally(()=>p.end())"
node -e "const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"SELECT count(*)::int AS retoure_perlen FROM sales_order_events WHERE stage='retoure'\").then(r=>console.log(r.rows[0])).finally(()=>p.end())"
```
Expected: `{ kanaele: 3 }` (bzw. `>= 3`, §11 #5) und `{ retoure_perlen: 1 }` (bzw. `>= 1`, §11 #2).

- [ ] **Step 5: Commit**

```bash
git add src/verkauf/seed-data.ts scripts/seed-verkauf.ts package.json
git commit -m "feat(verkauf): Order-Seed-DoD über Repository-Funktionen (§11 #1–#5)"
```

---

### Task 11: Gesamtlauf + Handoff

**Files:** keine (Verifikation)

- [ ] **Step 1: Volle Testsuite lokal**

Run: `npm test`
Expected: alle Suites grün **außer** den bekannten RLS-Failures aus `tests/db/rls.test.ts` (Projekt-Memory: erwartet auf diesem Host, keine Regression). Neue Suites `tests/verkauf/*` und `tests/app/verkauf-actions.test.ts` sind grün.

- [ ] **Step 2: Deploy + Verifikation auf der VPS**

Deploy auf die VPS (`root@194.164.204.249`, `budp.lumeapps.de`) gemäß Projekt-Deploy-Flow und dort:
- `npm run migrate` (Schema + RLS anwenden)
- Seeds ausführen (kontakte → katalog → verfuegbarkeit → verkauf)
- Auf der VPS `npx vitest run tests/db/rls.test.ts` — dort müssen die Deny-Tests **grün** sein (echte Rollen-Erzwingung).

Expected: Migration + Seeds fehlerfrei; RLS-Deny grün auf der VPS.

- [ ] **Step 3: Handoff**

B1 + B2 stehen: komplettes Datenmodell, RLS, Seed-Fundament und der Beleg-Kern samt zentraler Übergangslogik inkl. Bestands- und Finanz-Seiteneffekten. Nächster Baustein: **B3 — Verkauf Ebene 2/3** (Belegliste mit Spur, Beleg-Detail mit Faden, manuelle Beleganlage). Vor B3 eigenen Detailplan schreiben.

---

## Self-Review-Notiz

- **Spec-Abdeckung (Umsetzungsplan §3/§4):** Alle neun Tabellen (Task 1), RLS (Task 2), Seed-Fundament inkl. §11 #10–#12 (Task 3), Datenmodell-Hilfe (Task 4), Order-Typen/Nummer (Task 5), createOrder+Lesepfad (Task 6), zentrale `transitionOrderStatus` mit Übergangstabelle + Seiteneffekten (Task 7), Retoure/§11 #2 (Task 8), Server Actions (Task 9), Order-Seed §11 #1–#5 (Task 10). Finanz-/Verfügbarkeits-DoD #6–#9, #13 sind bewusst B5/B6/B8 (siehe Umsetzungsplan).
- **Typkonsistenz:** `transitionOrderStatus(orderId, target)`, `createOrder(input)`, `createReturn(originalOrderId)`, `nextOrderNumber(existing, year)` sind über Repository, Actions, Seeds und Tests identisch verwendet.
- **Bekannte Abweichung:** RLS-Deny-Tests sind auf dem Dev-Host erwartbar rot (Projekt-Memory) — real verifiziert auf der VPS.
