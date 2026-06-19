# Umzug auf self-hosted Supabase (Auth + RLS + DB) — Design-Spec

**Datum:** 2026-06-19
**Status:** Genehmigt (Brainstorming abgeschlossen)
**Baut auf:** `main` (V1 + 6 Connectoren + Credentials-Setup + Auth.js-SSO)
**Ersetzt:** die Auth.js-Authentifizierung (`feat/auth`, PR #2) sowie den schlanken Docker-Postgres

## Ziel

Die KPI-Plattform von einem schlanken Docker-Postgres + Auth.js auf eine
**self-hosted Supabase-Instanz** umziehen: Supabase liefert Postgres, GoTrue-Auth
(E-Mail/Passwort, vorerst kein OAuth) und Row-Level-Security. Der bestehende
AES-Credential-Tresor bleibt erhalten. Lokal lauffähig, mit env-getriebener Config
für einen späteren Umzug auf einen eigenen Server (VPS) vorbereitet.

## Entscheidungen (aus dem Brainstorming)

1. **Umbau-Tiefe:** Voll Supabase-nativ für **Auth + RLS + DB**. Der
   Credential-Tresor bleibt der bestehende AES-256-GCM-Tresor (kein Supabase Vault
   — `pgsodium` ist im self-hosted Stack versionsabhängig/weniger ausgereift; der
   AES-Tresor ist gebaut, reviewt und voll unter eigener Kontrolle).
2. **Runtime:** Self-hosted Supabase-Docker-Stack, **lokal jetzt, remote-ready**.
   Alle URLs/Keys/Secrets über Env, nichts hartkodiert.
3. **Auth:** GoTrue mit **E-Mail/Passwort**, Public-Signup **aus**, User manuell
   angelegt, lokal Auto-Confirm (kein SMTP). OAuth + echte Allowlist sind späteres
   Folge-Thema (dann via Auth-Hook).
4. **Zugriffsmodell:** Ein gemeinsamer Level — **alle eingeloggten User sehen alle
   Daten**. RLS = `authenticated → SELECT`; Schreiben nur via Service-Rolle (Sync).
   Kein Rollen-/Rechtesystem.
5. **Daten:** Frischer Start — `migrate` + `seed` + Shopware-Live-Resync gegen die
   Supabase-DB. Die lokale Docker-Postgres ist wegwerfbar (Sync ist idempotent).

## Architektur & Datenfluss

```
Browser → src/middleware.ts (@supabase/ssr: Session-Cookie auffrischen)
   ├─ kein User + Seite → Redirect /login
   ├─ kein User + /api/* → 401 JSON
   └─ User → Route normal
Login: /login → supabase.auth.signInWithPassword (GoTrue via Kong)
Server-Read (Seite/API): createServerClient(cookies) → PostgREST
   → RLS(authenticated) → Rows → computeKpis (TS)
Credentials (Server): /api/credentials → createServerClient → connector_credentials
   (RLS authenticated); Klartext nie über GET; AES via CREDENTIALS_KEY
Sync/migrate/seed (tsx-CLI): pg(DATABASE_URL, postgres/Service-Rolle)
   → Ciphertext lesen + AES-entschlüsseln → externe API → transaktionaler Replace
   (RLS umgangen)
```

## Komponenten

### Infrastruktur — `infra/supabase/`
Der offizielle Supabase-Self-Hosting-Stack wird ins Repo vendored (docker-compose +
`.env`), getrimmt auf: **db (Postgres), auth (GoTrue), rest (PostgREST), kong
(Gateway, Port 8000), studio, meta**. Weggelassen (YAGNI): realtime, storage,
imgproxy, analytics/logflare, vector. Der bisherige `db`-Service in der
App-`docker-compose.yml` entfällt; die App verbindet gegen Kong (`SUPABASE_URL`) und
gegen Postgres (`DATABASE_URL`, für die Sync-CLI).

**Env (alle über `.env`, remote-ready):**
- `SUPABASE_URL` (Kong-Gateway, lokal `http://localhost:8000`)
- `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (von Supabase generierte JWTs)
- `JWT_SECRET` (signiert die Auth-JWTs; muss zu den o.g. Keys passen)
- `POSTGRES_PASSWORD`, `DATABASE_URL` (Direktverbindung `postgres`-Rolle für die CLI)
- `CREDENTIALS_KEY` (32-Byte base64, AES-Tresor — unverändert)
- `LOCAL_USER_EMAIL`, `LOCAL_USER_PASSWORD` (Seed des ersten Users)

### Supabase-Client-Layer — `src/lib/supabase/`
- `server.ts` — `createServerClient` (`@supabase/ssr`), liest/schreibt Auth-Cookies;
  für Server-Components, Route-Handler und Middleware. Nutzt `SUPABASE_URL` +
  `SUPABASE_ANON_KEY` und den Cookie-Store.
- `client.ts` — `createBrowserClient` für das Login-Formular und Sign-out.
- Diese ersetzen `src/auth.ts`.

### Auth
- **`/login` (`src/app/login/page.tsx`)** — Client-Formular E-Mail/Passwort →
  `supabase.auth.signInWithPassword`; bei Erfolg Redirect auf `/`, bei Fehler
  Meldung. Dunkles Theme/grüne Akzente, konsistent mit dem Dashboard.
- **`scripts/create-user.ts`** — legt den initialen User reproduzierbar an
  (`supabase.auth.admin.createUser` mit Service-Role-Key, `email_confirm: true`,
  E-Mail/Passwort aus `LOCAL_USER_EMAIL`/`LOCAL_USER_PASSWORD`). Idempotent
  (existiert der User, kein Fehler). npm-Script `create-user`.
- **Sign-out** — Client-Komponente ruft `supabase.auth.signOut()` → Redirect `/login`.

### Middleware — `src/middleware.ts` (neu)
Nach `@supabase/ssr`-Muster: Session via `createServerClient` auffrischen
(`supabase.auth.getUser()`), dann:
- kein User + Pfad beginnt `/api/` → `401 JSON`.
- kein User + sonst → Redirect `/login` (mit `redirectTo`-Param).
- User vorhanden → Response (mit aufgefrischten Cookies) durchreichen.
`config.matcher` schließt `/login`, `_next/static`, `_next/image`, `favicon.ico` aus.
**Sicherheits-Eigenschaft:** kein unauthentifizierter Pfad erreicht eine geschützte
Seite oder Business-API; `/setup` + `/api/credentials` bleiben gegated.

### Datenebene + RLS
- Migration aktiviert RLS auf `daily_metrics`, `orders`, `customers`, `ad_spend`,
  `subscribers` und `connector_credentials`. Policies:
  - `authenticated` → `SELECT` auf allen sechs Tabellen.
  - `authenticated` → `INSERT/UPDATE/DELETE` auf `connector_credentials` (Setup-UI).
  - `anon` → kein Zugriff (keine Policy).
  - Die `postgres`/Service-Rolle umgeht RLS (Sync/migrate/seed schreiben darüber).
- **Reads** (Server-Components/API) laufen über den Supabase-Server-Client mit dem
  User-Token. Die KPI-Queries sind range-gefilterte Selects (`.select().gte().lte()`);
  die KPI-Mathematik bleibt in TS (`computeKpis`). BIGINT-Felder werden wie bisher per
  `Number()` koerziert. Ist eine Query zu komplex für PostgREST, wird sie als
  Postgres-Funktion (RPC) gekapselt und per `supabase.rpc()` aufgerufen.
- **Writes** (`scripts/sync-*.ts`, `migrate`, `seed`) bleiben auf `pg` mit
  privilegierter Direktverbindung; SSL env-abhängig (lokal aus, remote an).

### Tresor (unverändert)
`src/lib/crypto.ts` (AES-256-GCM, `CREDENTIALS_KEY`) und `src/lib/credentials.ts`
bleiben logisch gleich. `connector_credentials` liegt jetzt in der Supabase-DB.
Lese-/Schreibpfad der `/api/credentials`-Route nutzt den Supabase-Server-Client
(RLS `authenticated`); die Sync-Skripte lesen Ciphertext via privilegiertem `pg` und
entschlüsseln in TS. Maskierung/Sicherheits-Eigenschaften unverändert: geheimer
Klartext verlässt den Server nie über GET.

## Was entfernt wird
- Dependency `next-auth`; `src/auth.ts`; `src/app/api/auth/[...nextauth]/route.ts`;
  alte `src/middleware.ts` (ersetzt); `src/components/SignOutButton.tsx` (für
  Supabase neu); `src/lib/allowlist.ts` + Tests (YAGNI — kein OAuth aktiv).
- `src/app/page.tsx`-Header: liest die User-E-Mail künftig über den
  Supabase-Server-Client statt über `auth()`.
- `.env.example`: `AUTH_*` raus, `SUPABASE_*` + GoTrue-/User-Vars rein.
- `.github/workflows/ci.yml`: `AUTH_SECRET`-Dummy raus; CI-Anpassung siehe Tests.

## Fehlerbehandlung
- Fehlende `SUPABASE_*` / `CREDENTIALS_KEY` / `DATABASE_URL` → klare Fehler beim
  Start bzw. beim ersten Zugriff.
- GoTrue/Kong nicht erreichbar → Login schlägt mit verständlicher Meldung fehl.
- RLS verweigert anon/unauthentifizierte Queries (Defense-in-Depth zusätzlich zur
  Middleware).

## Tests (TDD)
- **Unit:** KPI-Engine-Tests bleiben unverändert (pure TS). Krypto-Tests bleiben.
  Allowlist- und Auth.js-Tests entfallen.
- **Middleware:** unauth Seite → Redirect `/login`; unauth `/api/*` → 401;
  authentifiziert → Durchlass (Supabase-Client gemockt).
- **RLS (Integration gegen lokalen Stack):** `authenticated` liest die KPI-Tabellen;
  `anon` bekommt keine Zeilen. Seriell wie die bestehenden pg-Integrationstests
  (`fileParallelism: false`).
- **Repository:** Reads gegen die Supabase-DB liefern dieselben Datasets wie zuvor
  (Range-Selects + `Number()`-Koerzierung).
- **create-user:** Idempotenz (zweiter Lauf wirft nicht).
- **CI:** GitHub Actions startet den benötigten Supabase-Teil (mindestens Postgres
  + GoTrue) bzw. setzt RLS-/Auth-abhängige Tests, die einen laufenden Stack
  brauchen, auf einen dedizierten Job; reine Unit-Tests laufen ohne Stack.
- **Live-Verifikation (manuell):** Login mit dem Seed-User → Zugriff; Logout →
  Redirect; `/api/kpis` ohne Session → 401; nach Login → 200; Dashboard zeigt KPIs
  nach Resync.

## Umsetzung in Phasen
Jede Phase ist für sich lauffähig und testbar; Details kommen in den
Implementierungsplan.
1. **Supabase-Stack hoch** + `DATABASE_URL`/Sync/`migrate`/`seed` dagegen
   (Auth.js bleibt vorerst) → Daten laufen auf Supabase-Postgres.
2. **Auth ersetzen:** Supabase-Client-Layer, `/login`, neue Middleware,
   `create-user`-Seed; Auth.js + `next-auth` entfernen.
3. **Reads + RLS:** Server-Reads auf `supabase-js`, RLS-Policies aktivieren, anon
   dichtmachen; `connector_credentials`-Pfad auf Supabase-Client.

## Scope-Grenze (bewusst)
- **Kein OAuth** in diesem Schritt (E-Mail/Passwort genügt); echte E-Mail-Allowlist
  und Social-Login sind Folge-Thema (Auth-Hook). Bis dahin schützt „Signup aus +
  manuell angelegte User" den Zugang.
- **Kein Rollen-/Rechtesystem**, keine Daten-Trennung pro User, kein Supabase Vault,
  kein SMTP/Mail-Flow (lokal Auto-Confirm), kein Realtime/Storage.
- Self-hosted-Deployment auf einen konkreten VPS (Domain/TLS/Reverse-Proxy) ist ein
  eigenes Folge-Thema; diese Spec macht die Config nur remote-**ready**.
- `CREDENTIALS_KEY`, `DATABASE_URL`, `SUPABASE_*`, `JWT_SECRET` bleiben in der Env
  (Bootstrap).
