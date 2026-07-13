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
          { type: 'p', text: 'Eine modulare ERP-Plattform. Jedes Modul deckt einen Arbeitsbereich ab: Kennzahlen (Dashboard), Sortiments- und Preissteuerung (BrickPM), Geschäftspartner (Kontakte) und Produktkatalog (Katalog).' },
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
          { type: 'note', text: 'Sichtbar sind nur die Module, für die deine Gruppe freigeschaltet ist. Dashboard und Hilfe sind immer verfügbar.' },
        ],
      },
    ],
  },

  // ── Module (Nutzer) ───────────────────────────────────────────────
  {
    slug: 'dashboard',
    title: 'Dashboard',
    summary: 'Kennzahlen-Überblick aus den angebundenen Quellen.',
    group: 'module',
    sections: [
      {
        heading: 'Was macht das Modul?',
        blocks: [
          { type: 'p', text: 'Das Dashboard bündelt Kennzahlen (KPIs) aus angebundenen Quellen wie Shop-, Ads- und E-Mail-Systemen zu einem Überblick.' },
        ],
      },
      {
        heading: 'Wichtige Funktionen',
        blocks: [
          { type: 'list', items: [
            'KPI-Kacheln mit Vergleich zum Vorzeitraum.',
            'Zeitraum- und Quellen-Filter.',
            'Daten stammen aus den unter „Verbindungen" konfigurierten Connectors.',
          ] },
        ],
      },
    ],
  },
  {
    slug: 'brickpm',
    title: 'BrickPM',
    summary: 'Sortiment, Preise, Aktionen und Wettbewerb steuern.',
    group: 'module',
    sections: [
      {
        heading: 'Was macht das Modul?',
        blocks: [
          { type: 'p', text: 'BrickPM ist das Product-Management für das Sortiment: Produkte, Preise/Margen, Aktionen und Wettbewerbsbeobachtung an einem Ort.' },
        ],
      },
      {
        heading: 'Wichtige Funktionen',
        blocks: [
          { type: 'list', items: [
            'Sortiment: Produkte mit Preis, Kosten und Marge pflegen.',
            'Aktionen & Goodies: Promotions planen und deren Margeneffekt sehen.',
            'Wettbewerb & Preis-Historie: eigene Preise gegen Wettbewerber verfolgen.',
            'Benachrichtigungen: Hinweise und fällige Aufgaben im Blick behalten.',
          ] },
        ],
      },
    ],
  },
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
            'Verbindungen: Anbindung an externe Systeme (Einstellungen › Verbindungen).',
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
            'Verbindungen: Anbindung an externe Systeme (Einstellungen › Verbindungen).',
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
            'Belegliste über alle Kanäle mit Kurz-Spur je Zeile.',
            'Beleg-Detail mit vollständigem, klickbarem Faden (Perlen zeigen Zeitpunkt und Auslöser).',
            'Genau eine primäre Aktion je Status (z. B. In Auftrag wandeln, Rechnung stellen, Retoure anlegen).',
            'Beleg manuell anlegen: Kunde wählen, Positionen erfassen — Preis und Bestand werden vorbelegt.',
          ] },
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
          { type: 'note', text: 'BrickPM-Tabellen (bpm_*) sind hier noch nicht dokumentiert.' },
        ],
      },
      {
        heading: 'Phase 2 — Kette (Verkauf · Verfügbarkeit · Finanzen)',
        blocks: [
          { type: 'p', text: 'Der Beleg ist eine Tabelle mit Status: sales_orders (Angebot/Auftrag/Rechnung/Gutschrift). sales_order_lines hält die Positionen, sales_order_events den Faden (eine Zeile pro Perle). Gutschriften sind sales_orders-Zeilen mit status=retoure, negativen Mengen und related_order_id auf den Ursprung.' },
          { type: 'p', text: 'Verfügbarkeit: warehouses (inkl. Konsignation, is_default), stock_levels je Lager (quantity_on_hand/quantity_reserved), stock_adjustments mit Pflicht-Grund, purchase_orders/purchase_order_lines für den Einkauf.' },
          { type: 'p', text: 'Finanzen: open_items führt Debitoren und Kreditoren in einer Tabelle (direction-Flag); payments bucht Zahlungen, open_item_id ist nullable (nicht zugeordnete Zahlung landet in der Zuordnen-Warteschlange).' },
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
            'Verbindungen je App (integration_connections): Status und letzter Sync.',
          ] },
        ],
      },
      {
        heading: 'Bedienung',
        blocks: [
          { type: 'list', items: [
            'Kontakte/Katalog: Einstellungen › Verbindungen.',
            'Plattform-Zugangsdaten & Sync: Einstellungen (/setup).',
          ] },
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
