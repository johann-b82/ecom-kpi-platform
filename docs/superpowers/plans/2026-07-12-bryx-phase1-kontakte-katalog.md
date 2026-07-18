# bryx OS Phase 1 — Kontakte & Katalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two foundational bryx OS apps — Kontakte and Katalog — as apps in the existing `(shell)` platform, mirroring the BrickPM module pattern (schema → pure logic → repository → actions → UI → seed → tests).

**Architecture:** Raw `pg` `Pool` data access (Supabase is auth-only), idempotent `db/schema.sql` + `db/rls.sql` applied by `npm run migrate`, per-module folders under `src/<mod>/`, App-Router pages under `src/app/(shell)/<app>/` guarded by `requireAppAccess`, warm-Amber ERP design tokens. Multi-tenancy is future-proofed with a nullable `tenant_id` column + control-plane tables and **no** mode-aware access logic.

**Tech Stack:** Next.js 14 App Router (server components + server actions), TypeScript, `pg`, Supabase (auth + Storage), Tailwind (ERP tokens), Vitest 2 + `@testing-library/react` (jsdom for `tests/components/**`), `tsx` for scripts.

## Global Constraints

Every task's requirements implicitly include this section.

- **Data access:** raw `pg` `pool` from `src/lib/db.ts` only. Repos map snake_case → camelCase and cast every `DATE` column `::text AS col` (timezone-safe), exactly like `src/brickpm/repository.ts`. `tenant_id` is selected but always `null` in Phase 1 — no `db_mode` logic, no pooled RLS.
- **Schema:** append to the single idempotent `db/schema.sql` (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) and `db/rls.sql` (`ALTER TABLE … ENABLE ROW LEVEL SECURITY`, no policy — privileged access only). Applied by `npm run migrate` (`tsx scripts/migrate.ts`). No versioned migrations.
- **Access gate:** every mutating server action starts with `await requireAppAccess('<app>', 'edit')` then a repository mutation then `revalidatePath(...)`. Import: `import { requireAppAccess } from '@/lib/groups';`.
- **Registry:** apps live in `src/lib/apps.ts` (`AppKey` union + `APPS`); default `edit` access seeded for the `Alle Nutzer` group in `db/schema.sql`.
- **Design system (binding — `docs/design/design-system.md`):** accent only via `--accent`/`text-brand`/`bg-accent`; warm `neutral` palette only (no gray/slate/zinc/stone, no pure white/black outside `neutral-0`/`neutral-950`); fonts Plus Jakarta Sans (`font-sans`) + DM Mono (`.anno` for the only sanctioned UPPERCASE micro-labels); `dark:` variants required on everything new; white-label must keep working. The domain doc's Indigo/Gold prototype theme is **not** adopted.
- **Shared input class** (reuse verbatim across all inline fields): `rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100`.
- **Tests:** Vitest. Files under `tests/` mirror `src/`. Node env by default; `tests/components/**` runs in jsdom. `@` → `src`. Run a single test with `npx vitest run <path>`; full suite `npm test`.
- **Deployment:** NEVER run the app locally (no `next dev`, no `docker compose up`). The app is deployed and verified on the VPS (`root@194.164.204.249`, https://budp.lumeapps.de). Only `npx vitest` runs locally. UI verification happens on the VPS deploy, not this host.
- **Lifecycle-Weiche truth table (confirmed — "Freigabe = orderable"):**

  | status | verkaufbar | bestellbar | shopSichtbar |
  | --- | --- | --- | --- |
  | konzept | false | false | false |
  | freigegeben | false | true | false |
  | aktiv | true | true | true |
  | auslaufend | true | false | true |
  | eingestellt | false | false | false |

---

## Task 1: Registry + control-plane schema

**Files:**
- Modify: `src/lib/apps.ts` (extend `AppKey`, `APPS`)
- Modify: `db/schema.sql` (add `('kontakte'),('katalog')` to the `group_app_access` seed; add `tenants`, `price_lists`, `external_references`, `integration_connections`)
- Modify: `db/rls.sql` (ENABLE RLS on the four new tables)
- Test: `tests/lib/apps.test.ts`

**Interfaces:**
- Produces: `AppKey` union now includes `'kontakte' | 'katalog'`; `APPS` gains both entries. Tables `tenants(id uuid pk)`, `price_lists(id uuid pk)`, `external_references`, `integration_connections(id uuid pk)` exist. Later tasks FK to `tenants(id)` and `price_lists(id)`.

- [ ] **Step 1: Write the failing test**

`tests/lib/apps.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { APPS, APP_KEYS } from '@/lib/apps';

describe('app registry', () => {
  it('registers kontakte and katalog with KO/KA abbrs', () => {
    const kontakte = APPS.find((a) => a.key === 'kontakte');
    const katalog = APPS.find((a) => a.key === 'katalog');
    expect(kontakte).toMatchObject({ abbr: 'KO', href: '/kontakte' });
    expect(katalog).toMatchObject({ abbr: 'KA', href: '/katalog' });
    expect(APP_KEYS).toContain('kontakte');
    expect(APP_KEYS).toContain('katalog');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/apps.test.ts`
Expected: FAIL (no kontakte/katalog entries).

- [ ] **Step 3: Extend the registry**

`src/lib/apps.ts` — replace the union and array:
```ts
export type AppKey = 'dashboard' | 'brickpm' | 'kontakte' | 'katalog';

export interface AppDef {
  key: AppKey;
  label: string;
  abbr: string;
  href: string;
}

export const APPS: AppDef[] = [
  { key: 'dashboard', label: 'Dashboard', abbr: 'DB', href: '/dashboard' },
  { key: 'brickpm', label: 'BrickPM', abbr: 'BP', href: '/brickpm' },
  { key: 'kontakte', label: 'Kontakte', abbr: 'KO', href: '/kontakte' },
  { key: 'katalog', label: 'Katalog', abbr: 'KA', href: '/katalog' },
];

export const APP_KEYS: AppKey[] = APPS.map((a) => a.key);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/apps.test.ts`
Expected: PASS.

- [ ] **Step 5: Add control-plane tables + group access to `db/schema.sql`**

Append near the other domain tables (match the file's existing `CREATE TABLE IF NOT EXISTS` style). These come first because later tables FK to them:
```sql
-- ── bryx control plane ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  subdomain  TEXT UNIQUE,
  db_mode    TEXT NOT NULL DEFAULT 'dedicated' CHECK (db_mode IN ('dedicated','pooled')),
  status     TEXT NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv','inaktiv','gekuendigt')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_lists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES tenants(id),
  name       TEXT NOT NULL,
  currency   CHAR(3) NOT NULL DEFAULT 'EUR',
  is_default BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS external_references (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID REFERENCES tenants(id),
  entity_type    TEXT NOT NULL,
  entity_id      UUID NOT NULL,
  source_system  TEXT NOT NULL,
  external_id    TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ,
  raw_payload    JSONB
);

CREATE TABLE IF NOT EXISTS integration_connections (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID REFERENCES tenants(id),
  app            TEXT NOT NULL,
  provider       TEXT NOT NULL,
  label          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'nicht verbunden',
  last_synced_at TIMESTAMPTZ
);
```
Then extend the existing default-access seed — change:
```sql
  SELECT g.id, a.app, 'edit' FROM groups g, (VALUES ('dashboard'),('brickpm')) AS a(app)
```
to:
```sql
  SELECT g.id, a.app, 'edit' FROM groups g, (VALUES ('dashboard'),('brickpm'),('kontakte'),('katalog')) AS a(app)
```

- [ ] **Step 6: Enable RLS on the new tables in `db/rls.sql`**

Append (mirrors the `bpm_*` no-policy lines):
```sql
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 7: Apply and smoke-check the migration**

Run: `npm run migrate`
Expected: prints `Schema applied.` then `RLS policies applied.` with no error. (Idempotent — safe to re-run.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/apps.ts db/schema.sql db/rls.sql tests/lib/apps.test.ts
git commit -m "feat(bryx): register kontakte/katalog apps + control-plane schema"
```

---

## Task 2: Kontakte schema

**Files:**
- Modify: `db/schema.sql` (add `contacts`, `contact_addresses`, `contact_persons`)
- Modify: `db/rls.sql`

**Interfaces:**
- Produces: `contacts(id uuid pk, number unique, …)`, `contact_addresses`, `contact_persons`. `contacts(id)` is later FK'd by `products.default_supplier_id`.

- [ ] **Step 1: Add tables to `db/schema.sql`** (after `price_lists`, before Katalog tables)
```sql
-- ── Kontakte ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id),
  number        TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  legal_form    TEXT,
  is_customer   BOOLEAN NOT NULL DEFAULT false,
  is_supplier   BOOLEAN NOT NULL DEFAULT false,
  vat_id        TEXT,
  tax_country   CHAR(2),
  payment_terms INT NOT NULL DEFAULT 14,
  price_list_id UUID REFERENCES price_lists(id),
  currency      CHAR(3) NOT NULL DEFAULT 'EUR',
  language      CHAR(2) NOT NULL DEFAULT 'de',
  status        TEXT NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv','inaktiv')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_addresses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES tenants(id),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('rechnung','lieferung')),
  street     TEXT,
  zip        TEXT,
  city       TEXT,
  country    CHAR(2),
  is_default BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS contact_persons (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES tenants(id),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  role       TEXT
);
```

- [ ] **Step 2: Enable RLS in `db/rls.sql`**
```sql
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_persons ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 3: Apply and verify**

Run: `npm run migrate`
Expected: `Schema applied.` / `RLS policies applied.`, no error.

- [ ] **Step 4: Commit**
```bash
git add db/schema.sql db/rls.sql
git commit -m "feat(kontakte): contacts, addresses, persons schema"
```

---

## Task 3: Kontakte number generation (pure logic)

**Files:**
- Create: `src/kontakte/number.ts`
- Test: `tests/kontakte/number.test.ts`

**Interfaces:**
- Produces: `nextContactNumber(existing: string[]): string` → next `K-####` (4-digit zero-padded), ignoring malformed entries.

- [ ] **Step 1: Write the failing test**

`tests/kontakte/number.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { nextContactNumber } from '@/kontakte/number';

describe('nextContactNumber', () => {
  it('starts at K-0001 when empty', () => {
    expect(nextContactNumber([])).toBe('K-0001');
  });
  it('increments the max, ignoring malformed', () => {
    expect(nextContactNumber(['K-0001', 'K-0007', 'garbage'])).toBe('K-0008');
  });
  it('zero-pads to four digits', () => {
    expect(nextContactNumber(['K-0123'])).toBe('K-0124');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/kontakte/number.test.ts`
Expected: FAIL ("Cannot find module '@/kontakte/number'").

- [ ] **Step 3: Implement**

`src/kontakte/number.ts`:
```ts
/** Next sprechende Kontaktnummer K-#### from the existing set (malformed entries ignored). */
export function nextContactNumber(existing: string[]): string {
  const nums = existing
    .map((n) => /^K-(\d+)$/.exec(n))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => parseInt(m[1], 10));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `K-${String(next).padStart(4, '0')}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/kontakte/number.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/kontakte/number.ts tests/kontakte/number.test.ts
git commit -m "feat(kontakte): K-#### number generation"
```

---

## Task 4: VIES USt-IdNr. check (real, non-blocking)

**Files:**
- Create: `src/lib/vies.ts`
- Test: `tests/lib/vies.test.ts`

**Interfaces:**
- Produces:
  - `parseVatId(vatId: string): { country: string; number: string } | null` (pure).
  - `type ViesResult = { valid: boolean; name?: string; error?: string }`.
  - `checkVatId(vatId: string): Promise<ViesResult>` — calls the EU VIES REST API with a 4s timeout; never throws (network/EU-down ⇒ `{ valid: false, error }`).

- [ ] **Step 1: Write the failing test** (pure-format part is the TDD core; network is mocked)

`tests/lib/vies.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseVatId, checkVatId } from '@/lib/vies';

describe('parseVatId', () => {
  it('splits country + number, strips spaces, upcases', () => {
    expect(parseVatId('de 811 907 980')).toEqual({ country: 'DE', number: '811907980' });
  });
  it('rejects malformed input', () => {
    expect(parseVatId('12345')).toBeNull();
    expect(parseVatId('')).toBeNull();
  });
});

describe('checkVatId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns a format error without calling the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const r = await checkVatId('nope');
    expect(r).toEqual({ valid: false, error: 'Ungültiges Format.' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps a valid VIES response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => ({ valid: true, name: 'ACME GmbH' }),
    })));
    expect(await checkVatId('DE811907980')).toEqual({ valid: true, name: 'ACME GmbH' });
  });

  it('degrades gracefully when VIES is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect(await checkVatId('DE811907980')).toEqual({ valid: false, error: 'VIES nicht erreichbar.' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lib/vies.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`src/lib/vies.ts`:
```ts
const VIES_URL = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number';

/** Split a raw USt-IdNr. into ISO country + number, or null if malformed. */
export function parseVatId(vatId: string): { country: string; number: string } | null {
  const s = vatId.replace(/\s/g, '').toUpperCase();
  const m = /^([A-Z]{2})([0-9A-Z]{2,12})$/.exec(s);
  return m ? { country: m[1], number: m[2] } : null;
}

export type ViesResult = { valid: boolean; name?: string; error?: string };

/** Non-blocking VIES check. Never throws; EU service down ⇒ { valid:false, error }. */
export async function checkVatId(vatId: string): Promise<ViesResult> {
  const parsed = parseVatId(vatId);
  if (!parsed) return { valid: false, error: 'Ungültiges Format.' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(VIES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countryCode: parsed.country, vatNumber: parsed.number }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { valid: false, error: 'VIES nicht erreichbar.' };
    const data = await res.json();
    const name = data.name && data.name !== '---' ? String(data.name) : undefined;
    return { valid: !!data.valid, name };
  } catch {
    return { valid: false, error: 'VIES nicht erreichbar.' };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/lib/vies.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/vies.ts tests/lib/vies.test.ts
git commit -m "feat(vies): real non-blocking USt-IdNr. check"
```

---

## Task 5: Kontakte types + repository

**Files:**
- Create: `src/kontakte/types.ts`
- Create: `src/kontakte/repository.ts`
- Test: `tests/kontakte/repository.test.ts`

**Interfaces:**
- Consumes: `pool` from `@/lib/db`; `nextContactNumber` from `@/kontakte/number`.
- Produces (types — used by actions + UI):
```ts
export interface Contact {
  id: string; tenantId: string | null; number: string; name: string;
  legalForm: string | null; isCustomer: boolean; isSupplier: boolean;
  vatId: string | null; taxCountry: string | null; paymentTerms: number;
  priceListId: string | null; currency: string; language: string;
  status: 'aktiv' | 'inaktiv'; notes: string | null; createdAt: string;
}
export interface ContactAddress {
  id: string; contactId: string; type: 'rechnung' | 'lieferung';
  street: string | null; zip: string | null; city: string | null;
  country: string | null; isDefault: boolean;
}
export interface ContactPerson {
  id: string; contactId: string; name: string;
  email: string | null; phone: string | null; role: string | null;
}
export interface ContactDetail extends Contact {
  addresses: ContactAddress[]; persons: ContactPerson[];
}
export interface ContactInput {
  name: string; legalForm?: string | null; isCustomer: boolean; isSupplier: boolean;
  vatId?: string | null; taxCountry?: string | null; paymentTerms: number;
  priceListId?: string | null; currency: string; language: string;
  status: 'aktiv' | 'inaktiv'; notes?: string | null;
}
```
- Produces (functions): `listContacts()`, `getContact(id)`, `createContact(input)`, `updateContact(id, input)`, plus address/person writers `upsertAddress`, `deleteAddress`, `upsertPerson`, `deletePerson`.

- [ ] **Step 1: Write the failing test** (DB-backed; the suite runs serial — `fileParallelism:false`)

`tests/kontakte/repository.test.ts`:
```ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { createContact, getContact, listContacts, updateContact } from '@/kontakte/repository';

const ids: string[] = [];
afterAll(async () => {
  for (const id of ids) await pool.query('DELETE FROM contacts WHERE id = $1', [id]);
});

describe('kontakte repository', () => {
  it('creates a contact with an auto K-#### number and reads it back camelCased', async () => {
    const c = await createContact({
      name: 'Testkontakt', isCustomer: true, isSupplier: false,
      paymentTerms: 21, currency: 'EUR', language: 'de', status: 'aktiv',
    });
    ids.push(c.id);
    expect(c.number).toMatch(/^K-\d{4}$/);
    expect(c.isCustomer).toBe(true);
    const back = await getContact(c.id);
    expect(back?.name).toBe('Testkontakt');
    expect(back?.addresses).toEqual([]);
  });

  it('updates mutable fields', async () => {
    const c = await createContact({
      name: 'Vorher', isCustomer: false, isSupplier: true,
      paymentTerms: 14, currency: 'EUR', language: 'de', status: 'aktiv',
    });
    ids.push(c.id);
    await updateContact(c.id, {
      name: 'Nachher', isCustomer: false, isSupplier: true,
      paymentTerms: 30, currency: 'EUR', language: 'de', status: 'inaktiv',
    });
    const back = await getContact(c.id);
    expect(back?.name).toBe('Nachher');
    expect(back?.status).toBe('inaktiv');
    expect(back?.paymentTerms).toBe(30);
  });

  it('lists contacts', async () => {
    expect((await listContacts()).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/kontakte/repository.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `src/kontakte/types.ts`** — exactly the interface block from **Interfaces** above.

- [ ] **Step 4: Implement `src/kontakte/repository.ts`**
```ts
import { pool } from '@/lib/db';
import { nextContactNumber } from './number';
import type { Contact, ContactAddress, ContactDetail, ContactInput, ContactPerson } from './types';

const CONTACT_COLS = `id, tenant_id, number, name, legal_form, is_customer, is_supplier,
  vat_id, tax_country, payment_terms, price_list_id, currency, language, status, notes,
  created_at::text AS created_at`;

function mapContact(x: any): Contact {
  return {
    id: x.id, tenantId: x.tenant_id, number: x.number, name: x.name,
    legalForm: x.legal_form, isCustomer: x.is_customer, isSupplier: x.is_supplier,
    vatId: x.vat_id, taxCountry: x.tax_country, paymentTerms: x.payment_terms,
    priceListId: x.price_list_id, currency: x.currency, language: x.language,
    status: x.status, notes: x.notes, createdAt: x.created_at,
  };
}
function mapAddress(x: any): ContactAddress {
  return {
    id: x.id, contactId: x.contact_id, type: x.type, street: x.street,
    zip: x.zip, city: x.city, country: x.country, isDefault: x.is_default,
  };
}
function mapPerson(x: any): ContactPerson {
  return { id: x.id, contactId: x.contact_id, name: x.name, email: x.email, phone: x.phone, role: x.role };
}

export async function listContacts(): Promise<Contact[]> {
  const r = await pool.query(`SELECT ${CONTACT_COLS} FROM contacts ORDER BY number`);
  return r.rows.map(mapContact);
}

export async function getContact(id: string): Promise<ContactDetail | null> {
  const r = await pool.query(`SELECT ${CONTACT_COLS} FROM contacts WHERE id = $1`, [id]);
  if (r.rows.length === 0) return null;
  const contact = mapContact(r.rows[0]);
  const addr = await pool.query(
    `SELECT id, contact_id, type, street, zip, city, country, is_default
       FROM contact_addresses WHERE contact_id = $1 ORDER BY type`, [id]);
  const pers = await pool.query(
    `SELECT id, contact_id, name, email, phone, role
       FROM contact_persons WHERE contact_id = $1 ORDER BY name`, [id]);
  return { ...contact, addresses: addr.rows.map(mapAddress), persons: pers.rows.map(mapPerson) };
}

export async function createContact(input: ContactInput): Promise<Contact> {
  const existing = await pool.query<{ number: string }>('SELECT number FROM contacts');
  const number = nextContactNumber(existing.rows.map((x) => x.number));
  const r = await pool.query(
    `INSERT INTO contacts (number, name, legal_form, is_customer, is_supplier, vat_id, tax_country,
       payment_terms, price_list_id, currency, language, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING ${CONTACT_COLS}`,
    [number, input.name, input.legalForm ?? null, input.isCustomer, input.isSupplier,
     input.vatId ?? null, input.taxCountry ?? null, input.paymentTerms, input.priceListId ?? null,
     input.currency, input.language, input.status, input.notes ?? null],
  );
  return mapContact(r.rows[0]);
}

export async function updateContact(id: string, input: ContactInput): Promise<void> {
  await pool.query(
    `UPDATE contacts SET name=$2, legal_form=$3, is_customer=$4, is_supplier=$5, vat_id=$6,
       tax_country=$7, payment_terms=$8, price_list_id=$9, currency=$10, language=$11,
       status=$12, notes=$13 WHERE id=$1`,
    [id, input.name, input.legalForm ?? null, input.isCustomer, input.isSupplier,
     input.vatId ?? null, input.taxCountry ?? null, input.paymentTerms, input.priceListId ?? null,
     input.currency, input.language, input.status, input.notes ?? null],
  );
}

export async function upsertAddress(a: Omit<ContactAddress, 'id'> & { id?: string }): Promise<void> {
  if (a.id) {
    await pool.query(
      `UPDATE contact_addresses SET type=$2, street=$3, zip=$4, city=$5, country=$6, is_default=$7 WHERE id=$1`,
      [a.id, a.type, a.street, a.zip, a.city, a.country, a.isDefault]);
  } else {
    await pool.query(
      `INSERT INTO contact_addresses (contact_id, type, street, zip, city, country, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [a.contactId, a.type, a.street, a.zip, a.city, a.country, a.isDefault]);
  }
}
export async function deleteAddress(id: string): Promise<void> {
  await pool.query('DELETE FROM contact_addresses WHERE id = $1', [id]);
}

export async function upsertPerson(p: Omit<ContactPerson, 'id'> & { id?: string }): Promise<void> {
  if (p.id) {
    await pool.query(
      `UPDATE contact_persons SET name=$2, email=$3, phone=$4, role=$5 WHERE id=$1`,
      [p.id, p.name, p.email, p.phone, p.role]);
  } else {
    await pool.query(
      `INSERT INTO contact_persons (contact_id, name, email, phone, role) VALUES ($1,$2,$3,$4,$5)`,
      [p.contactId, p.name, p.email, p.phone, p.role]);
  }
}
export async function deletePerson(id: string): Promise<void> {
  await pool.query('DELETE FROM contact_persons WHERE id = $1', [id]);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/kontakte/repository.test.ts`
Expected: PASS (requires a reachable DB via `DATABASE_URL`; migrations from Tasks 1–2 applied).

- [ ] **Step 6: Commit**
```bash
git add src/kontakte/types.ts src/kontakte/repository.ts tests/kontakte/repository.test.ts
git commit -m "feat(kontakte): types + repository"
```

---

## Task 6: Kontakte server actions

**Files:**
- Create: `src/app/(shell)/kontakte/actions.ts`
- Test: `tests/app/kontakte-actions.test.ts`

**Interfaces:**
- Consumes: repository writers from `@/kontakte/repository`; `checkVatId` from `@/lib/vies`; `requireAppAccess` from `@/lib/groups`.
- Produces (server actions): `createContactAction(input)`, `updateContactAction(id, input)`, `saveAddressAction(a)`, `removeAddressAction(id)`, `savePersonAction(p)`, `removePersonAction(id)`, `checkVatAction(vatId)`. Each mutation gates on `requireAppAccess('kontakte','edit')` and `revalidatePath`. `checkVatAction` gates on `'view'` and returns `ViesResult`.

- [ ] **Step 1: Write the failing test** (mock the gate, repo, VIES, cache — mirror `tests/app/brickpm-actions.test.ts`)

`tests/app/kontakte-actions.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/groups', () => ({ requireAppAccess: vi.fn() }));
vi.mock('@/kontakte/repository', () => ({
  createContact: vi.fn(async () => ({ id: 'c1' })),
  updateContact: vi.fn(), upsertAddress: vi.fn(), deleteAddress: vi.fn(),
  upsertPerson: vi.fn(), deletePerson: vi.fn(),
}));
vi.mock('@/lib/vies', () => ({ checkVatId: vi.fn(async () => ({ valid: true, name: 'X' })) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { createContactAction, checkVatAction } from '@/app/(shell)/kontakte/actions';
import { requireAppAccess } from '@/lib/groups';
import { createContact } from '@/kontakte/repository';
import { revalidatePath } from 'next/cache';

beforeEach(() => vi.clearAllMocks());

describe('kontakte actions', () => {
  it('createContactAction gates on edit, writes, revalidates', async () => {
    vi.mocked(requireAppAccess).mockResolvedValue(undefined);
    const input = { name: 'Neu', isCustomer: true, isSupplier: false,
      paymentTerms: 14, currency: 'EUR', language: 'de', status: 'aktiv' as const };
    const r = await createContactAction(input);
    expect(requireAppAccess).toHaveBeenCalledWith('kontakte', 'edit');
    expect(createContact).toHaveBeenCalledWith(input);
    expect(revalidatePath).toHaveBeenCalledWith('/kontakte');
    expect(r).toEqual({ id: 'c1' });
  });

  it('checkVatAction gates on view and returns the VIES result', async () => {
    vi.mocked(requireAppAccess).mockResolvedValue(undefined);
    expect(await checkVatAction('DE811907980')).toEqual({ valid: true, name: 'X' });
    expect(requireAppAccess).toHaveBeenCalledWith('kontakte', 'view');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/app/kontakte-actions.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `src/app/(shell)/kontakte/actions.ts`**
```ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireAppAccess } from '@/lib/groups';
import { checkVatId, type ViesResult } from '@/lib/vies';
import {
  createContact, updateContact, upsertAddress, deleteAddress, upsertPerson, deletePerson,
} from '@/kontakte/repository';
import type { Contact, ContactAddress, ContactInput, ContactPerson } from '@/kontakte/types';

export async function createContactAction(input: ContactInput): Promise<Contact> {
  await requireAppAccess('kontakte', 'edit');
  const c = await createContact(input);
  revalidatePath('/kontakte');
  return c;
}

export async function updateContactAction(id: string, input: ContactInput): Promise<void> {
  await requireAppAccess('kontakte', 'edit');
  await updateContact(id, input);
  revalidatePath('/kontakte');
  revalidatePath(`/kontakte/${id}`);
}

export async function saveAddressAction(a: Omit<ContactAddress, 'id'> & { id?: string }): Promise<void> {
  await requireAppAccess('kontakte', 'edit');
  await upsertAddress(a);
  revalidatePath(`/kontakte/${a.contactId}`);
}
export async function removeAddressAction(id: string, contactId: string): Promise<void> {
  await requireAppAccess('kontakte', 'edit');
  await deleteAddress(id);
  revalidatePath(`/kontakte/${contactId}`);
}

export async function savePersonAction(p: Omit<ContactPerson, 'id'> & { id?: string }): Promise<void> {
  await requireAppAccess('kontakte', 'edit');
  await upsertPerson(p);
  revalidatePath(`/kontakte/${p.contactId}`);
}
export async function removePersonAction(id: string, contactId: string): Promise<void> {
  await requireAppAccess('kontakte', 'edit');
  await deletePerson(id);
  revalidatePath(`/kontakte/${contactId}`);
}

export async function checkVatAction(vatId: string): Promise<ViesResult> {
  await requireAppAccess('kontakte', 'view');
  return checkVatId(vatId);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/app/kontakte-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add "src/app/(shell)/kontakte/actions.ts" tests/app/kontakte-actions.test.ts
git commit -m "feat(kontakte): server actions incl. VIES check"
```

---

## Task 7: Kontakte UI (layout, sidebar, list, detail)

**Files:**
- Create: `src/app/(shell)/kontakte/layout.tsx`
- Create: `src/app/(shell)/kontakte/page.tsx` (Liste)
- Create: `src/app/(shell)/kontakte/[id]/page.tsx` (Detail)
- Create: `src/components/KontakteSidebar.tsx`
- Create: `src/components/KontakteList.tsx` (client — search + Kunde/Lieferant/beide filter)
- Create: `src/components/KontakteDetail.tsx` (client — Kopf, Adressen, Ansprechpartner, Konditionen, Historie placeholder, role-reveal, VIES badge)
- Test: `tests/components/kontakte-list.test.tsx`

**Interfaces:**
- Consumes: `listContacts`, `getContact` from `@/kontakte/repository`; actions from `@/app/(shell)/kontakte/actions`; `requireAppAccess`/`getUserAccess` from `@/lib/groups`.

- [ ] **Step 1: Write the failing component test** (jsdom; mock `next/navigation`)

`tests/components/kontakte-list.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const rows = [
  { id: 'a', number: 'K-0001', name: 'Spielwaren Müller GmbH', isCustomer: true, isSupplier: false, status: 'aktiv' },
  { id: 'b', number: 'K-0002', name: 'Guangzhou ToyCraft Ltd.', isCustomer: false, isSupplier: true, status: 'aktiv' },
];

describe('KontakteList', () => {
  it('filters to suppliers only', async () => {
    const { KontakteList } = await import('@/components/KontakteList');
    render(<KontakteList contacts={rows as never} />);
    expect(screen.getByText('Spielwaren Müller GmbH')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lieferant' }));
    expect(screen.queryByText('Spielwaren Müller GmbH')).toBeNull();
    expect(screen.getByText('Guangzhou ToyCraft Ltd.')).toBeTruthy();
  });

  it('searches by name', async () => {
    const { KontakteList } = await import('@/components/KontakteList');
    render(<KontakteList contacts={rows as never} />);
    fireEvent.change(screen.getByPlaceholderText('Suchen …'), { target: { value: 'guang' } });
    expect(screen.queryByText('Spielwaren Müller GmbH')).toBeNull();
    expect(screen.getByText('Guangzhou ToyCraft Ltd.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/components/kontakte-list.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `src/components/KontakteList.tsx`**
```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { Contact } from '@/kontakte/types';

type RoleFilter = '' | 'kunde' | 'lieferant';

export function KontakteList({ contacts }: { contacts: Contact[] }) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState<RoleFilter>('');

  const rows = contacts.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (role === 'kunde' && !c.isCustomer) return false;
    if (role === 'lieferant' && !c.isSupplier) return false;
    return true;
  });

  const chip = (v: RoleFilter, label: string) => (
    <button
      onClick={() => setRole(v)}
      className={`rounded px-3 py-1 text-sm ${role === v
        ? 'bg-accent text-white'
        : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'}`}
    >{label}</button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen …"
          className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100"
        />
        {chip('', 'Alle')}{chip('kunde', 'Kunde')}{chip('lieferant', 'Lieferant')}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="anno text-left text-neutral-500">
            <th className="py-2">Name</th><th>Rolle</th><th>Ort</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2">
                <Link href={`/kontakte/${c.id}`} className="text-brand hover:text-brand-dark">{c.name}</Link>
              </td>
              <td>{[c.isCustomer && 'Kunde', c.isSupplier && 'Lieferant'].filter(Boolean).join(' + ') || '—'}</td>
              <td className="text-neutral-500">—</td>
              <td>{c.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```
> Note: "Ort" comes from the default address in Phase 2 wiring; Phase 1 renders `—` (matches the spec's minimal list). If the reviewer wants the default city now, join it in `listContacts`; left out to keep the list query flat.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/components/kontakte-list.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement the layout + sidebar** (copy BrickPM; swap key/title)

`src/components/KontakteSidebar.tsx`:
```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { slug: '', label: 'Liste' },
  { slug: 'einstellungen/verbindungen', label: 'Verbindungen' },
];

export function KontakteSidebar() {
  const pathname = usePathname();
  return (
    <nav className="w-56 shrink-0 border-r border-neutral-200 p-3 dark:border-neutral-800">
      <div className="anno px-2 pb-2 text-neutral-500">Kontakte</div>
      {ITEMS.map((it) => {
        const href = it.slug === '' ? '/kontakte' : `/kontakte/${it.slug}`;
        const active = pathname === href;
        return (
          <Link key={href} href={href}
            className={`block rounded px-2 py-1.5 text-sm ${active
              ? 'bg-accent font-medium text-white'
              : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800'}`}
          >{it.label}</Link>
        );
      })}
    </nav>
  );
}
```

`src/app/(shell)/kontakte/layout.tsx` (mirror `brickpm/layout.tsx` exactly — `requireAppAccess('kontakte')`, redirect `/` on no access, `UserMenu`, title "Kontakte", render `<KontakteSidebar/>`; keep `export const dynamic = 'force-dynamic'`). Use the same header/`UserMenu` markup as BrickPM.

- [ ] **Step 6: Implement the list page**

`src/app/(shell)/kontakte/page.tsx`:
```tsx
import { listContacts } from '@/kontakte/repository';
import { KontakteList } from '@/components/KontakteList';

export const dynamic = 'force-dynamic';

export default async function KontaktePage() {
  const contacts = await listContacts();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Kontakte</h2>
      <KontakteList contacts={contacts} />
    </div>
  );
}
```

- [ ] **Step 7: Implement `src/components/KontakteDetail.tsx`** — single screen with:
  - **Kopf:** name, `number`, role chips (checkboxes *Kunde*/*Lieferant* driving `isCustomer`/`isSupplier`); toggling *Lieferant* reveals supplier-only fields client-side (`{isSupplier && (…)}`).
  - **Block 1 Adressen:** rows over `addresses`, inline fields (shared input class), `saveAddressAction`/`removeAddressAction` via `useTransition` + `router.refresh()`.
  - **Block 2 Ansprechpartner:** same pattern over `persons`.
  - **Block 3 Konditionen:** `paymentTerms`, `priceListId` (`<select>` of price lists passed in), `currency`.
  - **Block 4 Historie:** static placeholder `<p className="text-sm text-neutral-500">Historie ab Phase 2.</p>`.
  - **VIES badge:** on blur of the `vatId` field call `checkVatAction(vat)` in a transition; show ✓ (green) with returned name, or ⚠ with the error. Never blocks save.
  Save via `updateContactAction(id, input)`.

  And `src/app/(shell)/kontakte/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { getContact } from '@/kontakte/repository';
import { KontakteDetail } from '@/components/KontakteDetail';

export const dynamic = 'force-dynamic';

export default async function KontaktDetailPage({ params }: { params: { id: string } }) {
  const contact = await getContact(params.id);
  if (!contact) notFound();
  return <KontakteDetail contact={contact} />;
}
```

- [ ] **Step 8: Run the full suite to confirm nothing regressed**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**
```bash
git add "src/app/(shell)/kontakte" src/components/KontakteSidebar.tsx src/components/KontakteList.tsx src/components/KontakteDetail.tsx tests/components/kontakte-list.test.tsx
git commit -m "feat(kontakte): shell UI — list, detail, VIES badge, role reveal"
```

---

## Task 8: Kontakte seed

**Files:**
- Create: `src/kontakte/seed-data.ts`
- Create: `scripts/seed-kontakte.ts`
- Modify: `package.json` (add `"seed-kontakte"`)

**Interfaces:**
- Consumes: `pool` from `../src/lib/db`.
- Produces: `seedKontakte(): Promise<void>` and a default price-list set. DoD coverage: Spielwaren Müller GmbH (Kunde, 21 Tage), ToyWorld / Kinderparadies eG / Spielzeugmarkt Nord (weitere Kunden), Guangzhou ToyCraft Ltd. (nur Lieferant, USD, kein vat_id), **≥1 Kontakt Kunde+Lieferant**; price lists Handel / Endkunde / Key Account.

- [ ] **Step 1: Implement `src/kontakte/seed-data.ts`** — export `PRICE_LISTS` (Handel default, Endkunde, Key Account) and `CONTACTS` arrays covering the DoD, including one contact with `isCustomer:true, isSupplier:true`, and Guangzhou with `currency:'USD', vatId:null, isSupplier:true, isCustomer:false`.

- [ ] **Step 2: Implement `scripts/seed-kontakte.ts`** (mirror `scripts/seed-brickpm.ts`: exportable fn + direct-invocation guard, `INSERT … ON CONFLICT DO UPDATE`). Insert price lists first (stable UUIDs so Katalog seed can reference them), then contacts assigning `price_list_id`.
```ts
import { pool } from '../src/lib/db';
import { PRICE_LISTS, CONTACTS } from '../src/kontakte/seed-data';

export async function seedKontakte(): Promise<void> {
  for (const pl of PRICE_LISTS) {
    await pool.query(
      `INSERT INTO price_lists (id, name, currency, is_default) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET name=excluded.name, currency=excluded.currency, is_default=excluded.is_default`,
      [pl.id, pl.name, pl.currency, pl.isDefault]);
  }
  for (const c of CONTACTS) {
    await pool.query(
      `INSERT INTO contacts (id, number, name, legal_form, is_customer, is_supplier, vat_id, tax_country,
         payment_terms, price_list_id, currency, language, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET name=excluded.name, is_customer=excluded.is_customer,
         is_supplier=excluded.is_supplier, payment_terms=excluded.payment_terms`,
      [c.id, c.number, c.name, c.legalForm, c.isCustomer, c.isSupplier, c.vatId, c.taxCountry,
       c.paymentTerms, c.priceListId, c.currency, c.language, c.status, c.notes]);
  }
  console.log('Kontakte seed applied.');
}

if (process.argv[1] && process.argv[1].endsWith('seed-kontakte.ts')) {
  seedKontakte().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 3: Wire the script** — add to `package.json` `scripts`: `"seed-kontakte": "tsx scripts/seed-kontakte.ts",`

- [ ] **Step 4: Run it**

Run: `npm run seed-kontakte`
Expected: prints `Kontakte seed applied.`; re-running is idempotent.

- [ ] **Step 5: Commit**
```bash
git add src/kontakte/seed-data.ts scripts/seed-kontakte.ts package.json
git commit -m "feat(kontakte): DoD seed set + price lists"
```

---

## Task 9: Katalog schema

**Files:**
- Modify: `db/schema.sql` (add `products`, `product_variants`, `prices`, `product_bundles`, `product_documents`)
- Modify: `db/rls.sql`

**Interfaces:**
- Produces: the five Katalog tables. `products.default_supplier_id` FKs `contacts(id)`; `prices.price_list_id` FKs `price_lists(id)`.

- [ ] **Step 1: Add tables to `db/schema.sql`**
```sql
-- ── Katalog ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID REFERENCES tenants(id),
  name               TEXT NOT NULL,
  description        TEXT,
  lifecycle_status   TEXT NOT NULL DEFAULT 'konzept'
                       CHECK (lifecycle_status IN ('konzept','freigegeben','aktiv','auslaufend','eingestellt')),
  category           TEXT,
  brand              TEXT,
  default_supplier_id UUID REFERENCES contacts(id),
  image_url          TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_variants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenants(id),
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku               TEXT UNIQUE NOT NULL,
  gtin              TEXT,
  attributes        JSONB,
  purchase_price    NUMERIC(12,2),
  weight_g          INT,
  reorder_point     INT NOT NULL DEFAULT 0,
  customs_tariff_no TEXT,
  status            TEXT NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv','inaktiv'))
);

CREATE TABLE IF NOT EXISTS prices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id),
  variant_id    UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  price_list_id UUID NOT NULL REFERENCES price_lists(id),
  min_qty       INT NOT NULL DEFAULT 1,
  amount        NUMERIC(12,2),
  valid_from    DATE,
  UNIQUE (variant_id, price_list_id, min_qty)
);

CREATE TABLE IF NOT EXISTS product_bundles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID REFERENCES tenants(id),
  bundle_variant_id   UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  component_variant_id UUID NOT NULL REFERENCES product_variants(id),
  quantity            INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS product_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  file_url    TEXT,
  expires_at  DATE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Enable RLS in `db/rls.sql`**
```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_documents ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 3: Apply and verify**

Run: `npm run migrate`
Expected: `Schema applied.` / `RLS policies applied.`

- [ ] **Step 4: Commit**
```bash
git add db/schema.sql db/rls.sql
git commit -m "feat(katalog): products, variants, prices, bundles, documents schema"
```

---

## Task 10: Katalog Lifecycle-Weiche (pure logic)

**Files:**
- Create: `src/katalog/lifecycle.ts`
- Test: `tests/katalog/lifecycle.test.ts`

**Interfaces:**
- Produces: `type LifecycleStatus`, `interface LifecycleFlags { verkaufbar; bestellbar; shopSichtbar }`, `lifecycle(status): LifecycleFlags`, `LIFECYCLE_STATUSES: LifecycleStatus[]`.

- [ ] **Step 1: Write the failing test** (encodes the confirmed Option-A table)

`tests/katalog/lifecycle.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { lifecycle } from '@/katalog/lifecycle';

describe('lifecycle-Weiche', () => {
  it('konzept: nothing', () => expect(lifecycle('konzept')).toEqual({ verkaufbar: false, bestellbar: false, shopSichtbar: false }));
  it('freigegeben: orderable only', () => expect(lifecycle('freigegeben')).toEqual({ verkaufbar: false, bestellbar: true, shopSichtbar: false }));
  it('aktiv: all true', () => expect(lifecycle('aktiv')).toEqual({ verkaufbar: true, bestellbar: true, shopSichtbar: true }));
  it('auslaufend: sell + shop, no reorder', () => expect(lifecycle('auslaufend')).toEqual({ verkaufbar: true, bestellbar: false, shopSichtbar: true }));
  it('eingestellt: nothing', () => expect(lifecycle('eingestellt')).toEqual({ verkaufbar: false, bestellbar: false, shopSichtbar: false }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/katalog/lifecycle.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`src/katalog/lifecycle.ts`:
```ts
export type LifecycleStatus = 'konzept' | 'freigegeben' | 'aktiv' | 'auslaufend' | 'eingestellt';

export interface LifecycleFlags {
  verkaufbar: boolean;
  bestellbar: boolean;
  shopSichtbar: boolean;
}

const TABLE: Record<LifecycleStatus, LifecycleFlags> = {
  konzept:     { verkaufbar: false, bestellbar: false, shopSichtbar: false },
  freigegeben: { verkaufbar: false, bestellbar: true,  shopSichtbar: false },
  aktiv:       { verkaufbar: true,  bestellbar: true,  shopSichtbar: true  },
  auslaufend:  { verkaufbar: true,  bestellbar: false, shopSichtbar: true  },
  eingestellt: { verkaufbar: false, bestellbar: false, shopSichtbar: false },
};

export const LIFECYCLE_STATUSES = Object.keys(TABLE) as LifecycleStatus[];

/** Maps a product lifecycle status to what it enables (Weiche). */
export function lifecycle(status: LifecycleStatus): LifecycleFlags {
  return TABLE[status];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/katalog/lifecycle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/katalog/lifecycle.ts tests/katalog/lifecycle.test.ts
git commit -m "feat(katalog): lifecycle-Weiche (Freigabe=orderable)"
```

---

## Task 11: Katalog margin (pure logic)

**Files:**
- Create: `src/katalog/margin.ts`
- Test: `tests/katalog/margin.test.ts`

**Interfaces:**
- Produces: `interface Margin { absolute: number; pct: number }`, `margin(ek: number, vk: number): Margin` (pct = Aufschlag-neutral Handelsspanne on VK; `vk===0 ⇒ pct 0`).

- [ ] **Step 1: Write the failing test**

`tests/katalog/margin.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { margin } from '@/katalog/margin';

describe('margin', () => {
  it('computes absolute and percent margin on VK', () => {
    expect(margin(10, 25)).toEqual({ absolute: 15, pct: 60 });
  });
  it('guards VK=0', () => {
    expect(margin(10, 0)).toEqual({ absolute: -10, pct: 0 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/katalog/margin.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/katalog/margin.ts`:
```ts
export interface Margin { absolute: number; pct: number }

/** Handelsspanne: absolute margin VK−EK and its share of VK (0 when VK is 0). */
export function margin(ek: number, vk: number): Margin {
  const absolute = vk - ek;
  const pct = vk === 0 ? 0 : (absolute / vk) * 100;
  return { absolute, pct };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/katalog/margin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/katalog/margin.ts tests/katalog/margin.test.ts
git commit -m "feat(katalog): EK→Marge computation"
```

---

## Task 12: Katalog types + repository

**Files:**
- Create: `src/katalog/types.ts`
- Create: `src/katalog/repository.ts`
- Test: `tests/katalog/repository.test.ts`

**Interfaces:**
- Consumes: `pool` from `@/lib/db`; `LifecycleStatus` from `@/katalog/lifecycle`.
- Produces (types):
```ts
import type { LifecycleStatus } from './lifecycle';
export interface Product {
  id: string; tenantId: string | null; name: string; description: string | null;
  lifecycleStatus: LifecycleStatus; category: string | null; brand: string | null;
  defaultSupplierId: string | null; imageUrl: string | null; createdAt: string;
}
export interface Variant {
  id: string; productId: string; sku: string; gtin: string | null;
  attributes: Record<string, unknown> | null; purchasePrice: number | null;
  weightG: number | null; reorderPoint: number; customsTariffNo: string | null;
  status: 'aktiv' | 'inaktiv';
}
export interface Price {
  id: string; variantId: string; priceListId: string; minQty: number;
  amount: number | null; validFrom: string | null;
}
export interface BundleComponent { id: string; bundleVariantId: string; componentVariantId: string; quantity: number }
export interface ProductDocument {
  id: string; productId: string; type: string; fileUrl: string | null;
  expiresAt: string | null; uploadedAt: string;
}
export interface ProductListItem extends Product { variantCount: number; minPurchasePrice: number | null }
export interface ProductDetail extends Product {
  variants: Variant[]; prices: Price[]; bundle: BundleComponent[]; documents: ProductDocument[];
}
export interface ProductInput {
  name: string; description?: string | null; lifecycleStatus: LifecycleStatus;
  category?: string | null; brand?: string | null; defaultSupplierId?: string | null; imageUrl?: string | null;
}
export interface VariantInput {
  productId: string; sku: string; gtin?: string | null; attributes?: Record<string, unknown> | null;
  purchasePrice?: number | null; weightG?: number | null; reorderPoint: number;
  customsTariffNo?: string | null; status: 'aktiv' | 'inaktiv';
}
```
- Produces (functions): `listProducts()` (→ `ProductListItem[]` with `variantCount`, `minPurchasePrice`), `getProduct(id)` (→ `ProductDetail`), `createProduct`, `updateProduct`, `setLifecycleStatus(id, status)`, `upsertVariant`, `deleteVariant`, `upsertPrice`, `deletePrice`, `setProductImage(id, url)`, `addDocument`, `deleteDocument`, `listPriceLists()`.

- [ ] **Step 1: Write the failing test**

`tests/katalog/repository.test.ts`:
```ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { createProduct, getProduct, listProducts, setLifecycleStatus, upsertVariant } from '@/katalog/repository';

const ids: string[] = [];
afterAll(async () => { for (const id of ids) await pool.query('DELETE FROM products WHERE id = $1', [id]); });

describe('katalog repository', () => {
  it('creates a product, adds a variant, and reads detail', async () => {
    const p = await createProduct({ name: 'Testprodukt', lifecycleStatus: 'konzept' });
    ids.push(p.id);
    await upsertVariant({ productId: p.id, sku: `T-${p.id.slice(0, 8)}`, reorderPoint: 5, status: 'aktiv', purchasePrice: 4.5 });
    const detail = await getProduct(p.id);
    expect(detail?.variants).toHaveLength(1);
    expect(detail?.variants[0].purchasePrice).toBe('4.50'); // pg NUMERIC → string
  });

  it('changes lifecycle status', async () => {
    const p = await createProduct({ name: 'Statusprodukt', lifecycleStatus: 'konzept' });
    ids.push(p.id);
    await setLifecycleStatus(p.id, 'aktiv');
    expect((await getProduct(p.id))?.lifecycleStatus).toBe('aktiv');
  });

  it('list carries variant count', async () => {
    const list = await listProducts();
    expect(list.length).toBeGreaterThan(0);
    expect(typeof list[0].variantCount).toBe('number');
  });
});
```
> Note the NUMERIC-as-string assertion: node-pg returns `NUMERIC` as a JS string. Keep monetary values as strings end-to-end (matches BrickPM `uvp/price/cost`) and format in the UI. `variantCount` is cast `::int`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/katalog/repository.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `src/katalog/types.ts`** — the interface block above.

- [ ] **Step 4: Implement `src/katalog/repository.ts`** — snake→camel maps, `valid_from::text`, `created_at::text`, `uploaded_at::text`, `expires_at::text`. Representative core (follow this shape for every writer):
```ts
import { pool } from '@/lib/db';
import type {
  BundleComponent, Price, Product, ProductDetail, ProductDocument, ProductInput,
  ProductListItem, Variant, VariantInput,
} from './types';
import type { LifecycleStatus } from './lifecycle';

const P_COLS = `id, tenant_id, name, description, lifecycle_status, category, brand,
  default_supplier_id, image_url, created_at::text AS created_at`;

const mapProduct = (x: any): Product => ({
  id: x.id, tenantId: x.tenant_id, name: x.name, description: x.description,
  lifecycleStatus: x.lifecycle_status, category: x.category, brand: x.brand,
  defaultSupplierId: x.default_supplier_id, imageUrl: x.image_url, createdAt: x.created_at,
});
const mapVariant = (x: any): Variant => ({
  id: x.id, productId: x.product_id, sku: x.sku, gtin: x.gtin, attributes: x.attributes,
  purchasePrice: x.purchase_price, weightG: x.weight_g, reorderPoint: x.reorder_point,
  customsTariffNo: x.customs_tariff_no, status: x.status,
});
const mapPrice = (x: any): Price => ({
  id: x.id, variantId: x.variant_id, priceListId: x.price_list_id,
  minQty: x.min_qty, amount: x.amount, validFrom: x.valid_from,
});

export async function listProducts(): Promise<ProductListItem[]> {
  const r = await pool.query(
    `SELECT ${P_COLS},
       (SELECT count(*)::int FROM product_variants v WHERE v.product_id = p.id) AS variant_count,
       (SELECT min(v.purchase_price) FROM product_variants v WHERE v.product_id = p.id) AS min_purchase_price
     FROM products p ORDER BY name`);
  return r.rows.map((x) => ({ ...mapProduct(x), variantCount: x.variant_count, minPurchasePrice: x.min_purchase_price }));
}

export async function getProduct(id: string): Promise<ProductDetail | null> {
  const p = await pool.query(`SELECT ${P_COLS} FROM products p WHERE id = $1`, [id]);
  if (p.rows.length === 0) return null;
  const variants = await pool.query(
    `SELECT id, product_id, sku, gtin, attributes, purchase_price, weight_g, reorder_point,
       customs_tariff_no, status FROM product_variants WHERE product_id = $1 ORDER BY sku`, [id]);
  const varIds = variants.rows.map((v) => v.id);
  const prices = varIds.length
    ? await pool.query(
        `SELECT id, variant_id, price_list_id, min_qty, amount, valid_from::text AS valid_from
           FROM prices WHERE variant_id = ANY($1) ORDER BY price_list_id, min_qty`, [varIds])
    : { rows: [] as any[] };
  const bundle = varIds.length
    ? await pool.query(
        `SELECT id, bundle_variant_id, component_variant_id, quantity
           FROM product_bundles WHERE bundle_variant_id = ANY($1)`, [varIds])
    : { rows: [] as any[] };
  const docs = await pool.query(
    `SELECT id, product_id, type, file_url, expires_at::text AS expires_at, uploaded_at::text AS uploaded_at
       FROM product_documents WHERE product_id = $1 ORDER BY uploaded_at DESC`, [id]);
  return {
    ...mapProduct(p.rows[0]),
    variants: variants.rows.map(mapVariant),
    prices: prices.rows.map(mapPrice),
    bundle: bundle.rows.map((x: any): BundleComponent => ({
      id: x.id, bundleVariantId: x.bundle_variant_id, componentVariantId: x.component_variant_id, quantity: x.quantity })),
    documents: docs.rows.map((x: any): ProductDocument => ({
      id: x.id, productId: x.product_id, type: x.type, fileUrl: x.file_url,
      expiresAt: x.expires_at, uploadedAt: x.uploaded_at })),
  };
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const r = await pool.query(
    `INSERT INTO products (name, description, lifecycle_status, category, brand, default_supplier_id, image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${P_COLS}`,
    [input.name, input.description ?? null, input.lifecycleStatus, input.category ?? null,
     input.brand ?? null, input.defaultSupplierId ?? null, input.imageUrl ?? null]);
  return mapProduct(r.rows[0]);
}

export async function updateProduct(id: string, input: ProductInput): Promise<void> {
  await pool.query(
    `UPDATE products SET name=$2, description=$3, lifecycle_status=$4, category=$5, brand=$6,
       default_supplier_id=$7, image_url=$8 WHERE id=$1`,
    [id, input.name, input.description ?? null, input.lifecycleStatus, input.category ?? null,
     input.brand ?? null, input.defaultSupplierId ?? null, input.imageUrl ?? null]);
}

export async function setLifecycleStatus(id: string, status: LifecycleStatus): Promise<void> {
  await pool.query('UPDATE products SET lifecycle_status = $2 WHERE id = $1', [id, status]);
}
export async function setProductImage(id: string, url: string): Promise<void> {
  await pool.query('UPDATE products SET image_url = $2 WHERE id = $1', [id, url]);
}

export async function upsertVariant(v: VariantInput & { id?: string }): Promise<void> {
  if (v.id) {
    await pool.query(
      `UPDATE product_variants SET sku=$2, gtin=$3, attributes=$4, purchase_price=$5, weight_g=$6,
         reorder_point=$7, customs_tariff_no=$8, status=$9 WHERE id=$1`,
      [v.id, v.sku, v.gtin ?? null, v.attributes ?? null, v.purchasePrice ?? null, v.weightG ?? null,
       v.reorderPoint, v.customsTariffNo ?? null, v.status]);
  } else {
    await pool.query(
      `INSERT INTO product_variants (product_id, sku, gtin, attributes, purchase_price, weight_g,
         reorder_point, customs_tariff_no, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [v.productId, v.sku, v.gtin ?? null, v.attributes ?? null, v.purchasePrice ?? null, v.weightG ?? null,
       v.reorderPoint, v.customsTariffNo ?? null, v.status]);
  }
}
export async function deleteVariant(id: string): Promise<void> {
  await pool.query('DELETE FROM product_variants WHERE id = $1', [id]);
}

export async function upsertPrice(p: Omit<Price, 'id'> & { id?: string }): Promise<void> {
  await pool.query(
    `INSERT INTO prices (variant_id, price_list_id, min_qty, amount, valid_from)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (variant_id, price_list_id, min_qty) DO UPDATE SET amount=excluded.amount, valid_from=excluded.valid_from`,
    [p.variantId, p.priceListId, p.minQty, p.amount, p.validFrom]);
}
export async function deletePrice(id: string): Promise<void> {
  await pool.query('DELETE FROM prices WHERE id = $1', [id]);
}

export async function addDocument(d: Omit<ProductDocument, 'id' | 'uploadedAt'>): Promise<void> {
  await pool.query(
    `INSERT INTO product_documents (product_id, type, file_url, expires_at) VALUES ($1,$2,$3,$4)`,
    [d.productId, d.type, d.fileUrl, d.expiresAt]);
}
export async function deleteDocument(id: string): Promise<void> {
  await pool.query('DELETE FROM product_documents WHERE id = $1', [id]);
}

export async function listPriceLists(): Promise<{ id: string; name: string; currency: string }[]> {
  const r = await pool.query('SELECT id, name, currency FROM price_lists ORDER BY name');
  return r.rows.map((x) => ({ id: x.id, name: x.name, currency: x.currency }));
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/katalog/repository.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add src/katalog/types.ts src/katalog/repository.ts tests/katalog/repository.test.ts
git commit -m "feat(katalog): types + repository"
```

---

## Task 13: Supabase Storage helper (verify-then-implement)

**Files:**
- Create: `src/lib/storage.ts`
- Test: `tests/lib/storage.test.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`.
- Produces: `isStorageAvailable(): Promise<boolean>`, `uploadFile(path: string, file: File): Promise<string | null>` (null ⇒ caller degrades to URL-paste). Bucket `katalog`.

- [ ] **Step 1: Verify Storage first (spec §F requirement)** — before writing code, confirm the self-hosted Supabase stack (`infra/supabase/`) exposes Storage and read `src/lib/supabase/server.ts` for the exact `createClient` signature/import. If Storage is not enabled on the host, the helper still ships but `uploadFile` will return `null` and the UI uses the URL-paste fallback (no blocker). Record the finding in the commit message.

Run: `grep -ri storage infra/supabase/ | head` and read `src/lib/supabase/server.ts`.

- [ ] **Step 2: Write the failing test** (mock the supabase client)

`tests/lib/storage.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';

const from = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ storage: { from, getBucket: vi.fn(async () => ({ error: null })) } }),
}));

import { uploadFile } from '@/lib/storage';

afterEach(() => vi.clearAllMocks());

describe('uploadFile', () => {
  it('returns the public URL on success', async () => {
    from.mockReturnValue({
      upload: vi.fn(async () => ({ error: null })),
      getPublicUrl: () => ({ data: { publicUrl: 'https://s/katalog/x.png' } }),
    });
    const url = await uploadFile('katalog/x.png', new File(['x'], 'x.png'));
    expect(url).toBe('https://s/katalog/x.png');
  });

  it('returns null when the upload errors (caller falls back to URL paste)', async () => {
    from.mockReturnValue({
      upload: vi.fn(async () => ({ error: { message: 'no bucket' } })),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
    });
    expect(await uploadFile('katalog/x.png', new File(['x'], 'x.png'))).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/lib/storage.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 4: Implement `src/lib/storage.ts`**
```ts
import { createClient } from '@/lib/supabase/server';

const BUCKET = 'katalog';

/** True if the Storage bucket is reachable; UI uses this to decide upload vs URL-paste. */
export async function isStorageAvailable(): Promise<boolean> {
  try {
    const { error } = await createClient().storage.getBucket(BUCKET);
    return !error;
  } catch {
    return false;
  }
}

/** Uploads a file and returns its public URL, or null so the caller can fall back to URL paste. */
export async function uploadFile(path: string, file: File): Promise<string | null> {
  try {
    const supabase = createClient();
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl || null;
  } catch {
    return null;
  }
}
```
> If Step 1 shows `createClient` is async in this repo, add `await` before `createClient()` here and in the test mock accordingly.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/lib/storage.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add src/lib/storage.ts tests/lib/storage.test.ts
git commit -m "feat(storage): Supabase Storage helper with URL-paste fallback"
```

---

## Task 14: Katalog server actions

**Files:**
- Create: `src/app/(shell)/katalog/actions.ts`
- Test: `tests/app/katalog-actions.test.ts`

**Interfaces:**
- Consumes: repository writers from `@/katalog/repository`; `uploadFile` from `@/lib/storage`; `requireAppAccess`.
- Produces: `createProductAction`, `updateProductAction`, `changeLifecycleAction(id, status)`, `saveVariantAction`, `removeVariantAction`, `savePriceAction`, `removePriceAction`, `addDocumentAction`, `removeDocumentAction`, `uploadProductImageAction(id, formData)`, `uploadDocumentFileAction(formData)`. Each gates `requireAppAccess('katalog','edit')` + `revalidatePath`.

- [ ] **Step 1: Write the failing test** (mirror Task 6's pattern; assert gate + repo call + revalidate for `changeLifecycleAction` and one upload action)

`tests/app/katalog-actions.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/groups', () => ({ requireAppAccess: vi.fn() }));
vi.mock('@/katalog/repository', () => ({
  createProduct: vi.fn(async () => ({ id: 'p1' })), updateProduct: vi.fn(),
  setLifecycleStatus: vi.fn(), setProductImage: vi.fn(),
  upsertVariant: vi.fn(), deleteVariant: vi.fn(), upsertPrice: vi.fn(), deletePrice: vi.fn(),
  addDocument: vi.fn(), deleteDocument: vi.fn(),
}));
vi.mock('@/lib/storage', () => ({ uploadFile: vi.fn(async () => 'https://s/x.png') }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { changeLifecycleAction } from '@/app/(shell)/katalog/actions';
import { requireAppAccess } from '@/lib/groups';
import { setLifecycleStatus } from '@/katalog/repository';
import { revalidatePath } from 'next/cache';

beforeEach(() => vi.clearAllMocks());

describe('katalog actions', () => {
  it('changeLifecycleAction gates, writes, revalidates detail', async () => {
    vi.mocked(requireAppAccess).mockResolvedValue(undefined);
    await changeLifecycleAction('p1', 'aktiv');
    expect(requireAppAccess).toHaveBeenCalledWith('katalog', 'edit');
    expect(setLifecycleStatus).toHaveBeenCalledWith('p1', 'aktiv');
    expect(revalidatePath).toHaveBeenCalledWith('/katalog/p1');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/app/katalog-actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/app/(shell)/katalog/actions.ts`** — all actions listed under **Interfaces**. Representative core:
```ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireAppAccess } from '@/lib/groups';
import { uploadFile } from '@/lib/storage';
import {
  createProduct, updateProduct, setLifecycleStatus, setProductImage,
  upsertVariant, deleteVariant, upsertPrice, deletePrice, addDocument, deleteDocument,
} from '@/katalog/repository';
import type { LifecycleStatus } from '@/katalog/lifecycle';
import type { Price, Product, ProductInput, VariantInput } from '@/katalog/types';

export async function createProductAction(input: ProductInput): Promise<Product> {
  await requireAppAccess('katalog', 'edit');
  const p = await createProduct(input);
  revalidatePath('/katalog');
  return p;
}

export async function changeLifecycleAction(id: string, status: LifecycleStatus): Promise<void> {
  await requireAppAccess('katalog', 'edit');
  await setLifecycleStatus(id, status);
  revalidatePath(`/katalog/${id}`);
}

export async function saveVariantAction(v: VariantInput & { id?: string }): Promise<void> {
  await requireAppAccess('katalog', 'edit');
  await upsertVariant(v);
  revalidatePath(`/katalog/${v.productId}`);
}

export async function savePriceAction(p: Omit<Price, 'id'> & { id?: string }, productId: string): Promise<void> {
  await requireAppAccess('katalog', 'edit');
  await upsertPrice(p);
  revalidatePath(`/katalog/${productId}`);
}

export async function uploadProductImageAction(id: string, formData: FormData): Promise<{ url: string | null }> {
  await requireAppAccess('katalog', 'edit');
  const file = formData.get('file') as File | null;
  const url = file ? await uploadFile(`products/${id}/${file.name}`, file) : null;
  if (url) { await setProductImage(id, url); revalidatePath(`/katalog/${id}`); }
  return { url };
}
```
Add the remaining thin wrappers (`updateProductAction`, `removeVariantAction`, `removePriceAction`, `addDocumentAction`, `removeDocumentAction`, `uploadDocumentFileAction`) following the same gate → repo → `revalidatePath('/katalog/<productId>')` shape. `uploadDocumentFileAction` uses `uploadFile('documents/…')` then `addDocument`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/app/katalog-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add "src/app/(shell)/katalog/actions.ts" tests/app/katalog-actions.test.ts
git commit -m "feat(katalog): server actions incl. uploads + lifecycle change"
```

---

## Task 15: Katalog UI (layout, sidebar, list, detail)

**Files:**
- Create: `src/app/(shell)/katalog/layout.tsx`, `src/app/(shell)/katalog/page.tsx`, `src/app/(shell)/katalog/[id]/page.tsx`
- Create: `src/components/KatalogSidebar.tsx`, `src/components/KatalogList.tsx`, `src/components/KatalogDetail.tsx`, `src/components/VariantTable.tsx`
- Test: `tests/components/variant-table.test.tsx`

**Interfaces:**
- Consumes: `listProducts`, `getProduct`, `listPriceLists` from `@/katalog/repository`; actions from `@/app/(shell)/katalog/actions`; `lifecycle`, `LIFECYCLE_STATUSES` from `@/katalog/lifecycle`; `margin` from `@/katalog/margin`.

- [ ] **Step 1: Write the failing component test** — inline-edit variant table saves on blur when a value changed

`tests/components/variant-table.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const saveVariantAction = vi.fn(async () => {});
vi.mock('@/app/(shell)/katalog/actions', () => ({ saveVariantAction, removeVariantAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const variants = [{ id: 'v1', productId: 'p1', sku: 'SKU-1', gtin: null, attributes: null,
  purchasePrice: '4.50', weightG: null, reorderPoint: 5, customsTariffNo: null, status: 'aktiv' }];

beforeEach(() => vi.clearAllMocks());

describe('VariantTable', () => {
  it('saves an edited SKU on blur', async () => {
    const { VariantTable } = await import('@/components/VariantTable');
    render(<VariantTable productId="p1" variants={variants as never} />);
    const input = screen.getByDisplayValue('SKU-1');
    fireEvent.change(input, { target: { value: 'SKU-2' } });
    fireEvent.blur(input);
    expect(saveVariantAction).toHaveBeenCalled();
    expect(saveVariantAction.mock.calls[0][0]).toMatchObject({ id: 'v1', sku: 'SKU-2' });
  });

  it('does not save when unchanged', async () => {
    const { VariantTable } = await import('@/components/VariantTable');
    render(<VariantTable productId="p1" variants={variants as never} />);
    const input = screen.getByDisplayValue('SKU-1');
    fireEvent.blur(input);
    expect(saveVariantAction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/components/variant-table.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `src/components/VariantTable.tsx`** (inline-edit, no modal — `defaultValue` + `onBlur` guarded by change, `useTransition` + `router.refresh()`)
```tsx
'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveVariantAction, removeVariantAction } from '@/app/(shell)/katalog/actions';
import type { Variant } from '@/katalog/types';

const INPUT = 'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

export function VariantTable({ productId, variants }: { productId: string; variants: Variant[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function save(v: Variant, patch: Partial<Variant>) {
    startTransition(async () => {
      await saveVariantAction({
        id: v.id, productId, sku: v.sku, gtin: v.gtin, attributes: v.attributes,
        purchasePrice: v.purchasePrice, weightG: v.weightG, reorderPoint: v.reorderPoint,
        customsTariffNo: v.customsTariffNo, status: v.status, ...patch,
      } as never);
      router.refresh();
    });
  }

  return (
    <table className="w-full text-sm">
      <thead><tr className="anno text-left text-neutral-500">
        <th className="py-2">SKU</th><th>EK</th><th>Meldebestand</th><th>Zolltarif</th><th></th>
      </tr></thead>
      <tbody>
        {variants.map((v) => (
          <tr key={v.id} className="border-t border-neutral-200 dark:border-neutral-800">
            <td className="py-1"><input className={INPUT} defaultValue={v.sku} disabled={pending}
              onBlur={(e) => e.target.value !== v.sku && save(v, { sku: e.target.value })} /></td>
            <td><input className={INPUT} defaultValue={v.purchasePrice ?? ''} disabled={pending}
              onBlur={(e) => e.target.value !== (v.purchasePrice ?? '') && save(v, { purchasePrice: e.target.value as never })} /></td>
            <td><input className={INPUT} type="number" defaultValue={v.reorderPoint} disabled={pending}
              onBlur={(e) => Number(e.target.value) !== v.reorderPoint && save(v, { reorderPoint: Number(e.target.value) })} /></td>
            <td><input className={INPUT} defaultValue={v.customsTariffNo ?? ''} disabled={pending}
              onBlur={(e) => e.target.value !== (v.customsTariffNo ?? '') && save(v, { customsTariffNo: e.target.value })} /></td>
            <td><button className="text-sm text-neutral-500 hover:text-brand" disabled={pending}
              onClick={() => startTransition(async () => { await removeVariantAction(v.id, productId); router.refresh(); })}>Entfernen</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/components/variant-table.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement sidebar + layout** — `KatalogSidebar.tsx` (Liste + Einstellungen → Verbindungen, `/katalog` base) and `katalog/layout.tsx` (copy BrickPM, `requireAppAccess('katalog')`, title "Katalog"). Same shape as Task 7's Kontakte equivalents.

- [ ] **Step 6: Implement list page + `KatalogList.tsx`** — search + status filter; table Bild · Name · Varianten-Anzahl · Status · EK (min purchase price, formatted). `page.tsx`:
```tsx
import { listProducts } from '@/katalog/repository';
import { KatalogList } from '@/components/KatalogList';

export const dynamic = 'force-dynamic';

export default async function KatalogPage() {
  const products = await listProducts();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Katalog</h2>
      <KatalogList products={products} />
    </div>
  );
}
```
`KatalogList.tsx` mirrors `KontakteList` (search input + status chips over `LIFECYCLE_STATUSES`), rows link to `/katalog/${id}`, EK column shows `minPurchasePrice` (or `—`), status shown as a chip.

- [ ] **Step 7: Implement `KatalogDetail.tsx` + `[id]/page.tsx`** — blocks:
  - **Kopf:** image (upload via `uploadProductImageAction`; if it returns `{url:null}` show the URL-paste input writing `imageUrl` through `updateProductAction`), name, **clickable status chip**: clicking cycles/opens `LIFECYCLE_STATUSES`, calls `changeLifecycleAction`, and shows a one-line effect from `lifecycle(status)` (e.g. "aktiv → verkaufbar, bestellbar, im Shop sichtbar").
  - **Block 1:** description, category, brand, default supplier (`<select>` of suppliers passed from the page via `listContacts().filter(isSupplier)`).
  - **Block 2:** `<VariantTable productId={p.id} variants={p.variants} />` + an "Variante hinzufügen" row calling `saveVariantAction` with no `id`.
  - **Block 3:** compact price matrix Preisliste × Staffel from `listPriceLists()` × `p.prices`, editable via `savePriceAction`.
  - **Block 4:** bundle components — render only when `p.bundle.length > 0`.
  - **Compliance:** documents list (type, expiry, file link) + upload (`uploadDocumentFileAction`) with URL-paste fallback + `expires_at` date field.
  `[id]/page.tsx` mirrors Kontakte's: `getProduct`, `notFound()` guard, also fetch `listPriceLists()` and supplier contacts, pass all to `KatalogDetail`.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**
```bash
git add "src/app/(shell)/katalog" src/components/KatalogSidebar.tsx src/components/KatalogList.tsx src/components/KatalogDetail.tsx src/components/VariantTable.tsx tests/components/variant-table.test.tsx
git commit -m "feat(katalog): shell UI — list, detail, inline variants, price matrix, compliance"
```

---

## Task 16: Katalog seed

**Files:**
- Create: `src/katalog/seed-data.ts`
- Create: `scripts/seed-katalog.ts`
- Modify: `package.json` (add `"seed-katalog"`)

**Interfaces:**
- Consumes: `pool`; price-list + supplier IDs from the Kontakte seed (import the shared constants from `@/kontakte/seed-data` so IDs line up).
- Produces: `seedKatalog(): Promise<void>` covering DoD — „Sternenjäger" (aktiv, Farbvarianten, part of a bundle); one product each in konzept/freigegeben/auslaufend/eingestellt; „Bauklötze Classic", „Weltraum-Buggy"; ≥1 bundle (3er-Pack); prices on Handel/Endkunde/Key Account with ≥1 Staffelpreis; **≥1 variant below its reorder_point**.

- [ ] **Step 1: Implement `src/katalog/seed-data.ts`** — `PRODUCTS`, `VARIANTS` (stable UUIDs; at least one with a low stock story — encode intent via `reorderPoint` high enough that DoD "unter Meldebestand" is demonstrable in UI once stock exists; Phase 1 has no stock table, so mark the intended variant in a comment and give it `reorderPoint` > 0), `PRICES` (incl. a `minQty > 1` Staffel), `BUNDLES` (a 3er-Pack: one `bundle_variant_id` with 3× a component). Reference `PRICE_LISTS`/supplier `CONTACTS` ids from `@/kontakte/seed-data`.

- [ ] **Step 2: Implement `scripts/seed-katalog.ts`** — mirror `seed-kontakte.ts`; insertion order products → variants → prices → bundles → documents; `INSERT … ON CONFLICT (id) DO UPDATE`. Guard for direct invocation.

- [ ] **Step 3: Wire the script** — add `"seed-katalog": "tsx scripts/seed-katalog.ts",` to `package.json`.

- [ ] **Step 4: Run both seeds in order** (Kontakte first — Katalog references its price lists + suppliers)

Run: `npm run seed-kontakte && npm run seed-katalog`
Expected: `Kontakte seed applied.` then `Katalog seed applied.`

- [ ] **Step 5: Commit**
```bash
git add src/katalog/seed-data.ts scripts/seed-katalog.ts package.json
git commit -m "feat(katalog): DoD seed set — Sternenjäger, bundle, staffelpreise"
```

---

## Task 17: Connection stubs (Verbindungen) for both apps

**Files:**
- Create: `src/lib/integrations.ts` (repository for `integration_connections`)
- Create: `src/app/(shell)/kontakte/einstellungen/verbindungen/page.tsx`
- Create: `src/app/(shell)/katalog/einstellungen/verbindungen/page.tsx`
- Create: `src/components/ConnectionStubs.tsx` (client)
- Modify: `src/app/(shell)/kontakte/actions.ts`, `src/app/(shell)/katalog/actions.ts` (add `simulateConnectAction`)
- Modify: `scripts/seed-kontakte.ts` and `scripts/seed-katalog.ts` (seed ≥1 „Verbunden (Demo)" + ≥1 „Nicht verbunden" per app)
- Test: `tests/app/connection-stub.test.ts`

**Interfaces:**
- Produces:
```ts
export interface Connection {
  id: string; app: string; provider: string; label: string;
  status: string; lastSyncedAt: string | null;
}
export function listConnections(app: string): Promise<Connection[]>;
export function simulateConnect(id: string): Promise<void>; // status='verbunden (Demo)', last_synced_at=now()
```
- `simulateConnectAction(id)` in each app's `actions.ts` gates `requireAppAccess('<app>','edit')`, calls `simulateConnect`, `revalidatePath('/<app>/einstellungen/verbindungen')`.

- [ ] **Step 1: Write the failing test**

`tests/app/connection-stub.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/groups', () => ({ requireAppAccess: vi.fn() }));
vi.mock('@/lib/integrations', () => ({ simulateConnect: vi.fn(), listConnections: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { simulateConnectAction } from '@/app/(shell)/kontakte/actions';
import { requireAppAccess } from '@/lib/groups';
import { simulateConnect } from '@/lib/integrations';
import { revalidatePath } from 'next/cache';

beforeEach(() => vi.clearAllMocks());

it('simulateConnectAction gates on edit, connects, revalidates', async () => {
  vi.mocked(requireAppAccess).mockResolvedValue(undefined);
  await simulateConnectAction('x1');
  expect(requireAppAccess).toHaveBeenCalledWith('kontakte', 'edit');
  expect(simulateConnect).toHaveBeenCalledWith('x1');
  expect(revalidatePath).toHaveBeenCalledWith('/kontakte/einstellungen/verbindungen');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/app/connection-stub.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/integrations.ts`**
```ts
import { pool } from '@/lib/db';

export interface Connection {
  id: string; app: string; provider: string; label: string;
  status: string; lastSyncedAt: string | null;
}

export async function listConnections(app: string): Promise<Connection[]> {
  const r = await pool.query(
    `SELECT id, app, provider, label, status, last_synced_at::text AS last_synced_at
       FROM integration_connections WHERE app = $1 ORDER BY label`, [app]);
  return r.rows.map((x) => ({
    id: x.id, app: x.app, provider: x.provider, label: x.label,
    status: x.status, lastSyncedAt: x.last_synced_at,
  }));
}

/** Demo stub — mirrors BrickPM simulateSync: no real API call. */
export async function simulateConnect(id: string): Promise<void> {
  await pool.query(
    `UPDATE integration_connections SET status = 'verbunden (Demo)', last_synced_at = now() WHERE id = $1`, [id]);
}
```

- [ ] **Step 4: Add `simulateConnectAction` to both `actions.ts`** (kontakte shown; katalog identical with `'katalog'` + its path)
```ts
import { simulateConnect } from '@/lib/integrations';

export async function simulateConnectAction(id: string): Promise<void> {
  await requireAppAccess('kontakte', 'edit');
  await simulateConnect(id);
  revalidatePath('/kontakte/einstellungen/verbindungen');
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/app/connection-stub.test.ts`
Expected: PASS.

- [ ] **Step 6: Implement `ConnectionStubs.tsx` + both pages** — card grid over `Connection[]`; each card shows `label`, a status chip, `lastSyncedAt`, and a "Verbinden (Demo)" button → `simulateConnectAction(id)` via `useTransition` + `router.refresh()`. Each `page.tsx` is a server component: `const items = await listConnections('<app>')` → `<ConnectionStubs items={items} onConnect={simulateConnectAction} />` (pass the app's action as a prop, or import per-page).

- [ ] **Step 7: Seed connection rows** — in each seed script insert ≥1 `status='verbunden (Demo)'` with a `last_synced_at` and ≥1 `status='nicht verbunden'` for that app (e.g. kontakte: "DATEV", "HubSpot"; katalog: "Shopware", "Amazon").

- [ ] **Step 8: Re-run seeds + full suite**

Run: `npm run seed-kontakte && npm run seed-katalog && npm test`
Expected: all green; connection rows present.

- [ ] **Step 9: Commit**
```bash
git add src/lib/integrations.ts src/components/ConnectionStubs.tsx "src/app/(shell)/kontakte" "src/app/(shell)/katalog" scripts/seed-kontakte.ts scripts/seed-katalog.ts tests/app/connection-stub.test.ts
git commit -m "feat(bryx): connection stubs (Verbindungen) for kontakte + katalog"
```

---

## Final verification (after all tasks)

- [ ] `npm test` — full suite green.
- [ ] `npm run migrate && npm run seed-kontakte && npm run seed-katalog` — clean, idempotent, DoD data present.
- [ ] Deploy to the VPS (`root@194.164.204.249`, per project CLAUDE.md — never locally) and exercise both apps in a browser: Kontakte list/filter/detail, VIES badge on a real USt-IdNr., role reveal; Katalog list, inline variant edit, clickable lifecycle chip with effect line, price matrix, bundle block, compliance upload (or URL fallback), Verbindungen "Verbinden (Demo)". Verify dark mode + white-label branding still render.

---

## Self-Review notes (author)

- **Spec coverage:** §A tables 1–12 → Tasks 1, 2, 9 (+ `integration_connections`/`external_references` in Task 1); §B registry/access/shell → Tasks 1, 7, 15, 17; §C modules → Tasks 3–6, 10–14; §D behaviours → VIES (4/6/7), lifecycle (10/15), role reveal (7), inline variants (15), connection stubs (17); §E UI → 7, 15; §F uploads → 13 + 14/15; §G seed → 8, 16, 17; tests are first in every task. All covered.
- **Assumption flagged:** Lifecycle table is the confirmed Option A (in Global Constraints). `NUMERIC` monetary values stay strings end-to-end (node-pg behavior) — UI formats them; do not coerce to `number` in repos.
- **Verify-first:** Task 13 Step 1 checks real Storage availability before committing to it (spec §F). If `createClient` is async in this repo, add `await` per the note.
- **Deploy caveat:** project CLAUDE.md forbids local runs — final browser verification is on the VPS only.
