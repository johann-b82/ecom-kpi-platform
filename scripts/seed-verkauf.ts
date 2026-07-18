import { pool } from '../src/lib/db';
import { SEED_ORDERS } from '../src/verkauf/seed-data';
import { createOrder, transitionOrderStatus, createReturn } from '../src/verkauf/repository';
import type { OrderStatus } from '../src/verkauf/types';

const PL_HANDEL = 'a1a1a1a1-0000-4000-8000-000000000001';
const CHAIN: OrderStatus[] = ['angebot', 'auftrag', 'versendet', 'rechnung_gestellt', 'bezahlt'];

async function lookup(table: 'contacts' | 'product_variants', col: string, val: string): Promise<string> {
  const r = await pool.query<{ id: string }>(`SELECT id FROM ${table} WHERE ${col} = $1`, [val]);
  if (r.rows.length === 0) throw new Error(`Nicht gefunden: ${table}.${col}=${val}`);
  return r.rows[0].id;
}

export async function seedVerkauf(): Promise<void> {
  for (const s of SEED_ORDERS) {
    const contactId = await lookup('contacts', 'number', s.contactNumber);
    const lines = [];
    for (const l of s.lines) {
      lines.push({ variantId: await lookup('product_variants', 'sku', l.sku), quantity: l.quantity, unitPrice: l.unitPrice });
    }
    const o = await createOrder({ contactId, channel: s.channel, priceListId: PL_HANDEL, lines });
    // Vom Einstiegsstatus schrittweise bis advanceTo hochfahren.
    const start = CHAIN.indexOf(o.status as OrderStatus);
    const end = CHAIN.indexOf(s.advanceTo);
    for (let i = start + 1; i <= end; i++) {
      await transitionOrderStatus(o.id, CHAIN[i]);
    }
    if (s.withReturn) await createReturn(o.id);
    console.log(`Seed-Beleg ${s.ref}: ${o.number} → ${s.advanceTo}${s.withReturn ? ' (+Retoure)' : ''}`);
  }
  console.log('Verkauf seed applied.');
}

if (process.argv[1] && process.argv[1].endsWith('seed-verkauf.ts')) {
  seedVerkauf().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}
