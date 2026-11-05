// P1.11 export / import. Zip layout lives in core/backup. Passphrase crypto
// lives in core/crypto. This file is the only place that writes Dexie.

import {
  BackupArchiveError,
  packPlainBackup,
  unpackPlainBackup,
  unzipNamedFiles,
  zipNamedFiles,
  type BackupBoardRow,
  type BackupMediaFile,
  type BackupProfileRow,
  type BackupSettingRow,
  type PlainBackup,
} from '../backup';
import { BackupCryptoError, decryptBackupBytes, encryptBackupBytes, type BackupEnvelope } from '../crypto';
import type { AppMediaStore } from './app-media-store';
import type { BoardRow, MediaRow, ProfileRow, SettingRow } from './rows';
import type { SawtiDb } from './sawti-db';
import { pruneSnapshots, snapshotProfile } from './snapshot';
import { mutateProfile } from './write';

export const SAWTI_BACKUP_APP_VERSION = '0.0.0';

const CORRUPT =
  'الملف تالف. لم يتغيّر شيء. This backup file is damaged. Nothing was changed.';

export class BackupNeedsPassphraseError extends Error {
  readonly code = 'needs-passphrase' as const;

  constructor() {
    super('هذا الملف محمي بكلمة سر. This backup is protected by a passphrase.');
    this.name = 'BackupNeedsPassphraseError';
  }
}

/** Blob bytes for backup. Namespace is the media-store namespace (`media` or `packs`). */
export interface BackupBlobStore {
  readonly backend: MediaRow['backend'];
  read(sha256: string, namespace: string): Promise<Uint8Array | null>;
  write(sha256: string, namespace: string, bytes: Uint8Array): Promise<void>;
  delete(sha256: string, namespace: string): Promise<void>;
}

export interface OpenedBackup {
  encrypted: boolean;
  plain: PlainBackup;
}

export interface BackupPreview {
  encrypted: boolean;
  profileNames: string[];
  boardCount: number;
  mediaCount: number;
  schemaVersion: number;
}

export interface BackupExportOptions {
  appVersion?: string;
  now?: Date;
  /** Null or omitted builds a plain archive. A string builds the encrypted container. */
  passphrase?: string | null;
}

export function backupBlobsFromAppMedia(store: AppMediaStore): BackupBlobStore {
  return {
    backend: store.backend,
    async read(sha256, namespace) {
      const buffer = await store.getArrayBuffer(sha256, { namespace });
      return buffer === null ? null : new Uint8Array(buffer);
    },
    async write(sha256, namespace, bytes) {
      const written = await store.put(new Blob([bytes as BlobPart]), { namespace });
      if (written !== sha256) {
        throw new BackupArchiveError('corrupt', CORRUPT);
      }
    },
    async delete(sha256, namespace) {
      await store.delete(sha256, { namespace });
    },
  };
}

export async function exportDatabase(
  db: SawtiDb,
  blobs: BackupBlobStore,
  options: BackupExportOptions = {},
): Promise<Uint8Array> {
  const profiles = (await db.profiles.toArray()).map(copyProfile);
  const boards = (await db.boards.toArray()).map(copyBoard);
  const settings = (await db.settings.toArray()).map(copySetting);
  const mediaRows = await db.media.toArray();
  const media: BackupMediaFile[] = [];
  for (const row of mediaRows) {
    const bytes = await blobs.read(row.sha256, row.namespace);
    if (bytes === null) throw new BackupArchiveError('corrupt', CORRUPT);
    media.push({ sha256: row.sha256, ext: 'bin', bytes });
  }
  const plain: PlainBackup = {
    manifest: {
      schemaVersion: 1,
      appVersion: options.appVersion ?? SAWTI_BACKUP_APP_VERSION,
      createdAt: (options.now ?? new Date()).toISOString(),
      profileIds: profiles.map((row) => row.id),
      encrypted: false,
    },
    profiles,
    boards,
    settings,
    media,
  };
  const zip = await packPlainBackup(plain);
  const passphrase = options.passphrase;
  if (passphrase == null || passphrase.length === 0) return zip;
  const sealed = await encryptBackupBytes(zip, passphrase);
  return zipNamedFiles({
    'envelope.json': new TextEncoder().encode(JSON.stringify(sealed.envelope)),
    'payload.bin': sealed.payload,
  });
}

export function inspectBackupContainer(bytes: Uint8Array): 'plain' | 'encrypted' {
  const files = readContainer(bytes);
  const hasEnvelope = files['envelope.json'] !== undefined;
  const hasManifest = files['manifest.json'] !== undefined;
  if (hasEnvelope && !hasManifest) return 'encrypted';
  if (hasManifest && !hasEnvelope) return 'plain';
  throw new BackupArchiveError('corrupt', CORRUPT);
}

export async function openBackupBytes(
  bytes: Uint8Array,
  passphrase: string | null,
): Promise<OpenedBackup> {
  const kind = inspectBackupContainer(bytes);
  if (kind === 'plain') {
    return { encrypted: false, plain: await unpackPlainBackup(bytes) };
  }
  if (passphrase == null || passphrase.length === 0) throw new BackupNeedsPassphraseError();
  const files = readContainer(bytes);
  const envelopeFile = files['envelope.json'];
  const payload = files['payload.bin'];
  if (envelopeFile === undefined || payload === undefined) {
    throw new BackupArchiveError('corrupt', CORRUPT);
  }
  const envelope = parseEnvelope(envelopeFile);
  const plainZip = await decryptBackupBytes(envelope, payload, passphrase);
  return { encrypted: true, plain: await unpackPlainBackup(plainZip) };
}

export function previewBackup(opened: OpenedBackup): BackupPreview {
  return {
    encrypted: opened.encrypted,
    profileNames: opened.plain.profiles.map(profileLabel),
    boardCount: opened.plain.boards.length,
    mediaCount: opened.plain.media.length,
    schemaVersion: opened.plain.manifest.schemaVersion,
  };
}

/**
 * Write media bytes, then snapshot every existing profile and replace
 * profiles, boards, and settings. `mutateProfile` snapshots the anchor
 * profile and prunes it to 10. Other profiles are snapshotted in that same
 * transaction. The media index is replaced only after that transaction commits.
 */
export async function restorePlainBackup(
  db: SawtiDb,
  blobs: BackupBlobStore,
  plain: PlainBackup,
  now = new Date(),
): Promise<void> {
  const existingProfiles = await db.profiles.toArray();
  const existingMedia = await db.media.toArray();

  for (const file of plain.media) {
    await blobs.write(file.sha256, 'media', file.bytes);
  }

  const anchor = existingProfiles[0]?.id ?? plain.profiles[0]?.id ?? null;
  const replaceDocs = async (): Promise<void> => {
    for (const row of existingProfiles) {
      if (row.id === anchor) continue;
      await snapshotProfile(db, row.id);
    }
    await db.profiles.clear();
    await db.boards.clear();
    await db.settings.clear();
    if (plain.profiles.length > 0) await db.profiles.bulkPut(plain.profiles as ProfileRow[]);
    if (plain.boards.length > 0) await db.boards.bulkPut(plain.boards as unknown as BoardRow[]);
    if (plain.settings.length > 0) await db.settings.bulkPut(plain.settings as SettingRow[]);
    const pruneIds = new Set<string>([
      ...existingProfiles.map((row) => row.id),
      ...plain.profiles.map((row) => row.id),
    ]);
    for (const id of pruneIds) {
      if (id !== anchor) await pruneSnapshots(db, id, 10);
    }
  };

  if (anchor) {
    await mutateProfile(db, anchor, replaceDocs);
  } else {
    await db.transaction('rw', db.profiles, db.boards, db.settings, db.snapshots, replaceDocs);
  }

  const createdAt = now.toISOString();
  await db.transaction('rw', db.media, async () => {
    await db.media.clear();
    if (plain.media.length === 0) return;
    const rows: MediaRow[] = plain.media.map((file) => ({
      sha256: file.sha256,
      bytes: file.bytes.byteLength,
      createdAt,
      backend: blobs.backend,
      namespace: 'media',
    }));
    await db.media.bulkPut(rows);
  });

  const incoming = new Set(plain.media.map((file) => file.sha256));
  for (const row of existingMedia) {
    if (!incoming.has(row.sha256)) await blobs.delete(row.sha256, row.namespace);
  }
}

function readContainer(bytes: Uint8Array): Record<string, Uint8Array> {
  try {
    return unzipNamedFiles(bytes);
  } catch (error) {
    if (error instanceof BackupArchiveError) throw error;
    throw new BackupArchiveError('corrupt', CORRUPT);
  }
}

function parseEnvelope(bytes: Uint8Array): BackupEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new BackupArchiveError('corrupt', CORRUPT);
  }
  if (parsed === null || typeof parsed !== 'object') throw new BackupArchiveError('corrupt', CORRUPT);
  return parsed as BackupEnvelope;
}

function copyProfile(row: ProfileRow): BackupProfileRow {
  return { ...row };
}

function copyBoard(row: BoardRow): BackupBoardRow {
  return { ...row, doc: { ...row.doc } };
}

function copySetting(row: SettingRow): BackupSettingRow {
  return { ...row };
}

function profileLabel(row: BackupProfileRow): string {
  const arabic = row.name['ar'];
  const english = row.name['en'];
  if (typeof arabic === 'string' && arabic.length > 0) return arabic;
  if (typeof english === 'string' && english.length > 0) return english;
  return row.id;
}

export { BackupArchiveError, BackupCryptoError };
