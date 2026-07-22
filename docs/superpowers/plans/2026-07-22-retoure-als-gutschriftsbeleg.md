# Retoure als eigener Gutschriftsbeleg — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Woo-Erstattungen als eigene, negative Gutschriftsbelege importieren statt den Ursprungsbeleg umzustempeln — damit nettet sich der Umsatz von selbst und `REVENUE_STATUS_SQL` braucht keinen Sonderfall.

**Architecture:** `STATUS_MAP` bildet `refunded` künftig auf `bezahlt` ab (der Verkauf bleibt ein Verkauf). Für jeden Eintrag in `refunds[]` legt der Import zusätzlich einen Beleg mit `status='retoure'`, negativem `total_net`, `related_order_id` auf den Ursprung und dem Erstattungsdatum an. Idempotenz über `external_references.external_id = 'refund:{refundId}'`.

**Tech Stack:** TypeScript, Postgres (`pg`), WooCommerce REST v3, Vitest.

## Global Constraints

- **`REVENUE_STATUS_SQL` wird NICHT angefasst.** Es bleibt `"o.status <> 'storniert'"`. Wenn am Ende ein Sonderfall für `retoure` nötig wäre, ist das Datenmodell falsch, nicht der Filter.
- **Gutschriften bekommen KEINE Positionszeilen**, nur `total_net`. Bewusst — Positionen wären wegen der SKU-Lücke unvollständig, und `total_net` hat in allen Umsatzabfragen Vorrang.
- `total_net` einer Gutschrift ist **immer negativ** (`-Math.abs(...)`), unabhängig vom Vorzeichen, das WooCommerce liefert.
- **Beide Import-Pfade** (Neuanlage UND erneuter Import) müssen Gutschriften anlegen. Der Bestandspfad korrigiert die 56 bereits importierten Prod-Belege — ohne ihn wirkt der Rollout nicht.
- Der Detail-Aufruf `/orders/{id}/refunds` erfolgt **nur** für Belege mit nicht-leerem `refunds[]`.
- Do NOT start or deploy the app.

**Wegwerf-DB für DB-Tests** (vitest lädt `.env` NICHT — sonst scheitern alle DB-Tests an Auth und maskieren echte Fehler; niemals gegen die Standard-DB testen, die Tests löschen Daten):

```bash
cd /root/ecom-platform && set -a && source .env && set +a
PW=$(python3 -c "import os,re;print(re.search(r'//[^:]+:([^@]+)@',os.environ['DATABASE_URL']).group(1))")
DB=citestret
docker exec -e PGPASSWORD="$PW" supabase-db psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS $DB"
docker exec -e PGPASSWORD="$PW" supabase-db psql -U postgres -d postgres -c "CREATE DATABASE $DB"
docker cp db/schema.sql supabase-db:/tmp/s.sql && docker exec -e PGPASSWORD="$PW" supabase-db psql -U postgres -d $DB -q -f /tmp/s.sql
docker cp db/rls.sql    supabase-db:/tmp/r.sql && docker exec -e PGPASSWORD="$PW" supabase-db psql -U postgres -d $DB -q -f /tmp/r.sql
export CITEST_URL="postgres://postgres:$PW@localhost:5432/$DB"
# Tests:  DATABASE_URL="$CITEST_URL" npx vitest run <datei>
```

Am Ende `DROP DATABASE citestret`.

---

### Task 1: `mapRefundNet` + Mirror holt Erstattungen

**Files:**
- Modify: `src/woocommerce/order-import.ts` (reine Funktion)
- Modify: `src/woocommerce/mirror.ts` (`_fields` + neue Methode)
- Test: `tests/woocommerce/order-import.test.ts`

**Interfaces:**
- Produces: `mapRefundNet(refund): number` — immer `<= 0`.
- Produces: `WooCommerceMirror.fetchOrderRefunds(orderId: string | number): Promise<Record<string, unknown>[]>`
- `fetchOrdersRaw` liefert zusätzlich das Feld `refunds`.

- [ ] **Step 1: Failing test schreiben**

An `tests/woocommerce/order-import.test.ts` anhängen:

```ts
import { mapRefundNet } from '@/woocommerce/order-import';

describe('mapRefundNet', () => {
  it('nimmt die Netto-Summe der Erstattungspositionen', () => {
    const r = { amount: '45.85', total_tax: '-7.32',
      line_items: [{ total: '-30.00' }, { total: '-8.53' }] };
    expect(mapRefundNet(r as any)).toBeCloseTo(-38.53);
  });
  it('faellt ohne Positionen auf |amount| - |total_tax| zurueck', () => {
    expect(mapRefundNet({ amount: '45.85', total_tax: '-7.32' } as any)).toBeCloseTo(-38.53);
  });
  it('liefert immer ein negatives Ergebnis, egal wie das Vorzeichen kommt', () => {
    expect(mapRefundNet({ amount: '10', total_tax: '0', line_items: [{ total: '10.00' }] } as any)).toBeCloseTo(-10);
    expect(mapRefundNet({ amount: '10', total_tax: '0', line_items: [{ total: '-10.00' }] } as any)).toBeCloseTo(-10);
  });
  it('leere Eingabe ergibt 0', () => {
    expect(mapRefundNet({} as any)).toBe(0);
  });
});
```

- [ ] **Step 2: Test rot laufen lassen**

Run: `npx vitest run tests/woocommerce/order-import.test.ts`
Expected: FAIL („mapRefundNet is not a function").

- [ ] **Step 3: `mapRefundNet` implementieren**

In `src/woocommerce/order-import.ts`, unter `mapOrderTotal`:

```ts
export interface WooRefund {
  id?: number | string;
  date_created?: string;
  amount?: string | number;
  total_tax?: string | number;
  line_items?: { total?: string | number }[];
}

// Netto-Betrag einer Erstattung, IMMER negativ. WooCommerce liefert `amount`
// positiv, die Positions-`total` negativ — deshalb wird das Vorzeichen hier
// explizit gesetzt statt der Quelle vertraut.
export function mapRefundNet(refund: WooRefund): number {
  const items = refund.line_items ?? [];
  if (items.length > 0) {
    const sum = items.reduce((s, li) => s + Math.abs(Number(li.total) || 0), 0);
    return -sum;
  }
  const gross = Math.abs(Number(refund.amount) || 0);
  const tax = Math.abs(Number(refund.total_tax) || 0);
  return -(gross - tax);
}
```

- [ ] **Step 4: Mirror erweitern**

In `src/woocommerce/mirror.ts`, in `fetchOrdersRaw` die `fields`-Zeile ergänzen um `,refunds`:

```ts
    const fields = 'id,number,status,date_created,date_paid,total,currency,customer_id,billing,line_items,refunds';
```

Und eine neue Methode direkt darunter (Stil der übrigen Fetch-Methoden übernehmen, `this.get` verwenden):

```ts
  // Alle Erstattungen eines Belegs inkl. Detail (date_created, amount,
  // total_tax, line_items) in EINEM Aufruf. Nur fuer Belege aufrufen, deren
  // `refunds`-Feld nicht leer ist.
  async fetchOrderRefunds(orderId: string | number): Promise<Record<string, unknown>[]> {
    const res = await this.get(`${this.base}/orders/${orderId}/refunds?per_page=100`);
    if (!res.ok) throw new Error(`WooCommerce refunds fetch failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as Record<string, unknown>[];
  }
```

- [ ] **Step 5: Test grün + Typecheck**

Run: `npx vitest run tests/woocommerce/order-import.test.ts`
Expected: PASS (auch die bestehenden reinen Tests der Datei).
Run: `npx tsc --noEmit` → sauber.

- [ ] **Step 6: Commit**

```bash
git add src/woocommerce/order-import.ts src/woocommerce/mirror.ts tests/woocommerce/order-import.test.ts
git commit -m "feat(verkauf): mapRefundNet + Mirror holt Woo-Erstattungen"
```

---

### Task 2: `refunded` wird zum Verkaufsbeleg

**Files:**
- Modify: `src/woocommerce/order-import.ts` (`STATUS_MAP`)
- Test: `tests/woocommerce/order-import.test.ts`

**Interfaces:**
- `mapOrderStatus('refunded')` liefert künftig `'bezahlt'` statt `'retoure'`.

- [ ] **Step 1: Failing test schreiben**

```ts
it('mapOrderStatus: refunded ist ein bezahlter Verkauf (die Gutschrift ist ein eigener Beleg)', () => {
  expect(mapOrderStatus('refunded')).toBe('bezahlt');
  expect(mapOrderStatus('cancelled')).toBe('storniert');   // unveraendert
  expect(mapOrderStatus('completed')).toBe('bezahlt');     // unveraendert
});
```

Falls die Datei bereits einen `mapOrderStatus`-Test hat, der `refunded → 'retoure'` erwartet: diesen Test **anpassen**, nicht danebenstellen — die alte Erwartung ist jetzt falsch.

- [ ] **Step 2: Rot laufen lassen**

Run: `npx vitest run tests/woocommerce/order-import.test.ts`
Expected: FAIL (liefert `'retoure'`).

- [ ] **Step 3: `STATUS_MAP` ändern**

In `src/woocommerce/order-import.ts`:

```ts
  refunded: 'bezahlt',   // Verkauf bleibt Verkauf; die Erstattung wird ein eigener Gutschriftsbeleg
```

- [ ] **Step 4: Grün**

Run: `npx vitest run tests/woocommerce/order-import.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/woocommerce/order-import.ts tests/woocommerce/order-import.test.ts
git commit -m "feat(verkauf): Woo-Status refunded wird bezahlt statt retoure"
```

---

### Task 3: Gutschriftsbelege anlegen (beide Pfade)

**Files:**
- Modify: `src/woocommerce/order-import.ts`
- Test: `tests/woocommerce/order-import.test.ts`

**Interfaces:**
- Consumes: `mapRefundNet` (Task 1), `mapOrderStatus` (Task 2).
- `importWooCommerceOrders` bekommt einen optionalen Parameter, über den die Erstattungen eines Belegs beschafft werden — damit der Test ohne echte API läuft:

```ts
export async function importWooCommerceOrders(
  pool: Pool, rawOrders: Record<string, unknown>[], priceListId: string,
  fetchRefunds?: (orderId: string) => Promise<WooRefund[]>,
): Promise<OrderImportResult>
```

Ohne diesen Parameter werden **keine** Gutschriften angelegt (Rückwärtskompatibilität für bestehende Aufrufer/Tests). `scripts/import-woocommerce-orders.ts` übergibt `(id) => mirror.fetchOrderRefunds(id) as Promise<WooRefund[]>`.

- Ergebnis-Objekt bekommt zwei Zähler: `creditNotesCreated`, `creditNotesSkipped` (bereits vorhanden).

- [ ] **Step 1: Failing test schreiben**

```ts
it('legt je Erstattung eine negative Gutschrift an, verknuepft und idempotent', async () => {
  const raw = [{
    id: 771001, number: '771001', status: 'refunded', date_created: '2026-06-22T10:00:00',
    date_paid: '2026-06-22T10:05:00', currency: 'EUR',
    billing: { first_name: 'Rita', last_name: 'Retoure', email: 'rita@example.com' },
    line_items: [{ sku: 'SKU-EXIST', quantity: 1, price: 100, total: '100.00' }],
    refunds: [{ id: 990001, total: '-100.00' }],
  }];
  const fetchRefunds = async () => ([{
    id: 990001, date_created: '2026-07-14T15:42:30', amount: '119.00', total_tax: '-19.00',
    line_items: [{ total: '-100.00' }],
  }] as any);

  await importWooCommerceOrders(pool, raw as any, priceListId, fetchRefunds);

  // Ursprungsbeleg ist ein Verkauf
  const o = await pool.query(`SELECT id, status, total_net FROM sales_orders WHERE number='WC-771001'`);
  expect(o.rows[0].status).toBe('bezahlt');
  expect(Number(o.rows[0].total_net)).toBeCloseTo(100);

  // Gutschrift: negativ, verknuepft, mit Erstattungsdatum
  const g = await pool.query(
    `SELECT status, total_net, related_order_id, placed_at::date::text AS d
       FROM sales_orders WHERE number='WC-771001-R990001'`);
  expect(g.rows.length).toBe(1);
  expect(g.rows[0].status).toBe('retoure');
  expect(Number(g.rows[0].total_net)).toBeCloseTo(-100);
  expect(g.rows[0].related_order_id).toBe(o.rows[0].id);
  expect(g.rows[0].d).toBe('2026-07-14');

  // Idempotenz: zweiter Import legt KEINE zweite Gutschrift an
  await importWooCommerceOrders(pool, raw as any, priceListId, fetchRefunds);
  const again = await pool.query(`SELECT count(*)::int AS n FROM sales_orders WHERE number LIKE 'WC-771001-R%'`);
  expect(again.rows[0].n).toBe(1);
});

it('Verkauf und Gutschrift ergeben im Umsatz netto 0', async () => {
  const { salesTotals } = await import('@/verkauf/repository');
  const RANGE = { start: '2026-06-01', end: '2026-07-31' };
  const before = (await salesTotals(RANGE)).revenueNet;
  const raw = [{
    id: 771002, number: '771002', status: 'refunded', date_created: '2026-06-23T10:00:00',
    date_paid: '2026-06-23T10:05:00', currency: 'EUR',
    billing: { first_name: 'Nino', last_name: 'Netto', email: 'nino@example.com' },
    line_items: [{ sku: 'SKU-EXIST', quantity: 1, price: 50, total: '50.00' }],
    refunds: [{ id: 990002, total: '-50.00' }],
  }];
  const fetchRefunds = async () => ([{
    id: 990002, date_created: '2026-07-01T09:00:00', amount: '50.00', total_tax: '0',
    line_items: [{ total: '-50.00' }],
  }] as any);
  await importWooCommerceOrders(pool, raw as any, priceListId, fetchRefunds);
  const after = (await salesTotals(RANGE)).revenueNet;
  expect(after - before).toBeCloseTo(0);   // +50 Verkauf, -50 Gutschrift
});
```

Passe Fixture-Namen (`pool`, `priceListId`, `SKU-EXIST`) an das an, was die Datei bereits verwendet.

- [ ] **Step 2: Rot laufen lassen**

Run: `DATABASE_URL="$CITEST_URL" npx vitest run tests/woocommerce/order-import.test.ts`
Expected: FAIL (keine Gutschrift vorhanden).

- [ ] **Step 3: Signatur erweitern**

`importWooCommerceOrders` um den optionalen vierten Parameter ergänzen (siehe Interfaces) und `OrderImportResult` um `creditNotesCreated: number` erweitern (im Initialisierer auf `0` setzen).

- [ ] **Step 4: Gutschriften anlegen**

Innerhalb der Transaktion je Beleg, **nachdem** der Ursprungsbeleg angelegt bzw. gefunden wurde (also in BEIDEN Pfaden erreichbar — am einfachsten direkt vor dem `COMMIT`, mit `orderId` aus dem jeweiligen Zweig):

```ts
      // Erstattungen -> je eine negative Gutschrift, verknuepft mit dem Ursprung.
      const rawRefunds = (raw.refunds as { id?: number | string }[] | undefined) ?? [];
      if (fetchRefunds && rawRefunds.length > 0) {
        const details = await fetchRefunds(wooId);
        for (const rf of details) {
          const refundId = String(rf.id ?? '');
          if (!refundId) continue;
          const refKey = `refund:${refundId}`;
          const dup = await c.query(
            `SELECT 1 FROM external_references
              WHERE source_system='woocommerce' AND entity_type='sales_order' AND external_id=$1`, [refKey]);
          if (dup.rows.length > 0) continue;           // schon importiert
          const net = mapRefundNet(rf);
          const cnNumber = `${number}-R${refundId}`;
          const cnIns = await c.query<{ id: string }>(
            `INSERT INTO sales_orders (number, contact_id, channel, status, currency, placed_at, total_net, related_order_id)
             VALUES ($1,$2,'shop','retoure',$3,$4,$5,$6) RETURNING id`,
            [cnNumber, contactId, currency, rf.date_created ?? placedAt, net, orderId]);
          const cnId = cnIns.rows[0].id;
          await c.query(
            `INSERT INTO sales_order_events (order_id, stage, source_app, automated, occurred_at)
             VALUES ($1,'retoure','verkauf',true, COALESCE($2::timestamptz, now()))`,
            [cnId, rf.date_created ?? null]);
          await c.query(
            `INSERT INTO external_references (entity_type, entity_id, source_system, external_id, last_synced_at, raw_payload)
             VALUES ('sales_order', $1, 'woocommerce', $2, now(), $3::jsonb)
             ON CONFLICT (source_system, external_id, entity_type) DO NOTHING`,
            [cnId, refKey, JSON.stringify(rf)]);
          result.creditNotesCreated++;
        }
      }
```

**Wichtig:** Im Bestandspfad stehen `number`, `contactId`, `currency`, `placedAt` womöglich nicht unter denselben Namen zur Verfügung wie im Neuanlage-Pfad. Beschaffe die fehlenden Werte dort aus dem vorhandenen Beleg (`SELECT number, contact_id, currency, placed_at FROM sales_orders WHERE id=$1`), statt den Block zu duplizieren. Ziel ist **ein** Block, der von beiden Pfaden erreicht wird.

- [ ] **Step 5: Aufrufer anpassen**

In `scripts/import-woocommerce-orders.ts` den vierten Parameter übergeben:

```ts
  const r = await importWooCommerceOrders(pool, all, priceListId,
    (id) => mirror.fetchOrderRefunds(id) as Promise<any>);
```

- [ ] **Step 6: Grün**

Run: `DATABASE_URL="$CITEST_URL" npx vitest run tests/woocommerce/ tests/verkauf/`
Expected: PASS, inkl. aller bestehenden Tests.
Run: `npx tsc --noEmit` → sauber.

- [ ] **Step 7: Commit**

```bash
git add src/woocommerce/order-import.ts scripts/import-woocommerce-orders.ts tests/woocommerce/order-import.test.ts
git commit -m "feat(verkauf): Woo-Erstattungen werden eigene negative Gutschriftsbelege"
```

---

### Task 4: Volle Verifikation

- [ ] **Step 1: Wegwerf-DB frisch aufsetzen** (Befehle in „Global Constraints").

- [ ] **Step 2: Komplette Suite**

Run: `DATABASE_URL="$CITEST_URL" npx vitest run`
Expected: **alle** grün. Ein roter Test ist bei korrekt aufgesetzter DB echt — nicht als Umgebungsproblem abtun.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → sauber.

- [ ] **Step 4: Bestätigen, dass der Umsatzfilter unangetastet ist**

Run: `grep -n "REVENUE_STATUS_SQL =" src/verkauf/repository.ts`
Expected: unverändert `"o.status <> 'storniert'"` — kein `retoure`-Sonderfall.

- [ ] **Step 5: Wegwerf-DB entfernen**

```bash
docker exec -e PGPASSWORD="$PW" supabase-db psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS citestret"
```

## Rollout (durch den Controller, nicht durch Task-Subagenten)

1. Deploy bryx-test (`/opt/budp-dev/deploy.sh`).
2. PR gegen `main`, CI abwarten.
3. Nach Merge: Prod deployen (`cd /opt/budp/app && ./deploy/deploy.sh`).
4. Auf Prod `import:woocommerce-orders` erneut laufen lassen (idempotent, ~10 Min, abgekoppelt starten).
5. **Gegenprobe auf Prod:**
   - `retoure`-Belege mit `related_order_id IS NULL` → muss **0** sein.
   - 56 Gutschriften mit negativer Summe ≈ −2.472,97.
   - Umsatz sinkt von 597.612,71 auf ≈ **595.139,74** (−2.472,97).
