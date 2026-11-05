// NativeMediaStore — Capacitor Filesystem under Directory.Data.
// Constructor-injected so unit tests never need a device.

import { Capacitor } from '@capacitor/core';
import {
  Directory,
  Filesystem,
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

import type { MediaStore } from '../storage/media-store';

export interface NativeFs {
  writeFile(options: WriteFileOptions): Promise<WriteFileResult>;
  readFile(options: ReadFileOptions): Promise<ReadFileResult>;
  deleteFile(options: DeleteFileOptions): Promise<void>;
  mkdir(options: MkdirOptions): Promise<void>;
  readdir(options: ReaddirOptions): Promise<ReaddirResult>;
  getUri(options: GetUriOptions): Promise<GetUriResult>;
}

// JavaScriptCore rejects Function#apply / spread once the argument count
// gets large. 8 KiB stays under that limit for long recordings.
const CHUNK = 0x2000;

export class NativeMediaStore implements MediaStore {
  readonly backend = 'native' as const;

  constructor(
    private readonly fs: NativeFs = Filesystem,
    private readonly toUrl: (uri: string) => string = (uri) => Capacitor.convertFileSrc(uri),
    private readonly root = 'sawti-media',
  ) {}

  isSupported(): boolean {
    if (typeof Capacitor === 'undefined' || typeof Capacitor.isNativePlatform !== 'function') {
      return false;
    }
    return Capacitor.isNativePlatform();
  }

  async write(key: string, blob: Blob): Promise<void> {
    assertFlatKey(key);
    await this.ensureRoot();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // No `encoding`: the plugin treats a bare string as base64 and writes bytes.
    await this.fs.writeFile({
      path: this.path(key),
      data: bytesToBase64(bytes),
      directory: Directory.Data,
      recursive: true,
    });
  }

  async read(key: string): Promise<Blob | null> {
    assertFlatKey(key);
    try {
      const result = await this.fs.readFile({
        path: this.path(key),
        directory: Directory.Data,
      });
      if (result.data instanceof Blob) return result.data;
      return base64ToBlob(result.data);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    assertFlatKey(key);
    try {
      await this.fs.deleteFile({ path: this.path(key), directory: Directory.Data });
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  async clear(): Promise<void> {
    for (const key of await this.keys()) {
      await this.delete(key);
    }
  }

  async keys(): Promise<string[]> {
    return (await this.files()).map((file) => file.name);
  }

  /** Byte size of each file. A missing root directory is empty, not an error. */
  async listSizes(): Promise<number[]> {
    return (await this.files()).map((file) => file.size);
  }

  /** Native playback URL. Do not use URL.createObjectURL for this backend. */
  async urlFor(key: string): Promise<string> {
    assertFlatKey(key);
    const { uri } = await this.fs.getUri({ path: this.path(key), directory: Directory.Data });
    return this.toUrl(uri);
  }

  private path(key: string): string {
    return `${this.root}/${key}`;
  }

  private async ensureRoot(): Promise<void> {
    try {
      await this.fs.mkdir({ path: this.root, directory: Directory.Data, recursive: true });
    } catch (error) {
      // A later write must not fail because the root directory is already there.
      if (!isAlreadyExists(error)) throw error;
    }
  }

  private async files(): Promise<{ name: string; size: number }[]> {
    try {
      const listed = await this.fs.readdir({ path: this.root, directory: Directory.Data });
      return listed.files
        .filter((file) => file.type === 'file')
        .map((file) => ({ name: file.name, size: file.size }));
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  }
}

function assertFlatKey(key: string): void {
  if (key.includes('..') || key.startsWith('/') || key.includes('\\') || key.includes('/')) {
    throw new Error(`Native media key must be a single path segment: ${key}`);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    const chunk = bytes.subarray(offset, offset + CHUNK);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBlob(data: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'application/octet-stream' });
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string') return message;
  }
  return '';
}

function isMissing(error: unknown): boolean {
  return errorMessage(error).toLowerCase().includes('does not exist');
}

function isAlreadyExists(error: unknown): boolean {
  return errorMessage(error).toLowerCase().includes('already exist');
}
