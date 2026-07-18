CREATE TABLE IF NOT EXISTS daily_metrics (
  date        DATE        NOT NULL,
  source      TEXT        NOT NULL,
  channel     TEXT        NOT NULL DEFAULT 'default',
  metric_key  TEXT        NOT NULL,
  value       DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (date, source, channel, metric_key)
);

-- Source-scope orders/customers (legacy single-key → composite). Cache tables:
-- drop + recreate, and clear the WooCommerce watermarks so the next sync does a
-- full backfill instead of an incremental delta against empty tables.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'orders' AND column_name = 'order_id') THEN
    DROP TABLE IF EXISTS orders CASCADE;
    DROP TABLE IF EXISTS customers CASCADE;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_settings') THEN
      DELETE FROM app_settings
       WHERE key IN ('woocommerce_orders_synced_at', 'woocommerce_orders_full_synced_at');
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS customers (
  uid              TEXT PRIMARY KEY,
  source           TEXT NOT NULL,
  first_order_date DATE NOT NULL,
  last_order_date  DATE NOT NULL,
  orders_count     INTEGER NOT NULL,
  total_revenue    DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  source        TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  customer_uid  TEXT NOT NULL,
  date          DATE NOT NULL,
  revenue       DOUBLE PRECISION NOT NULL,
  is_first_order BOOLEAN NOT NULL,
  PRIMARY KEY (source, source_id)
);
CREATE INDEX IF NOT EXISTS orders_date_idx ON orders (date);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders (customer_uid);

CREATE TABLE IF NOT EXISTS ad_spend (
  date        DATE NOT NULL,
  platform    TEXT NOT NULL,
  spend       DOUBLE PRECISION NOT NULL,
  impressions BIGINT NOT NULL,
  clicks      BIGINT NOT NULL,
  conversions BIGINT NOT NULL,
  conv_value  DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (date, platform)
);

CREATE TABLE IF NOT EXISTS subscribers (
  date         DATE NOT NULL,
  source       TEXT NOT NULL,
  signups      INTEGER NOT NULL,
  unsubscribes INTEGER NOT NULL,
  nps_score    DOUBLE PRECISION,
  PRIMARY KEY (date, source)
);

CREATE TABLE IF NOT EXISTS connector_credentials (
  connector   TEXT NOT NULL,
  field       TEXT NOT NULL,
  ciphertext  TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (connector, field)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_state (
  connector   TEXT PRIMARY KEY,
  last_run_at TIMESTAMPTZ,
  status      TEXT,
  detail      TEXT
);

CREATE TABLE IF NOT EXISTS oauth_connections (
  provider          TEXT PRIMARY KEY,
  refresh_token_enc TEXT,
  access_token_enc  TEXT,
  expires_at        TIMESTAMPTZ,
  scope             TEXT,
  account_label     TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  is_admin   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_app_access (
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  app        TEXT NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN ('view','edit')),
  PRIMARY KEY (group_id, app)
);

INSERT INTO groups (name, is_admin) VALUES ('Alle Nutzer', true)
  ON CONFLICT (name) DO NOTHING;
INSERT INTO group_app_access (group_id, app, permission)
  SELECT g.id, a.app, 'edit' FROM groups g, (VALUES ('brickpm'),('kontakte'),('katalog'),('verkauf')) AS a(app)
  WHERE g.name = 'Alle Nutzer'
  ON CONFLICT (group_id, app) DO NOTHING;

-- Phase 2: jede bestehende Gruppe mit Katalog-Zugriff erhält denselben Zugriff auf
-- Verkauf (Phase-2-Grundsatz „jeder sieht alles"). Deckt eigene Gruppen wie
-- 'Administratoren'/'Nutzer' ab, die nicht über die 'Alle Nutzer'-Vorbelegung laufen.
INSERT INTO group_app_access (group_id, app, permission)
  SELECT group_id, 'verkauf', permission FROM group_app_access WHERE app = 'katalog'
  ON CONFLICT (group_id, app) DO NOTHING;

-- Phase 2 / B5: dieselbe „jeder sieht alles"-Regel für Verfügbarkeit — jede Gruppe
-- mit Katalog-Zugriff erhält denselben Zugriff auf Verfügbarkeit. Deckt die realen
-- Gruppen 'Administratoren'/'Nutzer' ab (die nicht über 'Alle Nutzer' laufen).
INSERT INTO group_app_access (group_id, app, permission)
  SELECT group_id, 'verfuegbarkeit', permission FROM group_app_access WHERE app = 'katalog'
  ON CONFLICT (group_id, app) DO NOTHING;

-- Phase 2 / B6: dieselbe „jeder sieht alles"-Regel für Finanzen.
INSERT INTO group_app_access (group_id, app, permission)
  SELECT group_id, 'finanzen', permission FROM group_app_access WHERE app = 'katalog'
  ON CONFLICT (group_id, app) DO NOTHING;

CREATE TABLE IF NOT EXISTS bpm_products (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, cat TEXT, series TEXT, status TEXT,
  year INT, parts INT, uvp DOUBLE PRECISION, price DOUBLE PRECISION, cost DOUBLE PRECISION,
  t_mgn DOUBLE PRECISION, m_mgn DOUBLE PRECISION, stock INT, min_stock INT,
  valid_from DATE, valid_to DATE, channel TEXT, succ TEXT, descr TEXT
);
CREATE TABLE IF NOT EXISTS bpm_promotions (
  id TEXT PRIMARY KEY, name TEXT, product_id TEXT, type TEXT, start_date DATE, end_date DATE,
  target_units INT, sold INT, target_rev DOUBLE PRECISION, exp_mgn DOUBLE PRECISION,
  status TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS bpm_goodies (
  id TEXT PRIMARY KEY, name TEXT, type TEXT, cost DOUBLE PRECISION, price DOUBLE PRECISION,
  products TEXT[], min_cart DOUBLE PRECISION, valid_from DATE, valid_to DATE, status TEXT,
  mgn_effect DOUBLE PRECISION, comment TEXT
);
CREATE TABLE IF NOT EXISTS bpm_competitors (
  id TEXT PRIMARY KEY, product_id TEXT, competitor TEXT, comp_product TEXT,
  own_price DOUBLE PRECISION, comp_price DOUBLE PRECISION, avail BOOLEAN, date DATE, rec TEXT
);
CREATE TABLE IF NOT EXISTS bpm_notifications (
  id TEXT PRIMARY KEY, type TEXT, priority TEXT, ref_id TEXT, msg TEXT, action TEXT,
  status TEXT, due DATE, role TEXT, target TEXT
);
ALTER TABLE bpm_notifications ADD COLUMN IF NOT EXISTS note TEXT;
CREATE TABLE IF NOT EXISTS bpm_integrations (
  id TEXT PRIMARY KEY, type TEXT, system TEXT, purpose TEXT, objects TEXT[], dir TEXT,
  status TEXT, ep TEXT, last_sync TEXT
);
CREATE TABLE IF NOT EXISTS bpm_audit_log (
  id BIGSERIAL PRIMARY KEY, ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT, action TEXT NOT NULL, detail TEXT
);

CREATE TABLE IF NOT EXISTS bpm_price_history (
  product_id TEXT NOT NULL, date DATE NOT NULL, price DOUBLE PRECISION, cost DOUBLE PRECISION,
  PRIMARY KEY (product_id, date)
);

CREATE TABLE IF NOT EXISTS bpm_competitor_prices (
  product_id TEXT NOT NULL, competitor TEXT NOT NULL, date DATE NOT NULL,
  own_price DOUBLE PRECISION, comp_price DOUBLE PRECISION,
  PRIMARY KEY (product_id, competitor, date)
);

-- ── bryx control plane ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  subdomain  TEXT UNIQUE,
  db_mode    TEXT NOT NULL DEFAULT 'dedicated' CHECK (db_mode IN ('dedicated','pooled')),
  status     TEXT NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv','inaktiv','gekuendigt')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_lists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES tenants(id),
  name       TEXT NOT NULL,
  currency   CHAR(3) NOT NULL DEFAULT 'EUR',
  is_default BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS external_references (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID REFERENCES tenants(id),
  entity_type    TEXT NOT NULL,
  entity_id      UUID NOT NULL,
  source_system  TEXT NOT NULL,
  external_id    TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ,
  raw_payload    JSONB
);
-- Idempotency key for connector syncs: the same (source, external id, entity type)
-- maps to exactly one mirrored entity, so re-running a sync upserts instead of duplicating.
CREATE UNIQUE INDEX IF NOT EXISTS external_references_source_key
  ON external_references (source_system, external_id, entity_type);

CREATE TABLE IF NOT EXISTS integration_connections (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID REFERENCES tenants(id),
  app            TEXT NOT NULL,
  provider       TEXT NOT NULL,
  label          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'nicht verbunden',
  last_synced_at TIMESTAMPTZ
);

-- ── Kontakte ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id),
  number        TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  legal_form    TEXT,
  is_customer   BOOLEAN NOT NULL DEFAULT false,
  is_supplier   BOOLEAN NOT NULL DEFAULT false,
  vat_id        TEXT,
  tax_country   CHAR(2),
  payment_terms INT NOT NULL DEFAULT 14,
  price_list_id UUID REFERENCES price_lists(id),
  currency      CHAR(3) NOT NULL DEFAULT 'EUR',
  language      CHAR(2) NOT NULL DEFAULT 'de',
  status        TEXT NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv','inaktiv')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_addresses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES tenants(id),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('rechnung','lieferung')),
  street     TEXT,
  zip        TEXT,
  city       TEXT,
  country    CHAR(2),
  is_default BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS contact_persons (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES tenants(id),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  role       TEXT
);

-- ── Katalog ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID REFERENCES tenants(id),
  name               TEXT NOT NULL,
  description        TEXT,
  lifecycle_status   TEXT NOT NULL DEFAULT 'konzept'
                       CHECK (lifecycle_status IN ('konzept','freigegeben','aktiv','auslaufend','eingestellt')),
  category           TEXT,
  brand              TEXT,
  default_supplier_id UUID REFERENCES contacts(id),
  image_url          TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_variants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenants(id),
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku               TEXT UNIQUE NOT NULL,
  gtin              TEXT,
  attributes        JSONB,
  purchase_price    NUMERIC(12,2),
  weight_g          INT,
  reorder_point     INT NOT NULL DEFAULT 0,
  customs_tariff_no TEXT,
  status            TEXT NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv','inaktiv'))
);

CREATE TABLE IF NOT EXISTS prices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id),
  variant_id    UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  price_list_id UUID NOT NULL REFERENCES price_lists(id),
  min_qty       INT NOT NULL DEFAULT 1,
  amount        NUMERIC(12,2),
  valid_from    DATE,
  UNIQUE (variant_id, price_list_id, min_qty)
);

CREATE TABLE IF NOT EXISTS product_bundles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID REFERENCES tenants(id),
  bundle_variant_id   UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  component_variant_id UUID NOT NULL REFERENCES product_variants(id),
  quantity            INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS product_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  file_url    TEXT,
  expires_at  DATE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Verkauf (Phase 2) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID REFERENCES tenants(id),
  number           TEXT UNIQUE NOT NULL,
  contact_id       UUID NOT NULL REFERENCES contacts(id),
  channel          TEXT NOT NULL CHECK (channel IN ('shop','b2b_portal','marktplatz','telefon','manuell')),
  status           TEXT NOT NULL CHECK (status IN ('angebot','auftrag','versendet','rechnung_gestellt','bezahlt','retoure','storniert')),
  price_list_id    UUID REFERENCES price_lists(id),
  related_order_id UUID REFERENCES sales_orders(id),
  currency         CHAR(3) NOT NULL DEFAULT 'EUR',
  placed_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_order_lines (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES tenants(id),
  order_id   UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  quantity   INT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_order_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),
  order_id    UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  stage       TEXT NOT NULL CHECK (stage IN ('bestellt','kommissioniert','rechnung_gestellt','bezahlt','retoure')),
  source_app  TEXT NOT NULL CHECK (source_app IN ('verkauf','verfuegbarkeit','finanzen')),
  note        TEXT,
  automated   BOOLEAN NOT NULL DEFAULT false,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_order_events_order_idx ON sales_order_events (order_id, occurred_at);

-- ── Verfügbarkeit (Phase 2) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES tenants(id),
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'eigen' CHECK (type IN ('eigen','konsignation')),
  is_default BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS stock_levels (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenants(id),
  variant_id        UUID NOT NULL REFERENCES product_variants(id),
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  quantity_on_hand  INT NOT NULL DEFAULT 0,
  quantity_reserved INT NOT NULL DEFAULT 0,
  UNIQUE (variant_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES tenants(id),
  variant_id   UUID NOT NULL REFERENCES product_variants(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  delta        INT NOT NULL,
  reason       TEXT NOT NULL CHECK (reason IN ('inventurdifferenz','bruch_schwund','korrektur_fehlbuchung')),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Täglicher Bestands-Snapshot je Variante/Lager. Append-only, ein Satz pro Tag;
-- Quelle für den Bestandsverlauf (WooCommerce liefert keine Historie).
CREATE TABLE IF NOT EXISTS stock_snapshots (
  variant_id        UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  snapshot_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity_on_hand  INT  NOT NULL,
  quantity_reserved INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (variant_id, warehouse_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS stock_snapshots_variant_date_idx
  ON stock_snapshots (variant_id, snapshot_date);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),
  number      TEXT UNIQUE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES contacts(id),
  status      TEXT NOT NULL DEFAULT 'entwurf' CHECK (status IN ('entwurf','bestellt','teilweise_eingegangen','abgeschlossen','storniert')),
  expected_at DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenants(id),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  variant_id        UUID NOT NULL REFERENCES product_variants(id),
  quantity_ordered  INT NOT NULL,
  quantity_received INT NOT NULL DEFAULT 0,
  unit_cost         NUMERIC(12,2)
);

-- ── Finanzen (Phase 2) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS open_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenants(id),
  direction         TEXT NOT NULL CHECK (direction IN ('debitor','kreditor')),
  contact_id        UUID NOT NULL REFERENCES contacts(id),
  reference         TEXT,
  order_id          UUID REFERENCES sales_orders(id),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  amount            NUMERIC(12,2) NOT NULL,
  due_date          DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','teilweise_bezahlt','bezahlt','ueberfaellig')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID REFERENCES tenants(id),
  open_item_id       UUID REFERENCES open_items(id),
  amount             NUMERIC(12,2) NOT NULL,
  paid_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  method             TEXT NOT NULL CHECK (method IN ('ueberweisung','lastschrift','kreditkarte','paypal','sonstige')),
  external_reference TEXT
);

-- B2C-Segmentierung (Phase 3): Geschäfts- vs. Privatkunde. Default 'geschaeft'
-- (bestehende/manuelle Kontakte gelten als Geschäftskunden); WooCommerce-Import
-- markiert anhand des Billing-Firmennamens.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS segment TEXT NOT NULL DEFAULT 'geschaeft'
  CHECK (segment IN ('geschaeft','privat'));
CREATE INDEX IF NOT EXISTS idx_contacts_segment ON contacts (segment);

-- ── Kosten & Marge (Phase 3) ──────────────────────────────────────
-- order_costs: beleggenaue Kosten. amount ist vorzeichenbehaftet
-- (Menge×EK bzw. Gebühr; bei Retoure negativ). DB = Umsatz − Σ amount.
CREATE TABLE IF NOT EXISTS order_costs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES tenants(id),
  order_id   UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN
               ('wareneinsatz','marktplatzgebuehr','fulfillment','versand','zahlungsgebuehr','retoure','sonstige')),
  amount     NUMERIC(12,2) NOT NULL,
  source     TEXT NOT NULL CHECK (source IN ('berechnet','api','manuell')),
  source_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_costs_order_idx ON order_costs (order_id);

-- channel_costs: periodische, nicht-beleggenaue Kosten (Werbung, Lager, Abos)
-- je Vertriebskanal + Zeitraum.
CREATE TABLE IF NOT EXISTS channel_costs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES tenants(id),
  channel      TEXT NOT NULL CHECK (channel IN ('shop','b2b_portal','marktplatz','telefon','manuell')),
  type         TEXT NOT NULL CHECK (type IN ('werbung','lagergebuehr','abo_gebuehr','sonstige')),
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  amount       NUMERIC(12,2) NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('api','manuell')),
  external_ref TEXT
);
CREATE INDEX IF NOT EXISTS channel_costs_channel_period_idx ON channel_costs (channel, period_start);

-- Demo-Ads-Toggle (Phase 3): trennt Demo-ad_spend von echten Connector-Daten.
ALTER TABLE ad_spend ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
