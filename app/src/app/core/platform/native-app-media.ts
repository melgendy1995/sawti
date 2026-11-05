// Content-addressed native media. URLs come from Capacitor.convertFileSrc,
// not URL.createObjectURL. No Dexie.

import type { AppMediaPutOptions, AppMediaStore } from '../storage/app-media-store';
import { mediaKey } from '../storage/media-key';
import { sha256Hex } from '../storage/sha256';
import { NativeMediaStore } from './native-media-store';

function flatKey(sha256: string, options?: AppMediaPutOptions): string {
  return mediaKey(sha256, options?.namespace ?? 'media');
}

export function nativeAppMediaStore(store = new NativeMediaStore()): AppMediaStore {
  return {
    backend: 'native',
    async put(blob, options) {
      const sha = await sha256Hex(await blob.arrayBuffer());
      await store.write(flatKey(sha, options), blob);
      return sha;
    },
    async getUrl(sha256, options) {
      const key = flatKey(sha256, options);
      const blob = await store.read(key);
      if (blob === null) return null;
      return store.urlFor(key);
    },
    async getArrayBuffer(sha256, options) {
      const blob = await store.read(flatKey(sha256, options));
      return blob === null ? null : blob.arrayBuffer();
    },
    async delete(sha256, options) {
      await store.delete(flatKey(sha256, options));
    },
    async usage() {
      const sizes = await store.listSizes();
      let total = 0;
      for (const size of sizes) total += size;
      return total;
    },
  };
}
