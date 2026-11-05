// SHA-256 helpers for the P0.6 storage soak (plan §6 P0.6, ADR-02).
// Used to prove a blob read back from IndexedDB or OPFS is byte-identical to
// what was written. WebCrypto only; no third-party hashing.

/** Lower-case hex of bytes. Stable, so hashes compare as plain strings. */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * SHA-256 of a buffer as lower-case hex. Accepts any ArrayBuffer-backed view;
 * the cast to BufferSource bridges TS's generic typed-array types (a view over
 * ArrayBufferLike) to WebCrypto's narrower BufferSource. digest copies the
 * bytes, so a detached/resized buffer is not a concern here.
 */
export async function sha256Hex(data: ArrayBuffer | ArrayBufferView): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * A single digest over an ordered list of per-chunk hashes. Lets the report
 * carry one short fingerprint instead of hundreds of lines, while still
 * changing if any chunk, or the chunk order, changes. Newline-joined so the
 * input is unambiguous.
 */
export async function hashOfHashes(hashes: readonly string[]): Promise<string> {
  const text = hashes.join('\n');
  return sha256Hex(new TextEncoder().encode(text));
}

/**
 * Constant-ish string compare for two hex digests. Equal length and equal
 * content. Not security-sensitive here (local integrity check), but kept in
 * one place so the self-test and verify paths agree on what "match" means.
 */
export function hashesMatch(a: string, b: string): boolean {
  return a.length === b.length && a === b;
}
