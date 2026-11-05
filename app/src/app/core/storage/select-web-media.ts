// Web policy until M0: try IndexedDB, self-test it, then OPFS. No hardcoded winner.

import { wrapBlobStore, type AppMediaStore } from './app-media-store';
import { IndexedDbMediaStore } from './idb-media-store';
import { selfTest, type MediaStore } from './media-store';
import { OpfsMediaStore } from './opfs-media-store';

export interface WebMediaSelectionDeps {
  createIdb?: () => MediaStore;
  createOpfs?: () => MediaStore;
  selfTestFn?: typeof selfTest;
  probe?: Uint8Array;
}

const DEFAULT_PROBE = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8);

let probeSeq = 0;

function probeKey(backend: string): string {
  probeSeq += 1;
  return `probe-${backend}-${probeSeq}`;
}

/**
 * IDB first, then OPFS. A supported backend whose self-test does not match is
 * skipped. selfTest deletes its probe key.
 */
export async function selectWebMediaStore(deps?: WebMediaSelectionDeps): Promise<AppMediaStore> {
  const createIdb = deps?.createIdb ?? (() => new IndexedDbMediaStore('sawti-media-idb'));
  const createOpfs = deps?.createOpfs ?? (() => new OpfsMediaStore('sawti-media-opfs'));
  const runSelfTest = deps?.selfTestFn ?? selfTest;
  const probe = deps?.probe ?? DEFAULT_PROBE;

  const idb = createIdb();
  if (idb.isSupported()) {
    const result = await runSelfTest(idb, probeKey('idb'), probe);
    if (result.match) return wrapBlobStore(idb);
  }

  const opfs = createOpfs();
  if (opfs.isSupported()) {
    const result = await runSelfTest(opfs, probeKey('opfs'), probe);
    if (result.match) return wrapBlobStore(opfs);
  }

  throw new Error('No web media backend passed the self-test (IDB then OPFS).');
}
