import { describe, it, expect } from 'vitest';
import { CONNECTOR_FIELDS, CONNECTOR_LABELS, CONNECTOR_GROUPS, SYNC_EXCLUDED, CREDENTIAL_SOURCE } from '@/lib/connector-fields';
import { SYNC_CONNECTORS } from '@/lib/sync/runner';

describe('hub + amazon_ads registry entries', () => {
  it('registers hub with URL/API-Key fields and amazon_ads without own fields', () => {
    expect(CONNECTOR_FIELDS.hub.map((f) => f.field)).toEqual(['HUB_URL', 'HUB_API_KEY']);
    expect(CONNECTOR_FIELDS.hub.find((f) => f.field === 'HUB_API_KEY')?.secret).toBe(true);
    expect(CONNECTOR_FIELDS.amazon_ads).toEqual([]);
    expect(CONNECTOR_LABELS.hub).toBe('Verbindungs-Hub');
    expect(CONNECTOR_LABELS.amazon_ads).toBe('Amazon Ads');
    expect(CONNECTOR_GROUPS.flatMap((g) => g.connectors)).toContain('amazon_ads');
  });

  it('hub is excluded from sync; amazon_ads is gated on hub credentials', () => {
    expect(SYNC_EXCLUDED).toContain('hub');
    expect(CREDENTIAL_SOURCE.amazon_ads).toBe('hub');
    const keys = SYNC_CONNECTORS.map((c) => c.key);
    expect(keys).toContain('amazon_ads');
    expect(keys).not.toContain('hub');
  });
});
