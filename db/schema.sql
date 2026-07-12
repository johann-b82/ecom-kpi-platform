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
  SELECT g.id, a.app, 'edit' FROM groups g, (VALUES ('dashboard'),('brickpm'),('kontakte'),('katalog')) AS a(app)
  WHERE g.name = 'Alle Nutzer'
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
