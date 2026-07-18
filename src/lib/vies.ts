const VIES_URL = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number';

/** Split a raw USt-IdNr. into ISO country + number, or null if malformed. */
export function parseVatId(vatId: string): { country: string; number: string } | null {
  const s = vatId.replace(/\s/g, '').toUpperCase();
  const m = /^([A-Z]{2})([0-9A-Z]{2,12})$/.exec(s);
  // The number part must contain at least one digit — every real EU VAT number
  // does; this rejects all-letter input like "NOPE" that the char class alone allows.
  if (!m || !/\d/.test(m[2])) return null;
  return { country: m[1], number: m[2] };
}

export type ViesResult = { valid: boolean; name?: string; error?: string };

/** Non-blocking VIES check. Never throws; EU service down ⇒ { valid:false, error }. */
export async function checkVatId(vatId: string): Promise<ViesResult> {
  const parsed = parseVatId(vatId);
  if (!parsed) return { valid: false, error: 'Ungültiges Format.' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(VIES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countryCode: parsed.country, vatNumber: parsed.number }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { valid: false, error: 'VIES nicht erreichbar.' };
    const data = await res.json();
    const name = data.name && data.name !== '---' ? String(data.name) : undefined;
    return { valid: !!data.valid, name };
  } catch {
    return { valid: false, error: 'VIES nicht erreichbar.' };
  } finally {
    clearTimeout(timer);
  }
}
