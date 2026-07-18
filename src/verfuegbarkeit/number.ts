/** Nächste Bestellnummer B-<jahr>-#### aus dem bestehenden Satz (Fremdformate/andere Jahre ignoriert). */
export function nextPurchaseOrderNumber(existing: string[], year: number): string {
  const re = new RegExp(`^B-${year}-(\\d+)$`);
  const nums = existing
    .map((n) => re.exec(n))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => parseInt(m[1], 10));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `B-${year}-${String(next).padStart(4, '0')}`;
}
