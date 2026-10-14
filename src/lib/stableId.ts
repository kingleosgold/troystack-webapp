/**
 * A UUID made from a seed, the same every time for the same seed. Rows sent
 * to the account more than once (a retry after a lost answer, a second tab
 * moving the same guest stack) keep one id, so the second copy is refused as
 * a duplicate instead of saved twice.
 */
export async function stableUuid(seed: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  const b = new Uint8Array(digest).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // name-based version
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
