// Profile snapshots taken before a mutation or a Dexie upgrade. This file must
// not import SawtiDb (sawti-db.ts imports snapshotBeforeUpgrade).

import type { Table, Transaction } from 'dexie';

import type { BoardRow, ProfileRow, SettingRow, SnapshotPayload, SnapshotRow } from './rows';

/** Tables snapshotProfile can see. Structurally satisfied by SawtiDb. */
export interface SnapshotTables {
  profiles: Table<ProfileRow, string>;
  boards: Table<BoardRow, string>;
  settings: Table<SettingRow, string>;
  snapshots: Table<SnapshotRow, number>;
}

const SNAPSHOT_SOURCE_TABLES = ['profiles', 'boards', 'settings', 'snapshots'] as const;

/**
 * Read one profile, its boards, and every global setting into a new snapshot.
 * Does not prune and does not call mutateProfile.
 */
export async function snapshotProfile(
  db: SnapshotTables,
  profileId: string,
  now?: string,
): Promise<number> {
  const profile = (await db.profiles.get(profileId)) ?? null;
  const boards = await db.boards.where('profileId').equals(profileId).toArray();
  const settings = await db.settings.toArray();
  const payload: SnapshotPayload = { profile, boards, settings };
  return db.snapshots.add({
    profileId,
    createdAt: now ?? new Date().toISOString(),
    payload,
  });
}

/** Drop oldest snapshots for this profile until at most `keep` remain. */
export async function pruneSnapshots(
  db: SnapshotTables,
  profileId: string,
  keep = 10,
): Promise<void> {
  const rows = await db.snapshots.where('profileId').equals(profileId).toArray();
  if (rows.length <= keep) return;
  rows.sort(oldestFirst);
  const excess = rows.slice(0, rows.length - keep);
  const ids: number[] = [];
  for (const row of excess) {
    if (row.id !== undefined) ids.push(row.id);
  }
  if (ids.length > 0) await db.snapshots.bulkDelete(ids);
}

/**
 * Every Dexie version(n).upgrade must call this BEFORE mutating rows.
 * version(1) runs it on database creation when tables are empty.
 */
export async function snapshotBeforeUpgrade(tx: Transaction): Promise<void> {
  if (!SNAPSHOT_SOURCE_TABLES.every((name) => tx.storeNames.includes(name))) return;

  const profiles = await tx.table<ProfileRow, string>('profiles').toArray();
  const boards = await tx.table<BoardRow, string>('boards').toArray();
  const settings = await tx.table<SettingRow, string>('settings').toArray();
  const boardsByProfile = groupBoards(boards);
  const createdAt = new Date().toISOString();
  const snapshots = tx.table<SnapshotRow, number>('snapshots');

  for (const profile of profiles) {
    const payload: SnapshotPayload = {
      profile,
      boards: boardsByProfile.get(profile.id) ?? [],
      settings,
    };
    await snapshots.add({ profileId: profile.id, createdAt, payload });
  }
}

function oldestFirst(a: SnapshotRow, b: SnapshotRow): number {
  if (a.createdAt < b.createdAt) return -1;
  if (a.createdAt > b.createdAt) return 1;
  return (a.id ?? 0) - (b.id ?? 0);
}

function groupBoards(boards: readonly BoardRow[]): Map<string, BoardRow[]> {
  const byProfile = new Map<string, BoardRow[]>();
  for (const board of boards) {
    const list = byProfile.get(board.profileId);
    if (list) list.push(board);
    else byProfile.set(board.profileId, [board]);
  }
  return byProfile;
}
