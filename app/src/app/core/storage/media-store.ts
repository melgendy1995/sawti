// MediaStore: the minimal blob-by-key interface behind which P0.6 tests two
// iOS storage backends (plan v1.1 decision 14 / ADR-02, §3.1).
//
//   idb  = IndexedDB blobs.
//   opfs = Origin Private File System, compared when this soak (or a runtime
//          self-test) shows IDB blobs unreliable on iOS
//          (R-02: WebKit IndexedDB blob bugs).
//
// P0.6 compares idb and opfs only. P1.2 adds 'native' (Capacitor Filesystem),
// implemented under core/platform so this module stays free of Capacitor.
// This module is pure of Angular/Capacitor so core-layer lint rules hold.

import { sha256Hex, hashesMatch } from './sha256';

/** P0.6 compares 'idb' and 'opfs'. P1.2 adds 'native'. */
export type MediaBackend = 'idb' | 'opfs' | 'native';

/** Blob storage keyed by an opaque string. Enough for the soak, no more. */
export interface MediaStore {
  readonly backend: MediaBackend;
  /** True when this backend's platform APIs exist. */
  isSupported(): boolean;
  write(key: string, blob: Blob): Promise<void>;
  read(key: string): Promise<Blob | null>;
  delete(key: string): Promise<void>;
  /** Remove every key this store owns. */
  clear(): Promise<void>;
  /** All keys currently stored, order unspecified. */
  keys(): Promise<string[]>;
}

/** Outcome of writing bytes and reading them back through a store. */
export interface SelfTestResult {
  backend: MediaBackend;
  key: string;
  bytes: number;
  writtenHash: string;
  readBackHash: string | null;
  match: boolean;
  error: string | null;
}

/**
 * Write bytes under `key`, read them back, and SHA-256 compare. This is the
 * runtime self-test ADR-02 describes: a backend that fails it is not trusted
 * for media. Cleans up the probe key afterwards (best effort).
 */
export async function selfTest(
  store: MediaStore,
  key: string,
  bytes: Uint8Array,
): Promise<SelfTestResult> {
  const writtenHash = await sha256Hex(bytes);
  const base: SelfTestResult = {
    backend: store.backend,
    key,
    bytes: bytes.byteLength,
    writtenHash,
    readBackHash: null,
    match: false,
    error: null,
  };
  try {
    await store.write(key, new Blob([bytes as BlobPart]));
    const readBack = await store.read(key);
    if (readBack === null) {
      return { ...base, error: 'read returned null' };
    }
    const readBackHash = await sha256Hex(await readBack.arrayBuffer());
    return { ...base, readBackHash, match: hashesMatch(writtenHash, readBackHash) };
  } catch (error) {
    return { ...base, error: errorText(error) };
  } finally {
    try {
      await store.delete(key);
    } catch {
      // Cleanup is best effort; a leftover probe key does not fail the test.
    }
  }
}

/** Short, loggable text for any thrown value (DOMException name included). */
export function errorText(error: unknown): string {
  if (error instanceof DOMException) return `${error.name}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}
