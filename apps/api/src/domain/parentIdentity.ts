/**
 * Normal form used to recognise the same parent + child across bookings (SPEC A7):
 * trimmed, lower-cased, inner whitespace collapsed. "  Aanya  Rao " and "aanya rao" match.
 */
export function normalizeIdentityPart(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}
