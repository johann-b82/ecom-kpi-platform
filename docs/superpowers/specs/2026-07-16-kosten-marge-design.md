# Kosten & Marge — Design-Spec

*Datum: 2026-07-16 · Branch-Kontext: feat/phase-3-echte-kanaldaten*

## Problem

bryx kennt auf der Verkaufsseite bisher nur **Umsatz**. Der Kanal-Vergleich auf
`/verkauf` zeigt z.B. Amazon 42.000 € vs. B2B 18.000 € — und suggeriert damit,
Amazon sei dreimal so wertvoll. Für einen Amazon-Seller ist das falsch bis
gefährlich: von den 42.000 € gehen Referral Fee, FBA-Gebühren, Werbung und
Retouren ab. Was übrig bleibt, kann unter dem B2B-Deckungsbeitrag liegen. Ohne
Kostenseite ist der Kanal-Vergleich nicht nur unvollständig, sondern
irreführend. Deshalb steht dieses Modell **vor** jedem weiteren Connector.

## Zwei Kanal-Begriffe — bewusst getrennt

Im Projekt gibt es zwei verschiedene „Kanäle", die auf zwei verschiedene
Oberflächen gehören:

| Begriff | Beispiele | Datenquelle | Oberfläche |
|---|---|---|---|
| **Vertriebskanal** | Shop, B2B, Marktplatz, Telefon, Manuell | `sales_orders.channel` + `channel_costs.channel` | Verkaufssicht (`/verkauf`) |
| **Ads-Kanal** | Google Ads, Meta, TikTok | `ad_spend.platform` | E-Commerce-Dashboard (`/verkauf/dashboard`) |

Echtes, belegbasiertes DB ist nur je **Vertriebskanal** darstellbar. Für
**Ads-Kanäle** existiert **keine** Order→Plattform-Attribution (kein
utm/gclid/fbclid irgendwo im Schema; ROAS/CAC in `src/kpi/do.ts:20-30` sind
heute schon blended). Deshalb wird DB je Ads-Kanal **nicht erfunden** — siehe
Oberfläche 2.

## Datenmodell

Zwei neue Tabellen, idempotent an `db/schema.sql` angehängt (dieses Projekt hat
keine nummerierten Migrationen; `npm run migrate` liest `schema.sql` + `rls.sql`
und ist idempotent — vgl. das B2C-Segment-Muster `db/schema.sql:445-447`).

```
order_costs                              -- Kosten, die einem einzelnen Beleg zurechenbar sind
  id            uuid, pk
  tenant_id     uuid, fk → tenants, null
  order_id      uuid, fk → sales_orders, on delete cascade
  type          enum(wareneinsatz, marktplatzgebuehr, fulfillment,
                     versand, zahlungsgebuehr, retoure, sonstige)
  amount        numeric(12,2)            -- immer positiv, Vorzeichen ergibt sich aus type
  source        enum(berechnet, api, manuell)
  source_ref    text, null               -- z.B. Amazon Settlement-ID
  created_at    timestamptz default now()
  index(order_id)

channel_costs                            -- Kosten, die NICHT einem Beleg zurechenbar sind
  id            uuid, pk
  tenant_id     uuid, fk → tenants, null
  channel       enum(shop, b2b_portal, marktplatz, telefon, manuell)
  type          enum(werbung, lagergebuehr, abo_gebuehr, sonstige)
  period_start  date
  period_end    date
  amount        numeric(12,2)
  source        enum(api, manuell)
  external_ref  text, null               -- z.B. Amazon Ads Campaign-ID
  index(channel, period_start)
```

Enums werden als `CHECK`-Constraints umgesetzt (Projekt-Konvention, vgl.
`sales_orders.channel`/`status`). RLS-Policies analog zu bestehenden
tenant-scoped Tabellen in `db/rls.sql`.

### Warum zwei Kostenarten, nicht eine

- **`order_costs` = beleggenau.** Eine Amazon-Referral-Fee gehört zu *dieser*
  Bestellung. Damit ist der DB je Beleg berechenbar und im Beleg-Detail sichtbar.
- **`channel_costs` = periodisch.** Werbekosten gehören nicht zu einer
  Bestellung. Ad-Spend auf einzelne Belege umzulegen ist Attributionsmodellierung
  — ein Fass ohne Boden. bryx bucht Ad-Spend ehrlich auf Kanal + Zeitraum.

Daraus folgen zwei Kennzahlen, die nicht verwechselt werden dürfen:

| Kennzahl | Formel | Wo sichtbar |
|---|---|---|
| **DB je Beleg** | Umsatz − Σ order_costs | Beleg-Detail (Oberfläche 3) |
| **DB je Vertriebskanal** | Σ Umsatz − Σ order_costs − Σ channel_costs | Kanal-Vergleich (Oberfläche 1) |

Nur die zweite Zahl ist vollständig ehrlich. Deshalb wird im Kanal-Vergleich der
Ad-Spend als **eigene Spalte** gezeigt, nicht in einer Marge versteckt.

### Wareneinsatz — Einfrieren bei `createOrder`

`purchase_price` liegt seit Phase 1 an `product_variants` (`db/schema.sql:295`,
nullable). **Entscheidung (weicht bewusst vom ursprünglichen Spec-Wortlaut ab):**
Der EK wird **zeitgleich mit dem VK bei `createOrder`** eingefroren, nicht erst
beim Statuswechsel auf `auftrag`.

- Begründung: Der VK (`unit_price`) wird heute schon in `createOrder`
  (`src/verkauf/repository.ts:96-100`) als Snapshot geschrieben. VK und EK zu
  unterschiedlichen Zeitpunkten einzufrieren wäre inkonsistent; jeder Beleg —
  auch ein Angebot — hätte so sofort eine korrekte Marge.
- Umsetzung: In `createOrder` je `sales_order_line` eine `order_costs`-Zeile
  `(type=wareneinsatz, source=berechnet, amount = quantity * purchase_price)`
  in derselben Transaktion schreiben.
- **NULL-Handling:** `purchase_price` ist nullable. Ohne EK an der Variante wird
  **keine** Wareneinsatz-Zeile geschrieben. In der UI wird ein fehlender EK
  sichtbar markiert (siehe Oberfläche 1/3), damit die Marge nicht fälschlich „zu
  gut" aussieht.
- Ändert sich der EK später am Stammsatz, bleibt die eingefrorene Zeile —
  die historische Marge bleibt korrekt.

### Werbung je Vertriebskanal — fester Default + manueller Override

`ad_spend` ist nach Ads-*Plattform* verschlüsselt (`db/schema.sql:46-55`;
Werte `google_ads`/`meta_ads`/`tiktok_ads`), die Kanal-Vergleich-Tabelle braucht
Werbung aber je *Vertriebskanal*. Lösung:

1. **Fester Default im Code** — eine Mapping-Konstante Plattform→Vertriebskanal:
   `google_ads`/`meta_ads`/`tiktok_ads` → `shop`, `amazon_ads` → `marktplatz`.
   Daraus wird die „Werbung"-Spalte je Vertriebskanal für den gewählten Zeitraum
   abgeleitet (Summe `ad_spend.spend` je gemapptem Kanal).
2. **Manueller Override** — zusätzlich können `channel_costs(type=werbung)`
   manuell/per API auf einen Vertriebskanal + Zeitraum gebucht werden (z.B. Messe,
   Influencer). Diese addieren sich zur gemappten ad_spend-Summe.

Kein eigener Einstell-Screen für die Regel (bewusst YAGNI — Plattformen sind
wenige und stabil). Der Frontend-Hebel ist die manuelle `channel_costs`-Buchung.

## Oberfläche 1 — Verkaufssicht: Kanal-Vergleich (echtes DB je Vertriebskanal)

Heute ist `src/components/KanalVergleich.tsx` ein Karten-Grid mit drei Zahlen
(Umsatz netto, Belege, Ø). Es wird zu einer **echten, sortierbaren Tabelle**.

```
Kanal      Umsatz   Wareneinsatz  Gebühren  Werbung    DB      DB% ▾
Amazon     42.100    18.900        7.400     9.200     6.600   15,7%
Shop       24.300    10.900          700     1.100    11.600   47,7%
B2B        18.400     9.200            0         0     9.200    50,0%
────────────────────────────────────────────────────────────────────
Σ          84.800    39.000        8.100    10.300    27.400   32,3%
```

- **Spalten:** Kanal · Umsatz (netto) · Wareneinsatz · Gebühren · Werbung · DB · DB%.
  - *Wareneinsatz* = Σ `order_costs(wareneinsatz)` der Belege des Kanals im Zeitraum.
  - *Gebühren* = Σ `order_costs` aller übrigen Typen (marktplatzgebuehr,
    fulfillment, versand, zahlungsgebuehr, retoure, sonstige).
  - *Werbung* = gemappte `ad_spend.spend` (Default-Regel) + manuelle
    `channel_costs(werbung)`.
  - *DB* = Umsatz − Wareneinsatz − Gebühren − Werbung.
  - *DB%* = DB / Umsatz.
- **Werbung als eigene Spalte** — nicht in der Marge versteckt (Spec-Kernpunkt).
- **DB%-Visualisierung** mit warmem Akzent-Balken (`--accent`), **kein** kaltes
  Ampel-Grün/Rot (Design-System-Regel).
- **Default-Sortierung nach DB% aufsteigend** → der schwächste Kanal steht oben.
  Sortierung über die bestehende `SortableTh`-Logik (`src/components/SortableTh.tsx`,
  `src/lib/sort.ts`), Whitelist in `verkauf/repository.ts` (`ORDER_SORT_SQL`-Muster,
  Zeile 325) erweitern.
- **Fehlender EK:** Kanäle mit Belegen ohne `purchase_price` zeigen einen dezenten
  Hinweis (z.B. „EK unvollständig") am Wareneinsatz, damit DB% nicht falsch
  gelesen wird.
- Zeile verlinkt weiterhin auf die Kanal-Detailseite
  (`/verkauf/kanal/[channel]`).

**Query:** `channelSummary(range)` (`src/verkauf/repository.ts:431-448`) wird um
LEFT-JOIN/Subqueries auf `order_costs` (je order_id → channel) sowie um die
Werbungs-Ableitung (`ad_spend` gemappt + `channel_costs`) erweitert. Der Typ
`ChannelSummary` (`src/verkauf/types.ts:57-59`) bekommt die Felder
`wareneinsatz`, `gebuehren`, `werbung`, `db`, `dbProzent`.

## Oberfläche 2 — E-Commerce-Dashboard: Ads-Kanäle (ehrlich)

Zwei visuell klar getrennte Bausteine, damit plattform-gemeldeter ROAS nie mit
echter Marge verwechselt wird.

**a) DO-Phase — echte DB- + MER-Hero-Kachel** (kombiniert, neben Umsatz),
Wiederverwendung `src/components/KpiCard.tsx`:

```
┌ Umsatz ─────┐ ┌ Deckungsbeitrag ┐ ┌ MER (blended) ┐
│ 84.800 €    │ │ 27.400 € · 32 % │ │ 3,1×          │
└─────────────┘ └─────────────────┘ └───────────────┘
```

- **DB** = Σ Umsatz − Σ order_costs − Σ channel_costs (alle Vertriebskanäle,
  echt, belegbasiert).
- **MER (blended)** = Gesamtumsatz ÷ Gesamt-Adspend (ehrlich, keine Attribution).

**b) Neuer Streifen „Marketing-Effizienz je Kanal"** — mit `.anno`-Micro-Label
`PLATTFORM-GEMELDET` und Umschalter *kombiniert / je Kanal*:

```
Marketing-Effizienz          [ kombiniert · je Kanal ]
Kanal     Spend    ROAS*   conv_value*
Google    4.200    3,8×    16.000
Meta      3.100    2,9×     9.000
TikTok    1.900    2,1×     4.000
* von der Werbeplattform berichtet — überlappend, nicht dedupliziert
```

- Quelle: `ad_spend` je `platform` (Spend, `conv_value`, `conversions`).
- ROAS\* = `conv_value` ÷ `spend` **je Plattform** (plattform-gemeldet).
- Der Disclaimer-Fußtext ist **bewusst Teil des UI** — kein erfundenes DB je
  Ads-Kanal.
- „kombiniert" zeigt die blended Summe; „je Kanal" die Plattform-Zeilen.

## Oberfläche 3 — Beleg-Detail: DB je Beleg

In `src/components/VerkaufDetail.tsx` unter den Positionen ein Kosten-Block:

```
Umsatz netto                    142,00 €
− Wareneinsatz    berechnet     −64,00 €
− Marktplatzgebühr  api         −21,30 €
− Fulfillment       api          −8,90 €
──────────────────────────────────────────
Deckungsbeitrag                  47,80 €  (33,7 %)
```

- Jede Kostenzeile trägt ein kleines Quell-Badge (`berechnet` / `api` /
  `manuell`) — Transparenz, woher die Zahl kommt.
- Fehlt der Wareneinsatz (kein EK an der Variante), wird das explizit als
  Hinweis gezeigt statt stillschweigend 0 anzunehmen.
- DB% = DB / Umsatz netto.

## Betroffene Dateien (Überblick)

- `db/schema.sql` — `order_costs`, `channel_costs` (+ CHECK-Constraints, Indizes).
- `db/rls.sql` — Policies für beide Tabellen.
- `src/verkauf/repository.ts` — `createOrder` (EK einfrieren), `channelSummary`
  (Kostenspalten), neue Query für Beleg-Kosten, Werbungs-Mapping-Konstante.
- `src/verkauf/types.ts` — `ChannelSummary` erweitern, `OrderCost`/`ChannelCost`,
  `BelegKosten`.
- `src/verkauf/labels.ts` — Labels für Kostentypen/Quellen.
- `src/components/KanalVergleich.tsx` — Karten-Grid → sortierbare Tabelle.
- `src/components/VerkaufDetail.tsx` — Kosten-Block + DB.
- `src/app/(shell)/verkauf/dashboard/page.tsx` + `src/components/PhaseColumn.tsx`
  /`KpiCard.tsx` — DB-/MER-Hero-Kachel.
- Neue Dashboard-Komponente „Marketing-Effizienz je Kanal" (recharts/Tabelle,
  Stil-Konstanten `src/components/charts/chart-style.ts`).
- `src/kpi/do.ts` (ggf. `care.ts`) — DB/MER-KPI ergänzen.

## Hilfe-/Doku-Pflege (Projekt-CLAUDE.md)

- `src/lib/help/content.ts` — `verkauf`-Hilfeseite um Kosten & Marge / DB-Logik
  ergänzen; Registry-Test `tests/lib/help-content.test.ts` bleibt grün.
- Admin-Seite `datenmodell` — `order_costs`/`channel_costs` aufnehmen.

## Tests

- **Repository (vitest):** EK-Einfrieren bei `createOrder` (inkl. NULL-EK →
  keine Zeile); `channelSummary` rechnet Wareneinsatz/Gebühren/Werbung/DB/DB%
  korrekt; Werbungs-Mapping (Default-Regel + manueller Override addiert sich).
- **Beleg-Kosten:** DB je Beleg = Umsatz − Σ order_costs.
- **Mapping:** Plattform→Vertriebskanal-Konstante deckt alle bekannten
  Plattformen ab; unbekannte Plattform landet nachvollziehbar (z.B. `sonstige`/
  ignoriert mit Log).
- Bestehende Suite grün halten (RLS-Tests auf diesem Host: 16 erwartete
  Fehlschläge, kein Regressionssignal).

## Bewusst nicht im Scope (YAGNI)

- Kein Frontend-Editor für die Ads→Vertriebskanal-Regel (fester Default +
  manueller `channel_costs`-Override reicht).
- Kein DB/Marge je Ads-Kanal (keine Attributionsdaten — bewusst nicht erfunden).
- Keine Ad-Spend→Beleg-Attribution.
