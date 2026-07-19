export type DocBlock =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'steps'; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'note'; text: string };

export interface DocSection {
  heading: string;
  blocks: DocBlock[];
}

export interface DocPage {
  slug: string;
  title: string;
  summary: string;
  group: 'start' | 'module' | 'admin';
  admin?: boolean;
  sections: DocSection[];
}

export const HELP_PAGES: DocPage[] = [
  // ── Erste Schritte ────────────────────────────────────────────────
  {
    slug: 'uebersicht',
    title: 'Übersicht & Navigation',
    summary: 'Aufbau der Plattform und wie man sich bewegt.',
    group: 'start',
    sections: [
      {
        heading: 'Was ist diese Plattform?',
        blocks: [
          { type: 'p', text: 'Eine modulare ERP-Plattform. Jedes Modul deckt einen Arbeitsbereich ab: Verfügbarkeit, Verkauf und Finanzen bilden die Wertschöpfungskette; Geschäftspartner (Kontakte) und Produktkatalog (Katalog) liefern die Stammdaten.' },
        ],
      },
      {
        heading: 'Navigation',
        blocks: [
          { type: 'list', items: [
            'Linke Leiste (AppRail): Wechsel zwischen den Modulen. Das aktive Modul ist hervorgehoben.',
            'Logo oben links: zurück zum Launchpad (Startseite).',
            'Benutzermenü oben rechts: Einstellungen, Theme wechseln (hell/dunkel), Abmelden.',
          ] },
          { type: 'note', text: 'Sichtbar sind nur die Module, für die deine Gruppe freigeschaltet ist. Hilfe ist immer verfügbar. Die Shop-/Marketing-Kennzahlen findest du im Modul Verkauf unter „Dashboard".' },
        ],
      },
    ],
  },

  // ── Module (Nutzer) ───────────────────────────────────────────────
  {
    slug: 'kontakte',
    title: 'Kontakte',
    summary: 'Kunden und Lieferanten mit Adressen und Ansprechpartnern.',
    group: 'module',
    sections: [
      {
        heading: 'Was macht das Modul?',
        blocks: [
          { type: 'p', text: 'Kontakte verwaltet Geschäftspartner — Kunden und Lieferanten — mit Stammdaten, Adressen und Ansprechpartnern.' },
        ],
      },
      {
        heading: 'Wichtige Funktionen',
        blocks: [
          { type: 'list', items: [
            'Liste aller Kontakte mit Kennzeichnung Kunde/Lieferant.',
            'Detailansicht mit Rechnungs-/Lieferadressen und Ansprechpartnern.',
            'Steuer- und Zahlungsdaten (USt-IdNr., Zahlungsziel, Preisliste, Währung).',
            'Externe Anbindungen: zentral unter Einstellungen (/setup) › Verbindungen — nur für Administratoren.',
          ] },
        ],
      },
    ],
  },
  {
    slug: 'katalog',
    title: 'Katalog',
    summary: 'Produkte, Varianten, Preise und Bundles.',
    group: 'module',
    sections: [
      {
        heading: 'Was macht das Modul?',
        blocks: [
          { type: 'p', text: 'Der Katalog pflegt Produkte samt Varianten (SKU/GTIN), Preisen je Preisliste, Bundles und Dokumenten.' },
        ],
      },
      {
        heading: 'Wichtige Funktionen',
        blocks: [
          { type: 'list', items: [
            'Produkte mit Lebenszyklus-Status (Konzept bis Eingestellt).',
            'Varianten mit SKU, GTIN, Einkaufspreis und Nachbestellpunkt.',
            'Preise je Preisliste inkl. Staffeln (Mindestmenge).',
            'Bundles und Produktdokumente.',
            'Externe Anbindungen: zentral unter Einstellungen (/setup) › Verbindungen — nur für Administratoren.',
          ] },
        ],
      },
    ],
  },
  {
    slug: 'verkauf',
    title: 'Verkauf',
    summary: 'Belege über alle Kanäle — mit Faden von Bestellung bis Zahlung.',
    group: 'module',
    sections: [
      {
        heading: 'Was macht das Modul?',
        blocks: [
          { type: 'p', text: 'Verkauf zeigt alle Belege (Angebote, Aufträge, Rechnungen, Gutschriften) über sämtliche Kanäle. Jeder Beleg trägt einen Faden: die Perlen bestellt, kommissioniert, Rechnung gestellt, bezahlt — und bei einer Retoure eine fünfte Perle.' },
        ],
      },
      {
        heading: 'Wichtige Funktionen',
        blocks: [
          { type: 'list', items: [
            'Sales-Liste (Belege) über alle Kanäle mit Kurz-Spur je Zeile, sortierbar und filterbar nach Kanal, Status, Datum (von-bis) und Freitext.',
            'Beleg-Detail mit vollständigem, klickbarem Faden (Perlen zeigen Zeitpunkt und Auslöser).',
            'Genau eine primäre Aktion je Status (z. B. In Auftrag wandeln, Rechnung stellen, Retoure anlegen).',
            'Beleg manuell anlegen: Kunde wählen, Positionen erfassen — Preis und Bestand werden vorbelegt.',
          ] },
        ],
      },
      {
        heading: 'Übersicht & Kanäle (Ebene 1)',
        blocks: [
          { type: 'p', text: 'Die Verkauf-Startseite zeigt für den gewählten Zeitraum (7/30/90 Tage) Umsatz, Anzahl Belege (Sales), durchschnittlichen Warenkorbwert und die Stornoquote. Alle Beträge sind netto (ohne MwSt).' },
          { type: 'list', items: [
            'Kanal-Vergleich: Umsatz, Belege und Ø Warenkorb je Kanal (Shop, B2B-Portal, Marktplatz, Telefon, Manuell) — ein Klick öffnet die auf den Kanal gefilterte Belegliste.',
            'Status-Funnel: Anzahl Belege je Status von Angebot bis bezahlt.',
            'Umsatz zählt alle Belege außer stornierten (inkl. Angebote und Aufträge) und korrigiert sich automatisch, wenn Stornos/Abbrüche nachträglich reinkommen. Die Stornoquote (stornierter Umsatz ÷ platziertes Volumen) ist eine eigene, anklickbare Kennzahl mit Verlauf.',
            'Die Shop-/Marketing-KPIs (GA4, Shop, Ads) liegen unter Verkauf → Dashboard.',
            'Zeitraum: Standardzeiträume (7/30/90/365/Komplett) plus benutzerdefinierter von-bis-Bereich (zwei Datumsfelder → Anwenden).',
            'KPI-Kacheln Umsatz, Sales und Ø Warenkorb sind anklickbar — darunter klappt die jeweilige Verlaufskurve für den gewählten Zeitraum auf (eine gleichzeitig).',
          ] },
        ],
      },
      {
        heading: 'Kosten & Deckungsbeitrag',
        blocks: [
          { type: 'p', text: 'Jeder Beleg trägt seine zurechenbaren Kosten. Der Wareneinsatz (EK × Menge) wird beim Anlegen des Belegs eingefroren — spätere EK-Änderungen lassen die alte Marge unberührt.' },
          { type: 'p', text: 'Deckungsbeitrag je Beleg = Umsatz netto − alle Kostenzeilen. Im Kanal-Vergleich kommen periodische Werbekosten hinzu: DB je Kanal = Umsatz − Wareneinsatz − Gebühren − Werbung.' },
          { type: 'note', text: 'Werbung wird ehrlich als eigene Spalte gezeigt, nicht in der Marge versteckt. Web-Ads (Google/Meta/TikTok) zählen automatisch auf den Shop, Amazon-Ads auf den Marktplatz; zusätzliche Werbekosten lassen sich manuell je Kanal buchen.' },
        ],
      },
    ],
  },
  {
    slug: 'verfuegbarkeit',
    title: 'Verfügbarkeit',
    summary: 'Bestände, Reservierungen, Wareneingang und Meldebestand — die Versorgungsseite jeder Bestellung.',
    group: 'module',
    sections: [
      {
        heading: 'Was macht das Modul?',
        blocks: [
          { type: 'p', text: 'Verfügbarkeit zeigt je Artikel, wie viel verfügbar ist (Bestand minus Reservierungen) über alle Lager. Reservierungen entstehen automatisch aus dem Verkauf (Auftrag) und werden beim Versand aufgelöst — hier werden sie nur sichtbar.' },
        ],
      },
      {
        heading: 'Wichtige Funktionen',
        blocks: [
          { type: 'list', items: [
            'Bestandsübersicht: eine Zeile je Artikel mit verfügbar, reserviert und Meldebestand — unter dem Meldebestand wird der Artikel markiert.',
            'Varianten-Detail: Bestand je Lager sowie Bestandskorrektur mit Pflicht-Grund (Inventurdifferenz, Bruch/Schwund, Korrektur Fehlbuchung) und Korrektur-Historie.',
            'Wareneingang: Bestellungen von Entwurf über Bestellt bis Teilweise/Abgeschlossen; gebuchte Mengen erhöhen den Bestand im Standardlager.',
            'Meldebestand: alle Artikel mit Reichweite unter 90 Tagen (Bestand kleiner als der Absatz der letzten 90 Tage) — „Nachbestellung entwerfen" legt eine Bestellung im Status Entwurf beim (vorbelegten) Lieferanten an; die Vorschlagsmenge deckt den 90-Tage-Bedarf.',
          ] },
        ],
      },
      {
        heading: 'Der Beschaffungs-Kreislauf',
        blocks: [
          { type: 'p', text: 'Meldebestand → Entwurf → Bestellung auslösen → Wareneingang buchen → Bestand steigt → der Artikel fällt aus der Meldebestand-Liste. Wareneingang bucht in das Standardlager; ein Lager pro Wareneingang zu wählen ist bewusst noch nicht vorgesehen.' },
        ],
      },
      {
        heading: 'Bestandsverlauf & Nachliefer-Prognose',
        blocks: [
          { type: 'p', text: 'Die Übersicht zeigt drei KPIs — Gesamtbestand (anklickbar: Verlaufskurve für den gewählten Zeitraum), Warenwert im Lager (Bestand × Einkaufspreis, ebenfalls mit Verlauf) und Anzahl Artikel mit Reichweite unter 90 Tagen (ein Klick führt zum Meldebestand) — sowie eine sortier- und filterbare Kategorie-Tabelle. Ein Zeitraum-Selektor (Standard + von-bis) steuert die Kurven.' },
          { type: 'list', items: [
            'Artikel-Detail: Bestands- und Verkaufskurve übereinander sowie eine Nachliefer-Prognose mit Ø-Verbrauch über 90 Tage, Reichweite in Tagen, voraussichtlichem Leerdatum und Bestellvorschlag.',
            'Der Bestellvorschlag erscheint ab einer Reichweite unter 90 Tagen — dem Wiederbeschaffungshorizont für Bestellungen aus Übersee.',
            'Kategorie-Detail: dieselbe Kurve, über alle Artikel der Kategorie aggregiert.',
          ] },
          { type: 'note', text: 'Die Bestandskurve zeigt Daten erst ab dem ersten Snapshot — für Zeiträume davor bleibt sie leer.' },
        ],
      },
    ],
  },
  {
    slug: 'finanzen',
    title: 'Finanzen',
    summary: 'Cashflow-Verlauf (Einzahlungen), offene Posten, Zahlungsabgleich, Zuordnen-Warteschlange und Buchungsexport.',
    group: 'module',
    sections: [
      {
        heading: 'Was macht das Modul?',
        blocks: [
          { type: 'p', text: 'Finanzen zeigt die offenen Posten beider Richtungen: Debitoren (was Kunden schulden, aus Verkaufsrechnungen) und Kreditoren (was wir Lieferanten schulden). Überfälligkeit wird aus dem Fälligkeitsdatum abgeleitet.' },
        ],
      },
      {
        heading: 'Wichtige Funktionen',
        blocks: [
          { type: 'list', items: [
            'Operativer Cashflow (Einzahlungen): Verlaufschart der Zahlungseingänge auf Debitor-Posten über die letzten 12 Monate (monatlich). Nicht zugeordnete Zahlungen zählen erst nach Zuordnung mit.',
            'Zahlung erfassen: gleicht eine Zahlung einen Debitor-Posten voll aus, wird der zugehörige Verkaufsbeleg automatisch auf „bezahlt" gesetzt (bezahlt-Perle im Faden).',
            'Teilzahlungen setzen den Posten auf „teilweise bezahlt"; der Rest bleibt offen.',
            'Zuordnen-Warteschlange: nicht zugeordnete Zahlungen (z. B. ohne bekannte Rechnung) erfassen und später einem offenen Posten zuordnen.',
            'Lieferantenrechnung erfassen: legt einen Kreditor-Posten an (optional mit Bestellbezug).',
            'Buchungsexport: CSV aller Posten (Semikolon, Komma-Dezimal, UTF-8) für die weitere Verarbeitung.',
            'Offene-Posten-Tabelle sortierbar und pro Spalte filterbar (Richtung, Status, Betrag, Rest, Kontakt, Referenz); ein Zeitraum-Selektor (Standard + von-bis) grenzt nach Fälligkeit ein.',
          ] },
        ],
      },
      {
        heading: 'Beträge & Grenzen',
        blocks: [
          { type: 'p', text: 'Alle Beträge sind netto (ohne MwSt) — das Modell führt keine Steuerlogik. Der Export ist ein pragmatischer Buchungs-CSV, kein DATEV-EXTF-konformer Stapel.' },
        ],
      },
    ],
  },

  // ── Administration (nur Admin) ────────────────────────────────────
  {
    slug: 'rollen-gruppen',
    title: 'Rollen & Gruppen',
    summary: 'Zugriffssteuerung über Gruppen und App-Berechtigungen.',
    group: 'admin',
    admin: true,
    sections: [
      {
        heading: 'Konzept',
        blocks: [
          { type: 'p', text: 'Zugriff wird über Gruppen gesteuert. Ein Nutzer erbt die Rechte aller Gruppen, in denen er Mitglied ist. Es gibt keine Rechte direkt am Nutzer.' },
          { type: 'list', items: [
            'Admin-Gruppe (is_admin): sieht und darf alles, inkl. Administration.',
            'App-Zugriff je Gruppe: „view" (lesen) oder „edit" (bearbeiten) pro Modul.',
            'Dashboard und Hilfe sind ungated (für alle sichtbar).',
          ] },
        ],
      },
      {
        heading: 'Standardverhalten',
        blocks: [
          { type: 'list', items: [
            'Ist noch keine Gruppe vorhanden, gilt der erste Nutzer als Voll-Admin.',
            'Neue Nutzer werden der Standardgruppe „Alle Nutzer" zugeordnet.',
            'Die letzte Admin-Gruppe kann nicht entzogen werden (Aussperr-Schutz).',
          ] },
          { type: 'note', text: 'Verwaltung unter Einstellungen (/setup): Nutzer, Gruppen, Zugriffe. Die Einstellungen sind ausschließlich für Admins zugänglich — der Link erscheint nur bei ihnen und die Seite ist serverseitig geschützt.' },
        ],
      },
    ],
  },
  {
    slug: 'datenmodell',
    title: 'Datenmodell',
    summary: 'Die wichtigsten Tabellen je Domäne.',
    group: 'admin',
    admin: true,
    sections: [
      {
        heading: 'Kontakte',
        blocks: [
          { type: 'table', head: ['Tabelle', 'Zweck', 'Wichtige Felder'], rows: [
            ['contacts', 'Geschäftspartner (Stammdaten)', 'number, name, is_customer, is_supplier, vat_id, payment_terms, price_list_id, status'],
            ['contact_addresses', 'Adressen je Kontakt', 'contact_id, type (rechnung/lieferung), street, zip, city, country, is_default'],
            ['contact_persons', 'Ansprechpartner je Kontakt', 'contact_id, name, email, phone, role'],
          ] },
        ],
      },
      {
        heading: 'Katalog',
        blocks: [
          { type: 'table', head: ['Tabelle', 'Zweck', 'Wichtige Felder'], rows: [
            ['products', 'Produkt-Stammdaten', 'name, lifecycle_status, category, brand, default_supplier_id'],
            ['product_variants', 'Varianten je Produkt', 'product_id, sku, gtin, purchase_price, reorder_point, status'],
            ['prices', 'Preise je Variante/Preisliste', 'variant_id, price_list_id, min_qty, amount, valid_from'],
            ['product_bundles', 'Bundle-Zusammensetzung', 'bundle_variant_id, component_variant_id, quantity'],
            ['product_documents', 'Dokumente je Produkt', 'product_id, type, file_url, expires_at'],
          ] },
        ],
      },
      {
        heading: 'Zugriff & Plattform',
        blocks: [
          { type: 'table', head: ['Tabelle', 'Zweck', 'Wichtige Felder'], rows: [
            ['groups', 'Gruppen', 'name, is_admin'],
            ['group_members', 'Gruppen-Mitgliedschaft', 'group_id, user_id'],
            ['group_app_access', 'App-Rechte je Gruppe', 'group_id, app, permission (view/edit)'],
            ['price_lists', 'Preislisten', 'name, currency, is_default'],
          ] },
        ],
      },
      {
        heading: 'Integrationen',
        blocks: [
          { type: 'table', head: ['Tabelle', 'Zweck', 'Wichtige Felder'], rows: [
            ['connector_credentials', 'Verschlüsselte Zugangsdaten', 'connector, field, ciphertext'],
            ['oauth_connections', 'OAuth-Tokens je Provider', 'provider, refresh_token_enc, expires_at, account_label'],
            ['integration_connections', 'Verbindungen je App/Provider', 'app, provider, label, status, last_synced_at'],
            ['external_references', 'ID-Mapping zu Fremdsystemen', 'entity_type, entity_id, source_system, external_id'],
            ['sync_state', 'Sync-Status je Connector', 'connector, last_run_at, status, detail'],
          ] },
        ],
      },
      {
        heading: 'Phase 2 — Kette (Verkauf · Verfügbarkeit · Finanzen)',
        blocks: [
          { type: 'p', text: 'Der Beleg ist eine Tabelle mit Status: sales_orders (Angebot/Auftrag/Rechnung/Gutschrift). sales_order_lines hält die Positionen, sales_order_events den Faden (eine Zeile pro Perle). Gutschriften sind sales_orders-Zeilen mit status=retoure, negativen Mengen und related_order_id auf den Ursprung.' },
          { type: 'p', text: 'Verfügbarkeit: warehouses (inkl. Konsignation, is_default), stock_levels je Lager (quantity_on_hand/quantity_reserved), stock_adjustments mit Pflicht-Grund, purchase_orders/purchase_order_lines für den Einkauf.' },
          { type: 'p', text: 'stock_snapshots ist der tägliche Bestands-Snapshot je Variante/Lager (snapshot_date, quantity_on_hand, quantity_reserved) — append-only und Quelle für den Bestandsverlauf, da WooCommerce keine Bestandshistorie liefert. Befüllt vom täglichen Job npm run snapshot:stock.' },
          { type: 'p', text: 'Finanzen: open_items führt Debitoren und Kreditoren in einer Tabelle (direction-Flag); payments bucht Zahlungen, open_item_id ist nullable (nicht zugeordnete Zahlung landet in der Zuordnen-Warteschlange).' },
        ],
      },
      {
        heading: 'Kosten (order_costs, channel_costs)',
        blocks: [
          { type: 'p', text: 'order_costs hält beleggenaue Kosten (Wareneinsatz, Marktplatz-, Fulfillment-, Versand-, Zahlungsgebühr, Retoure, Sonstige). amount ist vorzeichenbehaftet — bei Retouren negativ.' },
          { type: 'p', text: 'channel_costs hält periodische, nicht-beleggenaue Kosten (Werbung, Lagergebühr, Abo) je Vertriebskanal und Zeitraum.' },
          { type: 'table', head: ['Tabelle', 'Zurechnung', 'Quelle'], rows: [
            ['order_costs', 'je Beleg', 'berechnet (EK) / API / manuell'],
            ['channel_costs', 'je Kanal + Zeitraum', 'API / manuell'],
          ] },
        ],
      },
    ],
  },
  {
    slug: 'verbindungen',
    title: 'Verbindungen & Connectors',
    summary: 'Externe Systeme anbinden und synchronisieren.',
    group: 'admin',
    admin: true,
    sections: [
      {
        heading: 'Konzept',
        blocks: [
          { type: 'p', text: 'Module binden externe Systeme über Verbindungen an. Zugangsdaten werden verschlüsselt gespeichert; OAuth-Provider laufen über den OAuth-Flow.' },
          { type: 'list', items: [
            'Zugangsdaten (connector_credentials): API-Keys/Secrets, verschlüsselt.',
            'OAuth (oauth_connections): Token-basierte Anbindung je Provider.',
          ] },
        ],
      },
      {
        heading: 'Bedienung',
        blocks: [
          { type: 'list', items: [
            'Plattform-Zugangsdaten & Sync: Einstellungen (/setup) › Verbindungen — nur für Administratoren.',
            'Der stündliche WooCommerce-Sync aktualisiert zwei Stellen: die KPI-Rohdaten (orders) und die ERP-Belege (sales_orders). Statuswechsel inkl. Storno/Retoure werden dabei auf bestehende Belege übertragen (inkrementell via modified_after, nächtlicher Voll-Abgleich als Sicherheitsnetz).',
          ] },
        ],
      },
      {
        heading: 'Demo-Ads-Daten',
        blocks: [
          { type: 'p', text: 'Unter Einstellungen (/setup) können Administratoren Demo-Ads-Daten für Google/Meta/TikTok an- und ausschalten. Damit lassen sich die Ads-Kennzahlen im E-Commerce-Dashboard (Marketing-Effizienz, MER, ROAS, CPM) testen, bevor die echten Werbekonten verbunden sind.' },
          { type: 'note', text: 'Kein echter API-Aufruf. Ausschalten entfernt nur die Demo-Zeilen; echte Connector-Daten bleiben unberührt.' },
        ],
      },
    ],
  },
  {
    slug: 'branding',
    title: 'Branding / White-Label',
    summary: 'Logo und Titel je Mandant anpassen.',
    group: 'admin',
    admin: true,
    sections: [
      {
        heading: 'Was ist White-Label?',
        blocks: [
          { type: 'p', text: 'Logo und Titel der Plattform sind konfigurierbar und werden über getBranding() im Root-Layout angewendet. So erscheint die Plattform im Erscheinungsbild des Mandanten.' },
          { type: 'list', items: [
            'Logo: erscheint in AppRail und Top-Bar; Fallback ist das bryx-Logo.',
            'Titel: Anwendungsname (auch als Initiale, wenn kein Logo gesetzt ist).',
          ] },
          { type: 'note', text: 'Der Akzentton folgt dem Design-System-Token --accent (--brand).' },
        ],
      },
    ],
  },
];

export function getHelpPage(slug: string): DocPage | undefined {
  return HELP_PAGES.find((p) => p.slug === slug);
}

export const HELP_USER_PAGES: DocPage[] = HELP_PAGES.filter((p) => p.group !== 'admin');
export const HELP_ADMIN_PAGES: DocPage[] = HELP_PAGES.filter((p) => p.admin === true);
