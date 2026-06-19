export function isAllowedEmail(email: string | null | undefined, raw: string | undefined): boolean {
  if (!email) return false;
  const allow = (raw ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return false; // fail-closed
  return allow.includes(email.trim().toLowerCase());
}
