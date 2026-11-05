// IndexedDbMediaStore — blobs stored directly in IndexedDB (plan v1.1 §3.1).
//
// Stores Blob objects, not ArrayBuffers, on purpose: the thing P0.6 is probing
// is exactly WebKit's IndexedDB *blob* path on iOS home-screen PWAs (R-02). A
// single DB with one object store keyed by the chunk key. No Dexie — the soak
// needs four operations, and a raw wrapper keeps the surface tiny.

import type { MediaStore } from './media-store';

const DB_NAME = 'sawti-soak-idb';
const STORE = 'blobs';
const DB_VERSION = 1;

export class IndexedDbMediaStore implements MediaStore {
  readonly backend = 'idb' as const;
  private dbPromise: Promise<IDBDatabase> | null = null;

  isSupported(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  async write(key: string, blob: Blob): Promise<void> {
    const db = await this.open();
    await this.tx(db, 'readwrite', (store) => store.put(blob, key));
  }

  async read(key: string): Promise<Blob | null> {
    const db = await this.open();
    const value = await this.request<unknown>(db, 'readonly', (store) => store.get(key));
    return value instanceof Blob ? value : null;
  }

  async delete(key: string): Promise<void> {
    const db = await this.open();
    await this.tx(db, 'readwrite', (store) => store.delete(key));
  }

  async clear(): Promise<void> {
    const db = await this.open();
    await this.tx(db, 'readwrite', (store) => store.clear());
  }

  async keys(): Promise<string[]> {
    const db = await this.open();
    const keys = await this.request<IDBValidKey[]>(db, 'readonly', (store) => store.getAllKeys());
    return keys.map((key) => String(key));
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
      request.onblocked = () => reject(new Error('indexedDB open blocked'));
    });
    return this.dbPromise;
  }

  /** Run a write op and resolve when the whole transaction commits. */
  private tx(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      // Surface the write error (e.g. QuotaExceededError) rather than swallow it.
      request.onerror = () => reject(request.error ?? transaction.error ?? new Error('idb op failed'));
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('idb transaction aborted'));
    });
  }

  /** Run a read op and resolve with its result. */
  private request<T>(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error ?? new Error('idb request failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('idb transaction aborted'));
    });
  }
}
