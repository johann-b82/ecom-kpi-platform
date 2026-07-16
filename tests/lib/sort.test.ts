import { describe, it, expect } from 'vitest';
import { parseSort, toggleSortParam } from '@/lib/sort';

const allowed = ['name', 'number', 'status'] as const;
const fallback = { col: 'number', dir: 'asc' } as const;

describe('parseSort', () => {
  it('liest aufsteigend', () => {
    expect(parseSort('name', allowed, fallback)).toEqual({ col: 'name', dir: 'asc' });
  });
  it('liest absteigend über führendes -', () => {
    expect(parseSort('-status', allowed, fallback)).toEqual({ col: 'status', dir: 'desc' });
  });
  it('fällt bei unbekannter/leerer Spalte auf den Default zurück (kein SQL-Injection-Vektor)', () => {
    expect(parseSort(undefined, allowed, fallback)).toEqual(fallback);
    expect(parseSort('id; DROP TABLE', allowed, fallback)).toEqual(fallback);
    expect(parseSort('-hack', allowed, fallback)).toEqual(fallback);
  });
});

describe('toggleSortParam', () => {
  it('schaltet dieselbe Spalte asc → desc', () => {
    expect(toggleSortParam({ col: 'name', dir: 'asc' }, 'name')).toBe('-name');
  });
  it('schaltet dieselbe Spalte desc → asc', () => {
    expect(toggleSortParam({ col: 'name', dir: 'desc' }, 'name')).toBe('name');
  });
  it('startet eine neue Spalte aufsteigend', () => {
    expect(toggleSortParam({ col: 'name', dir: 'desc' }, 'status')).toBe('status');
  });
});
