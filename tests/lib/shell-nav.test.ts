import { describe, it, expect } from 'vitest';
import { activeApp, selectTabApps } from '@/lib/shell-nav';
import { APPS, type AppDef } from '@/lib/apps';

describe('activeApp', () => {
  it('matcht exakten App-Pfad', () => {
    expect(activeApp('/verkauf')?.key).toBe('verkauf');
  });
  it('matcht Unterpfad als Präfix', () => {
    expect(activeApp('/verkauf/belege/42')?.key).toBe('verkauf');
  });
  it('liefert null auf dem Launchpad', () => {
    expect(activeApp('/')).toBeNull();
  });
  it('matcht nicht auf Teil-Segment-Kollision', () => {
    // '/verkaufxy' darf nicht als '/verkauf' zählen
    expect(activeApp('/verkaufxy')).toBeNull();
  });
});

describe('selectTabApps', () => {
  const apps = APPS; // 7 Apps
  it('zeigt die ersten 4 + showMore bei >4 Apps', () => {
    const { tabs, showMore } = selectTabApps(apps, null);
    expect(tabs.map((a) => a.key)).toEqual(['verfuegbarkeit', 'verkauf', 'finanzen', 'katalog']);
    expect(showMore).toBe(true);
  });
  it('ersetzt Slot 4 durch die aktive App, wenn sie nicht unter den ersten 4 ist', () => {
    const { tabs } = selectTabApps(apps, 'brickpm');
    expect(tabs.map((a) => a.key)).toEqual(['verfuegbarkeit', 'verkauf', 'finanzen', 'brickpm']);
  });
  it('lässt die ersten 4 unverändert, wenn die aktive App schon dabei ist', () => {
    const { tabs } = selectTabApps(apps, 'verkauf');
    expect(tabs.map((a) => a.key)).toEqual(['verfuegbarkeit', 'verkauf', 'finanzen', 'katalog']);
  });
  it('zeigt alle Apps ohne showMore bei <=4 Apps', () => {
    const four = apps.slice(0, 4) as AppDef[];
    const { tabs, showMore } = selectTabApps(four, 'brickpm');
    expect(tabs).toHaveLength(4);
    expect(showMore).toBe(false);
  });
});
