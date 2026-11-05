import type { SawtiDb } from './sawti-db';

export interface StorageStatus {
  estimate: { usage?: number; quota?: number } | null;
  persisted: boolean | null;
  /** Latest snapshot createdAt. Full file backups are later; the UI will show this as the last backup date. */
  lastSnapshotAt: string | null;
  mediaBytes: number;
  deletionWarning: string;
}

export const APP_DELETION_WARNING =
  "Deleting the app (the iOS Home Screen icon, or uninstalling on Android) deletes the user's data.";

/** Quota and persistence from `navigator.storage`, plus the newest snapshot time. No blobs and no UI. */
export async function storageStatus(db: SawtiDb, mediaBytes: number): Promise<StorageStatus> {
  const estimate = await readEstimate();
  const persisted = await readPersisted();
  const latest = await db.snapshots.orderBy('createdAt').last();
  return {
    estimate,
    persisted,
    lastSnapshotAt: latest?.createdAt ?? null,
    mediaBytes,
    deletionWarning: APP_DELETION_WARNING,
  };
}

async function readEstimate(): Promise<StorageStatus['estimate']> {
  if (typeof navigator === 'undefined') return null;
  const storage = navigator.storage;
  if (!storage || typeof storage.estimate !== 'function') return null;
  const estimate = await storage.estimate();
  return { usage: estimate.usage, quota: estimate.quota };
}

async function readPersisted(): Promise<boolean | null> {
  if (typeof navigator === 'undefined') return null;
  const storage = navigator.storage;
  if (!storage || typeof storage.persisted !== 'function') return null;
  return storage.persisted();
}
