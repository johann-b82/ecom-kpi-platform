# Status — Self-hosted Supabase Migration (ON HOLD)

**Stand:** 2026-06-19 · **Status:** ⏸️ pausiert (auf Wunsch) · **Branch:** `feat/supabase-migration`

## Wo wir stehen

Design und Plan sind fertig und committet; die Umsetzung wurde **vor Task 1**
pausiert. Es ist noch **kein** Implementierungs-Code geschrieben.

| Artefakt | Status | Commit |
|---|---|---|
| Design-Spec | ✅ committet | `7b1c105` (`docs/superpowers/specs/2026-06-19-supabase-migration-design.md`) |
| Implementierungsplan (9 Tasks, 3 Phasen) | ✅ committet | `8611a58` (`docs/superpowers/plans/2026-06-19-supabase-migration.md`) |
| Task 1–9 Umsetzung | ⏳ offen (nicht begonnen) | — |

Der Branch steht pristine auf `8611a58` (auf Basis von `main` @ `8689177`, das die
gemergte Auth.js-Lösung enthält). Working tree ist sauber.

## Was bewusst weggeräumt wurde

Ein Subagent hatte Task 1 begonnen und den offiziellen Supabase-Self-Hosting-Stack
nach `infra/supabase/` geklont (inkl. eines lokalen `infra/supabase/.env` mit
Test-Secrets). Das war **git-ignored und nie committet**; beim Pausieren wurde der
gesamte WIP gelöscht und `.gitignore` zurückgesetzt. **Keine Secrets im Git-Verlauf.**
Task 1 wird beim Fortsetzen frisch nach Plan ausgeführt (Klon ist in Minuten
reproduzierbar).

## Wichtige Entscheidungen / Vorbehalte (beim Fortsetzen beachten)

1. **Voll Supabase-nativ** für Auth + RLS + DB; **AES-Tresor bleibt** (kein Supabase
   Vault — `pgsodium` im self-hosted Stack zu wackelig).
2. **Credential-Pfad-Abweichung (markiert in „Global Constraints" des Plans):**
   `src/lib/credentials.ts` bleibt auf dem privilegierten `pg`-Pfad (geteilt von
   Sync-CLI + `/api/credentials`-Route). RLS auf `connector_credentials` ist trotzdem
   **an** (keine anon/authenticated-Policy → öffentliche API gesperrt). Falls du die
   Route doch auf `supabase-js` ziehen willst → Plan + Task 7/8 anpassen.
3. **Gepinnter Upstream-Tag** in Task 1 (`REF=v1.24.07`) ggf. auf eine aktuell
   verfügbare Self-Hosting-Version prüfen (`git ls-remote --tags
   https://github.com/supabase/supabase | tail`).
4. **Frischer Daten-Start** (kein Migrieren der lokalen Postgres-Zeilen; Sync ist
   idempotent).
5. **Auth.js wird in Task 5 entfernt** (`next-auth`, `src/auth.ts`,
   `[...nextauth]/route.ts`, `src/lib/allowlist.ts` + Test). Bis dahin bleibt die
   aktuelle Auth.js-Auth auf `main` voll funktionsfähig.

## So wird fortgesetzt (subagent-getrieben, wie bei Auth)

1. Test-Postgres (einfacher pg — voller Supabase-Stack nur für manuelle Live-Verify):
   ```bash
   docker run -d --name kpi-sb-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=postgres -p 5433:5432 postgres:16
   ```
   → Implementer der DB-abhängigen Tasks (T2/T7/T9) bekommen
   `DATABASE_URL=postgres://postgres:postgres@localhost:5433/postgres`.
2. Im Worktree: `npm install` (Deps), `npm test` (Baseline = 102 grün gegen die Test-DB
   nach `migrate`+`seed`).
3. SDD wieder aufnehmen: Ledger + Briefs liegen unter
   `.git/worktrees/supabase-migration/sdd/` (task-1..9-brief.md). Task 1 starten,
   pro Task Implementer + Review, am Ende Opus-Gesamt-Review → PR → CI grün → Merge.
4. Tasks-Übersicht: SB-T1…T9 + SB-Final (siehe Aufgabenliste der Session bzw. Plan).

## Test-/CI-Hinweise (im Plan verankert)
- Unit-Tests von T3/T4/T5/T6/T8 sind **gemockt** → kein laufender Stack nötig.
- DB-abhängig (laufende Postgres nötig): `migrate`/`seed`, T2-Verify, **T7 RLS**
  (`SET ROLE authenticated/anon`), T9 CI-Parität.
- CI braucht **keinen** vollen Supabase-Stack — nur einen einfachen Postgres-Service.
- Manuelle Live-Verifikation (echter Stack + GoTrue-Login) ist im Plan als letzter,
  separater Abschnitt aufgeschoben (braucht deinen Rechner/`.env`).
