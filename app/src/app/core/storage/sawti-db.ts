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
    super(name);
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
