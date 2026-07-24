import { describe, it, expect } from 'vitest';
import { aggregateSubscribers } from '@/verkauf/email-marketing';
import type { Subscriber } from '@/lib/types';

const row = (date: string, signups: number, unsubscribes: number, source = 'mailchimp'): Subscriber =>
  ({ date, source: source as Subscriber['source'], signups, unsubscribes, npsScore: null });

describe('aggregateSubscribers', () => {
  it('summiert Anmeldungen/Abmeldungen und berechnet Netto', () => {
    const rows = [row('2026-07-01', 10, 3), row('2026-07-02', 5, 1)];
    const { totals } = aggregateSubscribers(rows, { start: '2026-07-01', end: '2026-07-31' });
    expect(totals).toEqual({ signups: 15, unsubscribes: 4, netto: 11 });
  });

  it('ignoriert Zeilen außerhalb des Bereichs', () => {
    const rows = [row('2026-06-30', 100, 50), row('2026-07-01', 10, 2)];
    const { totals } = aggregateSubscribers(rows, { start: '2026-07-01', end: '2026-07-31' });
    expect(totals).toEqual({ signups: 10, unsubscribes: 2, netto: 8 });
  });

  it('aggregiert mehrere Quellen in denselben Tag', () => {
    const rows = [row('2026-07-01', 10, 2, 'mailchimp'), row('2026-07-01', 4, 1, 'klaviyo')];
    const { series } = aggregateSubscribers(rows, { start: '2026-07-01', end: '2026-07-05' });
    expect(series).toEqual([{ date: '2026-07-01', signups: 14, unsubscribes: 3, netto: 11 }]);
  });

  it('bucketet lange Zeiträume (>92 Tage) wochenweise auf Montage', () => {
    // 2026-07-01 = Mittwoch, 2026-07-03 = Freitag → gleiche ISO-Woche (Montag 2026-06-29)
    const rows = [row('2026-07-01', 10, 2), row('2026-07-03', 5, 1)];
    const { series } = aggregateSubscribers(rows, { start: '2026-01-01', end: '2026-07-31' });
    expect(series).toEqual([{ date: '2026-06-29', signups: 15, unsubscribes: 3, netto: 12 }]);
  });

  it('nimmt Buckets mit nur Abmeldungen (keine Anmeldungen) mit', () => {
    const rows = [row('2026-07-02', 0, 4)];
    const { series } = aggregateSubscribers(rows, { start: '2026-07-01', end: '2026-07-05' });
    expect(series).toEqual([{ date: '2026-07-02', signups: 0, unsubscribes: 4, netto: -4 }]);
  });

  it('leere Eingabe ⇒ Nullsummen und leere Reihe', () => {
    const { totals, series } = aggregateSubscribers([], { start: '2026-07-01', end: '2026-07-31' });
    expect(totals).toEqual({ signups: 0, unsubscribes: 0, netto: 0 });
    expect(series).toEqual([]);
  });
});
