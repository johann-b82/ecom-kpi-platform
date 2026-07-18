import { pool } from '../src/lib/db';
import { KREDITOR_ITEMS, UNASSIGNED_PAYMENTS } from '../src/finanzen/seed-data';

async function contactIdByName(name: string): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM contacts WHERE name = $1', [name]);
  if (r.rows.length === 0) throw new Error(`Unbekannter Kontakt im Seed: ${name}`);
  return r.rows[0].id;
}

export async function seedFinanzen(): Promise<void> {
  for (const it of KREDITOR_ITEMS) {
    const supplierId = await contactIdByName(it.supplierName);
    await pool.query(
      `INSERT INTO open_items (id, direction, contact_id, reference, amount, due_date, status)
       VALUES ($1,'kreditor',$2,$3,$4,$5,'offen')
       ON CONFLICT (id) DO UPDATE SET contact_id=excluded.contact_id, reference=excluded.reference,
         amount=excluded.amount, due_date=excluded.due_date`,
      [it.id, supplierId, it.reference, it.amount, it.dueDate]);
  }
  for (const p of UNASSIGNED_PAYMENTS) {
    await pool.query(
      `INSERT INTO payments (id, open_item_id, amount, method, external_reference, paid_at)
       VALUES ($1, NULL, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET amount=excluded.amount, method=excluded.method,
         external_reference=excluded.external_reference, paid_at=excluded.paid_at`,
      [p.id, p.amount, p.method, p.externalReference, p.paidAt]);
  }
  console.log('Finanzen seed applied.');
}

if (process.argv[1] && process.argv[1].endsWith('seed-finanzen.ts')) {
  seedFinanzen().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}
