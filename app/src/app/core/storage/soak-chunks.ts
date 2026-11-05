// Deterministic blob generation for the ~200 MB soak (plan §6 P0.6).
//
// The 200 MB is generated ON DEVICE at runtime, never committed. Bytes are
// patterned (a tiny xorshift PRNG seeded per chunk) so a chunk is reproducible
// from its index alone and is not real media of any person — just enough
// entropy that the hash is meaningful and the bytes do not compress to nothing.
//
// Memory stays bounded: the page builds one chunk buffer at a time, writes it,
// drops it, then builds the next.

const MiB = 1024 * 1024;

/** The soak write plan: how many chunks and how big each one is. */
export interface SoakPlan {
  chunkCount: number;
  chunkBytes: number;
  totalBytes: number;
}

/**
 * Default plan: 20 × 10 MiB ≈ 200 MiB. Bounded per-chunk memory. CI never runs
 * this; specs pass tiny byte counts directly to `makeChunk`.
 */
export function defaultSoakPlan(): SoakPlan {
  return makePlan(20, 10 * MiB);
}

export function makePlan(chunkCount: number, chunkBytes: number): SoakPlan {
  if (chunkCount <= 0 || chunkBytes <= 0) {
    throw new RangeError('soak plan needs positive chunk count and size');
  }
  return { chunkCount, chunkBytes, totalBytes: chunkCount * chunkBytes };
}

/** Stable key for a chunk, zero-padded so lexical order is numeric order. */
export function chunkKey(index: number): string {
  return `chunk-${String(index).padStart(4, '0')}`;
}

/**
 * Patterned bytes for chunk `index`, length `byteBytes`. Deterministic: the
 * same (index, length) always yields identical bytes, so a re-run can verify
 * against stored hashes, and a spec can assert an exact hash. xorshift32 keeps
 * it fast enough for 200 MB on a phone.
 */
export function makeChunk(index: number, byteLength: number): Uint8Array {
  const out = new Uint8Array(byteLength);
  // Seed from the index; +1 avoids a zero state, which xorshift cannot leave.
  let state = (index + 1) >>> 0;
  for (let i = 0; i < byteLength; i++) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    out[i] = state & 0xff;
  }
  return out;
}
