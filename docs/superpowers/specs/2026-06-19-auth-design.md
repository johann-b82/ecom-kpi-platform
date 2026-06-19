# Authentifizierung (Google-SSO + E-Mail-Allowlist) — Design-Spec

**Datum:** 2026-06-19
**Status:** Genehmigt (Brainstorming abgeschlossen)
**Baut auf:** `main` (V1 + 6 Connectoren + Credentials-Setup)

## Ziel

Alle Web-Oberflächen und API-Routen der Plattform hinter Login schützen: Google-
SSO via Auth.js, Zugriff auf eine E-Mail-Allowlist beschränkt. Schließt die im
Credentials-Review dokumentierte „keine Auth"-Grenze.

## Entscheidungen (aus dem Brainstorming)

1. **Library:** Auth.js (NextAuth v5) mit Google-Provider — statt OAuth selbst zu
   bauen. Session als signiertes JWT-Cookie (keine DB-Sessions).
2. **Zugriff:** E-Mail-**Allowlist** (`AUTH_ALLOWED_EMAILS`, Env). Nur gelistete
   Adressen dürfen rein; **fail-closed** (leere Liste → alle ablehnen).
3. **Durchsetzung:** Next.js-Middleware vor **allen** Routen. Seiten → Redirect
   zum Login; `/api/*` (außer `/api/auth`) → `401 JSON`.
4. **Secrets in `.env`** (Bootstrap, NICHT im verschlüsselten DB-Tresor):
   `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_ALLOWED_EMAILS`,
   `AUTH_URL`.
5. **Unberührt:** Sync-CLI (tsx → DB) und CI laufen nicht durch die Middleware.

## Architektur & Datenfluss

```
Browser → src/middleware.ts → Session-Cookie?
   ├─ nein + Seite (/, /phase, /setup) → Redirect /api/auth/signin (Google)
   ├─ nein + /api/* (außer /api/auth) → 401 JSON
   └─ ja → Route normal
Login: /api/auth/[...nextauth] (Auth.js) ↔ Google OAuth
   → signIn-Callback: isAllowedEmail(email, AUTH_ALLOWED_EMAILS) ? erlaubt : "AccessDenied"
```

### Neue/geänderte Dateien
- `src/lib/allowlist.ts` — reine `isAllowedEmail(email, raw): boolean`.
- `src/auth.ts` — `NextAuth({ providers:[Google], session:{strategy:'jwt'}, callbacks:{ signIn } })`; `signIn` erzwingt die Allowlist; exportiert `handlers`, `auth`, `signIn`, `signOut`.
- `src/app/api/auth/[...nextauth]/route.ts` — `export const { GET, POST } = handlers`.
- `src/middleware.ts` — Auth-Gate: Session via `auth()` prüfen; Seiten-Redirect / API-401; `config.matcher` schließt `/api/auth/*`, `_next/*`, `favicon.ico` aus.
- `src/app/page.tsx` (Modify) — Header zeigt eingeloggte E-Mail + „Abmelden" (POST `/api/auth/signout`).
- `.env.example` (Modify) — `AUTH_*` mit Erläuterung (OAuth-Client, Redirect-URI, `AUTH_SECRET`-Generierung).
- `package.json` — Dependency `next-auth@^5`.

## Allowlist-Durchsetzung

`isAllowedEmail(email, raw)`:
- `raw` (z. B. `"a@x.de, B@y.de"`) → split `,`, trim, lowercase → Set.
- `email` getrimmt + lowercased; Treffer → `true`, sonst `false`.
- **Leere/fehlende `raw` → `false`** (fail-closed: lieber niemand als jeder).

`signIn`-Callback: `return isAllowedEmail(profile?.email ?? user?.email, process.env.AUTH_ALLOWED_EMAILS)`. Bei `false` lehnt Auth.js mit `AccessDenied` ab.

## Middleware

- Liest die Session (Auth.js `auth()`), kein Cookie/ungültig → nicht authentifiziert.
- Nicht authentifiziert:
  - Pfad beginnt mit `/api/` → `new NextResponse(JSON 401)`.
  - sonst → Redirect auf den Auth.js-Sign-in (Google).
- `config.matcher`: `['/((?!api/auth|_next/static|_next/image|favicon.ico).*)']` — schützt alles außer den Auth-Routen + statischen Assets.

## Tests (TDD)

- **Unit (`isAllowedEmail`):** gelistete E-Mail (auch andere Schreibweise/Whitespace) → true; nicht gelistete → false; leere/undefined `raw` → false (fail-closed); mehrere Einträge.
- **Config/Build-Smoke:** `npm run build` mit Dummy-`AUTH_*` (AUTH_SECRET gesetzt) — Routen inkl. `/api/auth/[...nextauth]` bauen; Middleware kompiliert.
- **Live-Verifikation (aufgeschoben, echter OAuth-Client nötig):** Login mit
  erlaubter Google-Adresse → Zugriff; nicht-gelistete Adresse → AccessDenied;
  `/api/kpis` ohne Session → 401; nach Login → 200.

## Operatives Setup (einmalig)

Google Cloud Console → OAuth-2.0-Client (Typ „Web"): autorisierte Redirect-URI
`<AUTH_URL>/api/auth/callback/google`; Client-ID/Secret in `.env`. `AUTH_SECRET`
per `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
`AUTH_URL` = Basis-URL (lokal `http://localhost:3001`).

## Scope-Grenze (bewusst)

- Ein gemeinsamer Zugriffslevel (kein Rollen-/Rechte-System), keine DB-Sessions,
  keine eigene Login-Seiten-Gestaltung über die Auth.js-Defaults hinaus.
- Sync-CLI + CI bleiben ohne Auth (server-seitige Tools).
- Neue Dependency `next-auth@^5`; kein Schema-Change.
