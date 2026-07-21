import type { Pool } from 'pg';
import { nextContactNumber } from '@/kontakte/number';
import { cleanContactName, realCompany } from '@/kontakte/name';

// ── Pure mappers (unit-tested) ─────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  completed: 'bezahlt',
  processing: 'auftrag',
  'on-hold': 'auftrag',
  pending: 'angebot',
  'checkout-draft': 'angebot',
  cancelled: 'storniert',
  failed: 'storniert',
  trash: 'storniert',
  refunded: 'retoure',
};

export function mapOrderStatus(wooStatus: string): string {
  return STATUS_MAP[wooStatus] ?? 'angebot';
}

interface Billing {
  first_name?: string; last_name?: string; company?: string; email?: string;
  country?: string; postcode?: string; address_1?: string; address_2?: string; city?: string; phone?: string;
}

export function billingContactKey(b: Billing): string {
  if (b.email) return b.email.trim().toLowerCase();
  return `${b.first_name ?? ''} ${b.last_name ?? ''} ${b.postcode ?? ''}`.trim().toLowerCase();
}

export type ContactSegment = 'geschaeft' | 'privat';

// B2C-Segmentierung: Billing mit ECHTEM Firmenname → Geschäftskunde, sonst Privat.
// realCompany verwirft Platzhalter (z. B. „-- Anrede wählen --"), damit solche
// Kontakte nicht fälschlich als Geschäftskunde gezählt werden.
export function billingSegment(b: Billing): ContactSegment {
  return realCompany(b) ? 'geschaeft' : 'privat';
}

export interface ContactFields {
  name: string; taxCountry: string | null; email: string | null; phone: string | null;
  street: string | null; zip: string | null; city: string | null; country: string | null;
}

export function mapBillingToContact(b: Billing): ContactFields {
  const name = cleanContactName(b);
  const street = `${b.address_1 ?? ''} ${b.address_2 ?? ''}`.trim() || null;
  return {
    name,
    taxCountry: b.country ? b.country.slice(0, 2) : null,
    email: b.email ?? null,
    phone: b.phone ?? null,
    street,
    zip: b.postcode ?? null,
    city: b.city ?? null,
    country: b.country ? b.country.slice(0, 2) : null,
  };
}

interface WooLineItem { sku?: string; quantity: number; price: string | number; total?: string | number }

export function mapOrderLines(items: WooLineItem[], skuToVariant: Map<string, string>):
  { lines: { variantId: string; quantity: number; unitPrice: number }[]; skipped: string[] } {
  const lines: { variantId: string; quantity: number; unitPrice: number }[] = [];
  const skipped: string[] = [];
  for (const it of items) {
    if (!it.sku) { skipped.push('(ohne SKU)'); continue; }
    const variantId = skuToVariant.get(it.sku);
    if (!variantId) { skipped.push(it.sku); continue; }
    lines.push({ variantId, quantity: it.quantity, unitPrice: Number(it.price) || 0 });
  }
  return { lines, skipped };
}

// Netto-Belegsumme aus WooCommerce: Summe ueber ALLE Positionen, auch die ohne
// SKU (geloeschte Produkte). `total` ist der Betrag NACH Rabatt — `subtotal`
// waere davor und wuerde Rabatte als Umsatz ausweisen.
export function mapOrderTotal(items: WooLineItem[]): number {
  return items.reduce((s, it) => s + (Number(it.total) || 0), 0);
}

// ── Impure importer: inert historical records, idempotent ──────────────
// Inserts sales_orders + lines + minimal events at the mapped final status.
// NO stock reservation/deduction and NO open_items — historical orders are
// records, not live workflow.

export interface OrderImportResult {
  ordersCreated: number;
  ordersLinked: number;      // already imported, unchanged status (only lines reconciled)
  ordersUpdated: number;     // already imported, status changed → status + events reconciled
  contactsCreated: number;
  linesImported: number;
  linesSkipped: number;
}

export async function importWooCommerceOrders(
  pool: Pool, rawOrders: Record<string, unknown>[], priceListId: string,
): Promise<OrderImportResult> {
  const result: OrderImportResult = {
    ordersCreated: 0, ordersLinked: 0, ordersUpdated: 0, contactsCreated: 0, linesImported: 0, linesSkipped: 0,
  };

  // Build lookups once.
  const skuRows = await pool.query<{ sku: string; id: string }>('SELECT sku, id FROM product_variants');
  const skuToVariant = new Map(skuRows.rows.map((r) => [r.sku, r.id]));

  const numbersRes = await pool.query<{ number: string }>('SELECT number FROM contacts');
  const contactNumbers = numbersRes.rows.map((r) => r.number);

  // email/key → contactId, seeded from existing woo contact refs.
  const contactRefs = await pool.query<{ external_id: string; entity_id: string }>(
    `SELECT external_id, entity_id FROM external_references
      WHERE source_system='woocommerce' AND entity_type='contact'`);
  const keyToContact = new Map(contactRefs.rows.map((r) => [r.external_id, r.entity_id]));

  for (const raw of rawOrders) {
    const wooId = String(raw.id);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');

      // Already imported? Then reconcile its lines against the current catalog
      // (a re-run after the variations import picks up newly-matchable positions).
      const existing = await c.query<{ entity_id: string }>(
        `SELECT entity_id FROM external_references
          WHERE source_system='woocommerce' AND entity_type='sales_order' AND external_id=$1`, [wooId]);
      if (existing.rows.length > 0) {
        const existingOrderId = existing.rows[0].entity_id;
        await c.query('DELETE FROM sales_order_lines WHERE order_id=$1', [existingOrderId]);
        const re = mapOrderLines((raw.line_items as WooLineItem[]) ?? [], skuToVariant);
        for (const l of re.lines) {
          await c.query(
            `INSERT INTO sales_order_lines (order_id, variant_id, quantity, unit_price) VALUES ($1,$2,$3,$4)`,
            [existingOrderId, l.variantId, l.quantity, l.unitPrice]);
        }
        result.linesImported += re.lines.length;
        result.linesSkipped += re.skipped.length;

        // Status + automatische Events abgleichen (Storno/Refund propagieren).
        const newStatus = mapOrderStatus(String(raw.status));
        const cur = await c.query<{ status: string }>('SELECT status FROM sales_orders WHERE id=$1', [existingOrderId]);
        if (cur.rows[0] && cur.rows[0].status !== newStatus) {
          await c.query('UPDATE sales_orders SET status=$2 WHERE id=$1', [existingOrderId, newStatus]);
          await c.query('DELETE FROM sales_order_events WHERE order_id=$1 AND automated=true', [existingOrderId]);
          const placedAt = (raw.date_created as string) ?? null;
          await c.query(
            `INSERT INTO sales_order_events (order_id, stage, source_app, automated, occurred_at)
             VALUES ($1,'bestellt','verkauf',true, COALESCE($2::timestamptz, now()))`, [existingOrderId, placedAt]);
          if (newStatus === 'bezahlt') {
            await c.query(
              `INSERT INTO sales_order_events (order_id, stage, source_app, automated, occurred_at)
               VALUES ($1,'bezahlt','finanzen',true, COALESCE($2::timestamptz,$3::timestamptz, now()))`,
              [existingOrderId, (raw.date_paid as string) ?? null, placedAt]);
          } else if (newStatus === 'retoure') {
            await c.query(
              `INSERT INTO sales_order_events (order_id, stage, source_app, automated, occurred_at)
               VALUES ($1,'retoure','verkauf',true, COALESCE($2::timestamptz, now()))`, [existingOrderId, placedAt]);
          }
          result.ordersUpdated++;
        } else {
          result.ordersLinked++;
        }
        await c.query('COMMIT');
        continue;
      }

      // Resolve/create contact.
      const billing = (raw.billing as Billing) ?? {};
      const key = billingContactKey(billing);
      let contactId = keyToContact.get(key);
      if (!contactId) {
        const cf = mapBillingToContact(billing);
        const number = nextContactNumber(contactNumbers);
        contactNumbers.push(number);
        const cins = await c.query<{ id: string }>(
          `INSERT INTO contacts (number, name, is_customer, segment, tax_country, price_list_id)
           VALUES ($1,$2,true,$3,$4,$5) RETURNING id`,
          [number, cf.name, billingSegment(billing), cf.taxCountry, priceListId]);
        contactId = cins.rows[0].id;
        if (cf.email || cf.phone) {
          await c.query(`INSERT INTO contact_persons (contact_id, name, email, phone) VALUES ($1,$2,$3,$4)`,
            [contactId, cf.name, cf.email, cf.phone]);
        }
        if (cf.street || cf.zip || cf.city) {
          await c.query(
            `INSERT INTO contact_addresses (contact_id, type, street, zip, city, country, is_default)
             VALUES ($1,'rechnung',$2,$3,$4,$5,true)`,
            [contactId, cf.street, cf.zip, cf.city, cf.country]);
        }
        await c.query(
          `INSERT INTO external_references (entity_type, entity_id, source_system, external_id, last_synced_at, raw_payload)
           VALUES ('contact', $1, 'woocommerce', $2, now(), $3::jsonb)
           ON CONFLICT (source_system, external_id, entity_type) DO NOTHING`,
          [contactId, key, JSON.stringify(billing)]);
        keyToContact.set(key, contactId);
        result.contactsCreated++;
      }

      // Order.
      const status = mapOrderStatus(String(raw.status));
      const number = `WC-${raw.number ?? raw.id}`;
      const placedAt = (raw.date_created as string) ?? null;
      const currency = (raw.currency as string) ?? 'EUR';
      const oins = await c.query<{ id: string }>(
        `INSERT INTO sales_orders (number, contact_id, channel, status, currency, placed_at)
         VALUES ($1,$2,'shop',$3,$4,$5) RETURNING id`,
        [number, contactId, status, currency, placedAt]);
      const orderId = oins.rows[0].id;

      const { lines, skipped } = mapOrderLines((raw.line_items as WooLineItem[]) ?? [], skuToVariant);
      for (const l of lines) {
        await c.query(
          `INSERT INTO sales_order_lines (order_id, variant_id, quantity, unit_price) VALUES ($1,$2,$3,$4)`,
          [orderId, l.variantId, l.quantity, l.unitPrice]);
      }
      result.linesImported += lines.length;
      result.linesSkipped += skipped.length;

      // Minimal inert events reflecting the final status.
      await c.query(
        `INSERT INTO sales_order_events (order_id, stage, source_app, automated, occurred_at)
         VALUES ($1,'bestellt','verkauf',true, COALESCE($2::timestamptz, now()))`, [orderId, placedAt]);
      if (status === 'bezahlt') {
        await c.query(
          `INSERT INTO sales_order_events (order_id, stage, source_app, automated, occurred_at)
           VALUES ($1,'bezahlt','finanzen',true, COALESCE($2::timestamptz,$3::timestamptz, now()))`,
          [orderId, (raw.date_paid as string) ?? null, placedAt]);
      } else if (status === 'retoure') {
        await c.query(
          `INSERT INTO sales_order_events (order_id, stage, source_app, automated, occurred_at)
           VALUES ($1,'retoure','verkauf',true, COALESCE($2::timestamptz, now()))`, [orderId, placedAt]);
      }

      await c.query(
        `INSERT INTO external_references (entity_type, entity_id, source_system, external_id, last_synced_at, raw_payload)
         VALUES ('sales_order', $1, 'woocommerce', $2, now(), $3::jsonb)
         ON CONFLICT (source_system, external_id, entity_type)
         DO UPDATE SET entity_id=excluded.entity_id, last_synced_at=now(), raw_payload=excluded.raw_payload`,
        [orderId, wooId, JSON.stringify(raw)]);

      await c.query('COMMIT');
      result.ordersCreated++;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  return result;
}
