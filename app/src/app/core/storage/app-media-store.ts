// Content-addressed view over a P0.6 MediaStore. The hash is the id; the blob
// is written once, under a flat key. No Dexie rows.

import { mediaKey } from './media-key';
import type { MediaBackend, MediaStore } from './media-store';
import { sha256Hex } from './sha256';

export interface AppMediaPutOptions {
  namespace?: string;
}

export interface AppMediaStore {
  readonly backend: MediaBackend;
  /** Returns the SHA-256 of `blob`. */
  put(blob: Blob, options?: AppMediaPutOptions): Promise<string>;
  /**
   * Object URL for the blob, or null if it is missing.
   * The caller may revoke the URL.
   */
  getUrl(sha256: string, options?: AppMediaPutOptions): Promise<string | null>;
  getArrayBuffer(sha256: string, options?: AppMediaPutOptions): Promise<ArrayBuffer | null>;
  delete(sha256: string, options?: AppMediaPutOptions): Promise<void>;
  usage(): Promise<number>;
}

function flatKey(sha256: string, options?: AppMediaPutOptions): string {
  return mediaKey(sha256, options?.namespace ?? 'media');
}

export function wrapBlobStore(store: MediaStore): AppMediaStore {
  return {
    backend: store.backend,
    async put(blob, options) {
      const sha = await sha256Hex(await blob.arrayBuffer());
      await store.write(flatKey(sha, options), blob);
      return sha;
    },
    async getUrl(sha256, options) {
      const blob = await store.read(flatKey(sha256, options));
      // Caller may revoke this URL when the view is done with it.
      return blob === null ? null : URL.createObjectURL(blob);
    },
    async getArrayBuffer(sha256, options) {
      const blob = await store.read(flatKey(sha256, options));
      return blob === null ? null : blob.arrayBuffer();
    },
    async delete(sha256, options) {
      await store.delete(flatKey(sha256, options));
    },
    async usage() {
      let total = 0;
      for (const key of await store.keys()) {
        const blob = await store.read(key);
        if (blob === null) continue;
        total += blob.size;
      }
      return total;
    },
  };
}
