# bryx OS — Phase 1: Kontakte & Katalog — Design

**Date:** 2026-07-12
**Status:** Approved (design), pending implementation plan
**Source domain doc:** `bryx-phase1-kontakte-katalog.md` (provided by user)

## Goal

Build the two foundational apps of bryx OS — **Kontakte** and **Katalog** — as
two apps in the existing `(shell)` platform, mirroring the BrickPM module
pattern. Phase 1 is the data fundament plus the interactions the domain doc
specifies; nothing beyond it.

Guiding principle from the doc: **a field exists only if a later module needs it
or an automation reads it.** Everything else is a note field.

## Approved decisions (from brainstorming)

1. **Scope:** both apps in one spec/plan. Implement **Kontakte first** — Katalog's
   `products.default_supplier_id` references `contacts`.
2. **Multi-tenancy:** add nullable `tenant_id` on every table + a `tenants`
   control-plane table + `external_references`. **No `db_mode`-aware data-access
   logic / no pooled RLS** now — dedicated DB per customer, `tenant_id` stays
   null. Cheap future-proofing, no dead code.
3. **Schema extras:** include **both** the Zolltarifnummer field
   (`product_variants.customs_tariff_no`) **and** compliance documents
   (`product_documents`, CE/EN71 + expiry).
4. **VIES:** build the **real**, non-blocking USt-IdNr. check. All other
   integrations are mock-status placeholders.

## Existing patterns this must follow (do not reinvent)

- **Data access:** raw `pg` `Pool` (`src/lib/db.ts`, `DATABASE_URL`). Supabase is
  auth only. Repos map snake_case → camelCase and cast DATE columns `::text`
  (timezone-safe), exactly like `src/brickpm/repository.ts`.
- **Schema:** one idempotent file `db/schema.sql` (`CREATE TABLE IF NOT EXISTS`,
  `ADD COLUMN IF NOT EXISTS`) + `db/rls.sql`, applied by `npm run migrate`
  (`scripts/migrate.ts` runs the whole file). No versioned migrations.
- **Module layout:** `src/<mod>/{repository.ts,types.ts,<logic>.ts,seed-data.ts}`.
- **UI:** pages under `src/app/(shell)/<app>/` with a `layout.tsx` + sidebar;
  client tables/forms as `src/components/*`; server actions in `actions.ts`
  guarded by `requireAppAccess(app, right)` + `revalidatePath`.
- **Registry & access:** `src/lib/apps.ts` (`AppKey` union, `APPS`) +
  `src/lib/groups.ts` (`group_app_access` per app); default access seeded in
  `db/schema.sql` for the `Alle Nutzer` group.
- **Design system:** the warm Amber ERP tokens (`docs/design/design-system.md`).
  The domain doc's prototype theme (Indigo/Gold, Space Grotesk) is explicitly
  **not** adopted.

## A. Schema additions (append to `db/schema.sql`, idempotent)

Every table gets `tenant_id UUID REFERENCES tenants(id)` **nullable** (column
only — no mode logic). Created in FK-dependency order:

1. **`tenants`** — `id uuid pk`, `name`, `subdomain unique`,
   `db_mode` CHECK in (`dedicated`,`pooled`) default `dedicated`,
   `status` CHECK in (`aktiv`,`inaktiv`,`gekuendigt`), `created_at`.
2. **`price_lists`** — `name`, `currency char(3) default 'EUR'`, `is_default bool`.
   (Referenced by both `contacts` and `prices`.)
3. **`contacts`** — `number text unique` (K-#### sprechend), `name not null`,
   `legal_form`, `is_customer bool default false`, `is_supplier bool default false`,
   `vat_id`, `tax_country char(2)`, `payment_terms int default 14`,
   `price_list_id → price_lists`, `currency char(3) default 'EUR'`,
   `language char(2) default 'de'`, `status` in (`aktiv`,`inaktiv`), `notes`,
   `created_at`.
4. **`contact_addresses`** — `contact_id → contacts on delete cascade`,
   `type` in (`rechnung`,`lieferung`), `street,zip,city,country`, `is_default bool`.
5. **`contact_persons`** — `contact_id → contacts on delete cascade`,
   `name,email,phone,role`.
6. **`products`** — `name not null`, `description`,
   `lifecycle_status` in (`konzept`,`freigegeben`,`aktiv`,`auslaufend`,`eingestellt`),
   `category`, `brand`, `default_supplier_id → contacts`, `image_url`, `created_at`.
7. **`product_variants`** — `product_id → products on delete cascade`,
   `sku text unique`, `gtin`, `attributes jsonb`, `purchase_price numeric(12,2)`,
   `weight_g int`, `reorder_point int default 0`, `customs_tariff_no text`,
   `status` in (`aktiv`,`inaktiv`).
8. **`prices`** — `variant_id → product_variants`, `price_list_id → price_lists`,
   `min_qty int default 1`, `amount numeric(12,2)`, `valid_from date`,
   `unique(variant_id, price_list_id, min_qty)`.
9. **`product_bundles`** — `bundle_variant_id → product_variants`,
   `component_variant_id → product_variants`, `quantity int`.
10. **`product_documents`** (Compliance) — `product_id → products on delete cascade`,
    `type text` (CE/EN71/…), `file_url text`, `expires_at date`, `uploaded_at timestamptz`.
11. **`external_references`** — `entity_type`, `entity_id uuid`, `source_system`,
    `external_id`, `last_synced_at`, `raw_payload jsonb`. Generic mirror table; not
    populated in Phase 1 beyond what real syncs write later.
12. **`integration_connections`** (stub connection menu) — `app text`,
    `provider text`, `label text`, `status text`, `last_synced_at timestamptz`.
    Mirrors `bpm_integrations` + `simulateIntegration`.

## B. Registry, access, shell

- Add `kontakte` and `katalog` to `AppKey` + `APPS` in `src/lib/apps.ts`
  (abbr **KO** / **KA**; href `/kontakte`, `/katalog`).
- Extend the `group_app_access` seed VALUES in `db/schema.sql` so `Alle Nutzer`
  gets `edit` on both.
- Each app is a `(shell)/<app>/` route group with a light BrickPM-style sidebar:
  **Liste** and **Einstellungen → Verbindungen**. Detail is a drill-down route
  `/<app>/[id]`.

## C. Modules

`src/kontakte/` and `src/katalog/`, each:

- `repository.ts` — pg queries, snake→camel, `::text` dates. `tenant_id` is
  selected but always null in Phase 1.
- `types.ts` — TS types.
- Pure-logic files: `src/katalog/lifecycle.ts` (status-weiche),
  `src/katalog/margin.ts` (EK → Marge), `src/kontakte/number.ts` (K-#### gen),
  `src/lib/vies.ts` (VAT check).
- `seed-data.ts` — Phase-1 seed sets.

Server actions in `src/app/(shell)/<app>/actions.ts`, each calling
`requireAppAccess('<app>','edit')` then a repository mutation then
`revalidatePath`.

## D. Key behaviours

- **VIES (real, non-blocking).** `src/lib/vies.ts` calls the EU VIES REST API with
  a short timeout; a `checkVat(vatId)` server action returns
  `{ valid, name?, error? }`. UI runs it on blur of `vat_id`, shows a ✓/⚠ badge,
  and **never blocks save** (EU service down ⇒ save still works). No mandatory
  persistence in Phase 1.
- **Lifecycle-Weiche.** Pure function `lifecycle(status) → { verkaufbar,
  bestellbar, shop_sichtbar }` implementing the doc's table. Unit-tested. The
  status chip in Katalog-Detail is clickable → change with a one-line explanation
  of what it triggers.
- **Role reveal.** Toggling *Lieferant* on a contact reveals supplier-only fields
  (client-side); toggling off hides them.
- **Inline-edit variant table, no modals** (doc requirement) — mirror the repo's
  editable-table pattern.
- **Connection stubs.** Button sets `status='verbunden (Demo)'` +
  `last_synced_at=now()`, exactly like BrickPM's `simulateSync`. No real API call.

## E. UI

**Kontakte — Liste:** Suchfeld · Filter (Kunde/Lieferant/beide) · Tabelle
(Name · Rolle · Ort · Status).
**Kontakte — Detail:** single screen — Kopf (Name, Nummer, Rollen-Chips);
Block 1 Adressen; Block 2 Ansprechpartner; Block 3 Konditionen (Zahlungsziel,
Preisliste, Währung); Block 4 Historie (placeholder — ab Phase 2).

**Katalog — Liste:** Suchfeld · Filter (Status) · Tabelle
(Bild · Name · Varianten-Anzahl · Status · EK).
**Katalog — Detail:** Kopf (Bild, Name, Status-Chip klickbar); Block 1
(Beschreibung, Kategorie, Marke, Standardlieferant); Block 2 Varianten-Tabelle
inline editierbar (SKU, Attribute, EK, Meldebestand, Zolltarif); Block 3 Preise
je Preisliste (kompakte Matrix Preisliste × Staffel); Block 4 Bundle-Komponenten
(nur wenn Bundle); Compliance-Dokumente (Upload + Ablaufdatum).

## F. Uploads (one new infra touch)

Product images + compliance docs → **Supabase Storage** (self-hosted stack under
`infra/supabase/`) via one small `src/lib/storage.ts` helper; store the returned
URL on `products.image_url` / `product_documents.file_url`.
**Fallback:** if Storage is not enabled on the host, degrade to a URL-paste
field. Storage availability is verified during implementation before committing
to it.

## G. Seed & tests

**Seed** (`src/<app>/seed-data.ts` + `scripts/seed-kontakte.ts` /
`scripts/seed-katalog.ts`, wired as `npm run seed-kontakte` / `seed-katalog`)
covers the doc's Definition of Done:

- Kontakte: Spielwaren Müller GmbH (Kunde, Handel, 21 Tage); ToyWorld,
  Kinderparadies eG, Spielzeugmarkt Nord (weitere Kunden, versch. Konditionen);
  Guangzhou ToyCraft Ltd. (nur Lieferant, USD, kein vat_id); **≥1 Kontakt mit
  Kunde+Lieferant gleichzeitig**.
- Katalog: „Sternenjäger" (Aktiv, Farbvarianten, Teil eines Bundles); je ein
  Produkt in Konzept/Freigegeben/Auslaufend/Eingestellt; „Bauklötze Classic",
  „Weltraum-Buggy"; ≥1 Bundle (3er-Pack); Preislisten Handel/Endkunde/Key Account
  mit ≥1 Staffelpreis; **≥1 Variante unter Meldebestand**.
- Verbindungen: ≥1 „Verbunden (Demo)" mit `last_synced_at`, ≥1 „Nicht verbunden".

**Tests (TDD):** pure-logic unit tests (lifecycle-weiche, margin, VAT format,
number generation) written first; jsdom component tests for forms/tables,
following the existing `tests/` layout. Repository SQL exercised via the repo's
existing DB test helpers where present.

## Out of scope (Phase 1)

Branchen-Klassifizierung, Vertriebsgebiete, Lead-Scoring, CRM tagging;
Stücklisten, Chargen/Serien, mehrsprachige Produkttexte; real shop/marketplace
sync; encrypted credential storage (stubs only); `db_mode`-aware access layer +
pooled RLS. History block in contacts is a placeholder until Phase 2.

## Open business questions (do not block build)

- Criterion for pooled vs dedicated tenants (business, not technical).
- Whether direct toy import makes an early compliance *automation* needed
  (schema field is already in; the automation is Phase 3+).
