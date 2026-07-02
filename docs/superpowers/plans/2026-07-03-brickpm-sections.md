# BrickPM Sections (Phase 3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fill the 9 remaining `/brickpm` sidebar sections with real, DB-backed pages in budp CI, with gated write actions (notification status, sync sim) auditing to `bpm_audit_log`.

**Architecture:** Extend `src/brickpm/repository.ts` with reads + audited writes; pure logic in `src/brickpm/marge.ts` + `src/brickpm/format.ts`; gated server actions in `src/app/brickpm/actions.ts`; one route segment per section under `src/app/brickpm/<slug>/page.tsx`, removing the generic `[section]` placeholder.

**Tech Stack:** Next.js 14 App Router (server components + server actions), TypeScript, Tailwind (budp tokens), `pg`, Vitest.

## Global Constraints
- Reads/writes via the privileged `pg` pool; DATE columns cast `::text`. budp CI (brand/neutral tokens), German copy.
- Write actions call `requireAppAccess('brickpm','edit')` BEFORE mutating, then append an audit row, then `revalidatePath('/brickpm/<section>')`.
- Section pages are server components (except the Marge calculator + any component needing client state, which are `'use client'`). Reuse budp table/card/chip styling (`rounded-lg border border-neutral-200 bg-white … dark:…`).
- Conventional commits; commit after each task.

---

### Task 1: `note` field + repository reads & audited writes

**Files:** Modify `db/schema.sql` (add `note TEXT` to `bpm_notifications`), `src/brickpm/types.ts` (`note: string | null`), `src/brickpm/seed-data.ts` (add `note` to N001–N009, `null` where absent — N003 `'Stand 28.06.2026 geprüft'`, N008 `'Abverkaufspreis angepasst am 15.06.2026'`, N009 `'Via Demo-Skript Flow 4'`, others `null`), `scripts/seed-brickpm.ts` (include `note` col), `src/brickpm/repository.ts`. Create `tests/brickpm/repository-writes.test.ts`.

**Interfaces produced:** `listGoodies()`, `listCompetitors()`, `getProduct(id): Promise<BpmProduct|null>`, `listAuditLog(limit=50)`; `writeAudit(actor, action, detail)`, `setNotificationStatus(id, status, actor)`, `simulateIntegration(id, actor)`.

- [ ] **Step 1** Add `note TEXT` to the `bpm_notifications` CREATE TABLE (idempotent: add via a guarded `ALTER TABLE bpm_notifications ADD COLUMN IF NOT EXISTS note TEXT;` right after the table, so existing DBs get it). Add `note: string | null` to `BpmNotification`. Add `note` to each seed row and to the seed script's notifications INSERT (`note` col + `$11`, and `note=excluded.note` in the DO UPDATE).

- [ ] **Step 2** Extend `src/brickpm/repository.ts`:

```ts
import type { BpmGoodie, BpmCompetitor } from './types';

export async function getProduct(id: string): Promise<BpmProduct | null> {
  const list = await listProducts();
  return list.find((p) => p.id === id) ?? null;
}

export async function listGoodies(): Promise<BpmGoodie[]> {
  const r = await pool.query(
    `SELECT id,name,type,cost,price,products,min_cart, valid_from::text AS valid_from, valid_to::text AS valid_to,
            status,mgn_effect,comment FROM bpm_goodies ORDER BY id`,
  );
  return r.rows.map((x) => ({
    id: x.id, name: x.name, type: x.type, cost: x.cost, price: x.price, products: x.products,
    minCart: x.min_cart, validFrom: x.valid_from, validTo: x.valid_to, status: x.status,
    mgnEffect: x.mgn_effect, comment: x.comment,
  }));
}

export async function listCompetitors(): Promise<BpmCompetitor[]> {
  const r = await pool.query(
    `SELECT id,product_id,competitor,comp_product,own_price,comp_price,avail, date::text AS date, rec
       FROM bpm_competitors ORDER BY id`,
  );
  return r.rows.map((x) => ({
    id: x.id, productId: x.product_id, competitor: x.competitor, compProduct: x.comp_product,
    ownPrice: x.own_price, compPrice: x.comp_price, avail: x.avail, date: x.date, rec: x.rec,
  }));
}

export interface AuditEntry { id: number; ts: string; actor: string | null; action: string; detail: string | null }
export async function listAuditLog(limit = 50): Promise<AuditEntry[]> {
  const r = await pool.query(
    `SELECT id, ts::text AS ts, actor, action, detail FROM bpm_audit_log ORDER BY id DESC LIMIT $1`, [limit],
  );
  return r.rows.map((x) => ({ id: x.id, ts: x.ts, actor: x.actor, action: x.action, detail: x.detail }));
}

export async function writeAudit(actor: string | null, action: string, detail: string | null): Promise<void> {
  await pool.query('INSERT INTO bpm_audit_log (actor, action, detail) VALUES ($1,$2,$3)', [actor, action, detail]);
}

export async function setNotificationStatus(id: string, status: string, actor: string | null): Promise<void> {
  await pool.query('UPDATE bpm_notifications SET status = $2 WHERE id = $1', [id, status]);
  await writeAudit(actor, 'notification.status', `${id} → ${status}`);
}

export async function simulateIntegration(id: string, actor: string | null): Promise<void> {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  await pool.query('UPDATE bpm_integrations SET last_sync = $2 WHERE id = $1', [id, now]);
  await writeAudit(actor, 'integration.sync', `${id} @ ${now}`);
}
```

Also add `listNotifications` to select `note` (add `note` to its column list + mapping).

- [ ] **Step 3** Write `tests/brickpm/repository-writes.test.ts` (integration): `beforeAll` `seedBrickpm()`; assert `listGoodies()` len 6, `listCompetitors()` len 8; `setNotificationStatus('N001','in Prüfung', 'a@b.de')` then `listNotifications()` shows N001 status changed AND `listAuditLog()` has a `notification.status` row; `simulateIntegration('I001','a@b.de')` updates last_sync + audits. Then restore N001 to 'offen' in `afterAll` (or accept the mutation — the DB is a disposable test DB). Run it green.

- [ ] **Step 4** Commit `feat: BrickPM note field + repository reads & audited writes`.

---

### Task 2: Pure logic — Marge calculator + format helpers

**Files:** Create `src/brickpm/marge.ts`, `src/brickpm/format.ts`, `tests/brickpm/marge.test.ts`, `tests/brickpm/format.test.ts`.

**Interfaces produced:** `marge.ts`: `interface MargeInput { product: BpmProduct; discPct: number; discEur: number; goodieCost: number; targetRev: number; mode: 'pct'|'eur' }`; `interface MargeResult { effPrice: number; db: number; marge: number; maxDiscPrice: number; maxDiscEur: number; neededUnits: number; recommendation: string }`; `computeMarge(input): MargeResult`. `format.ts`: `eur(n)`, `pct(n)`, `deviation(own, comp): number` (= (own-comp)/comp), `STATUS_TONE: Record<string,'red'|'amber'|'green'|'neutral'>`.

- [ ] **Step 1** Write `tests/brickpm/marge.test.ts` asserting: with product {price:100,cost:60,uvp:120,tMgn:0.5,mMgn:0.35}, discPct 10 (mode pct) → effPrice 90, db=90-60=30, marge≈0.333, maxDiscPrice=60/(1-0.35)=92.307…, maxDiscEur=120-92.30…, recommendation follows the thresholds (m=0.333 ≥ mMgn 0.35? no → since 0.333<0.35 → "Rabatt gesperrt – Mindestmarge unterschritten"). Add a case where m≥tMgn → "Keine Maßnahme nötig", and one where goodieCost < disc → "Goodie statt Rabatt empfohlen". neededUnits = ceil(targetRev/effPrice).

- [ ] **Step 2** Implement `src/brickpm/marge.ts`:

```ts
import type { BpmProduct } from './types';

export interface MargeInput { product: BpmProduct; discPct: number; discEur: number; goodieCost: number; targetRev: number; mode: 'pct' | 'eur' }
export interface MargeResult { effPrice: number; db: number; marge: number; maxDiscPrice: number; maxDiscEur: number; neededUnits: number; recommendation: string }

export function computeMarge(i: MargeInput): MargeResult {
  const p = i.product;
  const disc = i.mode === 'pct' ? (p.price * i.discPct) / 100 : i.discEur;
  const effPrice = Math.max(0, p.price - disc);
  const db = effPrice - p.cost - i.goodieCost;
  const marge = effPrice > 0 ? db / effPrice : 0;
  const maxDiscPrice = p.cost / (1 - p.mMgn);
  const maxDiscEur = p.uvp - maxDiscPrice;
  const neededUnits = effPrice > 0 ? Math.ceil(i.targetRev / effPrice) : 0;
  let recommendation: string;
  if (marge >= p.tMgn) recommendation = 'Keine Maßnahme nötig';
  else if (i.goodieCost > 0 && i.goodieCost < disc) recommendation = 'Goodie statt Rabatt empfohlen';
  else if (marge >= p.mMgn + 0.05) recommendation = 'Bundle statt Rabatt empfohlen';
  else if (marge >= p.mMgn + 0.02) recommendation = 'Moderater Rabatt möglich';
  else if (marge >= p.mMgn) recommendation = 'Abverkaufsaktion empfehlen';
  else recommendation = 'Rabatt gesperrt – Mindestmarge unterschritten';
  return { effPrice, db, marge, maxDiscPrice, maxDiscEur, neededUnits, recommendation };
}
```

- [ ] **Step 3** Write `tests/brickpm/format.test.ts`: `eur(112.48)`='112,48 €'-ish (use `toLocaleString('de-DE')` or a fixed formatter — implement `eur` as ``${n.toFixed(2).replace('.', ',')} €``), `pct(0.333)`='33,3 %', `deviation(249.95,234.95)`≈0.0638.

- [ ] **Step 4** Implement `src/brickpm/format.ts`:

```ts
export const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
export const pct = (n: number) => `${(n * 100).toFixed(1).replace('.', ',')} %`;
export const deviation = (own: number, comp: number) => (comp === 0 ? 0 : (own - comp) / comp);

export const STATUS_TONE: Record<string, 'red' | 'amber' | 'green' | 'neutral'> = {
  kritisch: 'red', hoch: 'amber', mittel: 'neutral', niedrig: 'neutral',
  offen: 'amber', 'in Prüfung': 'amber', 'Aktion gestartet': 'green', erledigt: 'green', verworfen: 'neutral',
  aktiv: 'green', geplant: 'neutral', preorder: 'amber', ausgelaufen: 'neutral', ausverkauft: 'red',
  bereit: 'green', konfiguriert: 'neutral',
};
```

- [ ] **Step 5** Run both pure tests green; commit `feat: BrickPM margin calculator + format helpers`.

---

### Task 3: Gated server actions

**Files:** Create `src/app/brickpm/actions.ts`, `tests/app/brickpm-actions.test.ts`.

**Interfaces produced:** `changeNotificationStatus(id, status)`, `simulateSync(id)` (server actions).

- [ ] **Step 1** Write `tests/app/brickpm-actions.test.ts` (mock `@/lib/groups`, `@/lib/supabase/server`, `@/brickpm/repository`, `next/cache`): a view-only user (`requireAppAccess` throws) → the action rejects and no repository write is called; an edit user → repository write called with the current user's email + `revalidatePath` called.

- [ ] **Step 2** Implement `src/app/brickpm/actions.ts`:

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAppAccess } from '@/lib/groups';
import { setNotificationStatus, simulateIntegration } from '@/brickpm/repository';

async function actor(): Promise<string | null> {
  const { data: { user } } = await createClient().auth.getUser();
  return user?.email ?? null;
}

export async function changeNotificationStatus(id: string, status: string): Promise<void> {
  await requireAppAccess('brickpm', 'edit');
  await setNotificationStatus(id, status, await actor());
  revalidatePath('/brickpm/notifications');
}

export async function simulateSync(id: string): Promise<void> {
  await requireAppAccess('brickpm', 'edit');
  await simulateIntegration(id, await actor());
  revalidatePath('/brickpm/schnittstellen');
}
```

- [ ] **Step 3** Run test green; commit `feat: gated BrickPM server actions (notification status, sync sim)`.

---

### Task 4: Sortiment page (reference page)

**Files:** Create `src/app/brickpm/sortiment/page.tsx`, `src/components/BpmChip.tsx`.

- [ ] **Step 1** Write `src/components/BpmChip.tsx` (server-safe): a `<span>` chip colored by `STATUS_TONE[label]` (red/amber/green/neutral → the matching Tailwind bg/text tokens used elsewhere in budp), rendering `{label}`.
- [ ] **Step 2** Write `src/app/brickpm/sortiment/page.tsx` (server): `const products = await listProducts()`. Render a search + category + status filter (as a client `BpmFilters` OR simple `<form>` GET params — recommendation: a small `'use client'` filter that filters the already-loaded list in memory, since 13 rows). Table columns: ID, Name, Kategorie, Status (chip), Bestand (stock/minStock, red when stock<minStock), UVP (eur), Preis (eur), Marge (pct of (price-cost)/price). Row expandable/clickable → a detail card showing series, year, parts, channel, succ, from/to, descr. Use budp table styling. Full TSX component.
- [ ] **Step 3** `npm run build` clean; commit `feat: BrickPM Sortiment section`.

---

### Task 5: Aktionen, Goodies, Wettbewerb (read-only pages)

**Files:** Create `src/app/brickpm/aktionen/page.tsx`, `src/app/brickpm/goodies/page.tsx`, `src/app/brickpm/wettbewerb/page.tsx`.

Follow the Sortiment page's structure + budp styling. Each is a server component loading from the repository:
- **Aktionen** (`listPromotions`): table — ID, Name, Produkt (productId), Typ, Zeitraum (startDate–endDate), Fortschritt (`sold`/`targetUnits` as a bar + text), Zielumsatz (eur), Status (chip), Notiz.
- **Goodies** (`listGoodies`): table — ID, Name, Typ, Kosten (eur), gilt für (products joined), Mindest-Warenkorb (eur), Zeitraum, Status (chip), Margen-Effekt (eur), Kommentar. Plus a short "Goodie vs. Rabatt"-Hinweis block per goodie: since a goodie costs `cost` vs. an equivalent discount, show `mgnEffect`.
- **Wettbewerb** (`listCompetitors`): table — Produkt (productId), Wettbewerber, dessen Produkt, Eigener Preis (eur), Wettbewerbspreis (eur), Abweichung (`pct(deviation(ownPrice,compPrice))`, red if own>comp), Verfügbar (avail), Datum, Empfehlung (`rec`).

- [ ] **Step 1** Implement the three pages (full TSX each, following Sortiment's table pattern).
- [ ] **Step 2** `npm run build` clean; commit `feat: BrickPM Aktionen, Goodies, Wettbewerb sections`.

---

### Task 6: Marge & Sales-Ziele page (client calculator)

**Files:** Create `src/app/brickpm/marge/page.tsx` (server: loads products, passes to a client calc), `src/components/BpmMargeCalc.tsx` (`'use client'`).

- [ ] **Step 1** `BpmMargeCalc({ products })`: product `<select>`, mode toggle (% / €), discount input, goodie-cost input, target-revenue input; live-renders `computeMarge` output — effPrice, Deckungsbeitrag (eur), Marge (pct), Max-Rabatt (eur), benötigte Stückzahl, and the recommendation (toned chip/box). budp styling.
- [ ] **Step 2** The page loads `listProducts()` and renders `<BpmMargeCalc products={...} />`, default product P001.
- [ ] **Step 3** `npm run build` clean; commit `feat: BrickPM Marge calculator section`.

---

### Task 7: Notifications page (status change)

**Files:** Create `src/app/brickpm/notifications/page.tsx` (server), `src/components/BpmNotifications.tsx` (`'use client'`).

- [ ] **Step 1** `BpmNotifications({ items })`: a status filter (alle/offen/in Prüfung/…) and priority filter (in-memory over the loaded list); each notification row shows priority chip, type, msg, due, role, target, note (if present), current status chip, and a status `<select>` whose `onChange` calls the `changeNotificationStatus(id, status)` server action then `router.refresh()`. budp styling.
- [ ] **Step 2** The page loads `listNotifications()` and renders the client component.
- [ ] **Step 3** `npm run build` clean; commit `feat: BrickPM Notifications section with status change`.

---

### Task 8: Schnittstellen, Admin & Export, Demo pages

**Files:** Create `src/app/brickpm/schnittstellen/page.tsx` (server) + `src/components/BpmIntegrations.tsx` (`'use client'`); `src/app/brickpm/admin/page.tsx` (server) + `src/components/BpmExport.tsx` (`'use client'`); `src/app/brickpm/demo/page.tsx` (server).

- [ ] **Step 1 Schnittstellen** cards from `listIntegrations()` (add `listIntegrations()` to the repository if missing — SELECT with `objects`, `last_sync` as-is text): each card shows type, system, purpose, dir, status chip, ep, last_sync, and a "Sync simulieren" button calling `simulateSync(id)` then `router.refresh()`.
- [ ] **Step 2 Admin** `BpmExport`: buttons that build a Blob and download JSON/CSV for products/promotions/notifications/competitors (data passed from the server page, which loads all four lists); below, a read-only Audit-Log table from `listAuditLog(50)` (ts, actor, action, detail).
- [ ] **Step 3 Demo** a static guided page: intro + 4 cards (Limited Edition fast ausverkauft → link `/brickpm/notifications`; Marge & Sales-Ziel → `/brickpm/marge`; Goodie statt Rabatt → `/brickpm/goodies`; Wettbewerb prüfen → `/brickpm/wettbewerb`), each with a 1–2 sentence description of the flow.
- [ ] **Step 4** `npm run build` clean; commit `feat: BrickPM Schnittstellen, Admin/Export, Demo sections`.

---

### Task 9: Remove placeholder route + verify

**Files:** Remove `src/app/brickpm/[section]/page.tsx`.

- [ ] **Step 1** Delete the generic placeholder route (all 9 slugs now have real pages, so the sidebar links resolve to them).
- [ ] **Step 2** `npm run migrate && npm run seed-brickpm && npm test && npm run build && npx tsc --noEmit -p .` — all green.
- [ ] **Step 3** Commit `feat: remove BrickPM section placeholder; all sections live`.

---

## Self-Review
- Sections: Sortiment (T4), Aktionen/Goodies/Wettbewerb (T5), Marge (T6, T2 logic), Notifications (T7, T3 action), Schnittstellen/Admin/Demo (T8, T3 action), placeholder removal (T9). ✓
- Data layer + note + audited writes → T1; pure logic → T2; actions gated on edit → T3. ✓
- Tests: repository reads/writes (T1), marge + format (T2), action gating (T3); pages verified by build. ✓
- Placeholder scan: page markup is directive-with-exact-columns referencing the Sortiment reference (T4) + budp styling — logic/data/action/formula code is complete. No TBD.
- Type consistency: `computeMarge`/`MargeInput`/`MargeResult`, `eur`/`pct`/`deviation`/`STATUS_TONE`, `listGoodies`/`listCompetitors`/`getProduct`/`listAuditLog`/`writeAudit`/`setNotificationStatus`/`simulateIntegration`, `changeNotificationStatus`/`simulateSync` consistent across tasks.
