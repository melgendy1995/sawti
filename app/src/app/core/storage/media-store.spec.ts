import { selfTest, type MediaBackend, type MediaStore } from './media-store';
import { makeChunk } from './soak-chunks';

/**
 * In-memory MediaStore for the self-test logic. jsdom has no IndexedDB or OPFS,
 * so the real backends are device-only; this fake exercises the write → read →
 * SHA-256 compare path with real crypto on tiny (few-KB) fixtures.
 */
class FakeStore implements MediaStore {
  readonly backend: MediaBackend = 'idb';
  private readonly map = new Map<string, Blob>();
  constructor(private readonly corrupt = false) {}

  isSupported(): boolean {
    return true;
  }
  async write(key: string, blob: Blob): Promise<void> {
    // A corrupting backend flips one byte, standing in for a WebKit blob bug.
    if (this.corrupt) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      bytes[0] ^= 0x01;
      this.map.set(key, new Blob([bytes as BlobPart]));
      return;
    }
    this.map.set(key, blob);
  }
  async read(key: string): Promise<Blob | null> {
    return this.map.get(key) ?? null;
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
  async clear(): Promise<void> {
    this.map.clear();
  }
  async keys(): Promise<string[]> {
    return [...this.map.keys()];
  }
}

describe('MediaStore self-test', () => {
  const bytes = makeChunk(0, 4 * 1024); // 4 KiB fixture, not 200 MB.

  it('passes when the backend returns identical bytes, and cleans up the probe', async () => {
    const store = new FakeStore();
    const result = await selfTest(store, 'probe', bytes);

    expect(result.match).toBe(true);
    expect(result.error).toBeNull();
    expect(result.bytes).toBe(bytes.byteLength);
    expect(result.writtenHash).toBe(result.readBackHash);
    expect(result.writtenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await store.keys()).toEqual([]); // probe key removed
  });

  it('fails when the backend corrupts the blob', async () => {
    const result = await selfTest(new FakeStore(true), 'probe', bytes);

    expect(result.match).toBe(false);
    expect(result.error).toBeNull();
    expect(result.readBackHash).not.toBe(result.writtenHash);
  });

  it('reports a read that returns null as a non-match with a reason', async () => {
    const store: MediaStore = {
      backend: 'opfs',
      isSupported: () => true,
      write: async () => undefined,
      read: async () => null,
      delete: async () => undefined,
      clear: async () => undefined,
      keys: async () => [],
    };
    const result = await selfTest(store, 'probe', bytes);

    expect(result.match).toBe(false);
    expect(result.readBackHash).toBeNull();
    expect(result.error).toBe('read returned null');
  });
});
