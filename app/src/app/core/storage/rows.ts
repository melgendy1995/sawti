// Row types stored by SawtiDb (P1.2). Outbox, conflicts, and usage are P4/P5
// placeholders: version(1) does not create those tables. Unknown enumerable
// keys are kept by writing the caller's object, not a field whitelist.

import type { BoardDoc } from '../../domain/board';

export interface ProfileRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: Record<string, string>;
  [extra: string]: unknown;
}

export interface BoardRow {
  id: string;
  profileId: string;
  doc: BoardDoc;
  /** Must equal `doc.rev`. The board-level rev is the only concurrency token. */
  rev: number;
  updatedAt: string;
  [extra: string]: unknown;
}

/** Index only. Blob bytes stay in the media backend, never in this row. */
export interface MediaRow {
  sha256: string;
  bytes: number;
  createdAt: string;
  backend: 'idb' | 'opfs' | 'native';
  namespace: string;
  [extra: string]: unknown;
}

export interface PackRow {
  id: string;
  activeVersion: string;
  installedAt: string;
  [extra: string]: unknown;
}

/** `key` example: "eg-core:want_water:f". */
export interface PackItemRow {
  key: string;
  packId: string;
  fileRef: string;
  text: string;
  [extra: string]: unknown;
}

export interface SettingRow {
  key: string;
  value: unknown;
  [extra: string]: unknown;
}

export interface SnapshotPayload {
  profile: ProfileRow | null;
  boards: BoardRow[];
  settings: SettingRow[];
}

export interface SnapshotRow {
  id?: number;
  profileId: string;
  createdAt: string;
  payload: SnapshotPayload;
  [extra: string]: unknown;
}

/** P4 placeholder. Not created in version(1). */
export interface OutboxOp {
  id?: number;
  recordId: string;
  kind: string;
  baseRev: number;
  [extra: string]: unknown;
}

/** P4 placeholder. Not created in version(1). */
export interface ConflictRow {
  id: string;
  [extra: string]: unknown;
}

/** P5 placeholder. Not created in version(1). */
export interface UsageRow {
  profileId: string;
  day: string;
  boardId: string;
  cellId: string;
  count: number;
  [extra: string]: unknown;
}
