import { describe, it, expect } from 'vitest';
import { PRODUCTS, PROMOTIONS, GOODIES, COMPETITORS, NOTIFICATIONS, INTEGRATIONS } from '@/brickpm/seed-data';

describe('BrickPM seed data', () => {
  it('has the expected row counts', () => {
    expect(PRODUCTS).toHaveLength(13);
    expect(PROMOTIONS).toHaveLength(7);
    expect(GOODIES).toHaveLength(6);
    expect(COMPETITORS).toHaveLength(8);
    expect(NOTIFICATIONS).toHaveLength(9);
    expect(INTEGRATIONS).toHaveLength(8);
  });
  it('preserves known values and null-normalizes empty dates', () => {
    const p1 = PRODUCTS.find((p) => p.id === 'P001')!;
    expect(p1).toMatchObject({ name: 'Berliner Fernsehturm Limited Edition 2026', cost: 112.48, stock: 38, minStock: 50, succ: 'P010' });
    expect(p1.validTo).toBeNull();
    expect(GOODIES.find((g) => g.id === 'G001')!.products).toContain('P002');
    expect(NOTIFICATIONS.find((n) => n.id === 'N001')!.priority).toBe('kritisch');
  });
});
