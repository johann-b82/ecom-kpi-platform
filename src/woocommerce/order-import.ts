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
  refunded: 'bezahlt',   // Verkauf bleibt Verkauf; die Erstattung wird ein eigener Gutschriftsbeleg
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

export interface WooRefund {
  id?: number | string;
  date_created?: string;
  amount?: string | number;
  total_tax?: string | number;
  line_items?: { total?: string | number }[];
}

// Netto-Betrag einer Erstattung, IMMER negativ. WooCommerce liefert `amount`
// positiv, die Positions-`total` negativ — deshalb wird das Vorzeichen hier
// explizit gesetzt statt der Quelle vertraut.
export function mapRefundNet(refund: WooRefund): number {
  const items = refund.line_items ?? [];
  if (items.length > 0) {
    const sum = items.reduce((s, li) => s + Math.abs(Number(li.total) || 0), 0);
    return sum === 0 ? 0 : -sum;
  }
  const gross = Math.abs(Number(refund.amount) || 0);
  const tax = Math.abs(Number(refund.total_tax) || 0);
  const result = -Math.abs(gross - tax);
  return result === 0 ? 0 : result;
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
  creditNotesCreated: number;
  creditNotesSkipped: number;
}

export async function importWooCommerceOrders(
  pool: Pool, rawOrders: Record<string, unknown>[], priceListId: string,
  fetchRefunds?: (orderId: string) => Promise<WooRefund[]>,
): Promise<OrderImportResult> {
  const result: OrderImportResult = {
    ordersCreated: 0, ordersLinked: 0, ordersUpdated: 0, contactsCreated: 0, linesImported: 0, linesSkipped: 0,
    creditNotesCreated: 0, creditNotesSkipped: 0,
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

      let orderId: string;

      // Already imported? Then reconcile its lines against the current catalog
      // (a re-run after the variations import picks up newly-matchable positions).
      const existing = await c.query<{ entity_id: string }>(
        `SELECT entity_id FROM external_references
          WHERE source_system='woocommerce' AND entity_type='sales_order' AND external_id=$1`, [wooId]);
      if (existing.rows.length > 0) {
        orderId = existing.rows[0].entity_id;
        await c.query('DELETE FROM sales_order_lines WHERE order_id=$1', [orderId]);
        const re = mapOrderLines((raw.line_items as WooLineItem[]) ?? [], skuToVariant);
        for (const l of re.lines) {
          await c.query(
            `INSERT INTO sales_order_lines (order_id, variant_id, quantity, unit_price) VALUES ($1,$2,$3,$4)`,
            [orderId, l.variantId, l.quantity, l.unitPrice]);
        }
        result.linesImported += re.lines.length;
        result.linesSkipped += re.skipped.length;

        await c.query('UPDATE sales_orders SET total_net = $2 WHERE id = $1',
          [orderId, mapOrderTotal((raw.line_items as WooLineItem[]) ?? [])]);

        // Status + automatische Events abgleichen (Storno/Refund propagieren).
        const newStatus = mapOrderStatus(String(raw.status));
        const cur = await c.query<{ status: string }>('SELECT status FROM sales_orders WHERE id=$1', [orderId]);
        if (cur.rows[0] && cur.rows[0].status !== newStatus) {
          await c.query('UPDATE sales_orders SET status=$2 WHERE id=$1', [orderId, newStatus]);
          await c.query('DELETE FROM sales_order_events WHERE order_id=$1 AND automated=true', [orderId]);
          const placedAt = (raw.date_created as string) ?? null;
          await c.query(
            `INSERT INTO sales_order_events (order_id, stage, source_app, automated, occurred_at)
             VALUES ($1,'bestellt','verkauf',true, COALESCE($2::timestamptz, now()))`, [orderId, placedAt]);
          if (newStatus === 'bezahlt') {
            await c.query(
              `INSERT INTO sales_order_events (order_id, stage, source_app, automated, occurred_at)
               VALUES ($1,'bezahlt','finanzen',true, COALESCE($2::timestamptz,$3::timestamptz, now()))`,
              [orderId, (raw.date_paid as string) ?? null, placedAt]);
          }
          result.ordersUpdated++;
        } else {
          result.ordersLinked++;
        }
      } else {
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
        const rawLines = (raw.line_items as WooLineItem[]) ?? [];
        const oins = await c.query<{ id: string }>(
          `INSERT INTO sales_orders (number, contact_id, channel, status, currency, placed_at, total_net)
           VALUES ($1,$2,'shop',$3,$4,$5,$6) RETURNING id`,
          [number, contactId, status, currency, placedAt, mapOrderTotal(rawLines)]);
        orderId = oins.rows[0].id;

        const { lines, skipped } = mapOrderLines(rawLines, skuToVariant);
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
        }

        await c.query(
          `INSERT INTO external_references (entity_type, entity_id, source_system, external_id, last_synced_at, raw_payload)
           VALUES ('sales_order', $1, 'woocommerce', $2, now(), $3::jsonb)
           ON CONFLICT (source_system, external_id, entity_type)
           DO UPDATE SET entity_id=excluded.entity_id, last_synced_at=now(), raw_payload=excluded.raw_payload`,
          [orderId, wooId, JSON.stringify(raw)]);

        result.ordersCreated++;
      }

      // Erstattungen -> je eine negative Gutschrift, verknuepft mit dem Ursprung.
      // Ein Block fuer BEIDE Pfade (Neuanlage/Bestand) — number/contact_id/currency/
      // placed_at werden hier bewusst frisch aus sales_orders gelesen statt aus
      // Pfad-lokalen Variablen, damit kein Duplikat noetig ist.
      const rawRefunds = (raw.refunds as { id?: number | string }[] | undefined) ?? [];
      if (fetchRefunds && rawRefunds.length > 0) {
        const orow = await c.query<{ number: string; contact_id: string; currency: string; placed_at: string; status: string }>(
          `SELECT number, contact_id, currency, placed_at, status FROM sales_orders WHERE id=$1`, [orderId]);
        const origin = orow.rows[0];
        if (origin.status === 'storniert') {
          // Ein stornierter Ursprung traegt bereits 0 zum Umsatz bei (siehe
          // REVENUE_STATUS_SQL) — eine Gutschrift daneben waere eine einseitige
          // Korrektur ins Negative. Keine Gutschrift anlegen; auf demselben
          // Zaehler wie "schon importiert" mitzaehlen, da in beiden Faellen kein
          // neuer Gutschriftsbeleg entsteht.
          result.creditNotesSkipped += rawRefunds.length;
        } else {
          const details = await fetchRefunds(wooId);
          for (const rf of details) {
            const refundId = String(rf.id ?? '');
            if (!refundId) continue;
            const refKey = `refund:${refundId}`;
            const dup = await c.query(
              `SELECT 1 FROM external_references
                WHERE source_system='woocommerce' AND entity_type='sales_order' AND external_id=$1`, [refKey]);
            if (dup.rows.length > 0) { result.creditNotesSkipped++; continue; }   // schon importiert
            const net = mapRefundNet(rf);
            const cnNumber = `${origin.number}-R${refundId}`;
            const cnIns = await c.query<{ id: string }>(
              `INSERT INTO sales_orders (number, contact_id, channel, status, currency, placed_at, total_net, related_order_id)
               VALUES ($1,$2,'shop','retoure',$3,$4,$5,$6) RETURNING id`,
              [cnNumber, origin.contact_id, origin.currency, rf.date_created ?? origin.placed_at, net, orderId]);
            const cnId = cnIns.rows[0].id;
            await c.query(
              `INSERT INTO sales_order_events (order_id, stage, source_app, automated, occurred_at)
               VALUES ($1,'retoure','verkauf',true, COALESCE($2::timestamptz, now()))`,
              [cnId, rf.date_created ?? null]);
            await c.query(
              `INSERT INTO external_references (entity_type, entity_id, source_system, external_id, last_synced_at, raw_payload)
               VALUES ('sales_order', $1, 'woocommerce', $2, now(), $3::jsonb)
               ON CONFLICT (source_system, external_id, entity_type) DO NOTHING`,
              [cnId, refKey, JSON.stringify(rf)]);
            result.creditNotesCreated++;
          }
        }
      }

      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  return result;
}
