import { describe, it, expect } from 'vitest';
import { dueConnectors, type SyncStateRow } from '@/lib/sync/runner';

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-07-03T12:00:00Z');

const row = (o: Partial<SyncStateRow>): SyncStateRow => ({
  connector: 'ga4', label: 'GA4', configured: true, lastRunAt: null, status: null, detail: null, ...o,
});

describe('dueConnectors', () => {
  it('includes configured connectors never run', () => {
    const out = dueConnectors([row({ connector: 'ga4', lastRunAt: null })], 6 * HOUR, NOW);
    expect(out).toEqual(['ga4']);
  });

  it('excludes connectors run more recently than the interval', () => {
    const oneHourAgo = new Date(NOW - HOUR).toISOString();
    const out = dueConnectors([row({ connector: 'ga4', lastRunAt: oneHourAgo })], 6 * HOUR, NOW);
    expect(out).toEqual([]);
  });

  it('includes connectors whose last run exceeds the interval', () => {
    const sevenHoursAgo = new Date(NOW - 7 * HOUR).toISOString();
    const out = dueConnectors([row({ connector: 'ga4', lastRunAt: sevenHoursAgo })], 6 * HOUR, NOW);
    expect(out).toEqual(['ga4']);
  });

  it('never includes unconfigured connectors, even if never run', () => {
    const out = dueConnectors(
      [row({ connector: 'meta', configured: false, lastRunAt: null }), row({ connector: 'ga4', lastRunAt: null })],
      HOUR,
      NOW,
    );
    expect(out).toEqual(['ga4']);
  });
});

import { SYNC_CONNECTORS } from '@/lib/sync/runner';
import { CONNECTORS, CONNECTOR_LABELS } from '@/lib/connector-fields';

describe('SYNC_CONNECTORS is derived from the connector registry', () => {
  it('covers exactly CONNECTORS with labels from CONNECTOR_LABELS', () => {
    expect(SYNC_CONNECTORS.map((c) => c.key)).toEqual(CONNECTORS);
    for (const { key, label } of SYNC_CONNECTORS) {
      expect(label).toBe(CONNECTOR_LABELS[key]);
    }
  });
});
