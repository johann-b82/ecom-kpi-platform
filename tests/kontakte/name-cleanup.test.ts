import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { cleanContactNames } from '@/kontakte/name-cleanup';
import { nextContactNumber } from '@/kontakte/number';

const ids: string[] = [];
afterAll(async () => {
  for (const id of ids) {
    await pool.query(`DELETE FROM external_references WHERE entity_id=$1`, [id]);
    await pool.query(`DELETE FROM contacts WHERE id=$1`, [id]);
  }
  await pool.end();
});

async function seedContact(name: string, billing: object): Promise<string> {
  const nums = (await pool.query<{ number: string }>('SELECT number FROM contacts')).rows.map((r) => r.number);
  const number = nextContactNumber(nums);
  const c = await pool.query<{ id: string }>(
    `INSERT INTO contacts (number, name, is_customer) VALUES ($1,$2,true) RETURNING id`, [number, name]);
  const id = c.rows[0].id; ids.push(id);
  await pool.query(
    `INSERT INTO external_references (entity_type, entity_id, source_system, external_id, raw_payload)
     VALUES ('contact', $1, 'woocommerce', $2, $3)`, [id, `TEST-${id}`, JSON.stringify(billing)]);
  return id;
}

describe('cleanContactNames', () => {
  it('bereinigt Junk-Namen und ist idempotent; echte Namen bleiben', async () => {
    const junk = await seedContact('-- Anrede wählen --',
      { first_name: 'Max', last_name: 'Muster', company: '-- Anrede wählen --' });
    const real = await seedContact('Autohaus Marnet GmbH',
      { first_name: 'X', last_name: 'Y', company: 'Autohaus Marnet GmbH' });

    const changed = await cleanContactNames(pool);
    expect(changed).toBeGreaterThanOrEqual(1);
    expect((await pool.query('SELECT name FROM contacts WHERE id=$1', [junk])).rows[0].name).toBe('Max Muster');
    expect((await pool.query('SELECT name FROM contacts WHERE id=$1', [real])).rows[0].name).toBe('Autohaus Marnet GmbH');

    const second = await cleanContactNames(pool);   // idempotent
    expect((await pool.query('SELECT name FROM contacts WHERE id=$1', [junk])).rows[0].name).toBe('Max Muster');
    expect(second).toBe(0);
  });
});
