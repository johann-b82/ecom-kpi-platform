# Phase 2 · B4 — Verkauf Ebene 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die aggregierte Einstiegsebene des Verkauf-Moduls (`/verkauf` = Übersicht mit Kanal-Vergleich + Status-Funnel), Umzug der Belegliste nach `/verkauf/belege` und des bestehenden KPI-Boards nach `/verkauf/dashboard`, plus konsequente Netto-Auszeichnung.

**Architecture:** Rein additive, lesende Repository-Funktionen über `sales_orders`/`sales_order_lines`; Server-Components unter dem bestehenden `verkauf/layout.tsx`-Gate; keine neuen Tabellen, keine neuen Mutationen. Das KPI-Board (`src/kpi/*`) zieht unverändert an eine neue Route um.

**Tech Stack:** Next.js 14 App Router, React 18 Server/Client Components, raw `pg` Pool, Tailwind (warme `neutral`-Skala + `--accent`), Vitest (`fileParallelism: false`).

**Spec:** `docs/superpowers/specs/2026-07-14-phase-2-b4-verkauf-ebene1-design.md`

## Global Constraints

- **Netto überall:** Alle Geldbeträge im Verkauf-Modul sind netto (ohne MwSt). Es gibt keine Steuerlogik im Datenmodell — **keine Berechnung**, nur Kennzeichnung (`.anno`-Label „NETTO · OHNE MWST" bzw. Annotation „Beträge netto, ohne MwSt").
- **Umsatz-Definitionen (einheitlich für Gesamt und je Kanal):**
  - *Umsatz (netto)* = `SUM(quantity × unit_price)` über Positionen, deren Beleg-Status **∉ {angebot, storniert}**. Retoure-Belege (negative Mengen, gleicher Kanal wie Ursprung) mindern netto.
  - *Belege* = `COUNT` Belege mit Status **∉ {angebot, storniert}** (umsatztragende Belege). **Hinweis/Abweichung zur Spec §2.2:** dort stand „∉ {storniert}"; der Plan zählt Angebote bewusst **nicht** als Beleg, damit `Ø Belegwert = Umsatz / Belege` konsistent aufgeht. Angebote erscheinen als eigene Kachel *Offene Angebote*.
  - *Ø Belegwert (netto)* = Umsatz / Belege (Division durch 0 → 0).
  - *Offene Angebote* = `COUNT(status = 'angebot')` (nur Gesamt-Kachel).
- **Zeitachse:** `COALESCE(placed_at, created_at)::date BETWEEN start AND end` (inklusiv). Default-Zeitraum 30 Tage; erlaubt 7/30/90.
- **Kanal-Reihenfolge (fix, auch mit 0):** `shop, b2b_portal, marktplatz, telefon, manuell`.
- **Status-Reihenfolge (Funnel, alle 7):** `angebot, auftrag, versendet, rechnung_gestellt, bezahlt, retoure, storniert`.
- **Rot nur für „braucht Aufmerksamkeit"** — in B4 nicht nötig; Balken/Akzente in `accent`/`neutral`.
- **Deploy:** ausschließlich bryx-test (`/opt/budp-dev/deploy.sh`), **nie** Produktion.
- **Repo-Muster:** Server Components `force-dynamic`; wiederkehrende Tailwind-Strings als lokale Consts; `NUMERIC` → `Number()`.

---

## File Structure

**Neu:**
- `src/verkauf/format.ts` — `eur(n)` Netto-Geldformatierung (de-DE).
- `src/verkauf/labels.ts` — `CHANNEL_LABEL`, `STATUS_LABEL` Maps.
- `src/components/KanalVergleich.tsx` — Kanal-Vergleichskarten (Server Component).
- `src/components/StatusFunnel.tsx` — horizontaler Status-Funnel (Server Component).
- `src/app/(shell)/verkauf/page.tsx` — **neu** als Ebene-1-Übersicht (ersetzt die alte Belegliste an dieser Route).
- `src/app/(shell)/verkauf/belege/page.tsx` — Belegliste (umgezogen).
- `src/app/(shell)/verkauf/belege/[id]/page.tsx` — Beleg-Detail (umgezogen).
- `src/app/(shell)/verkauf/dashboard/page.tsx` — KPI-Board (umgezogen).
- `src/app/(shell)/verkauf/dashboard/phase/[phase]/page.tsx` — Phasen-Drill-down (umgezogen).
- `tests/verkauf/format.test.ts` — `eur`-Unit-Test.

**Geändert:**
- `src/verkauf/types.ts` — `DateRange`, `SalesTotals`, `ChannelSummary`, `StatusCount`.
- `src/verkauf/repository.ts` — `salesTotals`, `channelSummary`, `statusFunnel`, `listOrderRows(channel?)`.
- `src/components/VerkaufSidebar.tsx` — vier Einträge.
- `src/components/VerkaufList.tsx` — `initialChannel`-Prop + Zeilen-Link → `/verkauf/belege/[id]`.
- `src/components/VerkaufDetail.tsx` — Netto-Annotation + Retoure-Push → `/verkauf/belege/[id]`.
- `src/components/NeuerBeleg.tsx` — Erfolg-Push → `/verkauf/belege/[id]`.
- `src/components/Filters.tsx` — `basePath`-Prop.
- `src/components/PhaseColumn.tsx` — Link → `/verkauf/dashboard/phase/[key]`.
- `src/app/(shell)/verkauf/actions.ts` — Revalidate-Pfade.
- `src/app/(shell)/dashboard/page.tsx` — wird Redirect → `/verkauf/dashboard`.
- `src/lib/apps.ts` — `dashboard` aus `AppKey` + `APPS`.
- `src/lib/groups.ts` — `accessibleApps`-Baseline nur `hilfe`.
- `db/schema.sql` — `dashboard` aus `group_app_access`-Seed.
- `src/lib/help/content.ts` — `verkauf`-Seite erweitert; `dashboard`-Seite entfernt; Übersicht-Note angepasst.
- `tests/verkauf/repository.test.ts` — Aggregat-Tests.
- `tests/app/verkauf-actions.test.ts` — neue Revalidate-Pfade.
- `tests/lib/apps-access.test.ts`, `tests/lib/groups.test.ts` — ohne `dashboard`.

**Gelöscht (via `git mv`, kein Rest):**
- `src/app/(shell)/verkauf/[id]/page.tsx` → nach `belege/[id]/`.
- `src/app/(shell)/phase/[phase]/page.tsx` → nach `verkauf/dashboard/phase/[phase]/`.

---

## Task 1: Aggregat-Repository + Typen + Kanalfilter

**Files:**
- Modify: `src/verkauf/types.ts`
- Modify: `src/verkauf/repository.ts`
- Test: `tests/verkauf/repository.test.ts` (bestehende Datei erweitern)

**Interfaces:**
- Consumes: bestehendes `pool`, `OrderChannel`, `OrderStatus`, `OrderRow`.
- Produces: `DateRange`, `SalesTotals`, `ChannelSummary`, `StatusCount`; `salesTotals(range)`, `channelSummary(range)`, `statusFunnel(range)`, `listOrderRows(channel?)`.

- [ ] **Step 1: Typen ergänzen** — an `src/verkauf/types.ts` anhängen:

```ts
export interface DateRange { start: string; end: string } // ISO YYYY-MM-DD, inklusiv
export interface SalesTotals {
  revenueNet: number; orders: number; avgOrderValueNet: number; openOffers: number;
}
export interface ChannelSummary {
  channel: OrderChannel; revenueNet: number; orders: number; avgOrderValueNet: number;
}
export interface StatusCount { status: OrderStatus; count: number }
```

- [ ] **Step 2: Failing test schreiben** — in `tests/verkauf/repository.test.ts`. Die Datei hat bereits `beforeAll`/`afterAll` mit Fixtures (Kontakt, Variante, Preisliste, Standardlager) und benutzt `createOrder`/`transitionOrderStatus`/`createReturn`. **Zuerst die Datei lesen**, um die vorhandenen Fixture-IDs/Helfer zu übernehmen. Neuen `describe`-Block anhängen, der über einen weiten Zeitraum (heute − 30 … heute) frisch angelegte Belege aggregiert (deren `created_at = now()` fällt in den Bereich):

```ts
describe('B4 aggregates', () => {
  it('salesTotals: Umsatz ∉ {angebot,storniert}, offene Angebote separat, Ø = Umsatz/Belege', async () => {
    // Nutze die vorhandenen Fixtures (Kontakt-ID, Varianten-ID, Preisliste-ID).
    const today = new Date().toISOString().slice(0, 10);
    const range = { start: /* today-30 via addDays */ '', end: today };
    // Angebot (manuell) → zählt NUR als openOffer, nicht Umsatz/Beleg
    await createOrder({ contactId: CONTACT, channel: 'manuell', priceListId: LIST,
      lines: [{ variantId: VARIANT, quantity: 2, unitPrice: 10 }] });
    // Auftrag (shop, startet als auftrag) → Umsatz 3*10=30, Beleg 1
    await createOrder({ contactId: CONTACT, channel: 'shop', priceListId: LIST,
      lines: [{ variantId: VARIANT, quantity: 3, unitPrice: 10 }] });
    const t = await salesTotals(range);
    expect(t.revenueNet).toBeCloseTo(30);
    expect(t.orders).toBe(1);          // nur der Auftrag
    expect(t.openOffers).toBe(1);      // das Angebot
    expect(t.avgOrderValueNet).toBeCloseTo(30);
  });

  it('channelSummary: alle 5 Kanäle, umsatzloser Kanal = 0', async () => {
    const range = { start: /* today-30 */ '', end: new Date().toISOString().slice(0,10) };
    const rows = await channelSummary(range);
    expect(rows.map((r) => r.channel)).toEqual(['shop','b2b_portal','marktplatz','telefon','manuell']);
    const shop = rows.find((r) => r.channel === 'shop')!;
    expect(shop.revenueNet).toBeGreaterThan(0);
    const markt = rows.find((r) => r.channel === 'marktplatz')!;
    expect(markt.orders).toBe(0);
    expect(markt.revenueNet).toBe(0);
  });

  it('statusFunnel liefert alle 7 Status (auch 0)', async () => {
    const range = { start: /* today-30 */ '', end: new Date().toISOString().slice(0,10) };
    const f = await statusFunnel(range);
    expect(f.map((x) => x.status)).toEqual(
      ['angebot','auftrag','versendet','rechnung_gestellt','bezahlt','retoure','storniert']);
    expect(f.find((x) => x.status === 'angebot')!.count).toBeGreaterThanOrEqual(1);
  });

  it('Retoure mindert den Umsatz netto', async () => {
    // Beleg über den vollen Faden bis bezahlt bringen, dann createReturn.
    // Erwartung: revenueNet nach Retoure < revenueNet davor (negative Mengen, gleicher Kanal).
  });

  it('listOrderRows(channel) filtert auf den Kanal', async () => {
    const shopRows = await listOrderRows('shop');
    expect(shopRows.every((r) => r.channel === 'shop')).toBe(true);
    const all = await listOrderRows();
    expect(all.length).toBeGreaterThanOrEqual(shopRows.length);
  });
});
```

Konkrete Fixture-IDs (`CONTACT`/`VARIANT`/`LIST`) und den `today-30`-Wert (über das im Repo vorhandene `addDays` aus `@/lib/dates`) aus dem bestehenden Dateikopf übernehmen. Den Retoure-Test vollständig ausformulieren (Lebenszyklus wie im bestehenden Lifecycle-Test der Datei).

- [ ] **Step 3: Test laufen lassen (rot)** — Run: `npx vitest run tests/verkauf/repository.test.ts` — Erwartung: FAIL (Funktionen fehlen).

- [ ] **Step 4: Implementieren** — an `src/verkauf/repository.ts` anhängen und Import um die neuen Typen ergänzen:

```ts
export async function salesTotals(range: DateRange): Promise<SalesTotals> {
  const rev = await pool.query(
    `SELECT COALESCE(SUM(l.quantity * l.unit_price), 0)::float8 AS revenue,
            COUNT(DISTINCT o.id)::int AS orders
       FROM sales_orders o LEFT JOIN sales_order_lines l ON l.order_id = o.id
      WHERE COALESCE(o.placed_at, o.created_at)::date BETWEEN $1 AND $2
        AND o.status NOT IN ('angebot','storniert')`,
    [range.start, range.end]);
  const off = await pool.query(
    `SELECT COUNT(*)::int AS open_offers FROM sales_orders o
      WHERE COALESCE(o.placed_at, o.created_at)::date BETWEEN $1 AND $2
        AND o.status = 'angebot'`,
    [range.start, range.end]);
  const revenueNet = Number(rev.rows[0].revenue);
  const orders = rev.rows[0].orders;
  return {
    revenueNet, orders,
    avgOrderValueNet: orders > 0 ? revenueNet / orders : 0,
    openOffers: off.rows[0].open_offers,
  };
}

export async function channelSummary(range: DateRange): Promise<ChannelSummary[]> {
  const r = await pool.query(
    `SELECT o.channel, COUNT(DISTINCT o.id)::int AS orders,
            COALESCE(SUM(l.quantity * l.unit_price), 0)::float8 AS revenue
       FROM sales_orders o LEFT JOIN sales_order_lines l ON l.order_id = o.id
      WHERE COALESCE(o.placed_at, o.created_at)::date BETWEEN $1 AND $2
        AND o.status NOT IN ('angebot','storniert')
      GROUP BY o.channel`,
    [range.start, range.end]);
  const by = new Map<string, any>(r.rows.map((x: any) => [x.channel, x]));
  const CH: OrderChannel[] = ['shop','b2b_portal','marktplatz','telefon','manuell'];
  return CH.map((channel) => {
    const row = by.get(channel);
    const orders = row ? row.orders : 0;
    const revenueNet = row ? Number(row.revenue) : 0;
    return { channel, orders, revenueNet, avgOrderValueNet: orders > 0 ? revenueNet / orders : 0 };
  });
}

export async function statusFunnel(range: DateRange): Promise<StatusCount[]> {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count FROM sales_orders o
      WHERE COALESCE(o.placed_at, o.created_at)::date BETWEEN $1 AND $2
      GROUP BY status`,
    [range.start, range.end]);
  const by = new Map<string, number>(r.rows.map((x: any) => [x.status, x.count]));
  const ALL: OrderStatus[] =
    ['angebot','auftrag','versendet','rechnung_gestellt','bezahlt','retoure','storniert'];
  return ALL.map((status) => ({ status, count: by.get(status) ?? 0 }));
}
```

Und `listOrderRows` um den optionalen Kanalfilter erweitern (Signatur `listOrderRows(channel?: OrderChannel)`, `WHERE ($1::text IS NULL OR o.channel = $1)`, Parameter `[channel ?? null]`):

```ts
export async function listOrderRows(channel?: OrderChannel): Promise<OrderRow[]> {
  const r = await pool.query(
    `SELECT o.id, o.number, o.contact_id, c.name AS contact_name, o.channel, o.status,
            o.created_at::text AS created_at,
            COALESCE(array_agg(e.stage ORDER BY e.occurred_at) FILTER (WHERE e.stage IS NOT NULL), '{}') AS stages
       FROM sales_orders o
       JOIN contacts c ON c.id = o.contact_id
       LEFT JOIN sales_order_events e ON e.order_id = o.id
      WHERE ($1::text IS NULL OR o.channel = $1)
      GROUP BY o.id, c.name
      ORDER BY o.created_at DESC`, [channel ?? null]);
  return r.rows.map((x: any) => ({
    id: x.id, number: x.number, contactId: x.contact_id, contactName: x.contact_name,
    channel: x.channel, status: x.status, createdAt: x.created_at, stages: x.stages,
  }));
}
```

- [ ] **Step 5: Test laufen lassen (grün)** — Run: `npx vitest run tests/verkauf/repository.test.ts` — Erwartung: PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(verkauf): aggregate reads für Ebene-1 (salesTotals/channelSummary/statusFunnel) + Kanalfilter"`

---

## Task 2: Belegliste-Umzug nach `/verkauf/belege`

**Files:**
- Move: `src/app/(shell)/verkauf/[id]/page.tsx` → `src/app/(shell)/verkauf/belege/[id]/page.tsx` (`git mv`)
- Create: `src/app/(shell)/verkauf/belege/page.tsx`
- Delete: `src/app/(shell)/verkauf/page.tsx` (die alte Belegliste; die neue `/verkauf`-Übersicht kommt in Task 3)
- Modify: `src/components/VerkaufList.tsx`, `src/components/VerkaufDetail.tsx`, `src/components/NeuerBeleg.tsx`, `src/app/(shell)/verkauf/actions.ts`
- Test: `tests/app/verkauf-actions.test.ts`

**Interfaces:**
- Consumes: `listOrderRows(channel?)` (Task 1), `VerkaufList`, `getOrderView`.
- Produces: Route `/verkauf/belege` (+ `?channel=`) und `/verkauf/belege/[id]`.

- [ ] **Step 1: Detailseite verschieben** — `git mv "src/app/(shell)/verkauf/[id]" "src/app/(shell)/verkauf/belege/[id]"`. Inhalt bleibt unverändert (Import absolut).

- [ ] **Step 2: Alte Listen-Route entfernen** — `git rm "src/app/(shell)/verkauf/page.tsx"` (wird in Task 3 durch die Übersicht ersetzt).

- [ ] **Step 3: Neue Belegliste anlegen** — `src/app/(shell)/verkauf/belege/page.tsx`:

```tsx
import { listOrderRows } from '@/verkauf/repository';
import { VerkaufList } from '@/components/VerkaufList';
import type { OrderChannel } from '@/verkauf/types';

export const dynamic = 'force-dynamic';

const CHANNELS: OrderChannel[] = ['shop', 'b2b_portal', 'marktplatz', 'telefon', 'manuell'];

export default async function BelegePage({ searchParams }: { searchParams: { channel?: string } }) {
  const channel = CHANNELS.includes(searchParams.channel as OrderChannel)
    ? (searchParams.channel as OrderChannel) : undefined;
  const rows = await listOrderRows(channel);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Verkauf · Belege</h2>
      <VerkaufList rows={rows} initialChannel={channel ?? ''} />
    </div>
  );
}
```

- [ ] **Step 4: `VerkaufList` anpassen** — `initialChannel`-Prop und Zeilen-Link:

```tsx
export function VerkaufList({ rows, initialChannel = '' }:
  { rows: OrderRow[]; initialChannel?: OrderChannel | '' }) {
  const [q, setQ] = useState('');
  const [ch, setCh] = useState<OrderChannel | ''>(initialChannel);
  // ... unverändert ...
```
Und die Zeilen-Verlinkung ändern:
```tsx
<td className="py-2"><Link href={`/verkauf/belege/${r.id}`} className="text-brand hover:text-brand-dark">{r.number}</Link></td>
```

- [ ] **Step 5: `VerkaufDetail` + `NeuerBeleg` Pushes umbiegen**
  - `VerkaufDetail.tsx`: `router.push(\`/verkauf/${(res as { id: string }).id}\`)` → `router.push(\`/verkauf/belege/${(res as { id: string }).id}\`)`.
  - `NeuerBeleg.tsx`: `router.push(\`/verkauf/${order.id}\`)` → `router.push(\`/verkauf/belege/${order.id}\`)`.

- [ ] **Step 6: Revalidate-Pfade in `actions.ts`** — jede Action revalidiert Übersicht **und** Belegliste (+ Detail):

```tsx
export async function createOrderAction(input: SalesOrderInput): Promise<SalesOrderDetail> {
  await requireAppAccess('verkauf', 'edit');
  const o = await createOrder(input);
  revalidatePath('/verkauf');
  revalidatePath('/verkauf/belege');
  return o;
}
export async function transitionOrderStatusAction(id: string, target: OrderStatus): Promise<SalesOrderDetail> {
  await requireAppAccess('verkauf', 'edit');
  const o = await transitionOrderStatus(id, target);
  revalidatePath('/verkauf');
  revalidatePath('/verkauf/belege');
  revalidatePath(`/verkauf/belege/${id}`);
  return o;
}
export async function createReturnAction(originalOrderId: string): Promise<SalesOrderDetail> {
  await requireAppAccess('verkauf', 'edit');
  const credit = await createReturn(originalOrderId);
  revalidatePath('/verkauf');
  revalidatePath('/verkauf/belege');
  revalidatePath(`/verkauf/belege/${originalOrderId}`);
  return credit;
}
```

- [ ] **Step 7: Action-Test angleichen** — `tests/app/verkauf-actions.test.ts` lesen und die `revalidatePath`-Erwartungen auf die neuen Pfade aktualisieren (z. B. `expect(revalidatePath).toHaveBeenCalledWith('/verkauf/belege')` und für Transition/Return zusätzlich `'/verkauf/belege/<id>'`, plus `'/verkauf'`). Der Gate-/Repo-Aufruf-Teil bleibt.

- [ ] **Step 8: Tests + Build** — Run: `npx vitest run tests/app/verkauf-actions.test.ts && npx tsc --noEmit` — Erwartung: PASS / keine Typfehler.

- [ ] **Step 9: Commit** — `git add -A && git commit -m "refactor(verkauf): Belegliste + Detail nach /verkauf/belege umziehen (Kanal-Deep-Link)"`

---

## Task 3: Ebene-1 Übersicht + Netto-Auszeichnung + Sidebar

**Files:**
- Create: `src/verkauf/format.ts`, `src/verkauf/labels.ts`, `src/components/KanalVergleich.tsx`, `src/components/StatusFunnel.tsx`, `src/app/(shell)/verkauf/page.tsx`, `tests/verkauf/format.test.ts`
- Modify: `src/components/VerkaufSidebar.tsx`, `src/components/VerkaufDetail.tsx`

**Interfaces:**
- Consumes: `salesTotals`/`channelSummary`/`statusFunnel` (Task 1), `ChartCard`, `Filters` (mit `basePath` erst in Task 4 — hier `basePath="/verkauf"` bereits übergeben; `Filters` toleriert den Prop nach Task 4, davor greift der Default; siehe Hinweis).
- Produces: Route `/verkauf` (Übersicht).

> **Reihenfolge-Hinweis:** Diese Task übergibt `Filters basePath="/verkauf"`. Der `basePath`-Prop wird in Task 4 hinzugefügt. Damit der Build hier schon grün ist, wird `basePath` in **Task 3, Step 1** an `Filters` ergänzt (vorgezogen), Task 4 nutzt ihn dann nur noch.

- [ ] **Step 1: `Filters` um `basePath` erweitern** (vorgezogen, damit die Übersicht baut):

```tsx
export function Filters({ range, basePath = '/dashboard' }:
  { range?: { start: string; end: string }; basePath?: string }) {
  // ...
  onClick={() => router.push(`${basePath}?days=${o.days}`)}
```

- [ ] **Step 2: `eur` + Test** — `src/verkauf/format.ts`:

```ts
export function eur(amount: number): string {
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
```
`tests/verkauf/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { eur } from '@/verkauf/format';

describe('eur', () => {
  it('formatiert netto in de-DE mit Euro', () => {
    expect(eur(1234.5)).toBe('1.234,50 €');
    expect(eur(0)).toBe('0,00 €');
    expect(eur(-16.9)).toBe('-16,90 €');
  });
});
```
Run: `npx vitest run tests/verkauf/format.test.ts` — Erwartung: PASS.

- [ ] **Step 3: Labels** — `src/verkauf/labels.ts`:

```ts
import type { OrderChannel, OrderStatus } from './types';

export const CHANNEL_LABEL: Record<OrderChannel, string> = {
  shop: 'Shop', b2b_portal: 'B2B-Portal', marktplatz: 'Marktplatz',
  telefon: 'Telefon', manuell: 'Manuell',
};
export const STATUS_LABEL: Record<OrderStatus, string> = {
  angebot: 'Angebot', auftrag: 'Auftrag', versendet: 'Versendet',
  rechnung_gestellt: 'Rechnung gestellt', bezahlt: 'Bezahlt',
  retoure: 'Retoure', storniert: 'Storniert',
};
```

- [ ] **Step 4: `KanalVergleich`** — `src/components/KanalVergleich.tsx`:

```tsx
import Link from 'next/link';
import type { ChannelSummary, OrderChannel } from '@/verkauf/types';
import { CHANNEL_LABEL } from '@/verkauf/labels';
import { eur } from '@/verkauf/format';

const ORDER: OrderChannel[] = ['shop', 'b2b_portal', 'marktplatz', 'telefon', 'manuell'];

export function KanalVergleich({ channels }: { channels: ChannelSummary[] }) {
  const by = new Map(channels.map((c) => [c.channel, c]));
  return (
    <div>
      <p className="anno mb-3 text-neutral-500">Kanal-Vergleich · netto, ohne MwSt</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ORDER.map((ch) => {
          const c = by.get(ch);
          return (
            <Link key={ch} href={`/verkauf/belege?channel=${ch}`}
              className="rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-accent dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{CHANNEL_LABEL[ch]}</p>
              <p className="mt-2 text-xl font-semibold text-neutral-900 dark:text-neutral-100">{eur(c?.revenueNet ?? 0)}</p>
              <p className="mt-1 text-sm text-neutral-500">{c?.orders ?? 0} Belege · Ø {eur(c?.avgOrderValueNet ?? 0)}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `StatusFunnel`** — `src/components/StatusFunnel.tsx`:

```tsx
import type { StatusCount, OrderStatus } from '@/verkauf/types';
import { STATUS_LABEL } from '@/verkauf/labels';

const ORDER: OrderStatus[] =
  ['angebot', 'auftrag', 'versendet', 'rechnung_gestellt', 'bezahlt', 'retoure', 'storniert'];

export function StatusFunnel({ funnel }: { funnel: StatusCount[] }) {
  const by = new Map(funnel.map((f) => [f.status, f.count]));
  const max = Math.max(1, ...funnel.map((f) => f.count));
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="anno mb-3 text-neutral-500">Status-Funnel</p>
      <div className="space-y-1.5">
        {ORDER.map((s) => {
          const n = by.get(s) ?? 0;
          const pct = Math.round((n / max) * 100);
          return (
            <div key={s} className="flex items-center gap-3 text-sm">
              <span className="w-36 shrink-0 text-neutral-600 dark:text-neutral-400">{STATUS_LABEL[s]}</span>
              <div className="h-4 flex-1 rounded bg-neutral-100 dark:bg-neutral-800">
                <div className="h-4 rounded bg-accent" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right tabular-nums text-neutral-900 dark:text-neutral-100">{n}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Übersichtsseite** — `src/app/(shell)/verkauf/page.tsx`:

```tsx
import { salesTotals, channelSummary, statusFunnel } from '@/verkauf/repository';
import { addDays } from '@/lib/dates';
import { Filters } from '@/components/Filters';
import { ChartCard } from '@/components/charts/ChartCard';
import { KanalVergleich } from '@/components/KanalVergleich';
import { StatusFunnel } from '@/components/StatusFunnel';
import { eur } from '@/verkauf/format';

export const dynamic = 'force-dynamic';

function StatTile({ label, value, anno }: { label: string; value: string; anno?: string }) {
  return (
    <ChartCard>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
      {anno && <p className="anno mt-1 text-neutral-500">{anno}</p>}
    </ChartCard>
  );
}

export default async function VerkaufUebersichtPage({ searchParams }: { searchParams: { days?: string } }) {
  const days = [7, 30, 90].includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const end = new Date().toISOString().slice(0, 10);
  const range = { start: addDays(end, -(days - 1)), end };
  const [totals, channels, funnel] = await Promise.all([
    salesTotals(range), channelSummary(range), statusFunnel(range),
  ]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Verkauf · Übersicht</h2>
        <Filters range={range} basePath="/verkauf" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Umsatz" value={eur(totals.revenueNet)} anno="NETTO · OHNE MWST" />
        <StatTile label="Belege" value={String(totals.orders)} />
        <StatTile label="Ø Belegwert" value={eur(totals.avgOrderValueNet)} anno="NETTO · OHNE MWST" />
        <StatTile label="Offene Angebote" value={String(totals.openOffers)} />
      </div>
      <KanalVergleich channels={channels} />
      <StatusFunnel funnel={funnel} />
    </div>
  );
}
```

- [ ] **Step 7: Sidebar** — `src/components/VerkaufSidebar.tsx`, `ITEMS` und `href`-Logik ersetzen:

```tsx
const ITEMS = [
  { href: '/verkauf', label: 'Übersicht' },
  { href: '/verkauf/belege', label: 'Belege' },
  { href: '/verkauf/dashboard', label: 'Dashboard' },
  { href: '/verkauf/neu', label: 'Neuer Beleg' },
];

export function VerkaufSidebar() {
  const pathname = usePathname();
  return (
    <nav className="w-56 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-3 px-2 text-sm font-bold text-neutral-900 dark:text-neutral-100">Verkauf</p>
      <ul className="space-y-1">
        {ITEMS.map((it) => {
          const active = it.href === '/verkauf'
            ? pathname === '/verkauf'
            : pathname === it.href || pathname.startsWith(it.href + '/');
          return (
            <li key={it.href}>
              <Link href={it.href} className={`block rounded-md px-3 py-1.5 text-sm ${active
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
(Exakter Aktiv-Match für `/verkauf`, damit die Übersicht nicht bei jeder Unterseite aktiv leuchtet; Präfix-Match für die übrigen.)

- [ ] **Step 8: Netto-Annotation im Beleg-Detail** — in `src/components/VerkaufDetail.tsx` den `tfoot` um eine Annotation ergänzen:

```tsx
<tfoot>
  <tr className="border-t border-neutral-300 font-medium dark:border-neutral-700">
    <td className="py-2" colSpan={4}>Gesamt</td><td className="text-right">{total.toFixed(2)} €</td>
  </tr>
  <tr>
    <td className="anno pt-1 text-neutral-500" colSpan={5}>Beträge netto, ohne MwSt</td>
  </tr>
</tfoot>
```

- [ ] **Step 9: Build** — Run: `npx tsc --noEmit && npx vitest run tests/verkauf/format.test.ts` — Erwartung: keine Typfehler / PASS.

- [ ] **Step 10: Commit** — `git add -A && git commit -m "feat(verkauf): Ebene-1-Übersicht (Kanal-Vergleich, Status-Funnel, netto), Sidebar & Netto-Label"`

---

## Task 4: KPI-Board nach `/verkauf/dashboard` umziehen

**Files:**
- Move: `src/app/(shell)/phase/[phase]/page.tsx` → `src/app/(shell)/verkauf/dashboard/phase/[phase]/page.tsx` (`git mv`), dann anpassen
- Create: `src/app/(shell)/verkauf/dashboard/page.tsx`
- Modify: `src/app/(shell)/dashboard/page.tsx` (→ Redirect), `src/components/PhaseColumn.tsx`
- (`Filters basePath` bereits in Task 3, Step 1 erledigt.)

**Interfaces:**
- Consumes: `loadDataset`, `computeKpis`, `PhaseColumn`, `Filters` (mit `basePath`), `PHASE_META`, `loadDailySeries`, `KpiCard`, `PhaseTrendChart`.
- Produces: Routen `/verkauf/dashboard`, `/verkauf/dashboard/phase/[phase]`, Redirect von `/dashboard`.

- [ ] **Step 1: Board-Seite anlegen** — `src/app/(shell)/verkauf/dashboard/page.tsx` (ohne eigenes `<main>`, da das `verkauf/layout.tsx` bereits `main` + `p-6` liefert; `basePath` an `Filters`):

```tsx
import { loadDataset } from '@/kpi/repository';
import { computeKpis } from '@/kpi/index';
import { addDays } from '@/lib/dates';
import { PhaseColumn } from '@/components/PhaseColumn';
import { Filters } from '@/components/Filters';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function VerkaufDashboardPage({ searchParams }: { searchParams: { days?: string } }) {
  const days = [7, 30, 90].includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const end = new Date().toISOString().slice(0, 10);
  const range = { start: addDays(end, -(days - 1)), end };
  const supabase = createClient();
  const phases = computeKpis(await loadDataset(supabase), range);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Verkauf · Dashboard</h2>
        <Filters range={range} basePath="/verkauf/dashboard" />
      </header>
      <div className="flex gap-4">
        {phases.map((p) => <PhaseColumn key={p.phase} phase={p} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Phasen-Drill-down verschieben** — `git mv "src/app/(shell)/phase" "src/app/(shell)/verkauf/dashboard/phase"`. Dann in der verschobenen `.../phase/[phase]/page.tsx`: äußeres `<main className="flex-1 overflow-y-auto">` durch `<div className="mx-auto max-w-6xl">` ersetzen (Layout liefert `main`+`p-6`) und den Back-Link umbiegen:

```tsx
  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/verkauf/dashboard" className="text-sm text-brand hover:text-brand-dark">← Zur Übersicht</Link>
      <h1 className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">{meta.title} · {meta.subtitle}</h1>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        {phase.kpis.map((k) => <KpiCard key={k.key} kpi={k} />)}
      </div>
      <PhaseTrendChart series={series} metric={meta.leadMetric} />
    </div>
  );
```

- [ ] **Step 3: `PhaseColumn`-Link umbiegen** — `src/components/PhaseColumn.tsx`:
`href={\`/phase/${phase.phase}\`}` → `href={\`/verkauf/dashboard/phase/${phase.phase}\`}`.

- [ ] **Step 4: Alt-Route zum Redirect machen** — `src/app/(shell)/dashboard/page.tsx` vollständig ersetzen:

```tsx
import { redirect } from 'next/navigation';

export default function DashboardRedirect() {
  redirect('/verkauf/dashboard');
}
```

- [ ] **Step 5: Build** — Run: `npx tsc --noEmit` — Erwartung: keine Typfehler. Sicherstellen, dass kein Verweis mehr auf `/phase/` oder das alte Board zeigt: `grep -rn "/phase/" src` liefert nur noch die neue Route.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "refactor(verkauf): KPI-Board + Phasen-Drill-down nach /verkauf/dashboard umziehen; /dashboard → Redirect"`

---

## Task 5: `dashboard` aus der Rail + Zugriffs-Ripple

**Files:**
- Modify: `src/lib/apps.ts`, `src/lib/groups.ts`, `db/schema.sql`
- Test: `tests/lib/apps-access.test.ts`, `tests/lib/groups.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `AppKey` ohne `dashboard`; `APPS` ohne Dashboard-Eintrag; Baseline nur `hilfe`.

> **Atomar:** Union-Entfernung, `APPS`-Entfernung, `accessibleApps` und beide Tests **in einem Commit**, sonst `tsc`-Fehler (verwaiste `'dashboard'`-Literale).

- [ ] **Step 1: Tests zuerst anpassen (rot)** —
  - `tests/lib/apps-access.test.ts`:
    - Zeile „admin sieht alles": `expect(keys).toEqual(['brickpm', 'kontakte', 'katalog', 'verkauf', 'hilfe']);`
    - Baseline: `expect(keys).toEqual(['hilfe']);`
    - brickpm-Fall: `expect(keys).toEqual(['brickpm', 'hilfe']);`
  - `tests/lib/groups.test.ts` (fresh install):
    `expect(a.apps).toEqual({ brickpm: 'edit', kontakte: 'edit', katalog: 'edit', verkauf: 'edit', hilfe: 'edit' });`

  Run: `npx vitest run tests/lib/apps-access.test.ts tests/lib/groups.test.ts` — Erwartung: FAIL.

- [ ] **Step 2: `apps.ts`** — `dashboard` aus Union und `APPS` streichen:

```ts
export type AppKey = 'brickpm' | 'kontakte' | 'katalog' | 'hilfe' | 'verkauf';

export const APPS: AppDef[] = [
  { key: 'brickpm', label: 'BrickPM', abbr: 'BP', href: '/brickpm' },
  { key: 'kontakte', label: 'Kontakte', abbr: 'KO', href: '/kontakte' },
  { key: 'katalog', label: 'Katalog', abbr: 'KA', href: '/katalog' },
  { key: 'verkauf', label: 'Verkauf', abbr: 'VK', href: '/verkauf' },
  { key: 'hilfe', label: 'Hilfe', abbr: 'HI', href: '/hilfe' },
];
```

- [ ] **Step 3: `groups.ts` Baseline** — `accessibleApps` und Kommentar:

```ts
/** Apps to surface in the Rail/Launchpad. Hilfe is always shown (ungated baseline); others gated. */
export function accessibleApps(access: UserAccess): AppDef[] {
  return APPS.filter(
    (a) => a.key === 'hilfe' || access.isAdmin || !!access.apps[a.key],
  );
}
```

- [ ] **Step 4: Schema-Seed** — in `db/schema.sql` die `group_app_access`-Seed-Werteliste anpassen: das Tupel `('dashboard'),` aus dem `VALUES (...)` der „Alle Nutzer"-Grant-Query entfernen (die übrigen `('brickpm'),('kontakte'),('katalog'),('verkauf')` bleiben). Kein `DELETE` bestehender Zeilen.

- [ ] **Step 5: Tests grün** — Run: `npx vitest run tests/lib/apps-access.test.ts tests/lib/groups.test.ts && npx tsc --noEmit` — Erwartung: PASS / keine Typfehler.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(shell): dashboard aus der Rail entfernen (Board lebt unter Verkauf), Baseline = hilfe"`

---

## Task 6: Hilfe pflegen

**Files:**
- Modify: `src/lib/help/content.ts`
- Test: `tests/lib/help-content.test.ts` (muss grün bleiben, keine Änderung erwartet)

**Interfaces:**
- Consumes: —
- Produces: aktualisierte `verkauf`-Hilfeseite; entfernte `dashboard`-Modulseite.

- [ ] **Step 1: `dashboard`-Modulseite entfernen** — den kompletten Objekt-Eintrag `{ slug: 'dashboard', title: 'Dashboard', … }` (Gruppe `module`) aus `HELP_PAGES` löschen.

- [ ] **Step 2: Launchpad-Note korrigieren** — auf der `uebersicht`-Seite den Note-Text
„Sichtbar sind nur die Module, für die deine Gruppe freigeschaltet ist. Dashboard und Hilfe sind immer verfügbar."
ersetzen durch:
„Sichtbar sind nur die Module, für die deine Gruppe freigeschaltet ist. Hilfe ist immer verfügbar. Die Shop-/Marketing-Kennzahlen findest du im Modul Verkauf unter „Dashboard"."

- [ ] **Step 3: `verkauf`-Seite um Ebene 1 erweitern** — in den `sections` der `verkauf`-Seite nach „Wichtige Funktionen" ergänzen:

```ts
{
  heading: 'Übersicht & Kanäle (Ebene 1)',
  blocks: [
    { type: 'p', text: 'Die Verkauf-Startseite zeigt für den gewählten Zeitraum (7/30/90 Tage) Umsatz, Anzahl Belege, durchschnittlichen Belegwert und offene Angebote. Alle Beträge sind netto (ohne MwSt).' },
    { type: 'list', items: [
      'Kanal-Vergleich: Umsatz, Belege und Ø Belegwert je Kanal (Shop, B2B-Portal, Marktplatz, Telefon, Manuell) — ein Klick öffnet die auf den Kanal gefilterte Belegliste.',
      'Status-Funnel: Anzahl Belege je Status von Angebot bis bezahlt.',
      'Umsatz zählt Belege ab Auftrag; Angebote sind Pipeline (eigene Kennzahl), Retouren mindern den Umsatz netto.',
      'Die Shop-/Marketing-KPIs (GA4, Shop, Ads) liegen unter Verkauf → Dashboard.',
    ] },
  ],
},
```

- [ ] **Step 4: Test** — Run: `npx vitest run tests/lib/help-content.test.ts` — Erwartung: PASS (jede App in `APPS` hat weiter eine Modulseite; `dashboard` ist keine App mehr).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "docs(hilfe): Verkauf-Ebene-1 dokumentieren, Dashboard-Modulseite entfernen"`

---

## Abschluss (Controller, nach allen Tasks)

- [ ] **Volle Suite:** `npx vitest run` — grün (bekannte RLS-Deny-Fails auf diesem Host ausgenommen, siehe Memory `rls-tests-fail-on-supabase`).
- [ ] **`npx tsc --noEmit`** sauber.
- [ ] **Deploy auf bryx-test:** `/opt/budp-dev/deploy.sh` (nie Produktion).
- [ ] **Browser-Verifikation** (Chrome DevTools MCP), Konsole fehlerfrei:
  - `/verkauf` = Übersicht: Zeitraum-Umschalter (7/30/90 ändert Zahlen), 4 Netto-KPIs mit „NETTO · OHNE MWST", Kanal-Vergleich (≥2 Kanäle mit Werten), Status-Funnel.
  - Kanal-Karte → `/verkauf/belege?channel=<x>`, Filter-Chip aktiv, Liste passend.
  - `/verkauf/belege/[id]` erreichbar; Beleg-Detail zeigt „Beträge netto, ohne MwSt"; Retoure-Sprung landet unter `/verkauf/belege/…`.
  - Sidebar: Übersicht · Belege · Dashboard · Neuer Beleg; „Dashboard" → KPI-Board unter `/verkauf/dashboard`; Phasen-Drill-down + Back-Link funktionieren.
  - `/dashboard` (alt) leitet auf `/verkauf/dashboard` um.
  - Rail/Launchpad ohne „Dashboard"-Kachel.
- [ ] Falls der Kanal-Vergleich zu leer ist (nur 1 Kanal mit Belegen): über `/verkauf/neu` bzw. Seed ein bis zwei Belege anderer Kanäle erzeugen, damit der Vergleich aussagekräftig ist.
- [ ] **superpowers:finishing-a-development-branch** → Push + PR, gestackt auf #67.

---

## Self-Review (Autor)

- **Spec-Abdeckung:** Routing (§1)→T2/T3/T4; Übersicht+Netto (§2/§6)→T3/T1; Board-Umzug (§3)→T4; Rail/Access (§4)→T5; Repository (§5)→T1; Hilfe (§7)→T6; Verifikation (§8)→Abschluss. Alle Spec-Abschnitte haben eine Task.
- **Bewusste Spec-Verfeinerung:** „Belege" = ∉{angebot,storniert} statt ∉{storniert} (Global Constraints) — dem Menschen beim Execution-Handoff nennen.
- **Reihenfolge-Kopplung:** `Filters basePath` in T3 vorgezogen (T3 nutzt ihn, T4 auch) — vermerkt. Zwischen T2 und T3 hat `/verkauf` kurz keine Seite (nur on-branch, kein Build-Fehler).
- **Typkonsistenz:** `DateRange`/`SalesTotals`/`ChannelSummary`/`StatusCount` in T1 definiert, in T3 konsumiert; Feldnamen (`revenueNet`, `avgOrderValueNet`, `openOffers`) durchgängig.
