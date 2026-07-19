import { describe, it, expect } from 'vitest';
import { realCompany, cleanContactName } from '@/kontakte/name';

describe('realCompany', () => {
  it('behält einen echten Firmennamen', () => {
    expect(realCompany({ company: 'Autohaus Marnet GmbH' })).toBe('Autohaus Marnet GmbH');
  });
  it('verwirft Platzhalter, Bindestriche, numerisch, datumsartig', () => {
    for (const c of ['--', '-', '-- Anrede wählen --', 'Bitte auswählen', 'Auswahl',
                     'Auswahl: Anrede', 'Anrede', '  ', '12345', '05.07.2002', 'a']) {
      expect(realCompany({ company: c })).toBeNull();
    }
  });
});

describe('cleanContactName', () => {
  it('nimmt echten Firmennamen zuerst', () => {
    expect(cleanContactName({ company: 'A.T.U', first_name: 'Max', last_name: 'Muster' })).toBe('A.T.U');
  });
  it('fällt bei Junk-Firma auf den Personennamen zurück', () => {
    expect(cleanContactName({ company: '-- Anrede wählen --', first_name: 'Max', last_name: 'Muster' }))
      .toBe('Max Muster');
  });
  it('fällt ohne Namen auf E-Mail zurück, sonst Unbekannt', () => {
    expect(cleanContactName({ company: 'Auswahl', email: 'a@b.de' })).toBe('a@b.de');
    expect(cleanContactName({ company: '--' })).toBe('Unbekannt');
  });
});
