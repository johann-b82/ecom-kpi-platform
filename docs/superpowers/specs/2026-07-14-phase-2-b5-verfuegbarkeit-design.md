# Phase 2 · B5 — Verfügbarkeit (Design)

**Datum:** 2026-07-14
**Grundlage:** Roadmap `docs/superpowers/specs/2026-07-13-phase-2-umsetzungsplan-design.md`
(B5 = „Verfügbarkeit: Bestandsübersicht, Reservierung, Wareneingang,
Meldebestand-Entwurf", abhängig von B1/B2). Aufsetzend auf B1 (Schema: `warehouses`,
`stock_levels`, `stock_adjustments`, `purchase_orders`, `purchase_order_lines`) und
B2 (`transitionOrderStatus` schreibt bereits `stock_levels`).
**Zweck:** Das erste UI der Verfügbarkeit-Ebene — Bestände sehen, korrigieren,
Wareneingänge buchen und aus Meldebeständen Nachbestellungen entwerfen.

---

## 0. Gesperrte Entscheidungen (aus dem Brainstorming)

1. **Geschlossener Beschaffungs-Loop.** Der Meldebestand-Entwurf **erzeugt eine
   Bestellung im Status `entwurf`** (daher „Entwurf" = PO-Status `entwurf`), die
   im Wareneingang bestellt und eingebucht wird. Meldebestand und Wareneingang
   sind zwei Enden desselben Kreislaufs, kein reiner Report.
2. **Bestandskorrektur ist Teil von B5.** Eine gated `adjustStock()` schreibt
   `stock_adjustments` **und** bewegt `quantity_on_hand`. Das ist der
   Schreibpfad, den Verkauf/Wareneingang nicht abdecken (Inventurdifferenz,
   Bruch/Schwund, Fehlbuchung).
3. **Bestandsübersicht = pro Variante, mit Lager-Drill.** Landing zeigt eine
   Zeile je Variante (verfügbar = Σon_hand − Σreserved über alle Lager); Klick
   öffnet die Lager-Aufschlüsselung + Korrektur. Kein flaches
   (Variante × Lager)-Grid als Einstieg.
4. **Wareneingang bucht ins Default-Lager.** Die Entnahme-Logik aus B2 ist
   bewusst simpel gehalten (§5 Fachspec); der Wareneingang spiegelt das und
   bucht in das `is_default`-Lager. Ein Lager-Picker pro Wareneingang ist ein
   billiger späterer Zusatz, **nicht** in B5.
5. **Verfügbarkeit rechnet in Stückzahlen, nicht in Geld.** Keine Netto-Labels
   (die gehören zu Verkauf). Bestandswert zu EK ist bewusst außerhalb B5.

---

## 1. App-Registrierung & Routing

Neue App `verfuegbarkeit` (Kürzel **`VF`**, Label **Verfügbarkeit**,
href `/verfuegbarkeit`) in `src/lib/apps.ts` (`AppKey`-Union + `APPS`).

**App-Zugriff-Falle (verbindlich):** `requireAppAccess` hat **keinen**
Admin-Bypass; Zugriff läuft nur über `group_app_access`. Der Migrate-Schritt
grantet `verfuegbarkeit` deshalb **idempotent an alle bestehenden Gruppen**:

```sql
INSERT INTO group_app_access (group_id, app, permission)
SELECT group_id, 'verfuegbarkeit', permission
  FROM group_app_access WHERE app = 'katalog'
ON CONFLICT DO NOTHING;
```

(am selben Ort wie der `verkauf`-Grant). Ohne diesen Schritt ist das Modul für
die realen Gruppen `Administratoren`/`Nutzer` gesperrt, obwohl der APPS-Eintrag
existiert.

**Routing-Karte:**

```
/verfuegbarkeit                       Bestandsübersicht (Ebene 1): Variante →
                                      verfügbar / reserviert / Meldebestand-Flag
/verfuegbarkeit/[variantId]           Varianten-Detail: Lager-Aufschlüsselung +
                                      „Bestand korrigieren" + Korrektur-Historie
/verfuegbarkeit/wareneingang          Bestell-Liste (alle Status)
/verfuegbarkeit/wareneingang/[id]     Bestell-Detail: Positionen, „Bestellung
                                      auslösen", „Wareneingang buchen"
/verfuegbarkeit/meldebestand          Artikel unter Meldebestand +
                                      „Nachbestellung entwerfen"
```

`VerfuegbarkeitSidebar` (analog `VerkaufSidebar`): **Bestand · Wareneingang ·
Meldebestand**. `layout.tsx` spiegelt `verkauf/layout.tsx`:
`requireAppAccess('verfuegbarkeit')`-Gate (Redirect `/` bei fehlendem Zugriff)
+ Sidebar, `force-dynamic`.

---

## 2. Repository, Typen & zentrale Mutationen (`src/verfuegbarkeit/`)

Spiegelt das Verkauf-Muster: `types.ts`, `repository.ts` (raw `pg` Pool,
parametrisierte `pool.query`, `NUMERIC → Number()`, `snake_case → camelCase`
über `mapX`), `number.ts` (`nextPurchaseOrderNumber(existing) → B-2026-NNNN`),
`labels.ts` (Status-/Grund-Labels menschlich).

**Zwei gesperrte Traps aus B2 gelten weiter:**

- Jede Mutation läuft in **einer Transaktion** (`pool.connect()` + `BEGIN/COMMIT`,
  `c.release()` im `finally`).
- Jedes bestandschreibende `INSERT … SELECT … ON CONFLICT` **aggregiert per
  Variante** (`SUM(quantity) GROUP BY variant_id`), sonst Postgres-Fehler /
  Fehlbuchung bei zwei Positionen derselben Variante.

### 2.1 Lesend

- `listStock(): StockRow[]` — eine Zeile je Variante: `sku`, `label`,
  `onHand = Σquantity_on_hand`, `reserved = Σquantity_reserved`,
  `available = onHand − reserved`, `reorderPoint`, `belowReorder`
  (`reorderPoint > 0 AND available < reorderPoint`). Nutzt das bestehende
  `availableStock`-Idiom (`SUM(on_hand) − SUM(reserved)` über alle Lager).
- `getVariantStock(variantId): VariantStockDetail | null` — Kopf (sku/label/
  reorderPoint) + `perWarehouse` (Lager-Name, on_hand, reserved) +
  `adjustments` (jüngste `stock_adjustments`, absteigend `created_at`).
- `listPurchaseOrders(): PurchaseOrderRow[]` — number, Lieferant-Name, status,
  expected_at, Positions-/Eingangs-Summen.
- `getPurchaseOrder(id): PurchaseOrderDetail | null` — Kopf + `lines`
  (variant sku/label, `quantityOrdered`, `quantityReceived`, `unitCost`).
- `listReorderSuggestions(): ReorderSuggestion[]` — Varianten mit
  `available < reorder_point` (`reorder_point > 0`): sku, label, available,
  reorderPoint, `defaultSupplierId`/-name (aus `products.default_supplier_id`,
  nullable), `suggestedQty` (`reorderPoint * 2 − available`, min 1).

### 2.2 Schreibend (gated in der Action-Ebene auf `verfuegbarkeit/edit`)

| Funktion | Wirkung |
|---|---|
| `adjustStock(variantId, warehouseId, delta, reason, note?)` | Insert `stock_adjustments` (`reason ∈ {inventurdifferenz, bruch_schwund, korrektur_fehlbuchung}`) **und** Upsert `stock_levels.quantity_on_hand += delta` (ON CONFLICT auf `(variant_id, warehouse_id)`). Guard: Ergebnis-`on_hand` ≥ 0. |
| `createDraftPurchaseOrder({ supplierId, lines })` | Insert `purchase_orders` (status `entwurf`, `number` via `nextPurchaseOrderNumber`) + `purchase_order_lines`. Rückgabe: neue PO-Id. |
| `markPurchaseOrderOrdered(poId)` | `entwurf → bestellt`. Ungültiger Ausgangsstatus wirft. |
| `receiveGoods(poId, receipts[{ lineId, quantity }])` | Der Wareneingangs-Flaschenhals: `purchase_order_lines.quantity_received += quantity` (Guard: received ≤ ordered), `stock_levels.quantity_on_hand += quantity` im **`is_default`-Lager** (Upsert). Danach PO-Status: **alle** Zeilen voll eingegangen → `abgeschlossen`, sonst `teilweise_eingegangen`. Zulässiger Ausgangsstatus: `bestellt`/`teilweise_eingegangen`. |
| `cancelPurchaseOrder(poId)` | `entwurf`/`bestellt → storniert`. Kein Bestand berührt (nichts eingegangen). |

**Zwei bewusste Design-Entscheidungen (§0.4 + Verkauf-Abgrenzung):**

- **Wareneingang bucht ins `is_default`-Lager** (wie B2 die Reservierung
  lagerunabhängig hält). Kein Lager-Picker in B5.
- **Wareneingang gibt keine Reservierungen frei.** Reservierungen sind
  Verkaufs-Sache und werden ausschließlich von `transitionOrderStatus`
  bewegt; der Wareneingang erhöht nur das Angebot (`quantity_on_hand`).

Es gibt **keinen** `sales_order_events`-Schreibvorgang in Verfügbarkeit — der
Faden ist beleggebunden; Wareneingänge sind über `purchase_order_lines.
quantity_received` auditierbar.

---

## 3. Server Actions

`src/app/(shell)/verfuegbarkeit/actions.ts` (`'use server'`), jede Action:
(1) `requireAppAccess('verfuegbarkeit','edit')`, (2) Repository, (3)
`revalidatePath(...)`, Fehler als plain `Error`:

- `adjustStockAction(variantId, warehouseId, delta, reason, note?)` →
  revalidate `/verfuegbarkeit` + `/verfuegbarkeit/[variantId]`.
- `createDraftPurchaseOrderAction(input)` → revalidate `/verfuegbarkeit/wareneingang`
  + `/verfuegbarkeit/meldebestand`; gibt neue PO-Id zurück (Client redirectet
  auf das Bestell-Detail).
- `markPurchaseOrderOrderedAction(poId)` / `receiveGoodsAction(poId, receipts)` /
  `cancelPurchaseOrderAction(poId)` → revalidate `/verfuegbarkeit/wareneingang`
  (+ `/[id]`) und `/verfuegbarkeit` (Bestand ändert sich beim Wareneingang).

---

## 4. UI (vier Bausteine)

Alle Komponenten `'use client'` wo interaktiv, `useTransition` +
`router.refresh()`, **Liste → Detail-Panel** (kein Modal), warme `neutral`-Skala
+ `--accent`, Dark-Mode-Varianten, `.anno` für Mikrolabels, wiederkehrende
Tailwind-Strings als lokale Consts (keine Komponentenbibliothek).

### 4.1 Bestandsübersicht (`/verfuegbarkeit`)
Server-Component, `force-dynamic`. Tabelle eine Zeile je Variante:
**SKU · Bezeichnung · verfügbar · reserviert · Meldebestand**, mit Warn-Chip
(Akzent/Amber, **kein** hartes Rot außer „braucht Aufmerksamkeit") wenn
`belowReorder`. Leichte Kopfleiste: *Artikel unter Meldebestand* (Anzahl) ·
*Lager* (Anzahl). Zeile → Varianten-Detail.

### 4.2 Varianten-Detail (`/verfuegbarkeit/[variantId]`)
`notFound()` bei unbekannter Variante. Lager-Aufschlüsselung (Lager · on_hand ·
reserviert), **„Bestand korrigieren"**-Formular (Lager-Select, Delta ±,
Grund-Select über Label-Map, optionale Notiz) → `adjustStockAction`, plus
Korrektur-Historie (`stock_adjustments`, jüngste zuerst).

### 4.3 Wareneingang (`/verfuegbarkeit/wareneingang` + `/[id]`)
Liste: number · Lieferant · Status-Chip · expected_at · „x/y eingegangen".
Detail: Positionen mit bestellt/eingegangen; **„Bestellung auslösen"**
(`entwurf → bestellt`) und **„Wareneingang buchen"**-Formular (Menge je Position,
vorbelegt mit Restmenge) → `receiveGoodsAction`. `entwurf`/`bestellt` zeigen
zusätzlich **„Bestellung stornieren"**.

### 4.4 Meldebestand-Entwurf (`/verfuegbarkeit/meldebestand`)
Liste der Varianten unter Meldebestand (verfügbar · Meldebestand · Fehlmenge).
Je Zeile **„Nachbestellung entwerfen"** → kleines Formular (Lieferant-Select,
vorbelegt aus `products.default_supplier_id`; Picker = Kontakte; Menge vorbelegt
`suggestedQty`) → `createDraftPurchaseOrderAction` erzeugt eine einzeilige
`entwurf`-PO und leitet auf `/verfuegbarkeit/wareneingang/[neueId]` weiter.
Damit schließt sich der Loop: Meldebestand → Entwurf → auslösen → einbuchen →
Bestand steigt → Variante fällt aus der Meldebestand-Liste.

---

## 5. Seed

`scripts/seed-verfuegbarkeit.ts` seedet bereits 3 Lager (eins `is_default`,
eins `konsignation`), Bestände (SJ-ROT in zwei Lagern, unter `reorder_point`)
und eine Korrektur. B5 **erweitert** ihn (idempotent `ON CONFLICT (id) DO UPDATE`,
stabile UUIDs), damit die neuen UIs Inhalt haben:

- **Eine `teilweise_eingegangen`-Bestellung** (z. B. `B-2026-0001` an Guangzhou
  ToyCraft, SJ-ROT: bestellt 50, eingegangen 20) → gibt dem Wareneingang einen
  echten „buchen"-Fall und zeigt den Teil-Status.
- Kein zusätzlicher Meldebestand-Seed nötig: SJ-ROT (verfügbar 12 < 20) liefert
  die Meldebestand-Story sofort.

Seed-Daten als typisierte Consts in `src/verfuegbarkeit/seed-data.ts`
(erweitert die bestehende Datei). Kein neues npm-Script (nutzt
`seed-verfuegbarkeit`).

---

## 6. Hilfe & Datenmodell (CLAUDE.md Definition-of-Done)

- **Neue Modul-Hilfeseite `verfuegbarkeit`** (`src/lib/help/content.ts`,
  `group:'module'`, **Slug = `verfuegbarkeit`**) — sonst schlägt
  `tests/lib/help-content.test.ts` fehl. Inhalt: Bestandsübersicht
  (verfügbar = Σon_hand − Σreserved, Meldebestand-Flag), Reservierung (entsteht
  automatisch aus Verkauf, hier nur sichtbar), Bestandskorrektur mit
  Pflicht-Grund, Wareneingang (`entwurf → bestellt → teilweise_eingegangen →
  abgeschlossen`, bucht ins Default-Lager), Meldebestand-Entwurf → Draft-PO-Loop.
- **Kein Datenmodell-Change:** alle fünf Tabellen sind seit B1 in der
  `datenmodell`-Admin-Seite dokumentiert (`content.ts` „Verfügbarkeit: warehouses
  … purchase_orders/purchase_order_lines"). Unberührt.
- **Kein neuer Connector** → `verbindungen` unberührt (Verfügbarkeit-
  Verbindungsmenü ist B8).

---

## 7. Tests & Verifikation (DoD)

- `tests/verfuegbarkeit/repository.test.ts` (echter Pool, `afterAll`-Cleanup):
  - `listStock` aggregiert SJ-ROT über zwei Lager korrekt (verfügbar = Σ).
  - `adjustStock` schreibt `stock_adjustments`-Zeile **und** bewegt `on_hand`;
    negativer Endbestand wirft.
  - `receiveGoods`: Teil-Eingang → `teilweise_eingegangen`, restlicher Eingang →
    `abgeschlossen`, `on_hand` im Default-Lager erhöht; Über-Eingang
    (received > ordered) wirft.
  - `createDraftPurchaseOrder` legt PO mit Status `entwurf` + Zeile an;
    `markPurchaseOrderOrdered`/`cancelPurchaseOrder` Status-Guards.
  - `listReorderSuggestions`: SJ-ROT gelistet (mit `defaultSupplierId`),
    ausreichend bevorratete Variante nicht.
- `tests/db/rls.test.ts`: die fünf Tabellen sind seit B1 in der Deny-Liste —
  grün bestätigen, **keine** neuen Zeilen.
- Action-Unit-Tests (gemocktes Repo/`groups`/`next/cache`): Gate auf
  `verfuegbarkeit/edit`, Repo-Aufruf, Revalidate.
- `tests/lib/apps-access.test.ts` / `tests/lib/groups.test.ts`: `verfuegbarkeit`
  in die Admin-App-Listen-Literale aufnehmen (Union-Change-Ripple).
- `help-content` grün mit neuem Slug. `tsc --noEmit` sauber, volle Suite grün.
- **Deploy auf bryx-test** (`/opt/budp-dev/deploy.sh`) — **nie** Produktion —
  und Browser-Verifikation: Übersicht mit Meldebestand-Flag; Korrektur bucht
  (Historie erscheint); Wareneingang Teil- und Voll-Eingang (Status wandert);
  Meldebestand → Entwurf → PO erscheint im Wareneingang; Rail zeigt
  „Verfügbarkeit" für Admin; Konsole fehlerfrei.

---

## 8. Bewusst außerhalb B5 (später)

- Lager-Picker pro Wareneingang; mehrzeiliger manueller PO-Bau (Entwurf ist
  einzeilig, Erweiterung im Wareneingang später).
- Bestandswert zu EK, Umlagerungen zwischen Lagern.
- Verfügbarkeit-Verbindungsmenü → **B8**.
- Finanz-Kopplung (Kreditor-Offene-Posten aus Bestellungen) → **B6**.
