import type { SawtiDb } from './sawti-db';
import { pruneSnapshots, snapshotProfile } from './snapshot';

/**
 * Snapshot `profileId`, run `fn`, then prune. `fn` may only touch profiles,
 * boards, settings, and snapshots. If `fn` throws, the transaction rolls the
 * snapshot back. Pack and media writes do not use this helper.
 */
export async function mutateProfile<T>(
  db: SawtiDb,
  profileId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return db.transaction('rw', db.profiles, db.boards, db.settings, db.snapshots, async () => {
    await snapshotProfile(db, profileId);
    const result = await fn();
    // P4: dirty records {recordId, kind, baseRev}
    await pruneSnapshots(db, profileId, 10);
    return result;
  });
}
