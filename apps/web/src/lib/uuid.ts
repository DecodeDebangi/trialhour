type CryptoLike = Pick<Crypto, 'getRandomValues'> & { randomUUID?: () => string };

/**
 * A random v4 UUID. `crypto.randomUUID` only exists in secure contexts (https or localhost),
 * so on plain http (e.g. a phone opening http://192.168.x.x:5173) it is missing; in that case
 * build one from `getRandomValues`, which is available everywhere.
 */
export function newUuid(source: CryptoLike = globalThis.crypto): string {
  if (typeof source.randomUUID === 'function') return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
