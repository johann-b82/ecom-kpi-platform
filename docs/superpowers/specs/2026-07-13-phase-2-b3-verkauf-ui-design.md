# Phase 2 — B3 (Verkauf Ebene 2/3: Belegliste, Beleg-Detail mit Faden, manuelle Anlage) — Design

**Datum:** 2026-07-13
**Grundlage:** `bryx OS — Phase 2 (Gesamtdokument)` §4/§7; Roadmap in
`docs/superpowers/specs/2026-07-13-phase-2-umsetzungsplan-design.md` (Baustein B3).
**Voraussetzung:** B1+B2 (PR #66) — Datenmodell + Beleg-Kern
(`sales_orders/_lines/_events`, `transitionOrderStatus`, `createReturn`,
Server Actions).

Dieses Dokument beschreibt den **Umsetzungsweg** für die erste Verkauf-UI. Das
Produkt-Design steht im Gesamtdokument; hier geht es um Struktur und Repo-Mapping.

---

## 0. Gesperrte Entscheidungen (Brainstorming)

1. **Belegliste lebt unter `/verkauf`** (alle Kanäle, Spur-Spalte, Filter,
   „Neuer Beleg"). Die Ebene-1-Aggregatsicht (KPI-Zeile, Kanal-Vergleich,
   Kanal-Unterrouten) ergänzt **B4** oberhalb der Liste. Entspricht Spec §4
   (die Belegliste ist Teil von Ebene 1).
2. **Faden = horizontale Perlen.** Perlen links→rechts auf einer Linie, aktueller
   Status gefüllt, künftige offen, Klick → Popover (Zeitpunkt, Notiz, Quelle,
   „automatisch ausgelöst"). Die **Spur** in Listenzeilen ist die kompakte
   4–5-Punkt-Version derselben Form.
3. **Manuelle Anlage voll mit Auto-Vorbelegung** (Spec §4): Kunde → zieht
   Preisliste/Zahlungsziel/Lieferadresse; Positionen → Preis aus Kundenpreisliste
   + verfügbarer Bestand daneben; Warnung statt Blockade bei zu wenig Bestand.

## 1. Tragende Voraussetzung: `verkauf` als App registrieren

`requireAppAccess` hat **keinen Admin-Bypass** — Zugriff kommt ausschließlich aus
`group_app_access`-Zeilen (`src/lib/groups.ts`). Damit `/verkauf` zugänglich ist,
braucht B3 drei Registrierungsschritte:

- **`src/lib/apps.ts`:** Eintrag `{ key:'verkauf', label:'Verkauf', abbr:'VK', href:'/verkauf' }`. Der `AppKey`-Union enthält `'verkauf'` bereits (B2-Build-Fix).
- **`db/schema.sql`:** `'verkauf'` in die `group_app_access`-Seed-VALUES-Liste
  aufnehmen (Zeile mit `('dashboard'),('brickpm'),('kontakte'),('katalog')`).
  Weil der INSERT `ON CONFLICT DO NOTHING` idempotent bei jedem `migrate` läuft,
  erhält die bestehende `'Alle Nutzer'`-Gruppe (auf bryx-test/VPS) den
  `verkauf`-Grant beim nächsten Deploy — Phase-2-Grundsatz „jeder sieht alles".
- **`src/lib/help/content.ts`:** Modul-Hilfeseite `slug:'verkauf'`, `group:'module'`
  (sonst schlägt `tests/lib/help-content.test.ts` fehl, sobald `verkauf` in APPS ist).

## 2. Routen & Dateien (spiegelt Kontakte-Muster)

```
src/app/(shell)/verkauf/
  layout.tsx     Gate requireAppAccess('verkauf') + <VerkaufSidebar>
  page.tsx       Belegliste (server: listOrderRows()) → <VerkaufList>
  [id]/page.tsx  Beleg-Detail (server: getOrderView(id); notFound()) → <VerkaufDetail>
  neu/page.tsx   Manuelle Anlage (server: prefetch Kunden+Varianten+Preise) → <NeuerBeleg>
```

`VerkaufSidebar` (Items: **Belege**; Verbindungen folgt B8) analog `KontakteSidebar`.
`actions.ts` existiert aus B2 (createOrder/transition/createReturn) — B3 fügt keine
Schreib-Actions hinzu.

## 3. Repository-Leseergänzungen (`src/verkauf/repository.ts`)

Neue, rein lesende Funktionen (bestehende `getOrder`/`listOrders` bleiben
unangetastet — sie werden von den Transition-Funktionen genutzt):

- `listOrderRows(): OrderRow[]` — je Beleg: Order-Felder + `contactName` +
  `stages: EventStage[]` (`array_agg(stage ORDER BY occurred_at)`), sortiert
  `created_at DESC`. Speist Liste + Spur ohne N+1.
- `getOrderView(id): OrderView | null` — `SalesOrderDetail` + `contactName` +
  Positionszeilen mit `sku`/`productName` (Join `product_variants`/`products`).
  Speist Detail + Faden.
- `sellableVariants(): SellableVariant[]` — `{ variantId, sku, productName }` für
  aktive Varianten (Join Produkte), sortiert nach Produktname/SKU.
- `priceForVariant(variantId, priceListId, qty=1): number | null` — bestpassender
  `prices.amount` (`min_qty <= qty ORDER BY min_qty DESC LIMIT 1`).
- `availableStock(variantId): number` — `SUM(quantity_on_hand) − SUM(quantity_reserved)`
  über alle Lager (überall dieselbe Verfügbar-Formel).
- `customerDefaults(contactId): { priceListId, paymentTerms, deliveryAddress }` —
  für die Formular-Vorbelegung (reine Leseabfrage über `contacts`/`contact_addresses`).

`neu/page.tsx` prefetcht Kunden (mit Defaults), `sellableVariants()` (mit
`availableStock` je Variante) und eine kompakte Preis-Map je (Variante×Preisliste),
sodass `<NeuerBeleg>` ohne weitere Server-Round-Trips rechnen kann.

## 4. Komponenten (`src/components/`)

Alle `'use client'`, `useTransition` + `router.refresh()`, warme Neutrals +
`--accent`, Dark-Mode, `.anno`-Mikrolabels; wiederkehrende Tailwind-Strings als
lokale Consts (`INPUT`/`SECTION`/`ANNO` wie in `KatalogDetail`). Optik von
Faden/Chips über den `frontend-design`-Skill.

- **`Faden`** — horizontale Perlenleiste aus `OrderView.events`. Feste Stage-Reihe
  `bestellt · kommissioniert · rechnung_gestellt · bezahlt` plus **`retoure`** als
  5. Perle, sobald ein Retoure-Event existiert. Gefüllt = Event vorhanden, sonst
  offen. Klick → Popover mit `occurred_at`, `note`, `source_app` und Label
  „automatisch ausgelöst" bei `automated`.
- **`Spur`** — kompakte, nicht-interaktive Punktreihe aus `OrderRow.stages` für
  Listenzeilen (dieselbe Stage-Reihe, kleiner).
- **`VerkaufList`** — Tabelle: Nummer · Kunde · Kanal-Chip · Status-Chip · **Spur** ·
  Datum. In-Memory-Suche + Kanal-/Status-Filter-Chips (wie `KontakteList`). Zeile
  verlinkt `/verkauf/[id]`. Button „Neuer Beleg" → `/verkauf/neu`.
- **`VerkaufDetail`** — Kopf (Nummer, Kunde-Link zu `/kontakte/[id]`, Kanal-Chip,
  Status-Chip) · **Faden** · Positionen-Tabelle · **genau eine primäre Aktion je
  Status** · „…"-Menü (Sekundäres).
- **`NeuerBeleg`** — Kunde-Auswahl (zieht Defaults) → Positions-Editor (Variante
  wählen → Preis aus Kundenpreisliste vorbelegt, `verfügbar`-Zahl daneben,
  **Warnung** wenn `menge > verfügbar`, keine Blockade) → Speichern ruft
  `createOrderAction`, danach `router.push('/verkauf/'+id)`.

## 5. Primäraktionen je Status (Spec §4)

| Status | Primäraktion | Mechanik |
|---|---|---|
| `angebot` | „In Auftrag wandeln" | `transitionOrderStatusAction(id,'auftrag')` |
| `auftrag` | *(keine)* — Hinweis „Wartet auf Versand" | — |
| `versendet` | „Rechnung stellen" | `transitionOrderStatusAction(id,'rechnung_gestellt')` |
| `rechnung_gestellt` | *(keine)* — Hinweis „Wartet auf Zahlung" | — |
| `bezahlt` | „Retoure anlegen" | `createReturnAction(id)` |

„…"-Menü: **Stornieren** (nur sichtbar/aktiv bei `angebot`/`auftrag` — die
Übergangslogik erlaubt Storno nur dort, s. B2-Entscheidung). Kopie/PDF sind
spätere Phasen. Der `versendet`-Übergang wird von Verfügbarkeit (B5) ausgelöst,
nicht hier — deshalb hat `auftrag` bewusst keine Verkauf-Primäraktion.

## 6. Design-System / Rot-Regel

- Kanal-Chips und Status-Chips mit warmen Tokens; **Rot nur für „braucht
  Aufmerksamkeit"** — hier die `retoure`-Perle/-Chip. Kein dekoratives Rot.
- Status→Ton (unverbindlicher Startpunkt, Feinschliff via `frontend-design`):
  angebot neutral · auftrag/versendet akzentnah · rechnung_gestellt `warning` ·
  bezahlt `success` · retoure `danger` · storniert gedimmt.

## 7. Definition of Done

- Repository-Tests (echter Pool): `listOrderRows` liefert Stages in Reihenfolge +
  Kundenname; `availableStock` = on_hand−reserved; `priceForVariant` wählt die
  Staffel korrekt; `getOrderView` liefert Positions-Labels + Kundenname.
- `tests/lib/help-content.test.ts` grün (neue `verkauf`-Hilfeseite).
- Vorführbar mit den B2-Seeds: Liste zeigt Spur über ≥3 Kanäle; Detail eines
  Shop-Belegs zeigt den vollen Faden inkl. Retoure-Perle; manuelle Anlage erzeugt
  einen Beleg mit korrekt vorbelegtem Preis.
- Auf **bryx-test** deployen und den Faden/Liste/Anlage **selbst im Browser
  prüfen** (Claude in Chrome / DevTools) vor Übergabe.

## 8. Bewusst nicht in B3

- Ebene-1-Aggregate, Kanal-Vergleich, Kanal-Unterrouten, `/dashboard`-Frage → **B4**.
- `Einstellungen → Verbindungen` für Verkauf → **B8**.
- Bearbeiten/Löschen bestehender Belegpositionen (Belege sind nach Anlage über den
  Faden-Fluss unveränderlich außer via Status/Storno/Retoure) — kein Inline-Edit.
