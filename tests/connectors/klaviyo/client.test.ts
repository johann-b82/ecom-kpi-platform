import { describe, it, expect, vi } from 'vitest';
import { KlaviyoClient } from '@/connectors/klaviyo/client';

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const metricsBody = {
  data: [
    { id: 'M1', attributes: { name: 'Subscribed to List' } },
    { id: 'M2', attributes: { name: 'Unsubscribed' } },
  ],
};

describe('KlaviyoClient', () => {
  it('listet Metriken und sendet Auth + revision Header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(metricsBody));
    const client = new KlaviyoClient('KEY', fetchMock as unknown as typeof fetch);
    const metrics = await client.listMetrics();
    expect(metrics).toEqual([
      { id: 'M1', name: 'Subscribed to List' },
      { id: 'M2', name: 'Unsubscribed' },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://a.klaviyo.com/api/metrics');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Klaviyo-API-Key KEY',
      revision: '2024-10-15',
    });
  });

  it('löst Metriknamen zu IDs auf', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(metricsBody));
    const client = new KlaviyoClient('KEY', fetchMock as unknown as typeof fetch);
    expect(await client.resolveMetricId('Unsubscribed')).toBe('M2');
  });

  it('wirft mit Auflistung, wenn ein Metrikname fehlt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(metricsBody));
    const client = new KlaviyoClient('KEY', fetchMock as unknown as typeof fetch);
    await expect(client.resolveMetricId('Nope'))
      .rejects.toThrow(/not found.*Subscribed to List, Unsubscribed/);
  });

  it('baut den Aggregate-Request mit metric_id, interval, timezone, Filter', async () => {
    const aggBody = { data: { attributes: { dates: ['2026-01-01T00:00:00+01:00'], data: [{ measurements: { count: [5] } }] } } };
    const fetchMock = vi.fn().mockResolvedValue(res(aggBody));
    const client = new KlaviyoClient('KEY', fetchMock as unknown as typeof fetch);
    const attrs = await client.metricAggregate('M1', 30);
    expect(attrs.dates).toEqual(['2026-01-01T00:00:00+01:00']);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://a.klaviyo.com/api/metric-aggregates');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.data.attributes.metric_id).toBe('M1');
    expect(body.data.attributes.interval).toBe('day');
    expect(body.data.attributes.timezone).toBe('Europe/Berlin');
    expect(body.data.attributes.measurements).toEqual(['count']);
    expect(body.data.attributes.filter[0]).toMatch(/^greater-or-equal\(datetime,/);
  });

  it('wirft bei HTTP-Fehler mit Status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ errors: [] }, 401));
    const client = new KlaviyoClient('KEY', fetchMock as unknown as typeof fetch);
    await expect(client.listMetrics()).rejects.toThrow(/failed: 401/);
  });
});
