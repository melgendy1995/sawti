// Load a v1.0 fixture into an already-open SawtiDb. Tests open the database
// (and install fake-indexeddb); this module does not.

import type {
  BoardRow,
  MediaRow,
  PackItemRow,
  PackRow,
  ProfileRow,
  SettingRow,
  SnapshotRow,
} from './rows';
import type { SawtiDb } from './sawti-db';

export interface V1Fixture {
  name: 'v1.0';
  dexieVersion: 1;
  dbName: 'sawti';
  tables: {
    profiles: ProfileRow[];
    boards: BoardRow[];
    media: MediaRow[];
    packs: PackRow[];
    packItems: PackItemRow[];
    snapshots: SnapshotRow[];
    settings: SettingRow[];
  };
}

const V1_TABLES = [
  'profiles',
  'boards',
  'media',
  'packs',
  'packItems',
  'snapshots',
  'settings',
] as const;

/** bulkPut each table unchanged, in one readwrite transaction. */
export async function loadV1Fixture(db: SawtiDb, fixture: V1Fixture): Promise<void> {
  const tables = fixture.tables;
  await db.transaction('rw', V1_TABLES, async () => {
    await db.profiles.bulkPut(tables.profiles);
    await db.boards.bulkPut(tables.boards);
    await db.media.bulkPut(tables.media);
    await db.packs.bulkPut(tables.packs);
    await db.packItems.bulkPut(tables.packItems);
    await db.snapshots.bulkPut(tables.snapshots);
    await db.settings.bulkPut(tables.settings);
  });
}
