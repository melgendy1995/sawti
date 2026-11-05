import { selfTest, type MediaBackend, type MediaStore } from './media-store';
import { selectWebMediaStore } from './select-web-media';

/**
 * In-memory MediaStore. jsdom has no OPFS and these tests must not touch a
 * real IndexedDB. selfTest still uses real SHA-256 on the tiny probe.
 */
class FakeStore implements MediaStore {
  readonly backend: MediaBackend;
  private readonly map = new Map<string, Blob>();

  constructor(
    backend: MediaBackend,
    private readonly supported: boolean,
    private readonly corrupt = false,
  ) {
    this.backend = backend;
  }

  isSupported(): boolean {
    return this.supported;
  }

  async write(key: string, blob: Blob): Promise<void> {
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

describe('selectWebMediaStore', () => {
  it('picks IDB when it is supported and honest, and does not create OPFS', async () => {
    let idbCreates = 0;
    const store = await selectWebMediaStore({
      createIdb: () => {
        idbCreates += 1;
        return new FakeStore('idb', true);
      },
      createOpfs: () => {
        throw new Error('createOpfs should not be called');
      },
    });

    expect(store.backend).toBe('idb');
    expect(idbCreates).toBe(1);
  });

  it('falls through to OPFS when IDB corrupts one byte', async () => {
    const store = await selectWebMediaStore({
      createIdb: () => new FakeStore('idb', true, true),
      createOpfs: () => new FakeStore('opfs', true),
    });

    expect(store.backend).toBe('opfs');
  });

  it('uses OPFS when IDB is unsupported, without treating that as a failure', async () => {
    const store = await selectWebMediaStore({
      createIdb: () => new FakeStore('idb', false),
      createOpfs: () => new FakeStore('opfs', true),
    });

    expect(store.backend).toBe('opfs');
  });

  it('rejects when both self-tests fail', async () => {
    await expect(
      selectWebMediaStore({
        createIdb: () => new FakeStore('idb', true, true),
        createOpfs: () => new FakeStore('opfs', true, true),
      }),
    ).rejects.toThrow(/No web media backend passed the self-test/);
  });

  it('rejects when both backends are unsupported', async () => {
    await expect(
      selectWebMediaStore({
        createIdb: () => new FakeStore('idb', false),
        createOpfs: () => new FakeStore('opfs', false),
      }),
    ).rejects.toThrow(/No web media backend passed the self-test/);
  });

  it('runs the real selfTest (probe is removed after a pass)', async () => {
    const idb = new FakeStore('idb', true);
    const store = await selectWebMediaStore({
      createIdb: () => idb,
      createOpfs: () => {
        throw new Error('createOpfs should not be called');
      },
      selfTestFn: selfTest,
    });

    expect(store.backend).toBe('idb');
    expect(await idb.keys()).toEqual([]);
  });
});
