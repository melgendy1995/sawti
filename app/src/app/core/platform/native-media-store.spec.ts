import {
  Directory,
  type DeleteFileOptions,
  type GetUriOptions,
  type GetUriResult,
  type MkdirOptions,
  type ReaddirOptions,
  type ReaddirResult,
  type ReadFileOptions,
  type ReadFileResult,
  type WriteFileOptions,
  type WriteFileResult,
} from '@capacitor/filesystem';

import { sha256Hex } from '../storage/sha256';
import { nativeAppMediaStore } from './native-app-media';
import { NativeMediaStore, type NativeFs } from './native-media-store';

class FakeFs implements NativeFs {
  readonly files = new Map<string, { data: string; size: number }>();
  private readonly dirs = new Set<string>();

  async writeFile(options: WriteFileOptions): Promise<WriteFileResult> {
    if (typeof options.data !== 'string') throw new Error('data must be a base64 string');
    if (options.encoding !== undefined) throw new Error('encoding must be omitted');
    if (options.recursive !== true || options.directory !== Directory.Data) {
      throw new Error('writeFile must be recursive under Directory.Data');
    }
    const parent = options.path.slice(0, options.path.lastIndexOf('/'));
    if (!this.dirs.has(parent)) throw new Error('Parent directory must exist');
    const bytes = base64ToBytes(options.data);
    this.files.set(options.path, { data: options.data, size: bytes.byteLength });
    return { uri: `uri:${options.path}` };
  }

  async readFile(options: ReadFileOptions): Promise<ReadFileResult> {
    const file = this.files.get(options.path);
    if (!file) throw new Error('File does not exist');
    return { data: file.data };
  }

  async deleteFile(options: DeleteFileOptions): Promise<void> {
    if (!this.files.delete(options.path)) throw new Error('File does not exist');
  }

  async mkdir(options: MkdirOptions): Promise<void> {
    if (options.recursive !== true || options.directory !== Directory.Data) {
      throw new Error('mkdir must be recursive under Directory.Data');
    }
    if (this.dirs.has(options.path)) {
      throw new Error(`Directory at '${options.path}' already exists, cannot be overwritten.`);
    }
    this.dirs.add(options.path);
  }

  async readdir(options: ReaddirOptions): Promise<ReaddirResult> {
    if (!this.dirs.has(options.path)) throw new Error('Directory does not exist');
    const prefix = `${options.path}/`;
    const files = [...this.files.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, file]) => ({
        name: path.slice(prefix.length),
        type: 'file' as const,
        size: file.size,
        mtime: 0,
        uri: `uri:${path}`,
      }));
    return { files };
  }

  async getUri(options: GetUriOptions): Promise<GetUriResult> {
    return { uri: `uri:${options.path}` };
  }
}

function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function blobOf(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart]);
}

describe('NativeMediaStore', () => {
  function create(): { fs: FakeFs; store: NativeMediaStore } {
    const fs = new FakeFs();
    const store = new NativeMediaStore(fs, (uri) => `cap:${uri}`);
    return { fs, store };
  }

  it('round-trips bytes, including values above 127', async () => {
    const { store } = create();
    const bytes = Uint8Array.of(0, 1, 127, 128, 255);
    await store.write('clip', blobOf(bytes));

    const read = await store.read('clip');
    expect(read).not.toBeNull();
    expect(new Uint8Array(await read!.arrayBuffer())).toEqual(bytes);
    expect(read!.type).toBe('application/octet-stream');
  });

  it('returns null when the file is missing', async () => {
    const { store } = create();
    expect(await store.read('missing')).toBeNull();
  });

  it('does not throw when deleting a missing file', async () => {
    const { store } = create();
    await store.delete('missing');
    expect(await store.read('missing')).toBeNull();
  });

  it('lists file names and clear removes them', async () => {
    const { store } = create();
    expect(await store.keys()).toEqual([]);
    expect(await store.listSizes()).toEqual([]);

    await store.write('a', blobOf(Uint8Array.of(1, 2)));
    await store.write('b', blobOf(Uint8Array.of(3)));

    expect((await store.keys()).sort()).toEqual(['a', 'b']);
    expect((await store.listSizes()).sort((x, y) => x - y)).toEqual([1, 2]);

    await store.clear();
    expect(await store.keys()).toEqual([]);
    expect(await store.read('a')).toBeNull();
  });

  it('urlFor uses the injected converter', async () => {
    const { store } = create();
    await store.write('clip', blobOf(Uint8Array.of(9)));
    expect(await store.urlFor('clip')).toBe('cap:uri:sawti-media/clip');
  });

  it('rejects a key that contains ..', async () => {
    const { store } = create();
    await expect(store.write('a/../../b', blobOf(Uint8Array.of(1)))).rejects.toThrow();
    await expect(store.write('..', blobOf(Uint8Array.of(1)))).rejects.toThrow();
  });
});

describe('nativeAppMediaStore', () => {
  it('hashes, reads, converts the URL, and reports usage', async () => {
    const fs = new FakeFs();
    const native = new NativeMediaStore(fs, (uri) => `cap:${uri}`);
    const app = nativeAppMediaStore(native);
    const bytes = Uint8Array.of(1, 2, 3, 4);

    expect(app.backend).toBe('native');
    expect(await app.usage()).toBe(0);

    const sha = await app.put(blobOf(bytes));
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
    expect(sha).toBe(await sha256Hex(bytes));

    const back = await app.getArrayBuffer(sha);
    expect(back).not.toBeNull();
    expect(new Uint8Array(back!)).toEqual(bytes);
    expect(await app.getUrl(sha)).toBe(`cap:uri:sawti-media/media__${sha}`);
    expect(await app.usage()).toBe(bytes.byteLength);

    await app.delete(sha);
    expect(await app.getArrayBuffer(sha)).toBeNull();
    expect(await app.usage()).toBe(0);
  });

  it('keeps a packs namespace on a different path from the default', async () => {
    const fs = new FakeFs();
    const native = new NativeMediaStore(fs, (uri) => `cap:${uri}`);
    const app = nativeAppMediaStore(native);
    const bytes = Uint8Array.of(5, 6, 7);

    const sha = await app.put(blobOf(bytes));
    const packs = await app.put(blobOf(bytes), { namespace: 'packs' });

    expect(packs).toBe(sha);
    expect([...fs.files.keys()].sort()).toEqual(
      [`sawti-media/media__${sha}`, `sawti-media/packs__${sha}`].sort(),
    );
    expect(await app.usage()).toBe(bytes.byteLength * 2);

    await app.delete(sha);
    expect(await app.getArrayBuffer(sha)).toBeNull();
    expect(await app.getArrayBuffer(sha, { namespace: 'packs' })).not.toBeNull();
  });
});
