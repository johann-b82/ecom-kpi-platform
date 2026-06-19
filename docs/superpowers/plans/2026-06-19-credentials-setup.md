# Credentials-Setup-Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine `/setup`-Page, über die alle Connector-Credentials gepflegt werden — in der UI maskiert, in der DB AES-256-GCM-verschlüsselt; die sechs Sync-Skripte lesen Credentials künftig nur aus der DB.

**Architecture:** Reine Krypto-/Registry-Schicht (`crypto.ts`, `connector-fields.ts`) → DB-Tresor (`credentials.ts`, neue Tabelle) → API-Routen (`/api/credentials` GET/POST) → Setup-UI (`/setup` + Client-Form) → Sync-Umbau (6 Skripte + GA4-Client lesen via `loadConnectorConfig`). Engine/KPI/Dashboard unverändert.

**Tech Stack:** TypeScript · Node `crypto` (AES-256-GCM, keine Dependency) · `pg` · Next.js App Router · Vitest. Baut auf `feat/kpi-platform-v1` (V1 + 6 Connectoren).

## Global Constraints

- Master-Key: Env `CREDENTIALS_KEY` (32 Byte base64); fehlt/ungültig → klarer Fehler. `DATABASE_URL` + `CREDENTIALS_KEY` bleiben in der Env; alle Connector-Creds liegen verschlüsselt in der DB.
- Krypto: AES-256-GCM, 12-Byte-Zufalls-IV, Speicherformat `iv:tag:ciphertext` (base64). GCM-Integrität: manipulierter Tag → `decrypt` wirft.
- Cred-Quelle der Syncs: **nur DB** (`getCredentials`/`loadConnectorConfig`), nicht `process.env`. Fehlt ein Pflichtfeld → Fehler mit Verweis auf `/setup`.
- Maskierung: secret-Felder `type="password"`; gesetzte Secrets zeigen nur „•••••••• (gesetzt am …)"; Secret-Klartext verlässt den Server **nie** über `GET`.
- `POST` mit leerem Feldwert = unverändert (überschreibt kein Secret); `null` = löschen.
- GA4-Sonderfall: Feld `GA4_SERVICE_ACCOUNT_JSON` (Key-JSON-Inhalt) → `Ga4Client.fromCredentials(propertyId, parsedJson)` (`new GoogleAuth({ credentials, scopes })`); ersetzt den Datei-Pfad.
- Additive Migration (`connector_credentials`), keine neue Dependency, kein Scheduler, keine Auth auf `/setup` (V1-konsistent).
- Connectoren + Felder verbindlich laut Feld-Registry (Task 1).

---

## File Structure

```
src/lib/crypto.ts            # encrypt/decrypt (AES-256-GCM)
src/lib/connector-fields.ts  # CONNECTOR_FIELDS Registry + Connector type
src/lib/credentials.ts       # set/get/getOne/delete/listStatus/loadConnectorConfig (DB)
db/schema.sql                # + connector_credentials (Modify)
src/app/api/credentials/route.ts   # GET (Status, non-secret-Werte) + POST (set/delete)
src/app/setup/page.tsx       # Server-Component (Status laden, Form rendern)
src/components/CredentialsForm.tsx # 'use client' Formular (Maskierung, Save/Delete)
src/app/page.tsx             # Header-Link "⚙ Setup" (Modify)
scripts/sync-*.ts            # 6 Skripte: process.env → loadConnectorConfig (Modify)
src/connectors/ga4/client.ts # + static fromCredentials (Modify)
.env.example                 # + CREDENTIALS_KEY (Modify)
tests/lib/crypto.test.ts, tests/lib/credentials.test.ts, tests/app/credentials-route.test.ts, tests/lib/load-config.test.ts
```

---

### Task 1: Krypto-Modul & Feld-Registry (rein)

**Files:**
- Create: `src/lib/crypto.ts`, `src/lib/connector-fields.ts`
- Test: `tests/lib/crypto.test.ts`

**Interfaces:**
- Produces: `encrypt(plain: string): string`, `decrypt(blob: string): string`; `type Connector`, `interface FieldDef { field; label; secret; optional }`, `const CONNECTOR_FIELDS: Record<Connector, FieldDef[]>`, `const CONNECTORS: Connector[]`.

- [ ] **Step 1: Failing crypto test**

`tests/lib/crypto.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { encrypt, decrypt } from '@/lib/crypto';

const KEY = Buffer.alloc(32, 7).toString('base64');
beforeEach(() => { process.env.CREDENTIALS_KEY = KEY; });

describe('crypto (AES-256-GCM)', () => {
  it('round-trips a value', () => {
    expect(decrypt(encrypt('s3cret-value'))).toBe('s3cret-value');
  });
  it('produces different ciphertext each call (random IV)', () => {
    expect(encrypt('x')).not.toBe(encrypt('x'));
  });
  it('throws on tampered auth tag', () => {
    const [iv, , data] = encrypt('hello').split(':');
    const badTag = Buffer.alloc(16, 0).toString('base64');
    expect(() => decrypt(`${iv}:${badTag}:${data}`)).toThrow();
  });
  it('throws when CREDENTIALS_KEY is missing', () => {
    delete process.env.CREDENTIALS_KEY;
    expect(() => encrypt('x')).toThrow(/CREDENTIALS_KEY/);
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/lib/crypto.test.ts`
Expected: FAIL — `@/lib/crypto` nicht gefunden.

- [ ] **Step 3: Krypto implementieren**

`src/lib/crypto.ts`:
```ts
import crypto from 'node:crypto';

function key(): Buffer {
  const raw = process.env.CREDENTIALS_KEY;
  if (!raw) throw new Error('CREDENTIALS_KEY is not set (32-byte base64 required).');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('CREDENTIALS_KEY must decode to exactly 32 bytes.');
  return buf;
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

export function decrypt(blob: string): string {
  const [ivB64, tagB64, dataB64] = blob.split(':');
  if (!ivB64 || !tagB64 || dataB64 === undefined) throw new Error('Invalid ciphertext format.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 4: Test grün**

Run: `npm test -- tests/lib/crypto.test.ts`
Expected: PASS (4 Tests).

- [ ] **Step 5: Feld-Registry anlegen**

`src/lib/connector-fields.ts`:
```ts
export type Connector = 'shopware' | 'ga4' | 'klaviyo' | 'meta' | 'tiktok' | 'google';

export interface FieldDef {
  field: string;
  label: string;
  secret: boolean;
  optional: boolean;
}

export const CONNECTOR_FIELDS: Record<Connector, FieldDef[]> = {
  shopware: [
    { field: 'SHOPWARE_API_URL', label: 'API URL', secret: false, optional: false },
    { field: 'SHOPWARE_CLIENT_ID', label: 'Client ID', secret: false, optional: false },
    { field: 'SHOPWARE_CLIENT_SECRET', label: 'Client Secret', secret: true, optional: false },
  ],
  ga4: [
    { field: 'GA4_PROPERTY_ID', label: 'Property ID', secret: false, optional: false },
    { field: 'GA4_SERVICE_ACCOUNT_JSON', label: 'Service Account JSON', secret: true, optional: false },
  ],
  klaviyo: [
    { field: 'KLAVIYO_API_KEY', label: 'Private API Key', secret: true, optional: false },
    { field: 'KLAVIYO_SIGNUP_METRIC', label: 'Signup-Metrik', secret: false, optional: true },
    { field: 'KLAVIYO_UNSUB_METRIC', label: 'Unsub-Metrik', secret: false, optional: true },
  ],
  meta: [
    { field: 'META_ACCESS_TOKEN', label: 'Access Token', secret: true, optional: false },
    { field: 'META_AD_ACCOUNT_ID', label: 'Ad Account ID', secret: false, optional: false },
    { field: 'META_PURCHASE_ACTION_TYPE', label: 'Purchase Action Type', secret: false, optional: true },
  ],
  tiktok: [
    { field: 'TIKTOK_ACCESS_TOKEN', label: 'Access Token', secret: true, optional: false },
    { field: 'TIKTOK_ADVERTISER_ID', label: 'Advertiser ID', secret: false, optional: false },
    { field: 'TIKTOK_VALUE_METRIC', label: 'Value-Metrik', secret: false, optional: true },
    { field: 'TIKTOK_VIDEO_METRIC', label: 'Video-Metrik', secret: false, optional: true },
  ],
  google: [
    { field: 'GOOGLE_ADS_DEVELOPER_TOKEN', label: 'Developer Token', secret: true, optional: false },
    { field: 'GOOGLE_ADS_CLIENT_ID', label: 'OAuth Client ID', secret: false, optional: false },
    { field: 'GOOGLE_ADS_CLIENT_SECRET', label: 'OAuth Client Secret', secret: true, optional: false },
    { field: 'GOOGLE_ADS_REFRESH_TOKEN', label: 'Refresh Token', secret: true, optional: false },
    { field: 'GOOGLE_ADS_CUSTOMER_ID', label: 'Customer ID', secret: false, optional: false },
    { field: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID', label: 'Login Customer ID', secret: false, optional: true },
  ],
};

export const CONNECTORS = Object.keys(CONNECTOR_FIELDS) as Connector[];
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/crypto.ts src/lib/connector-fields.ts tests/lib/crypto.test.ts
git commit -m "feat: AES-256-GCM crypto module and connector field registry"
```

---

### Task 2: Schema-Migration & Credential-Tresor (DB)

**Files:**
- Modify: `db/schema.sql`
- Create: `src/lib/credentials.ts`
- Test: `tests/lib/credentials.test.ts`

**Interfaces:**
- Consumes: `pool` (`@/lib/db`), `encrypt`/`decrypt` (`@/lib/crypto`), `CONNECTOR_FIELDS`/`CONNECTORS`/`Connector` (`@/lib/connector-fields`).
- Produces: `setCredential(connector, field, value): Promise<void>`, `deleteCredential(connector, field): Promise<void>`, `getCredential(connector, field): Promise<string|null>`, `getCredentials(connector): Promise<Record<string,string>>`, `listStatus(): Promise<{ connector, field, isSet, updatedAt }[]>`.

- [ ] **Step 1: Schema ergänzen**

An `db/schema.sql` anhängen:
```sql
CREATE TABLE IF NOT EXISTS connector_credentials (
  connector   TEXT NOT NULL,
  field       TEXT NOT NULL,
  ciphertext  TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (connector, field)
);
```

- [ ] **Step 2: Migration anwenden**

Run: `docker compose up -d db && npm run migrate`
Expected: „Schema applied." — Tabelle `connector_credentials` existiert.

- [ ] **Step 3: Failing integration test**

`tests/lib/credentials.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setCredential, getCredentials, getCredential, deleteCredential, listStatus } from '@/lib/credentials';
import { pool } from '@/lib/db';

beforeAll(() => { process.env.CREDENTIALS_KEY = Buffer.alloc(32, 9).toString('base64'); });
afterAll(async () => {
  await pool.query(`DELETE FROM connector_credentials WHERE connector = 'shopware'`);
  await pool.end();
});

describe('credentials store (integration, benötigt DB)', () => {
  it('set→get round-trip und Upsert', async () => {
    await setCredential('shopware', 'SHOPWARE_CLIENT_SECRET', 'sec1');
    expect((await getCredentials('shopware')).SHOPWARE_CLIENT_SECRET).toBe('sec1');
    await setCredential('shopware', 'SHOPWARE_CLIENT_SECRET', 'sec2');
    expect(await getCredential('shopware', 'SHOPWARE_CLIENT_SECRET')).toBe('sec2');
  });
  it('listStatus meldet isSet ohne Klartext', async () => {
    await setCredential('shopware', 'SHOPWARE_API_URL', 'https://shop.example');
    const st = await listStatus();
    const row = st.find((s) => s.connector === 'shopware' && s.field === 'SHOPWARE_API_URL')!;
    expect(row.isSet).toBe(true);
    expect(JSON.stringify(st)).not.toContain('https://shop.example');
  });
  it('delete entfernt das Credential', async () => {
    await deleteCredential('shopware', 'SHOPWARE_API_URL');
    expect(await getCredential('shopware', 'SHOPWARE_API_URL')).toBeNull();
  });
});
```

- [ ] **Step 4: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/lib/credentials.test.ts`
Expected: FAIL — `@/lib/credentials` nicht gefunden.

- [ ] **Step 5: Tresor implementieren**

`src/lib/credentials.ts`:
```ts
import { pool } from './db';
import { encrypt, decrypt } from './crypto';
import { CONNECTOR_FIELDS, CONNECTORS, type Connector } from './connector-fields';

export async function setCredential(connector: Connector, field: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO connector_credentials(connector, field, ciphertext, updated_at)
     VALUES($1, $2, $3, now())
     ON CONFLICT (connector, field) DO UPDATE SET ciphertext = excluded.ciphertext, updated_at = now()`,
    [connector, field, encrypt(value)],
  );
}

export async function deleteCredential(connector: Connector, field: string): Promise<void> {
  await pool.query('DELETE FROM connector_credentials WHERE connector = $1 AND field = $2', [connector, field]);
}

export async function getCredential(connector: Connector, field: string): Promise<string | null> {
  const res = await pool.query('SELECT ciphertext FROM connector_credentials WHERE connector = $1 AND field = $2', [connector, field]);
  return res.rows[0] ? decrypt(res.rows[0].ciphertext) : null;
}

export async function getCredentials(connector: Connector): Promise<Record<string, string>> {
  const res = await pool.query('SELECT field, ciphertext FROM connector_credentials WHERE connector = $1', [connector]);
  const out: Record<string, string> = {};
  for (const row of res.rows) out[row.field] = decrypt(row.ciphertext);
  return out;
}

export interface CredentialStatus {
  connector: Connector;
  field: string;
  isSet: boolean;
  updatedAt: string | null;
}

export async function listStatus(): Promise<CredentialStatus[]> {
  const res = await pool.query('SELECT connector, field, updated_at::text AS "updatedAt" FROM connector_credentials');
  const setMap = new Map<string, string>(res.rows.map((r) => [`${r.connector}:${r.field}`, r.updatedAt]));
  const out: CredentialStatus[] = [];
  for (const connector of CONNECTORS) {
    for (const f of CONNECTOR_FIELDS[connector]) {
      const updatedAt = setMap.get(`${connector}:${f.field}`) ?? null;
      out.push({ connector, field: f.field, isSet: updatedAt !== null, updatedAt });
    }
  }
  return out;
}
```

- [ ] **Step 6: Test grün**

Run: `npm test -- tests/lib/credentials.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 7: Commit**

```bash
git add db/schema.sql src/lib/credentials.ts tests/lib/credentials.test.ts
git commit -m "feat: encrypted connector_credentials store with migration"
```

---

### Task 3: API-Routen `/api/credentials` (GET Status + POST set/delete)

**Files:**
- Create: `src/app/api/credentials/route.ts`
- Test: `tests/app/credentials-route.test.ts`

**Interfaces:**
- Consumes: `listStatus`, `getCredential`, `setCredential`, `deleteCredential` (`@/lib/credentials`); `CONNECTOR_FIELDS`, `CONNECTORS` (`@/lib/connector-fields`).
- Produces: `GET()` → `{ fields: Array<{ connector, field, label, secret, optional, isSet, updatedAt, value? }> }` (`value` nur für nicht-secret gesetzte Felder); `POST(request)` → `{ ok: true }` (setzt/löscht je Feld; leerer Wert = unverändert).

- [ ] **Step 1: Failing test**

`tests/app/credentials-route.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

const setCredential = vi.fn(async () => {});
const deleteCredential = vi.fn(async () => {});
vi.mock('@/lib/credentials', () => ({
  listStatus: async () => [
    { connector: 'shopware', field: 'SHOPWARE_API_URL', isSet: true, updatedAt: '2026-01-01' },
    { connector: 'shopware', field: 'SHOPWARE_CLIENT_SECRET', isSet: true, updatedAt: '2026-01-01' },
  ],
  getCredential: async (_c: string, f: string) => (f === 'SHOPWARE_API_URL' ? 'https://shop.example' : 'SHOULD-NOT-LEAK'),
  setCredential,
  deleteCredential,
}));

import { GET, POST } from '@/app/api/credentials/route';

describe('GET /api/credentials', () => {
  it('liefert nicht-secret-Werte, aber NIE secret-Werte', async () => {
    const body = await (await GET()).json();
    const url = body.fields.find((f: any) => f.field === 'SHOPWARE_API_URL');
    const secret = body.fields.find((f: any) => f.field === 'SHOPWARE_CLIENT_SECRET');
    expect(url.value).toBe('https://shop.example');
    expect(secret.value).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('SHOULD-NOT-LEAK');
  });
});

describe('POST /api/credentials', () => {
  it('setzt nicht-leere, ignoriert leere, löscht null', async () => {
    setCredential.mockClear(); deleteCredential.mockClear();
    const req = new Request('http://x/api/credentials', {
      method: 'POST',
      body: JSON.stringify({ connector: 'shopware', fields: { SHOPWARE_CLIENT_SECRET: 'new', SHOPWARE_CLIENT_ID: '', SHOPWARE_API_URL: null } }),
    });
    await POST(req);
    expect(setCredential).toHaveBeenCalledWith('shopware', 'SHOPWARE_CLIENT_SECRET', 'new');
    expect(setCredential).not.toHaveBeenCalledWith('shopware', 'SHOPWARE_CLIENT_ID', '');
    expect(deleteCredential).toHaveBeenCalledWith('shopware', 'SHOPWARE_API_URL');
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/app/credentials-route.test.ts`
Expected: FAIL — `@/app/api/credentials/route` nicht gefunden.

- [ ] **Step 3: Route implementieren**

`src/app/api/credentials/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { listStatus, getCredential, setCredential, deleteCredential } from '@/lib/credentials';
import { CONNECTOR_FIELDS, CONNECTORS, type Connector } from '@/lib/connector-fields';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await listStatus();
  const fields = [];
  for (const connector of CONNECTORS) {
    for (const f of CONNECTOR_FIELDS[connector]) {
      const st = status.find((s) => s.connector === connector && s.field === f.field)!;
      const value = !f.secret && st.isSet ? (await getCredential(connector, f.field)) ?? undefined : undefined;
      fields.push({ connector, field: f.field, label: f.label, secret: f.secret, optional: f.optional, isSet: st.isSet, updatedAt: st.updatedAt, value });
    }
  }
  return NextResponse.json({ fields });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { connector: Connector; fields: Record<string, string | null> };
  const known = new Set((CONNECTOR_FIELDS[body.connector] ?? []).map((f) => f.field));
  for (const [field, value] of Object.entries(body.fields ?? {})) {
    if (!known.has(field)) continue;
    if (value === null) await deleteCredential(body.connector, field);
    else if (value !== '') await setCredential(body.connector, field, value);
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Test grün**

Run: `npm test -- tests/app/credentials-route.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/credentials/route.ts tests/app/credentials-route.test.ts
git commit -m "feat: /api/credentials route (status GET + set/delete POST)"
```

---

### Task 4: Setup-Page & Maskierungs-Formular

**Files:**
- Create: `src/app/setup/page.tsx`, `src/components/CredentialsForm.tsx`
- Modify: `src/app/page.tsx` (Header-Link)
- Modify: `.env.example` (CREDENTIALS_KEY)

**Interfaces:**
- Consumes: `listStatus`, `getCredential` (`@/lib/credentials`), `CONNECTOR_FIELDS`, `CONNECTORS` (`@/lib/connector-fields`).
- Produces: Seite `/setup`; Client-Komponente `CredentialsForm` (POSTet an `/api/credentials`).

- [ ] **Step 1: Client-Formular implementieren**

`src/components/CredentialsForm.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface FieldView {
  connector: string; field: string; label: string; secret: boolean; optional: boolean;
  isSet: boolean; updatedAt: string | null; value?: string;
}

export function CredentialsForm({ fields }: { fields: FieldView[] }) {
  const router = useRouter();
  const connectors = [...new Set(fields.map((f) => f.connector))];
  const [inputs, setInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) if (!f.secret && f.value) init[`${f.connector}:${f.field}`] = f.value;
    return init;
  });
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const k = (c: string, f: string) => `${c}:${f}`;

  async function save(connector: string) {
    const payload: Record<string, string> = {};
    for (const f of fields.filter((x) => x.connector === connector)) {
      payload[f.field] = inputs[k(connector, f.field)] ?? '';
    }
    await fetch('/api/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connector, fields: payload }) });
    setMsg(`${connector} gespeichert.`);
    router.refresh();
  }
  async function remove(connector: string, field: string) {
    await fetch('/api/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connector, fields: { [field]: null } }) });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}
      {connectors.map((connector) => (
        <section key={connector} className="rounded-lg border border-emerald-900/40 bg-neutral-900 p-4">
          <h2 className="mb-3 text-lg font-semibold text-emerald-400">{connector}</h2>
          <div className="space-y-3">
            {fields.filter((f) => f.connector === connector).map((f) => (
              <div key={f.field} className="flex items-center gap-3">
                <label className="w-56 text-sm text-neutral-300">
                  {f.label}{f.optional && <span className="text-neutral-500"> (optional)</span>}
                </label>
                <input
                  className="flex-1 rounded bg-neutral-800 px-2 py-1 text-sm text-neutral-100"
                  type={f.secret && !show[k(connector, f.field)] ? 'password' : 'text'}
                  placeholder={f.secret && f.isSet ? `•••••••• (gesetzt am ${f.updatedAt?.slice(0, 10)})` : ''}
                  value={inputs[k(connector, f.field)] ?? ''}
                  onChange={(e) => setInputs({ ...inputs, [k(connector, f.field)]: e.target.value })}
                />
                {f.secret && (
                  <button type="button" className="text-xs text-neutral-400" onClick={() => setShow({ ...show, [k(connector, f.field)]: !show[k(connector, f.field)] })}>
                    {show[k(connector, f.field)] ? 'verbergen' : 'anzeigen'}
                  </button>
                )}
                <span className={`text-xs ${f.isSet ? 'text-emerald-500' : 'text-neutral-500'}`}>{f.isSet ? 'gesetzt ✓' : 'nicht gesetzt'}</span>
                {f.isSet && <button type="button" className="text-xs text-red-400" onClick={() => remove(connector, f.field)}>Löschen</button>}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => save(connector)} className="mt-3 rounded bg-emerald-600 px-3 py-1 text-sm text-white">Speichern</button>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Setup-Page implementieren**

`src/app/setup/page.tsx`:
```tsx
import Link from 'next/link';
import { listStatus, getCredential } from '@/lib/credentials';
import { CONNECTOR_FIELDS, CONNECTORS } from '@/lib/connector-fields';
import { CredentialsForm, type FieldView } from '@/components/CredentialsForm';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const status = await listStatus();
  const fields: FieldView[] = [];
  for (const connector of CONNECTORS) {
    for (const f of CONNECTOR_FIELDS[connector]) {
      const st = status.find((s) => s.connector === connector && s.field === f.field)!;
      const value = !f.secret && st.isSet ? (await getCredential(connector, f.field)) ?? undefined : undefined;
      fields.push({ connector, field: f.field, label: f.label, secret: f.secret, optional: f.optional, isSet: st.isSet, updatedAt: st.updatedAt, value });
    }
  }
  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-emerald-400">⚙ Connector-Setup</h1>
        <Link href="/" className="text-sm text-emerald-400">← Zum Dashboard</Link>
      </header>
      <p className="mb-6 text-sm text-neutral-400">
        Zugangsdaten werden AES-256-verschlüsselt in der DB gespeichert. Secrets werden in der Oberfläche maskiert und nie zurückgegeben — leer lassen heißt „unverändert".
      </p>
      <CredentialsForm fields={fields} />
    </main>
  );
}
```

- [ ] **Step 3: Header-Link im Dashboard ergänzen**

In `src/app/page.tsx` im `<header>` neben `<Filters />` einen Setup-Link einfügen. Den `Filters`-Block so ersetzen:
```tsx
        <div className="flex items-center gap-4">
          <Filters />
          <a href="/setup" className="text-sm text-neutral-400 hover:text-emerald-400">⚙ Setup</a>
        </div>
```
(ersetzt das vorhandene alleinstehende `<Filters />` im Header.)

- [ ] **Step 4: `.env.example` ergänzen**

An `.env.example` anhängen:
```
# 32-byte base64 key, erzeugen mit:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
CREDENTIALS_KEY=replace-with-generated-32-byte-base64-key
```

- [ ] **Step 5: Build-Verifikation**

Run: `npm run build`
Expected: Erfolg; Routen `/`, `/setup`, `/api/credentials` vorhanden.

- [ ] **Step 6: Volle Suite grün**

Run: `npm test`
Expected: PASS (keine Regression).

- [ ] **Step 7: Commit**

```bash
git add src/app/setup/page.tsx src/components/CredentialsForm.tsx src/app/page.tsx .env.example
git commit -m "feat: /setup credentials page with masked secret inputs"
```

---

### Task 5: Sync-Umbau (DB-only) & GA4-Client `fromCredentials`

**Files:**
- Create: (Test) `tests/lib/load-config.test.ts`
- Modify: `src/lib/credentials.ts` (`loadConnectorConfig`), `src/connectors/ga4/client.ts` (`fromCredentials`), `scripts/sync-shopware.ts`, `scripts/sync-ga4.ts`, `scripts/sync-klaviyo.ts`, `scripts/sync-meta.ts`, `scripts/sync-tiktok.ts`, `scripts/sync-google.ts`

**Interfaces:**
- Consumes: `getCredentials` (`@/lib/credentials`), `CONNECTOR_FIELDS` (`@/lib/connector-fields`).
- Produces: `loadConnectorConfig(connector): Promise<Record<string,string>>` — lädt DB-Creds, prüft Pflichtfelder (Registry `optional:false`), wirft mit `/setup`-Hinweis wenn welche fehlen; `Ga4Client.fromCredentials(propertyId, credentials): Ga4Client`.

- [ ] **Step 1: `loadConnectorConfig`-Test (mock getCredentials)**

`tests/lib/load-config.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/credentials', async (orig) => {
  const actual = await orig() as Record<string, unknown>;
  return { ...actual, getCredentials: vi.fn() };
});

import { loadConnectorConfig, getCredentials } from '@/lib/credentials';

describe('loadConnectorConfig', () => {
  it('gibt vollständige Config zurück', async () => {
    (getCredentials as any).mockResolvedValue({ SHOPWARE_API_URL: 'u', SHOPWARE_CLIENT_ID: 'i', SHOPWARE_CLIENT_SECRET: 's' });
    expect(await loadConnectorConfig('shopware')).toMatchObject({ SHOPWARE_CLIENT_SECRET: 's' });
  });
  it('wirft mit /setup-Hinweis bei fehlendem Pflichtfeld', async () => {
    (getCredentials as any).mockResolvedValue({ SHOPWARE_API_URL: 'u' });
    await expect(loadConnectorConfig('shopware')).rejects.toThrow(/\/setup/);
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/lib/load-config.test.ts`
Expected: FAIL — `loadConnectorConfig` nicht exportiert.

- [ ] **Step 3: `loadConnectorConfig` in `src/lib/credentials.ts` ergänzen**

Am Ende von `src/lib/credentials.ts` anhängen:
```ts
export async function loadConnectorConfig(connector: Connector): Promise<Record<string, string>> {
  const cfg = await getCredentials(connector);
  const missing = CONNECTOR_FIELDS[connector]
    .filter((f) => !f.optional && !cfg[f.field])
    .map((f) => f.field);
  if (missing.length > 0) {
    throw new Error(`${connector}-Credentials fehlen (${missing.join(', ')}) — bitte auf /setup hinterlegen.`);
  }
  return cfg;
}
```

- [ ] **Step 4: Test grün**

Run: `npm test -- tests/lib/load-config.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: GA4-Client `fromCredentials` ergänzen**

In `src/connectors/ga4/client.ts` neben `fromEnv` eine Methode ergänzen:
```ts
  static fromCredentials(propertyId: string, credentials: object): Ga4Client {
    const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
    const getToken: TokenProvider = async () => {
      const client = await auth.getClient();
      const token = await client.getAccessToken();
      if (!token.token) throw new Error('GA4 auth: no access token returned');
      return token.token;
    };
    return new Ga4Client(propertyId, getToken);
  }
```

- [ ] **Step 6: Die sechs Sync-Skripte auf `loadConnectorConfig` umstellen**

Muster (für jedes Skript): den `process.env.X`-Block durch `const cfg = await loadConnectorConfig('<connector>')` ersetzen und Felder aus `cfg` lesen. Konkret:

`scripts/sync-shopware.ts` — Env-Block ersetzen durch:
```ts
  const cfg = await loadConnectorConfig('shopware');
  const client = new ShopwareClient({ apiUrl: cfg.SHOPWARE_API_URL, clientId: cfg.SHOPWARE_CLIENT_ID, clientSecret: cfg.SHOPWARE_CLIENT_SECRET });
```
und Import oben: `import { loadConnectorConfig } from '../src/lib/credentials';`

`scripts/sync-ga4.ts`:
```ts
  const cfg = await loadConnectorConfig('ga4');
  const client = Ga4Client.fromCredentials(cfg.GA4_PROPERTY_ID, JSON.parse(cfg.GA4_SERVICE_ACCOUNT_JSON));
```
(Import `loadConnectorConfig`; `GOOGLE_APPLICATION_CREDENTIALS`-Logik + `fromEnv`-Aufruf entfernen.)

`scripts/sync-klaviyo.ts`:
```ts
  const cfg = await loadConnectorConfig('klaviyo');
  const signupMetric = cfg.KLAVIYO_SIGNUP_METRIC ?? 'Subscribed to List';
  const unsubMetric = cfg.KLAVIYO_UNSUB_METRIC ?? 'Unsubscribed';
  const client = new KlaviyoClient(cfg.KLAVIYO_API_KEY);
```

`scripts/sync-meta.ts`:
```ts
  const cfg = await loadConnectorConfig('meta');
  const purchaseActionType = cfg.META_PURCHASE_ACTION_TYPE ?? 'purchase';
  const client = new MetaClient(cfg.META_ACCESS_TOKEN, cfg.META_AD_ACCOUNT_ID);
```

`scripts/sync-tiktok.ts`:
```ts
  const cfg = await loadConnectorConfig('tiktok');
  const valueMetric = cfg.TIKTOK_VALUE_METRIC ?? 'total_complete_payment';
  const videoMetric = cfg.TIKTOK_VIDEO_METRIC ?? 'video_play_actions';
  const client = new TikTokClient(cfg.TIKTOK_ACCESS_TOKEN, cfg.TIKTOK_ADVERTISER_ID, valueMetric, videoMetric);
```

`scripts/sync-google.ts`:
```ts
  const cfg = await loadConnectorConfig('google');
  const client = new GoogleAdsClient({
    developerToken: cfg.GOOGLE_ADS_DEVELOPER_TOKEN,
    clientId: cfg.GOOGLE_ADS_CLIENT_ID,
    clientSecret: cfg.GOOGLE_ADS_CLIENT_SECRET,
    refreshToken: cfg.GOOGLE_ADS_REFRESH_TOKEN,
    customerId: cfg.GOOGLE_ADS_CUSTOMER_ID,
    loginCustomerId: cfg.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  });
```
In jedem Skript den jeweiligen alten `process.env.*`-Validierungsblock entfernen und `import { loadConnectorConfig } from '../src/lib/credentials';` ergänzen. `parseDays`/`days` und der restliche Ablauf bleiben unverändert.

- [ ] **Step 7: Volle Suite + Build**

Run: `npm test && npm run build`
Expected: PASS (alle Tests inkl. der neuen; Build grün). Die sechs Skripte sind reine Orchestrierung — durch `loadConnectorConfig`-Test + Build abgedeckt.

- [ ] **Step 8: Commit**

```bash
git add src/lib/credentials.ts src/connectors/ga4/client.ts scripts/sync-shopware.ts scripts/sync-ga4.ts scripts/sync-klaviyo.ts scripts/sync-meta.ts scripts/sync-tiktok.ts scripts/sync-google.ts tests/lib/load-config.test.ts
git commit -m "feat: syncs read credentials from encrypted DB store via loadConnectorConfig"
```

- [ ] **Step 9: Live-Verifikation (Shopware end-to-end)**

```bash
# CREDENTIALS_KEY in .env erzeugen + eintragen:
node -e "console.log('CREDENTIALS_KEY='+require('crypto').randomBytes(32).toString('base64'))" >> .env
docker compose up -d db && npm run migrate
# Server starten, /setup öffnen, Shopware-Felder eintragen, speichern. Dann:
set -a; source .env; set +a
npm run sync:shopware     # liest jetzt aus der DB
```
Erwartet: Sync lädt die Creds aus der DB und zieht echte Bestellungen; ohne hinterlegte Creds bricht er mit „…fehlen — bitte auf /setup hinterlegen" ab. `/setup` zeigt secret-Felder maskiert; ein Reload liefert nie den Klartext eines Secrets.

---

## Definition of Done

- `npm test` grün inkl. neuer Tests (crypto 4, credentials 3, route 2, load-config 2).
- `npm run build` grün; `/setup` rendert das maskierte Formular; `/api/credentials` GET liefert nie ein Secret.
- Credentials liegen AES-256-GCM-verschlüsselt in `connector_credentials`; `CREDENTIALS_KEY` aus der Env.
- Alle sechs Syncs lesen Creds via `loadConnectorConfig` aus der DB; fehlende Pflichtfelder → `/setup`-Hinweis.
- Keine Secrets im Repo; keine neue Dependency; kein Schema-Bruch.

## Verifizierte Spec-Abdeckung (Self-Review)

- AES-256-GCM, IV/Tag/Format, fehlender Key → Fehler: Task 1 ✓
- Feld-Registry mit secret/optional-Flags: Task 1 ✓
- Tabelle `connector_credentials`, set/get/getOne/delete/listStatus: Task 2 ✓
- GET nie secret-Klartext / POST leer=unverändert / null=löschen: Task 3 ✓
- Setup-Page mit Maskierung (password, „•••• gesetzt am …", Augen-Toggle nur eigene Eingabe, Löschen): Task 4 ✓
- Header-Link, `CREDENTIALS_KEY` in `.env.example`: Task 4 ✓
- Syncs nur-DB via `loadConnectorConfig` + `/setup`-Hinweis; GA4 `fromCredentials` (JSON statt Datei-Pfad): Task 5 ✓
- Keine Auth (Scope-Grenze): bewusst, im Spec dokumentiert ✓
