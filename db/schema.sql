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
