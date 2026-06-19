# Credentials-Setup-Page (verschlüsselter Secret-Tresor) — Design-Spec

**Datum:** 2026-06-19
**Status:** Genehmigt (Brainstorming abgeschlossen)
**Baut auf:** KPI-Plattform V1 + alle 6 Connectoren (Branch `feat/kpi-platform-v1`)

## Ziel

Eine Setup-Page in der Plattform, über die alle Connector-Zugangsdaten gepflegt
werden: Passwörter/Keys in der Oberfläche maskiert, in der DB AES-256-GCM-
verschlüsselt abgelegt. Die sechs Sync-Skripte beziehen ihre Credentials künftig
**ausschließlich aus der DB** (entschlüsselt zur Laufzeit), nicht mehr aus
`process.env`.

## Entscheidungen (aus dem Brainstorming)

1. **Master-Key:** Env-Variable `CREDENTIALS_KEY` (32 Byte, base64). Einziges
   Secret außerhalb der DB. Fehlt er → klarer Fehler beim Ver-/Entschlüsseln.
2. **Cred-Quelle der Syncs:** **Nur DB.** Bestehende `.env`-Connector-Werte müssen
   einmalig über `/setup` eingetragen werden. `DATABASE_URL` + `CREDENTIALS_KEY`
   bleiben in der Env.
3. **Krypto:** AES-256-GCM via Node-`crypto`, keine Dependency. Pro Wert
   zufälliger 12-Byte-IV; Speicherformat `iv:tag:ciphertext` (base64).
4. **Maskierung:** Geheime Felder sind `type="password"`; gesetzte Secrets zeigen
   nur „•••••••• (gesetzt am …)"; der Klartext verlässt den Server nie über GET.
5. **Keine Auth** auf `/setup` (konsistent mit V1) — siehe Scope-Grenze.

## Schema (additive Migration, kein Schema-Bruch)

```sql
CREATE TABLE IF NOT EXISTS connector_credentials (
  connector   TEXT NOT NULL,        -- 'shopware'|'ga4'|'klaviyo'|'meta'|'tiktok'|'google'
  field       TEXT NOT NULL,        -- z.B. 'SHOPWARE_CLIENT_SECRET'
  ciphertext  TEXT NOT NULL,        -- iv:tag:data (base64), AES-256-GCM
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (connector, field)
);
```
Eine Zeile pro Feld; Werte (auch nicht-geheime) liegen **nie** im Klartext in der DB.

## Feld-Registry

`src/lib/connector-fields.ts` — pro Connector die Feldliste mit Flags. Steuert UI
(Maskierung) und Pflicht-Validierung der Syncs.

| Connector | Felder (secret=🔒 / sichtbar=👁 / optional) |
|---|---|
| `shopware` | 👁 `SHOPWARE_API_URL`, 👁 `SHOPWARE_CLIENT_ID`, 🔒 `SHOPWARE_CLIENT_SECRET` |
| `ga4` | 👁 `GA4_PROPERTY_ID`, 🔒 `GA4_SERVICE_ACCOUNT_JSON` |
| `klaviyo` | 🔒 `KLAVIYO_API_KEY`, 👁optional `KLAVIYO_SIGNUP_METRIC`, 👁optional `KLAVIYO_UNSUB_METRIC` |
| `meta` | 🔒 `META_ACCESS_TOKEN`, 👁 `META_AD_ACCOUNT_ID`, 👁optional `META_PURCHASE_ACTION_TYPE` |
| `tiktok` | 🔒 `TIKTOK_ACCESS_TOKEN`, 👁 `TIKTOK_ADVERTISER_ID`, 👁optional `TIKTOK_VALUE_METRIC`, 👁optional `TIKTOK_VIDEO_METRIC` |
| `google` | 🔒 `GOOGLE_ADS_DEVELOPER_TOKEN`, 👁 `GOOGLE_ADS_CLIENT_ID`, 🔒 `GOOGLE_ADS_CLIENT_SECRET`, 🔒 `GOOGLE_ADS_REFRESH_TOKEN`, 👁 `GOOGLE_ADS_CUSTOMER_ID`, 👁optional `GOOGLE_ADS_LOGIN_CUSTOMER_ID` |

Registry-Eintrag: `{ field, label, secret: boolean, optional: boolean }`. Alle Werte
werden verschlüsselt gespeichert; `secret:false`-Felder (URLs/IDs/Metriknamen)
dürfen über GET entschlüsselt zurückkommen (damit die UI sie zeigt/editiert),
`secret:true`-Felder **niemals**.

## Credential-Modul (`src/lib/credentials.ts`)

- `encrypt(plain: string): string` / `decrypt(blob: string): string` — AES-256-GCM
  mit `CREDENTIALS_KEY`; `decrypt` wirft bei manipuliertem Tag (GCM-Integrität).
- `setCredential(connector, field, value): Promise<void>` — verschlüsselt + upsert.
- `deleteCredential(connector, field): Promise<void>`.
- `getCredentials(connector): Promise<Record<field,string>>` — lädt + entschlüsselt
  **server-seitig** (für die Syncs).
- `listStatus(): Promise<{ connector, field, isSet, updatedAt }[]>` — nur Status,
  kein geheimer Klartext.

## API-Routen

- `GET /api/credentials` → pro Feld `{ connector, field, isSet, updatedAt, value? }`.
  `value` **nur** für `secret:false`-Felder (entschlüsselt); für secret-Felder
  niemals — nur `isSet`.
- `POST /api/credentials` → Body `{ connector, fields: { FIELD: string | null } }`.
  - String, nicht-leer → `setCredential` (verschlüsseln + upsert).
  - leerer String → ignorieren (= unverändert; überschreibt kein Secret).
  - `null` → `deleteCredential`.

## Setup-Page `/setup`

- Server-Component lädt `GET`-Status; ein Client-Formular pro Connector-Abschnitt
  (Felder aus der Registry).
- **Maskierung:**
  - `secret`-Felder: `type="password"`; gesetzt → Platzhalter „•••••••• (gesetzt am …)".
    Eingabe leer lassen = unverändert. Augen-Toggle zeigt nur die **selbst getippte**
    Eingabe, nie einen gespeicherten Wert.
  - `secret:false`-Felder: Textfeld, vorbefüllt mit dem (sichtbaren) Wert.
  - Pro Feld „gesetzt ✓ / nicht gesetzt"-Badge + „Löschen".
- Speichern → `POST`; danach Status neu laden + Erfolgsmeldung.
- Dunkles Theme/grüne Akzente; Link im Dashboard-Header („⚙ Setup").

**Sicherheits-Eigenschaften:** Geheimer Klartext fließt nur Browser→Server (POST)
und Server→externe API (Sync). Aus DB und GET kommen keine Secrets heraus.

## Sync-Umbau (DB-only)

Jedes `scripts/sync-*.ts` ersetzt die `process.env`-Lektüre durch das Modul:
```ts
const cfg = await getCredentials('shopware');
if (!cfg.SHOPWARE_CLIENT_SECRET) {
  throw new Error('Shopware-Credentials fehlen — bitte auf /setup hinterlegen.');
}
```
Pflichtfelder (Registry `optional:false`) werden geprüft; fehlt eines → Fehler mit
Verweis auf `/setup`. Optionale Felder behalten ihre Code-Defaults, wenn leer.
**GA4-Sonderfall:** `GA4_SERVICE_ACCOUNT_JSON` (JSON-Inhalt) wird geparst und dem
Client direkt übergeben (`Ga4Client.fromCredentials(propertyId, parsedJson)` →
`new GoogleAuth({ credentials: parsedJson, scopes })`) — ersetzt den
`GOOGLE_APPLICATION_CREDENTIALS`-Datei-Pfad.

## Tests (TDD)

- **Unit (Krypto):** `encrypt`→`decrypt` Round-Trip; zwei Verschlüsselungen
  desselben Werts → unterschiedliche Chiffretexte (zufälliger IV); manipulierter
  Tag → `decrypt` wirft; fehlender `CREDENTIALS_KEY` → klarer Fehler.
- **Integration (DB):** `setCredential`→`getCredentials` Round-Trip; Upsert
  überschreibt; `deleteCredential`; `listStatus` liefert nur `isSet` (kein Klartext).
- **API:** `GET` enthält **nie** den Wert eines secret-Felds; `POST` mit leerem
  Feld lässt bestehendes Secret unangetastet; `POST` mit `null` löscht.
- **Migration:** `connector_credentials` existiert nach `npm run migrate`.
- **Sync-Refactor:** je Connector ein Test, dass bei fehlendem Pflichtfeld der
  `/setup`-Hinweis geworfen wird (Credential-Modul gemockt).

## Scope-Grenze (bewusst)

- **Keine Authentifizierung** auf `/setup` — konsistent mit V1 (kein Login). Für
  die lokale/Docker-Single-User-Plattform vertretbar; GET liefert nie geheimen
  Klartext. **Wird die Plattform je öffentlich erreichbar, braucht `/setup` (und
  idealerweise das ganze Dashboard) vorher Auth-Schutz** — eigenes Folge-Thema.
- Kein Schema-Bruch (additive Tabelle), keine neue Dependency, kein Scheduler,
  kein Key-Rotation-/Re-Encryption-Workflow (späteres Thema).
- `CREDENTIALS_KEY` + `DATABASE_URL` bleiben in der Env (Bootstrap).
