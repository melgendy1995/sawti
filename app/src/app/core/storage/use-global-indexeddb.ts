import Dexie from 'dexie';

/**
 * Dexie reads `indexedDB` once, when its module is first evaluated. Unit tests
 * install fake-indexeddb after that if the bundler loads Dexie first. Call
 * this after `import 'fake-indexeddb/auto'` and before `new SawtiDb()`.
 */
export function useGlobalIndexedDb(): void {
  const root = globalThis as typeof globalThis & {
    indexedDB?: IDBFactory;
    IDBKeyRange?: typeof IDBKeyRange;
  };
  if (!root.indexedDB || !root.IDBKeyRange) return;
  Dexie.dependencies.indexedDB = root.indexedDB;
  Dexie.dependencies.IDBKeyRange = root.IDBKeyRange;
}
