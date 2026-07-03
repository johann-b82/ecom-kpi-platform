import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  listGoodies, listCompetitors, listNotifications, listAuditLog,
  setNotificationStatus, simulateIntegration,
} from '@/brickpm/repository';
import { seedBrickpm } from '../../scripts/seed-brickpm';
import { pool } from '@/lib/db';

beforeAll(async () => { await seedBrickpm(); });
afterAll(async () => {
  await pool.query(`UPDATE bpm_notifications SET status = 'offen' WHERE id = 'N001'`);
  await pool.end();
});

describe('BrickPM repository writes (integration, benötigt DB)', () => {
  it('listGoodies returns 6 mapped goodies', async () => {
    const gs = await listGoodies();
    expect(gs).toHaveLength(6);
  });

  it('listCompetitors returns 8 mapped competitors', async () => {
    const cs = await listCompetitors();
    expect(cs).toHaveLength(8);
  });

  it('setNotificationStatus updates status and writes an audit row', async () => {
    await setNotificationStatus('N001', 'in Prüfung', 'a@b.de');
    const ns = await listNotifications();
    const n1 = ns.find((n) => n.id === 'N001')!;
    expect(n1.status).toBe('in Prüfung');
    const log = await listAuditLog();
    expect(log.some((e) => e.action === 'notification.status' && e.detail === 'N001 → in Prüfung')).toBe(true);
  });

  it('simulateIntegration updates last_sync and writes an audit row', async () => {
    await simulateIntegration('I001', 'a@b.de');
    const r = await pool.query(`SELECT last_sync FROM bpm_integrations WHERE id = 'I001'`);
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    expect(r.rows[0].last_sync).toBe(now);
    const log = await listAuditLog();
    expect(log.some((e) => e.action === 'integration.sync' && e.detail === `I001 @ ${now}`)).toBe(true);
  });
});
