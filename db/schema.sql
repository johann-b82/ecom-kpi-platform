CREATE TABLE IF NOT EXISTS daily_metrics (
  date        DATE        NOT NULL,
  source      TEXT        NOT NULL,
  channel     TEXT        NOT NULL DEFAULT 'default',
  metric_key  TEXT        NOT NULL,
  value       DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (date, source, channel, metric_key)
);

CREATE TABLE IF NOT EXISTS customers (
  customer_id      TEXT PRIMARY KEY,
  first_order_date DATE NOT NULL,
  last_order_date  DATE NOT NULL,
  orders_count     INTEGER NOT NULL,
  total_revenue    DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  order_id      TEXT PRIMARY KEY,
  customer_id   TEXT NOT NULL,
  date          DATE NOT NULL,
  revenue       DOUBLE PRECISION NOT NULL,
  is_first_order BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_date_idx ON orders (date);

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
  SELECT g.id, a.app, 'edit' FROM groups g, (VALUES ('dashboard'),('brickpm')) AS a(app)
  WHERE g.name = 'Alle Nutzer'
  ON CONFLICT (group_id, app) DO NOTHING;
