/** Next sprechende Kontaktnummer K-#### from the existing set (malformed entries ignored). */
export function nextContactNumber(existing: string[]): string {
  const nums = existing
    .map((n) => /^K-(\d+)$/.exec(n))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => parseInt(m[1], 10));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `K-${String(next).padStart(4, '0')}`;
}
