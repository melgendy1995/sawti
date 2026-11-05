import Dexie, { type Table } from 'dexie';

import type {
  BoardRow,
  ConflictRow,
  MediaRow,
  OutboxOp,
  PackItemRow,
  PackRow,
  ProfileRow,
  SettingRow,
  SnapshotRow,
  UsageRow,
} from './rows';
import { snapshotBeforeUpgrade } from './snapshot';

export class SawtiDb extends Dexie {
  profiles!: Table<ProfileRow, string>;
  boards!: Table<BoardRow, string>;
  media!: Table<MediaRow, string>;
  packs!: Table<PackRow, string>;
  packItems!: Table<PackItemRow, string>;
  outbox!: Table<OutboxOp, number>; // P4 — do not create the table in version(1)
  snapshots!: Table<SnapshotRow, number>;
  settings!: Table<SettingRow, string>;
  conflicts!: Table<ConflictRow, string>; // P4 — do not create the table in version(1)
  usage!: Table<UsageRow, [string, string, string, number]>; // P5 — do not create in version(1)

  constructor(name = 'sawti') {
    // Bind the IndexedDB that exists now. Dexie otherwise keeps the one it saw
    // when its module was first imported, which is empty in unit tests if
    // fake-indexeddb is installed later.
    super(name, bindLiveIndexedDb());
    this.version(1)
      .stores({
        profiles: 'id, updatedAt',
        boards: 'id, profileId, updatedAt',
        media: 'sha256',
        packs: 'id',
        packItems: 'key, packId',
        snapshots: '++id, profileId, createdAt',
        settings: 'key',
      })
      .upgrade((tx) => snapshotBeforeUpgrade(tx));
    // version(2) adds outbox, conflicts (P4); version(3) adds usage (P5)
  }
}

function bindLiveIndexedDb():
  | { indexedDB: IDBFactory; IDBKeyRange: typeof globalThis.IDBKeyRange }
  | undefined {
  const indexedDB = globalThis.indexedDB;
  const IDBKeyRange = globalThis.IDBKeyRange;
  if (!indexedDB || !IDBKeyRange) return undefined;
  Dexie.dependencies.indexedDB = indexedDB;
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;
  return { indexedDB, IDBKeyRange };
}
