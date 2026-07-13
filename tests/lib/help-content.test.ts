import { describe, it, expect } from 'vitest';
import { APPS } from '@/lib/apps';
import {
  HELP_PAGES,
  HELP_USER_PAGES,
  HELP_ADMIN_PAGES,
  getHelpPage,
} from '@/lib/help/content';

describe('help content registry', () => {
  it('has unique, url-safe slugs', () => {
    const slugs = HELP_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  it('provides a module help page for every registered app except hilfe itself', () => {
    const moduleSlugs = new Set(
      HELP_PAGES.filter((p) => p.group === 'module').map((p) => p.slug),
    );
    for (const app of APPS) {
      if (app.key === 'hilfe') continue;
      expect(moduleSlugs.has(app.key)).toBe(true);
    }
  });

  it('flags admin pages consistently', () => {
    for (const p of HELP_PAGES) {
      if (p.group === 'admin') expect(p.admin).toBe(true);
      else expect(p.admin).not.toBe(true);
    }
    expect(HELP_ADMIN_PAGES.every((p) => p.admin === true)).toBe(true);
    expect(HELP_USER_PAGES.some((p) => p.admin === true)).toBe(false);
  });

  it('resolves pages by slug', () => {
    expect(getHelpPage('kontakte')?.title).toBeTruthy();
    expect(getHelpPage('does-not-exist')).toBeUndefined();
  });

  it('every page has at least one section with at least one block', () => {
    for (const p of HELP_PAGES) {
      expect(p.sections.length).toBeGreaterThan(0);
      for (const s of p.sections) expect(s.blocks.length).toBeGreaterThan(0);
    }
  });
});
