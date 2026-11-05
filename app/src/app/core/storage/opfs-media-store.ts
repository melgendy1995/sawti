// OpfsMediaStore — Origin Private File System (plan v1.1 §3.1, ADR-02).
//
// The fallback P0.6 compares against IndexedDB. Each key is a file inside a
// private "sawti-soak" directory obtained from navigator.storage.getDirectory().
// Keys are flat chunk ids (no slashes), so no nested directories are needed.

import type { MediaStore } from './media-store';

const DIR_NAME = 'sawti-soak-opfs';

export class OpfsMediaStore implements MediaStore {
  readonly backend = 'opfs' as const;

  isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.storage &&
      typeof navigator.storage.getDirectory === 'function'
    );
  }

  async write(key: string, blob: Blob): Promise<void> {
    const dir = await this.dir();
    const handle = await dir.getFileHandle(fileName(key), { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
    } finally {
      await writable.close();
    }
  }

  async read(key: string): Promise<Blob | null> {
    const dir = await this.dir();
    try {
      const handle = await dir.getFileHandle(fileName(key));
      return await handle.getFile();
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const dir = await this.dir();
    try {
      await dir.removeEntry(fileName(key));
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  async clear(): Promise<void> {
    for (const key of await this.keys()) {
      await this.delete(key);
    }
  }

  async keys(): Promise<string[]> {
    const dir = await this.dir();
    const keys: string[] = [];
    // values()/keys() is an async iterator in the File System Access API.
    for await (const [name, handle] of entries(dir)) {
      if (handle.kind === 'file') keys.push(keyName(name));
    }
    return keys;
  }

  private async dir(): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(DIR_NAME, { create: true });
  }
}

// Files carry a .bin suffix so the directory only ever holds our blobs.
function fileName(key: string): string {
  if (key.includes('/') || key.includes('\\')) {
    throw new Error(`OPFS key must be flat: ${key}`);
  }
  return `${key}.bin`;
}

function keyName(file: string): string {
  return file.endsWith('.bin') ? file.slice(0, -'.bin'.length) : file;
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

interface AsyncEntries {
  entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
}

function entries(
  dir: FileSystemDirectoryHandle,
): AsyncIterableIterator<[string, FileSystemHandle]> {
  const iterable = (dir as unknown as AsyncEntries).entries;
  if (!iterable) throw new Error('OPFS directory iteration is unavailable');
  return iterable.call(dir);
}
