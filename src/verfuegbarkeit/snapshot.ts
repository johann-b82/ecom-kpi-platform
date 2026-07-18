import type { Pool, PoolClient } from 'pg';

/** Schreibt für `today` (Default CURRENT_DATE) einen Bestands-Snapshot je
 *  Variante/Lager aus dem aktuellen stock_levels. Idempotent pro Tag. */
export async function writeDailySnapshot(
  client: Pool | PoolClient, today?: string,
): Promise<number> {
  const res = await client.query(
    `INSERT INTO stock_snapshots (variant_id, warehouse_id, snapshot_date, quantity_on_hand, quantity_reserved)
     SELECT variant_id, warehouse_id, COALESCE($1::date, CURRENT_DATE), quantity_on_hand, quantity_reserved
       FROM stock_levels
     ON CONFLICT (variant_id, warehouse_id, snapshot_date) DO NOTHING`,
    [today ?? null]);
  return res.rowCount ?? 0;
}
