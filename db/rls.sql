-- Roles exist in real Supabase; create them no-op for plain-postgres CI.
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- KPI tables: authenticated may read; anon has no grant + no policy.
GRANT SELECT ON daily_metrics, orders, customers, ad_spend, subscribers TO authenticated;

ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_read ON daily_metrics;
CREATE POLICY authenticated_read ON daily_metrics FOR SELECT TO authenticated USING (true);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_read ON orders;
CREATE POLICY authenticated_read ON orders FOR SELECT TO authenticated USING (true);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_read ON customers;
CREATE POLICY authenticated_read ON customers FOR SELECT TO authenticated USING (true);

ALTER TABLE ad_spend ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_read ON ad_spend;
CREATE POLICY authenticated_read ON ad_spend FOR SELECT TO authenticated USING (true);

ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_read ON subscribers;
CREATE POLICY authenticated_read ON subscribers FOR SELECT TO authenticated USING (true);

-- Credentials: RLS on, NO anon/authenticated policy → only privileged (postgres/service_role) access.
ALTER TABLE connector_credentials ENABLE ROW LEVEL SECURITY;

-- Drill-down aggregation (PostgREST can't GROUP BY): SECURITY INVOKER so RLS applies.
CREATE OR REPLACE FUNCTION daily_series(p_metric_key text, p_start date, p_end date)
RETURNS TABLE(date date, value double precision)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT date, sum(value) AS value FROM daily_metrics
  WHERE metric_key = p_metric_key AND date BETWEEN p_start AND p_end
  GROUP BY date ORDER BY date
$$;
GRANT EXECUTE ON FUNCTION daily_series(text, date, date) TO authenticated;
