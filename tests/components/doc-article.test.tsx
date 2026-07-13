import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DocArticle } from '@/components/help/DocArticle';
import type { DocPage } from '@/lib/help/content';

afterEach(cleanup);

const page: DocPage = {
  slug: 'demo', title: 'Demo Titel', summary: 'kurz', group: 'module',
  sections: [
    { heading: 'Abschnitt A', blocks: [
      { type: 'p', text: 'Ein Absatz.' },
      { type: 'list', items: ['Punkt eins', 'Punkt zwei'] },
    ] },
    { heading: 'Tabelle', blocks: [
      { type: 'table', head: ['Spalte'], rows: [['Zelle X']] },
    ] },
  ],
};

describe('DocArticle', () => {
  it('renders the title, section headings and block content', () => {
    render(<DocArticle page={page} />);
    expect(screen.getByText('Demo Titel')).toBeTruthy();
    expect(screen.getByText('Abschnitt A')).toBeTruthy();
    expect(screen.getByText('Ein Absatz.')).toBeTruthy();
    expect(screen.getByText('Punkt eins')).toBeTruthy();
    expect(screen.getByText('Spalte')).toBeTruthy();
    expect(screen.getByText('Zelle X')).toBeTruthy();
  });
});
