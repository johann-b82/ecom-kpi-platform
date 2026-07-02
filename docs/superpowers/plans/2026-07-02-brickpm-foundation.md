# BrickPM Foundation (Phase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add BrickPM as a gated app area inside budp — its `bpm_` Postgres schema + seed, a server-side data layer, a `/brickpm` shell with a working Cockpit (budp CI), a nav entry, and the `requireAppAccess('brickpm')` gate — plus harden the grandfather rule now that a real route is gated.

**Architecture:** Seven RLS-closed `bpm_` tables reachable only via the privileged `pg` pool, seeded from a committed fixture extracted from the original demo bundle. A `src/brickpm/` module (types, repository, pure cockpit stats). A Next.js App Router `/brickpm` area whose server layout guards with `requireAppAccess('brickpm')` and renders a budp-styled sidebar; the Cockpit index computes 6 KPIs + notification lists. The `getUserAccess` grandfather rule changes from per-user to global-empty.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, `pg` (privileged server reads), Vitest.

## Global Constraints

- `bpm_` tables reachable ONLY via the privileged `pg` pool (`@/lib/db`); RLS enabled, NO `anon`/`authenticated` policy — same posture as `connector_credentials`. `schema.sql` applies on plain Postgres (no FK to `auth.users`); idempotent (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT`).
- BrickPM uses **budp's CI** (brand `var(--brand)`, neutral palette, Roboto) — NOT the demo's blue/dark look.
- `/brickpm` is gated by `requireAppAccess('brickpm')` (from `@/lib/groups`); the KPI dashboard stays ungated.
- Grandfather rule: full admin ONLY when zero groups exist globally (not per-user).
- Seed data is the **real** demo data, extracted once from `~/Downloads/drive-download-20260702T194014Z-3-001/UseCase_BrickPM.html` and committed as `src/brickpm/seed-data.ts`.
- German UI copy; conventional commits; commit after each task.

---

### Task 1: `bpm_` schema + RLS

**Files:**
- Modify: `db/schema.sql` (append after the groups tables), `db/rls.sql`, `tests/db/rls.test.ts`

**Interfaces:**
- Produces: tables `bpm_products`, `bpm_promotions`, `bpm_goodies`, `bpm_competitors`, `bpm_notifications`, `bpm_integrations`, `bpm_audit_log`.

- [ ] **Step 1: Add failing RLS cases** to `tests/db/rls.test.ts` inside the `describe('RLS on KPI tables', …)` block:

```ts
  for (const t of ['bpm_products','bpm_promotions','bpm_goodies','bpm_competitors','bpm_notifications','bpm_integrations','bpm_audit_log']) {
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

- [ ] **Step 2: Run — expect fail** (`relation "bpm_products" does not exist`)

Run: `npm test -- tests/db/rls.test.ts`
Expected: FAIL.

- [ ] **Step 3: Append tables to `db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS bpm_products (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, cat TEXT, series TEXT, status TEXT,
  year INT, parts INT, uvp DOUBLE PRECISION, price DOUBLE PRECISION, cost DOUBLE PRECISION,
  t_mgn DOUBLE PRECISION, m_mgn DOUBLE PRECISION, stock INT, min_stock INT,
  valid_from DATE, valid_to DATE, channel TEXT, succ TEXT, descr TEXT
);
CREATE TABLE IF NOT EXISTS bpm_promotions (
  id TEXT PRIMARY KEY, name TEXT, product_id TEXT, type TEXT, start_date DATE, end_date DATE,
  target_units INT, sold INT, target_rev DOUBLE PRECISION, exp_mgn DOUBLE PRECISION,
  status TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS bpm_goodies (
  id TEXT PRIMARY KEY, name TEXT, type TEXT, cost DOUBLE PRECISION, price DOUBLE PRECISION,
  products TEXT[], min_cart DOUBLE PRECISION, valid_from DATE, valid_to DATE, status TEXT,
  mgn_effect DOUBLE PRECISION, comment TEXT
);
CREATE TABLE IF NOT EXISTS bpm_competitors (
  id TEXT PRIMARY KEY, product_id TEXT, competitor TEXT, comp_product TEXT,
  own_price DOUBLE PRECISION, comp_price DOUBLE PRECISION, avail BOOLEAN, date DATE, rec TEXT
);
CREATE TABLE IF NOT EXISTS bpm_notifications (
  id TEXT PRIMARY KEY, type TEXT, priority TEXT, ref_id TEXT, msg TEXT, action TEXT,
  status TEXT, due DATE, role TEXT, target TEXT
);
CREATE TABLE IF NOT EXISTS bpm_integrations (
  id TEXT PRIMARY KEY, type TEXT, system TEXT, purpose TEXT, objects TEXT[], dir TEXT,
  status TEXT, ep TEXT, last_sync TEXT
);
CREATE TABLE IF NOT EXISTS bpm_audit_log (
  id BIGSERIAL PRIMARY KEY, ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT, action TEXT NOT NULL, detail TEXT
);
```

- [ ] **Step 4: Enable RLS in `db/rls.sql`** (one statement per table, in the no-public-policy block):

```sql
ALTER TABLE bpm_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpm_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpm_goodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpm_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpm_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpm_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpm_audit_log ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 5: Migrate + run — expect pass**

Run: `npm run migrate && npm test -- tests/db/rls.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add db/schema.sql db/rls.sql tests/db/rls.test.ts
git commit -m "feat: bpm_ BrickPM tables with RLS (server-only)"
```

---

### Task 2: BrickPM types + seed-data fixture (extracted from the bundle)

**Files:**
- Create: `src/brickpm/types.ts`, `src/brickpm/seed-data.ts`, `tests/brickpm/seed-data.test.ts`

**Interfaces:**
- Produces: `types.ts` exports `BpmProduct`, `BpmPromotion`, `BpmGoodie`, `BpmCompetitor`, `BpmNotification`, `BpmIntegration`. `seed-data.ts` exports `PRODUCTS`, `PROMOTIONS`, `GOODIES`, `COMPETITORS`, `NOTIFICATIONS`, `INTEGRATIONS` (typed arrays).

- [ ] **Step 1: Write `src/brickpm/types.ts`**

```ts
export interface BpmProduct {
  id: string; name: string; cat: string; series: string; status: string;
  year: number; parts: number; uvp: number; price: number; cost: number;
  tMgn: number; mMgn: number; stock: number; minStock: number;
  validFrom: string | null; validTo: string | null; channel: string; succ: string | null; descr: string;
}
export interface BpmPromotion {
  id: string; name: string; productId: string; type: string; startDate: string | null; endDate: string | null;
  targetUnits: number; sold: number; targetRev: number; expMgn: number; status: string; note: string;
}
export interface BpmGoodie {
  id: string; name: string; type: string; cost: number; price: number; products: string[];
  minCart: number; validFrom: string | null; validTo: string | null; status: string; mgnEffect: number; comment: string;
}
export interface BpmCompetitor {
  id: string; productId: string; competitor: string; compProduct: string;
  ownPrice: number; compPrice: number; avail: boolean; date: string | null; rec: string;
}
export interface BpmNotification {
  id: string; type: string; priority: string; refId: string; msg: string; action: string;
  status: string; due: string | null; role: string; target: string;
}
export interface BpmIntegration {
  id: string; type: string; system: string; purpose: string; objects: string[]; dir: string;
  status: string; ep: string; lastSync: string;
}
```

- [ ] **Step 2: Extract the real data into `src/brickpm/seed-data.ts`**

Source: `~/Downloads/drive-download-20260702T194014Z-3-001/UseCase_BrickPM.html` (minified bundle). For each entity, locate its array and transcribe every row into a typed constant. Extraction method (run to see the raw literals):

```bash
F=~/Downloads/drive-download-20260702T194014Z-3-001/UseCase_BrickPM.html
grep -o "id:'P0[0-9][0-9]'[^}]*}" "$F"   # 13 products
grep -o "id:'A0[0-9][0-9]'[^}]*}" "$F"   # 7 promotions
grep -o "id:'G0[0-9][0-9]'[^}]*}" "$F"   # 6 goodies
grep -o "id:'C0[0-9][0-9]'[^}]*}" "$F"   # 8 competitors
grep -o "id:'N0[0-9][0-9]'[^}]*}" "$F"   # 9 notifications
grep -o "id:'I0[0-9][0-9]'[^}]*}" "$F"   # 8 integrations
```

Conversion rules when writing `seed-data.ts` (JS-literal → typed TS):
- Rename fields to the interface's camelCase where they differ: promotion `start`→`startDate`, `end`→`endDate`; product `from`→`validFrom`, `to`→`validTo`; goodie `from`→`validFrom`, `to`→`validTo`; integration `lastSync` stays.
- Empty-string dates (`''`) and empty `succ` (`''`) → `null`. Keep non-empty strings as-is.
- Arrays (`products:['P001',…]`, `objects:['products',…]`) stay arrays.
- Numbers stay numbers; `avail:true/false` stays boolean.

Shape (typed, with the FIRST row of each shown as the worked template — transcribe the rest the same way):

```ts
import type {
  BpmProduct, BpmPromotion, BpmGoodie, BpmCompetitor, BpmNotification, BpmIntegration,
} from './types';

export const PRODUCTS: BpmProduct[] = [
  { id: 'P001', name: 'Berliner Fernsehturm Limited Edition 2026', cat: 'Limited Edition', series: 'Stadtikonen',
    status: 'kritisch', year: 2026, parts: 2450, uvp: 249.95, price: 249.95, cost: 112.48, tMgn: 0.50, mMgn: 0.35,
    stock: 38, minStock: 50, validFrom: '2026-01-15', validTo: null, channel: 'Online, POS', succ: 'P010',
    descr: 'Ikonisches Berliner Wahrzeichen als hochdetailliertes Klemmbausteinmodell. Limitierte Auflage 2026. Nummeriertes Echtheitszertifikat.' },
  // …transcribe P002–P013 from the bundle…
];

export const PROMOTIONS: BpmPromotion[] = [
  { id: 'A001', name: 'Fernsehturm Abverkaufs-Aktion', productId: 'P001', type: 'Abverkauf', startDate: '2026-06-20',
    endDate: '2026-07-15', targetUnits: 38, sold: 14, targetRev: 9500, expMgn: 0.50, status: 'aktiv',
    note: 'Rabatt 10% + Goodie Teiletrenner empfohlen' },
  // …transcribe A002–A007…
];

export const GOODIES: BpmGoodie[] = [
  { id: 'G001', name: 'Teiletrenner 3er-Set', type: 'Goodie', cost: 1.50, price: 0,
    products: ['P001','P002','P003','P004'], minCart: 49.95, validFrom: '2026-01-01', validTo: '2026-12-31',
    status: 'aktiv', mgnEffect: -1.50, comment: 'Standard-Goodie für alle Architektur- und Stadion-Sets' },
  // …transcribe G002–G006…
];

export const COMPETITORS: BpmCompetitor[] = [
  { id: 'C001', productId: 'P001', competitor: 'BrickMarket', compProduct: 'Berlin Tower Collector 2026',
    ownPrice: 249.95, compPrice: 234.95, avail: true, date: '2026-06-28', rec: 'Preispositionierung prüfen – 6,4% über Wettbewerb' },
  // …transcribe C002–C008…
];

export const NOTIFICATIONS: BpmNotification[] = [
  { id: 'N001', type: 'Bestand', priority: 'kritisch', refId: 'P001',
    msg: 'Limited Edition Berliner Fernsehturm: Nur noch 38 Stück (Mindestbestand: 50). Abverkauf oder Nachproduktion entscheiden.',
    action: 'Abverkaufsaktion starten', status: 'offen', due: '2026-07-05', role: 'Produktmanager', target: 'Sortiment, Aktionen' },
  // …transcribe N002–N009…
];

export const INTEGRATIONS: BpmIntegration[] = [
  { id: 'I001', type: 'Shop-System', system: 'Shopware 6', purpose: 'Produktdaten, Preise, Aktionen, Bestände',
    objects: ['products','promotions','prices','inventory'], dir: 'BrickPM → Shop', status: 'bereit',
    ep: '/api/products', lastSync: '2026-06-25 14:32' },
  // …transcribe I002–I008…
];
```

Transcribe ALL rows (do not leave the `…` comments). Preserve exact German text, numbers, and dates from the bundle.

- [ ] **Step 3: Write `tests/brickpm/seed-data.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { PRODUCTS, PROMOTIONS, GOODIES, COMPETITORS, NOTIFICATIONS, INTEGRATIONS } from '@/brickpm/seed-data';

describe('BrickPM seed data', () => {
  it('has the expected row counts', () => {
    expect(PRODUCTS).toHaveLength(13);
    expect(PROMOTIONS).toHaveLength(7);
    expect(GOODIES).toHaveLength(6);
    expect(COMPETITORS).toHaveLength(8);
    expect(NOTIFICATIONS).toHaveLength(9);
    expect(INTEGRATIONS).toHaveLength(8);
  });
  it('preserves known values and null-normalizes empty dates', () => {
    const p1 = PRODUCTS.find((p) => p.id === 'P001')!;
    expect(p1).toMatchObject({ name: 'Berliner Fernsehturm Limited Edition 2026', cost: 112.48, stock: 38, minStock: 50, succ: 'P010' });
    expect(p1.validTo).toBeNull();
    expect(GOODIES.find((g) => g.id === 'G001')!.products).toContain('P002');
    expect(NOTIFICATIONS.find((n) => n.id === 'N001')!.priority).toBe('kritisch');
  });
});
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- tests/brickpm/seed-data.test.ts`
Expected: PASS. If a count fails, a row was missed during transcription — fix and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/brickpm/types.ts src/brickpm/seed-data.ts tests/brickpm/seed-data.test.ts
git commit -m "feat: BrickPM types + real seed-data fixture extracted from the demo bundle"
```

---

### Task 3: `seed-brickpm` script (idempotent insert)

**Files:**
- Create: `scripts/seed-brickpm.ts`, `tests/brickpm/seed-script.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: the seed-data arrays (`@/brickpm/seed-data`), `pool` (`@/lib/db`).
- Produces: `seedBrickpm(): Promise<void>` exported from `scripts/seed-brickpm.ts` (so tests can call it without spawning a process).

- [ ] **Step 1: Write the failing test `tests/brickpm/seed-script.test.ts`** (integration):

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { seedBrickpm } from '../../scripts/seed-brickpm';
import { pool } from '@/lib/db';

afterAll(async () => { await pool.end(); });

describe('seedBrickpm (integration, benötigt DB)', () => {
  it('inserts all rows and is idempotent', async () => {
    await seedBrickpm();
    await seedBrickpm(); // second run must not error or duplicate
    const p = await pool.query('SELECT count(*)::int n FROM bpm_products');
    const n = await pool.query('SELECT count(*)::int n FROM bpm_notifications');
    expect(p.rows[0].n).toBe(13);
    expect(n.rows[0].n).toBe(9);
    const p1 = await pool.query(`SELECT cost, stock, succ, valid_to FROM bpm_products WHERE id = 'P001'`);
    expect(p1.rows[0]).toMatchObject({ cost: 112.48, stock: 38, succ: 'P010', valid_to: null });
  });
});
```

- [ ] **Step 2: Run — expect fail** (module missing)

Run: `npm test -- tests/brickpm/seed-script.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `scripts/seed-brickpm.ts`**

```ts
import { pool } from '../src/lib/db';
import {
  PRODUCTS, PROMOTIONS, GOODIES, COMPETITORS, NOTIFICATIONS, INTEGRATIONS,
} from '../src/brickpm/seed-data';

export async function seedBrickpm(): Promise<void> {
  for (const p of PRODUCTS) {
    await pool.query(
      `INSERT INTO bpm_products (id,name,cat,series,status,year,parts,uvp,price,cost,t_mgn,m_mgn,stock,min_stock,valid_from,valid_to,channel,succ,descr)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (id) DO UPDATE SET name=excluded.name,cat=excluded.cat,series=excluded.series,status=excluded.status,
         year=excluded.year,parts=excluded.parts,uvp=excluded.uvp,price=excluded.price,cost=excluded.cost,
         t_mgn=excluded.t_mgn,m_mgn=excluded.m_mgn,stock=excluded.stock,min_stock=excluded.min_stock,
         valid_from=excluded.valid_from,valid_to=excluded.valid_to,channel=excluded.channel,succ=excluded.succ,descr=excluded.descr`,
      [p.id,p.name,p.cat,p.series,p.status,p.year,p.parts,p.uvp,p.price,p.cost,p.tMgn,p.mMgn,p.stock,p.minStock,p.validFrom,p.validTo,p.channel,p.succ,p.descr],
    );
  }
  for (const a of PROMOTIONS) {
    await pool.query(
      `INSERT INTO bpm_promotions (id,name,product_id,type,start_date,end_date,target_units,sold,target_rev,exp_mgn,status,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET name=excluded.name,product_id=excluded.product_id,type=excluded.type,
         start_date=excluded.start_date,end_date=excluded.end_date,target_units=excluded.target_units,sold=excluded.sold,
         target_rev=excluded.target_rev,exp_mgn=excluded.exp_mgn,status=excluded.status,note=excluded.note`,
      [a.id,a.name,a.productId,a.type,a.startDate,a.endDate,a.targetUnits,a.sold,a.targetRev,a.expMgn,a.status,a.note],
    );
  }
  for (const g of GOODIES) {
    await pool.query(
      `INSERT INTO bpm_goodies (id,name,type,cost,price,products,min_cart,valid_from,valid_to,status,mgn_effect,comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET name=excluded.name,type=excluded.type,cost=excluded.cost,price=excluded.price,
         products=excluded.products,min_cart=excluded.min_cart,valid_from=excluded.valid_from,valid_to=excluded.valid_to,
         status=excluded.status,mgn_effect=excluded.mgn_effect,comment=excluded.comment`,
      [g.id,g.name,g.type,g.cost,g.price,g.products,g.minCart,g.validFrom,g.validTo,g.status,g.mgnEffect,g.comment],
    );
  }
  for (const c of COMPETITORS) {
    await pool.query(
      `INSERT INTO bpm_competitors (id,product_id,competitor,comp_product,own_price,comp_price,avail,date,rec)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET product_id=excluded.product_id,competitor=excluded.competitor,comp_product=excluded.comp_product,
         own_price=excluded.own_price,comp_price=excluded.comp_price,avail=excluded.avail,date=excluded.date,rec=excluded.rec`,
      [c.id,c.productId,c.competitor,c.compProduct,c.ownPrice,c.compPrice,c.avail,c.date,c.rec],
    );
  }
  for (const n of NOTIFICATIONS) {
    await pool.query(
      `INSERT INTO bpm_notifications (id,type,priority,ref_id,msg,action,status,due,role,target)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET type=excluded.type,priority=excluded.priority,ref_id=excluded.ref_id,msg=excluded.msg,
         action=excluded.action,status=excluded.status,due=excluded.due,role=excluded.role,target=excluded.target`,
      [n.id,n.type,n.priority,n.refId,n.msg,n.action,n.status,n.due,n.role,n.target],
    );
  }
  for (const i of INTEGRATIONS) {
    await pool.query(
      `INSERT INTO bpm_integrations (id,type,system,purpose,objects,dir,status,ep,last_sync)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET type=excluded.type,system=excluded.system,purpose=excluded.purpose,objects=excluded.objects,
         dir=excluded.dir,status=excluded.status,ep=excluded.ep,last_sync=excluded.last_sync`,
      [i.id,i.type,i.system,i.purpose,i.objects,i.dir,i.status,i.ep,i.lastSync],
    );
  }
  console.log('BrickPM seed applied.');
}

if (process.argv[1] && process.argv[1].endsWith('seed-brickpm.ts')) {
  seedBrickpm().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 4: Add the npm script** to `package.json` (after `seed-groups`):

```json
    "seed-groups": "tsx scripts/seed-groups.ts",
    "seed-brickpm": "tsx scripts/seed-brickpm.ts"
```

- [ ] **Step 5: Run — expect pass**

Run: `npm test -- tests/brickpm/seed-script.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-brickpm.ts package.json tests/brickpm/seed-script.test.ts
git commit -m "feat: idempotent seed-brickpm script"
```

---

### Task 4: Repository + pure cockpit stats

**Files:**
- Create: `src/brickpm/cockpit.ts`, `src/brickpm/repository.ts`, `tests/brickpm/cockpit.test.ts`, `tests/brickpm/repository.test.ts`

**Interfaces:**
- Consumes: `pool` (`@/lib/db`), the Bpm types.
- Produces:
  - `cockpit.ts`: `interface CockpitStats { produkte: number; kritisch: number; preorder: number; aktiveAktionen: number; avgMarge: number; offeneNotifs: number }`; `computeCockpitStats(products: BpmProduct[], promotions: BpmPromotion[], notifications: BpmNotification[]): CockpitStats`; `sortHeuteWichtig(notifications: BpmNotification[]): BpmNotification[]` (open only, priority then due, top 5).
  - `repository.ts`: `listProducts()`, `listPromotions()`, `listNotifications()`; `interface CockpitData { stats: CockpitStats; heuteWichtig: BpmNotification[]; offene: BpmNotification[] }`; `getCockpit(): Promise<CockpitData>`.

- [ ] **Step 1: Write the failing pure test `tests/brickpm/cockpit.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { computeCockpitStats, sortHeuteWichtig } from '@/brickpm/cockpit';
import type { BpmProduct, BpmPromotion, BpmNotification } from '@/brickpm/types';

const prod = (o: Partial<BpmProduct>): BpmProduct => ({
  id: 'P', name: '', cat: '', series: '', status: 'aktiv', year: 2026, parts: 0, uvp: 0,
  price: 100, cost: 60, tMgn: 0, mMgn: 0, stock: 100, minStock: 10, validFrom: null, validTo: null,
  channel: '', succ: null, descr: '', ...o,
});
const notif = (o: Partial<BpmNotification>): BpmNotification => ({
  id: 'N', type: '', priority: 'mittel', refId: '', msg: '', action: '', status: 'offen', due: '2026-07-10', role: '', target: '', ...o,
});

describe('computeCockpitStats', () => {
  it('computes the six KPIs', () => {
    const products = [
      prod({ id: 'P1', status: 'aktiv', stock: 5, minStock: 10, price: 100, cost: 60 }),   // kritisch
      prod({ id: 'P2', status: 'preorder', stock: 50, minStock: 10, price: 200, cost: 100 }),
      prod({ id: 'P3', status: 'aktiv', stock: 50, minStock: 10, price: 0, cost: 0 }),      // price 0 excluded from marge
    ];
    const promos: BpmPromotion[] = [
      { id: 'A1', name: '', productId: '', type: '', startDate: null, endDate: null, targetUnits: 0, sold: 0, targetRev: 0, expMgn: 0, status: 'aktiv', note: '' },
      { id: 'A2', name: '', productId: '', type: '', startDate: null, endDate: null, targetUnits: 0, sold: 0, targetRev: 0, expMgn: 0, status: 'beendet', note: '' },
    ];
    const notifs = [notif({ id: 'N1', status: 'offen' }), notif({ id: 'N2', status: 'erledigt' })];
    const s = computeCockpitStats(products, promos, notifs);
    expect(s.produkte).toBe(3);
    expect(s.kritisch).toBe(1);
    expect(s.preorder).toBe(1);
    expect(s.aktiveAktionen).toBe(1);
    expect(s.offeneNotifs).toBe(1);
    // avg of (100-60)/100=0.4 and (200-100)/200=0.5 → 0.45 (P3 price 0 excluded)
    expect(s.avgMarge).toBeCloseTo(0.45, 5);
  });
});

describe('sortHeuteWichtig', () => {
  it('keeps only open, sorts by priority then due, top 5', () => {
    const ns = [
      notif({ id: 'a', priority: 'niedrig', due: '2026-07-01', status: 'offen' }),
      notif({ id: 'b', priority: 'kritisch', due: '2026-07-20', status: 'offen' }),
      notif({ id: 'c', priority: 'kritisch', due: '2026-07-05', status: 'offen' }),
      notif({ id: 'd', priority: 'hoch', due: '2026-07-02', status: 'erledigt' }), // filtered out
    ];
    const out = sortHeuteWichtig(ns);
    expect(out.map((n) => n.id)).toEqual(['c', 'b', 'a']);
  });
});
```

- [ ] **Step 2: Run — expect fail** (module missing)

Run: `npm test -- tests/brickpm/cockpit.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/brickpm/cockpit.ts`**

```ts
import type { BpmProduct, BpmPromotion, BpmNotification } from './types';

export interface CockpitStats {
  produkte: number; kritisch: number; preorder: number;
  aktiveAktionen: number; avgMarge: number; offeneNotifs: number;
}

export function computeCockpitStats(
  products: BpmProduct[], promotions: BpmPromotion[], notifications: BpmNotification[],
): CockpitStats {
  const priced = products.filter((p) => p.price > 0);
  const avgMarge = priced.length
    ? priced.reduce((s, p) => s + (p.price - p.cost) / p.price, 0) / priced.length
    : 0;
  return {
    produkte: products.length,
    kritisch: products.filter((p) => p.stock < p.minStock).length,
    preorder: products.filter((p) => p.status === 'preorder').length,
    aktiveAktionen: promotions.filter((a) => a.status === 'aktiv').length,
    avgMarge,
    offeneNotifs: notifications.filter((n) => n.status === 'offen').length,
  };
}

const PRIO_RANK: Record<string, number> = { kritisch: 0, hoch: 1, mittel: 2, niedrig: 3 };

export function sortHeuteWichtig(notifications: BpmNotification[]): BpmNotification[] {
  return notifications
    .filter((n) => n.status === 'offen')
    .sort((a, b) => {
      const pr = (PRIO_RANK[a.priority] ?? 9) - (PRIO_RANK[b.priority] ?? 9);
      if (pr !== 0) return pr;
      return (a.due ?? '9999').localeCompare(b.due ?? '9999');
    })
    .slice(0, 5);
}
```

- [ ] **Step 4: Run pure test — expect pass**

Run: `npm test -- tests/brickpm/cockpit.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing repository test `tests/brickpm/repository.test.ts`** (integration — assumes seed ran, or seeds inline):

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getCockpit, listProducts } from '@/brickpm/repository';
import { seedBrickpm } from '../../scripts/seed-brickpm';
import { pool } from '@/lib/db';

beforeAll(async () => { await seedBrickpm(); });
afterAll(async () => { await pool.end(); });

describe('BrickPM repository (integration, benötigt DB)', () => {
  it('listProducts returns 13 mapped products (camelCase)', async () => {
    const ps = await listProducts();
    expect(ps).toHaveLength(13);
    const p1 = ps.find((p) => p.id === 'P001')!;
    expect(p1).toMatchObject({ minStock: 50, tMgn: 0.5, validTo: null, succ: 'P010' });
  });
  it('getCockpit returns stats + notification lists', async () => {
    const c = await getCockpit();
    expect(c.stats.produkte).toBe(13);
    expect(c.stats.offeneNotifs).toBeGreaterThan(0);
    expect(c.heuteWichtig.length).toBeGreaterThan(0);
    expect(c.heuteWichtig.every((n) => n.status === 'offen')).toBe(true);
  });
});
```

- [ ] **Step 6: Run — expect fail** (module missing)

Run: `npm test -- tests/brickpm/repository.test.ts`
Expected: FAIL.

- [ ] **Step 7: Write `src/brickpm/repository.ts`**

```ts
import { pool } from '@/lib/db';
import type { BpmProduct, BpmPromotion, BpmNotification } from './types';
import { computeCockpitStats, sortHeuteWichtig, type CockpitStats } from './cockpit';

function toDate(v: Date | null): string | null { return v ? v.toISOString().slice(0, 10) : null; }

export async function listProducts(): Promise<BpmProduct[]> {
  const r = await pool.query('SELECT * FROM bpm_products ORDER BY id');
  return r.rows.map((x) => ({
    id: x.id, name: x.name, cat: x.cat, series: x.series, status: x.status, year: x.year, parts: x.parts,
    uvp: x.uvp, price: x.price, cost: x.cost, tMgn: x.t_mgn, mMgn: x.m_mgn, stock: x.stock, minStock: x.min_stock,
    validFrom: toDate(x.valid_from), validTo: toDate(x.valid_to), channel: x.channel, succ: x.succ, descr: x.descr,
  }));
}

export async function listPromotions(): Promise<BpmPromotion[]> {
  const r = await pool.query('SELECT * FROM bpm_promotions ORDER BY id');
  return r.rows.map((x) => ({
    id: x.id, name: x.name, productId: x.product_id, type: x.type, startDate: toDate(x.start_date), endDate: toDate(x.end_date),
    targetUnits: x.target_units, sold: x.sold, targetRev: x.target_rev, expMgn: x.exp_mgn, status: x.status, note: x.note,
  }));
}

export async function listNotifications(): Promise<BpmNotification[]> {
  const r = await pool.query('SELECT * FROM bpm_notifications ORDER BY id');
  return r.rows.map((x) => ({
    id: x.id, type: x.type, priority: x.priority, refId: x.ref_id, msg: x.msg, action: x.action,
    status: x.status, due: toDate(x.due), role: x.role, target: x.target,
  }));
}

export interface CockpitData { stats: CockpitStats; heuteWichtig: BpmNotification[]; offene: BpmNotification[] }

export async function getCockpit(): Promise<CockpitData> {
  const [products, promotions, notifications] = await Promise.all([listProducts(), listPromotions(), listNotifications()]);
  return {
    stats: computeCockpitStats(products, promotions, notifications),
    heuteWichtig: sortHeuteWichtig(notifications),
    offene: notifications.filter((n) => n.status === 'offen'),
  };
}
```

- [ ] **Step 8: Run — expect pass**

Run: `npm test -- tests/brickpm/repository.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/brickpm/cockpit.ts src/brickpm/repository.ts tests/brickpm/cockpit.test.ts tests/brickpm/repository.test.ts
git commit -m "feat: BrickPM repository + pure cockpit stats"
```

---

### Task 5: Grandfather-hardening (global-empty)

**Files:**
- Modify: `src/lib/groups.ts` (`getUserAccess`), `tests/lib/groups.test.ts`

**Interfaces:**
- Consumes: `pool` (already imported in groups.ts).
- Produces: unchanged signature `getUserAccess(userId)`; new semantics for the no-membership case.

- [ ] **Step 1: Update the grandfather tests in `tests/lib/groups.test.ts`**

Replace the existing `'grants full admin when the user is in no group (grandfather)'` test with two cases (the mock now returns the membership query first, then the group-count query):

```ts
  it('no membership + groups exist → no access (grandfather only when system empty)', async () => {
    q().mockResolvedValueOnce({ rows: [] } as never)          // membership query
     .mockResolvedValueOnce({ rows: [{ n: 2 }] } as never);   // group count
    const a = await getUserAccess('u1');
    expect(a).toEqual({ apps: {}, isAdmin: false });
  });

  it('no membership + zero groups → full admin (fresh install)', async () => {
    q().mockResolvedValueOnce({ rows: [] } as never)
     .mockResolvedValueOnce({ rows: [{ n: 0 }] } as never);
    const a = await getUserAccess('u1');
    expect(a.isAdmin).toBe(true);
    expect(a.apps).toEqual({ dashboard: 'edit', brickpm: 'edit' });
  });
```

(The existing aggregation tests — member of groups — pass a single `mockResolvedValue` and are unchanged; they never reach the second query.)

- [ ] **Step 2: Run — expect fail** (current code returns full admin on empty membership without the count query)

Run: `npm test -- tests/lib/groups.test.ts`
Expected: FAIL on the "groups exist → no access" case.

- [ ] **Step 3: Update `getUserAccess` in `src/lib/groups.ts`**

Replace the grandfather branch:

```ts
  if (res.rows.length === 0) {
    // No memberships. Grandfather full admin ONLY when the system has no groups at all
    // (fresh install); otherwise the user simply has no access.
    const c = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM groups');
    return c.rows[0].n === 0 ? fullAdmin() : { apps: {}, isAdmin: false };
  }
```

(Keep `fullAdmin()` and the aggregation loop for the has-membership case exactly as they are.)

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- tests/lib/groups.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/groups.ts tests/lib/groups.test.ts
git commit -m "fix: grandfather full-admin only when no groups exist (not per-user)"
```

---

### Task 6: `/brickpm` shell + gating + sidebar + Cockpit

**Files:**
- Create: `src/components/BpmSidebar.tsx`, `src/app/brickpm/layout.tsx`, `src/app/brickpm/page.tsx`, `src/app/brickpm/[section]/page.tsx`

**Interfaces:**
- Consumes: `requireAppAccess` (`@/lib/groups`), `getCockpit` (`@/brickpm/repository`), `createClient` (`@/lib/supabase/server`), `UserMenu` (`@/components/UserMenu`).

- [ ] **Step 1: Write `src/components/BpmSidebar.tsx`** (budp CI — neutral surface, brand-accent active; client component so it highlights the current route)

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECTIONS: { slug: string; label: string }[] = [
  { slug: '', label: 'Cockpit' },
  { slug: 'sortiment', label: 'Sortiment' },
  { slug: 'aktionen', label: 'Aktionen & Preorder' },
  { slug: 'marge', label: 'Marge & Sales-Ziele' },
  { slug: 'goodies', label: 'Goodies & Bundles' },
  { slug: 'wettbewerb', label: 'Wettbewerb' },
  { slug: 'notifications', label: 'Notifications' },
  { slug: 'schnittstellen', label: 'Schnittstellen' },
  { slug: 'admin', label: 'Admin & Export' },
  { slug: 'demo', label: 'Demo-Skript' },
];

export function BpmSidebar() {
  const pathname = usePathname();
  return (
    <nav className="w-56 shrink-0 border-r border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">BrickPM</p>
      <ul className="space-y-1">
        {SECTIONS.map((s) => {
          const href = s.slug === '' ? '/brickpm' : `/brickpm/${s.slug}`;
          const isActive = pathname === href;
          return (
            <li key={s.slug}>
              <Link
                href={href}
                className={`block rounded-md px-3 py-1.5 text-sm ${
                  isActive
                    ? 'bg-brand font-medium text-white'
                    : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: Write `src/app/brickpm/layout.tsx`** (server; gate + shell)

```tsx
import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserAccess, requireAppAccess } from '@/lib/groups';
import { BpmSidebar } from '@/components/BpmSidebar';
import { UserMenu } from '@/components/UserMenu';

export const dynamic = 'force-dynamic';

export default async function BrickpmLayout({ children }: { children: ReactNode }) {
  let ok = false;
  try { await requireAppAccess('brickpm'); ok = true; } catch { /* no access */ }
  if (!ok) redirect('/');

  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      <BpmSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3 dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">BrickPM</h1>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-brand hover:text-brand-dark">← Dashboard</Link>
            <UserMenu email={user?.email} canBrickPM={!!access.apps.brickpm} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `src/app/brickpm/page.tsx`** (Cockpit)

```tsx
import { getCockpit } from '@/brickpm/repository';

export const dynamic = 'force-dynamic';

const KPIS = (s: Awaited<ReturnType<typeof getCockpit>>['stats']) => [
  { label: 'Produkte', value: String(s.produkte) },
  { label: 'Kritisch', value: String(s.kritisch) },
  { label: 'Preorder aktiv', value: String(s.preorder) },
  { label: 'Aktive Aktionen', value: String(s.aktiveAktionen) },
  { label: 'Ø Marge', value: `${(s.avgMarge * 100).toFixed(1)} %` },
  { label: 'Offene Notifications', value: String(s.offeneNotifs) },
];

export default async function CockpitPage() {
  const { stats, heuteWichtig } = await getCockpit();
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Cockpit</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {KPIS(stats).map((k) => (
            <div key={k.label} className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{k.value}</div>
              <div className="mt-1 text-xs text-neutral-500">{k.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">Heute wichtig</h3>
        <ul className="space-y-2">
          {heuteWichtig.map((n) => (
            <li key={n.id} className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
              <span className={`mt-0.5 rounded px-1.5 py-0.5 text-xs font-semibold ${
                n.priority === 'kritisch' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                : n.priority === 'hoch' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>
                {n.priority}
              </span>
              <div className="flex-1">
                <div className="text-neutral-800 dark:text-neutral-200">{n.msg}</div>
                <div className="mt-0.5 text-xs text-neutral-500">{n.type} · fällig {n.due ?? '—'} · {n.role}</div>
              </div>
            </li>
          ))}
          {heuteWichtig.length === 0 && <li className="text-sm text-neutral-500">Keine offenen Notifications.</li>}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/app/brickpm/[section]/page.tsx`** (placeholder for the 9 other sections)

```tsx
export const dynamic = 'force-dynamic';

const LABELS: Record<string, string> = {
  sortiment: 'Sortiment', aktionen: 'Aktionen & Preorder', marge: 'Marge & Sales-Ziele',
  goodies: 'Goodies & Bundles', wettbewerb: 'Wettbewerb', notifications: 'Notifications',
  schnittstellen: 'Schnittstellen', admin: 'Admin & Export', demo: 'Demo-Skript',
};

export default function SectionPlaceholder({ params }: { params: { section: string } }) {
  const label = LABELS[params.section] ?? params.section;
  return (
    <div>
      <h2 className="mb-2 text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">{label}</h2>
      <p className="text-sm text-neutral-500">Dieser Bereich kommt in einer späteren Phase.</p>
    </div>
  );
}
```

- [ ] **Step 5: Build — expect success**

Run: `npm run build`
Expected: build succeeds; `/brickpm` and `/brickpm/[section]` routes listed. (No unit test for the server layout redirect; the gate uses the already-tested `requireAppAccess`. Verified in the browser in Task 8.)

- [ ] **Step 6: Commit**

```bash
git add src/components/BpmSidebar.tsx src/app/brickpm
git commit -m "feat: gated /brickpm shell with sidebar and Cockpit (budp CI)"
```

---

### Task 7: BrickPM nav entry in the user menu

**Files:**
- Modify: `src/components/UserMenu.tsx`, `src/app/page.tsx`

**Interfaces:**
- Consumes: `getUserAccess` (`@/lib/groups`).
- Produces: `UserMenu` accepts `canBrickPM?: boolean`.

- [ ] **Step 1: Add `canBrickPM` to `UserMenu`**

Change the signature and add a menu item before "Einstellungen":

```tsx
export function UserMenu({ email, canBrickPM }: { email?: string | null; canBrickPM?: boolean }) {
```

Inside the dropdown `role="menu"`, add above the `/setup` link:

```tsx
          {canBrickPM && (
            <a href="/brickpm" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
              <GridIcon /> BrickPM
            </a>
          )}
```

And add the icon near the other icon components:

```tsx
function GridIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
```

- [ ] **Step 2: Pass `canBrickPM` from the dashboard page** — modify `src/app/page.tsx`

Add the import and compute access, then pass the prop:

```ts
import { getUserAccess } from '@/lib/groups';
// … after `const { data: { user } } = await supabase.auth.getUser();`
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };
// … change the UserMenu usage:
          <UserMenu email={user?.email} canBrickPM={!!access.apps.brickpm} />
```

- [ ] **Step 3: Build — expect success**

Run: `npm run build && npx tsc --noEmit -p .`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/UserMenu.tsx src/app/page.tsx
git commit -m "feat: BrickPM entry in the user menu (access-gated)"
```

---

### Task 8: Verify end-to-end + deploy notes

**Files:** none (verification).

- [ ] **Step 1: Full suite + build + typecheck**

Run: `npm run migrate && npm run seed-brickpm && npm test && npm run build && npx tsc --noEmit -p .`
Expected: all green; seed inserts 13 products etc.

- [ ] **Step 2: Browser check (Claude in Chrome / dev)**

Logged in (grandfather/admin), open the user menu → **BrickPM** appears → `/brickpm` shows the Cockpit (6 KPI cards with real numbers, Heute-wichtig list). Click a sidebar section → placeholder. Confirm the KPI dashboard (`/`) is unaffected. Then, in Einstellungen → Gruppen, create a group WITHOUT `brickpm` access, move a test user into ONLY that group, and confirm that user gets redirected away from `/brickpm` and sees no BrickPM menu entry.

- [ ] **Step 3: Note the deploy seed step**

Record that production deploy must run `npm run seed-groups` AND `npm run seed-brickpm` after `migrate` — add both to the VPS `/opt/budp/deploy.sh` at deploy time (it is not in the repo).

- [ ] **Step 4: Commit any fixups**

```bash
git commit -am "test: verify BrickPM foundation end-to-end" --allow-empty
```

---

## Self-Review

**Spec coverage:**
- 7 `bpm_` tables + RLS → Task 1. ✓
- Seed fixture extracted from bundle + seed script (idempotent) → Tasks 2, 3. ✓
- Data layer + pure cockpit stats → Task 4. ✓
- Grandfather-hardening (global-empty) → Task 5. ✓
- `/brickpm` shell + gating (`requireAppAccess('brickpm')`) + budp-CI sidebar + placeholders → Task 6. ✓
- Cockpit (6 KPIs + Heute wichtig + offene) → Tasks 4 (data) + 6 (render). ✓
- Nav entry (access-gated) → Task 7. ✓
- Deploy seed steps → Task 8. ✓
- RLS/repository/stats/grandfather tests → Tasks 1, 4, 5; seed tests → Tasks 2, 3. ✓

**Placeholder scan:** No TBD/TODO. The only `…` are in Task 2's seed-data template, explicitly instructing the implementer to transcribe the remaining rows from the concrete bundle source with the given rules and a count-checking test — a specified transcription, not a vague placeholder.

**Type consistency:** `BpmProduct`/`BpmPromotion`/`BpmGoodie`/`BpmCompetitor`/`BpmNotification`/`BpmIntegration`, `CockpitStats`, `CockpitData`, `computeCockpitStats`, `sortHeuteWichtig`, `getCockpit`/`listProducts`/`listPromotions`/`listNotifications`, `seedBrickpm`, `BpmSidebar()` (client, `usePathname`), `UserMenu({email,canBrickPM})` are consistent across tasks. Column↔field mappings (snake_case ↔ camelCase) are applied uniformly in the seed script (Task 3) and repository (Task 4).
