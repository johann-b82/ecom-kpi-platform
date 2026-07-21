export interface BillingName {
  first_name?: string; last_name?: string; company?: string; email?: string;
}

const PLACEHOLDERS = new Set([
  'anrede', 'anrede wählen', '-- anrede wählen --', 'bitte auswählen', 'auswählen',
  'bitte wählen', '-- bitte wählen --', 'auswahl', 'auswahl: anrede', 'firma', 'company',
  'keine angabe', 'n/a',
]);

// Echter Firmenname — oder null, wenn der company-Wert ein Import-Platzhalter ist.
export function realCompany(b: BillingName): string | null {
  const raw = (b.company ?? '').trim();
  if (raw.length < 2) return null;
  const norm = raw.toLowerCase();
  if (/^[-–—\s]*$/.test(raw)) return null;                 // nur Striche/Whitespace
  if (PLACEHOLDERS.has(norm)) return null;
  if (/^\d+$/.test(raw)) return null;                      // rein numerisch
  if (/^\d{1,4}[.\/-]\d{1,2}[.\/-]\d{1,4}$/.test(raw)) return null; // datumsartig
  return raw;
}

// Anzeigename: echter Firmenname > Personenname > E-Mail > 'Unbekannt'.
export function cleanContactName(b: BillingName): string {
  const full = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim();
  const email = (b.email ?? '').trim();
  return realCompany(b) || full || email || 'Unbekannt';
}
