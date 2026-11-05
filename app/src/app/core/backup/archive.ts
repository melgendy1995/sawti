// Plain `.sawti` zip. Encryption is a different outer zip (`envelope.json` +
// `payload.bin`) built by the caller. This module only packs the inner archive.
// `settings.json` is an extra member so caregiver settings round-trip.

import { unzipSync, zipSync } from 'fflate';

import { sha256Hex } from '../storage/sha256';

export const BACKUP_SCHEMA_VERSION = 1;

const CORRUPT =
  'الملف تالف. لم يتغيّر شيء. This backup file is damaged. Nothing was changed.';

const SCHEMA =
  'هذه النسخة من تطبيق أحدث. حدّث التطبيق. Update the app.';

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const SHA_PATTERN = /^[a-f0-9]{64}$/;
const EXT_PATTERN = /^[a-z0-9]{1,8}$/;

export interface BackupManifest {
  schemaVersion: number;
  appVersion: string;
  createdAt: string;
  profileIds: string[];
  encrypted: false;
}

export interface BackupProfileRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: Record<string, string>;
  [extra: string]: unknown;
}

export interface BackupBoardRow {
  id: string;
  profileId: string;
  doc: {
    schemaVersion: number;
    id: string;
    profileId: string;
    rev: number;
    [extra: string]: unknown;
  };
  rev: number;
  updatedAt: string;
  [extra: string]: unknown;
}

export interface BackupSettingRow {
  key: string;
  value: unknown;
  [extra: string]: unknown;
}

export interface BackupMediaFile {
  sha256: string;
  ext: string;
  bytes: Uint8Array;
}

export interface PlainBackup {
  manifest: BackupManifest;
  profiles: BackupProfileRow[];
  boards: BackupBoardRow[];
  settings: BackupSettingRow[];
  media: BackupMediaFile[];
}

export class BackupArchiveError extends Error {
  readonly code: 'corrupt' | 'schema';

  constructor(code: 'corrupt' | 'schema', message: string) {
    super(message);
    this.name = 'BackupArchiveError';
    this.code = code;
  }
}

export function zipNamedFiles(files: Record<string, Uint8Array>): Uint8Array {
  for (const name of Object.keys(files)) {
    if (!isSafeZipPath(name)) throw new BackupArchiveError('corrupt', CORRUPT);
  }
  return zipSync(files);
}

export function unzipNamedFiles(zipBytes: Uint8Array): Record<string, Uint8Array> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zipBytes);
  } catch {
    throw new BackupArchiveError('corrupt', CORRUPT);
  }
  for (const name of Object.keys(files)) {
    if (name.endsWith('/')) continue;
    if (!isSafeZipPath(name)) throw new BackupArchiveError('corrupt', CORRUPT);
  }
  return files;
}

export async function packPlainBackup(backup: PlainBackup): Promise<Uint8Array> {
  assertPackSchema(backup.manifest.schemaVersion);
  if (backup.manifest.encrypted !== false) throw new BackupArchiveError('corrupt', CORRUPT);
  if (backup.manifest.appVersion.length === 0 || backup.manifest.createdAt.length === 0) {
    throw new BackupArchiveError('corrupt', CORRUPT);
  }

  const profiles = backup.profiles.map(copyRecord) as BackupProfileRow[];
  const boards = backup.boards.map(copyRecord) as BackupBoardRow[];
  const settings = backup.settings.map(copyRecord) as BackupSettingRow[];
  const profileIds = profiles.map((row) => {
    assertId(row.id);
    return row.id;
  });
  if (new Set(profileIds).size !== profileIds.length) throw new BackupArchiveError('corrupt', CORRUPT);

  const files: Record<string, Uint8Array> = {
    'manifest.json': jsonBytes({
      schemaVersion: BACKUP_SCHEMA_VERSION,
      appVersion: backup.manifest.appVersion,
      createdAt: backup.manifest.createdAt,
      profileIds: [...profileIds].sort(),
      encrypted: false,
    }),
    'settings.json': jsonBytes(settings),
  };

  for (const profile of profiles) {
    files[`profiles/${profile.id}.json`] = jsonBytes(profile);
  }

  const seenBoards = new Set<string>();
  for (const board of boards) {
    assertId(board.id);
    if (!profileIds.includes(board.profileId)) throw new BackupArchiveError('corrupt', CORRUPT);
    if (seenBoards.has(board.id)) throw new BackupArchiveError('corrupt', CORRUPT);
    seenBoards.add(board.id);
    files[`boards/${board.id}.json`] = jsonBytes(board);
  }

  const seenMedia = new Set<string>();
  for (const file of backup.media) {
    if (!SHA_PATTERN.test(file.sha256) || !EXT_PATTERN.test(file.ext)) {
      throw new BackupArchiveError('corrupt', CORRUPT);
    }
    if (seenMedia.has(file.sha256)) throw new BackupArchiveError('corrupt', CORRUPT);
    seenMedia.add(file.sha256);
    const hash = await sha256Hex(file.bytes);
    if (hash !== file.sha256) throw new BackupArchiveError('corrupt', CORRUPT);
    files[`media/${file.sha256}.${file.ext}`] = new Uint8Array(file.bytes);
  }

  return zipNamedFiles(files);
}

export async function unpackPlainBackup(zipBytes: Uint8Array): Promise<PlainBackup> {
  const files = unzipNamedFiles(zipBytes);
  const manifestFile = files['manifest.json'];
  const settingsFile = files['settings.json'];
  if (manifestFile === undefined || settingsFile === undefined) {
    throw new BackupArchiveError('corrupt', CORRUPT);
  }

  const manifestRaw = parseJson(manifestFile);
  if (!isRecord(manifestRaw)) throw new BackupArchiveError('corrupt', CORRUPT);
  const schemaVersion = manifestRaw['schemaVersion'];
  if (typeof schemaVersion === 'number' && Number.isInteger(schemaVersion) && schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new BackupArchiveError('schema', SCHEMA);
  }
  if (schemaVersion !== BACKUP_SCHEMA_VERSION || manifestRaw['encrypted'] !== false) {
    throw new BackupArchiveError('corrupt', CORRUPT);
  }
  const appVersion = manifestRaw['appVersion'];
  const createdAt = manifestRaw['createdAt'];
  const profileIdsRaw = manifestRaw['profileIds'];
  if (typeof appVersion !== 'string' || typeof createdAt !== 'string' || !Array.isArray(profileIdsRaw)) {
    throw new BackupArchiveError('corrupt', CORRUPT);
  }
  if (!profileIdsRaw.every((id): id is string => typeof id === 'string' && ID_PATTERN.test(id))) {
    throw new BackupArchiveError('corrupt', CORRUPT);
  }
  if (new Set(profileIdsRaw).size !== profileIdsRaw.length) throw new BackupArchiveError('corrupt', CORRUPT);

  const profiles: BackupProfileRow[] = [];
  const boards: BackupBoardRow[] = [];
  const media: BackupMediaFile[] = [];

  for (const [path, bytes] of Object.entries(files)) {
    if (path.endsWith('/')) continue;
    if (path === 'manifest.json' || path === 'settings.json') continue;
    const profileName = directChild(path, 'profiles');
    if (profileName !== null) {
      profiles.push(readProfile(profileName, bytes));
      continue;
    }
    const boardName = directChild(path, 'boards');
    if (boardName !== null) {
      boards.push(readBoard(boardName, bytes));
      continue;
    }
    const mediaName = directChild(path, 'media');
    if (mediaName !== null) {
      media.push(await readMedia(mediaName, bytes));
      continue;
    }
  }

  const profileIds = profiles.map((row) => row.id);
  if (!sameSet(profileIds, profileIdsRaw)) throw new BackupArchiveError('corrupt', CORRUPT);
  const profileSet = new Set(profileIds);
  for (const board of boards) {
    if (!profileSet.has(board.profileId)) throw new BackupArchiveError('corrupt', CORRUPT);
  }

  const settings = readSettings(settingsFile);
  const manifest: BackupManifest = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion,
    createdAt,
    profileIds: [...profileIdsRaw],
    encrypted: false,
  };
  return { manifest, profiles, boards, settings, media };
}

function assertPackSchema(schemaVersion: number): void {
  if (typeof schemaVersion === 'number' && Number.isInteger(schemaVersion) && schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new BackupArchiveError('schema', SCHEMA);
  }
  if (schemaVersion !== BACKUP_SCHEMA_VERSION) throw new BackupArchiveError('corrupt', CORRUPT);
}

function readProfile(filename: string, bytes: Uint8Array): BackupProfileRow {
  if (!filename.endsWith('.json')) throw new BackupArchiveError('corrupt', CORRUPT);
  const id = filename.slice(0, -'.json'.length);
  assertId(id);
  const parsed = parseJson(bytes);
  if (!isRecord(parsed) || parsed['id'] !== id) throw new BackupArchiveError('corrupt', CORRUPT);
  if (typeof parsed['createdAt'] !== 'string' || typeof parsed['updatedAt'] !== 'string') {
    throw new BackupArchiveError('corrupt', CORRUPT);
  }
  if (!isStringRecord(parsed['name'])) throw new BackupArchiveError('corrupt', CORRUPT);
  return parsed as BackupProfileRow;
}

function readBoard(filename: string, bytes: Uint8Array): BackupBoardRow {
  if (!filename.endsWith('.json')) throw new BackupArchiveError('corrupt', CORRUPT);
  const id = filename.slice(0, -'.json'.length);
  assertId(id);
  const parsed = parseJson(bytes);
  if (!isRecord(parsed) || parsed['id'] !== id) throw new BackupArchiveError('corrupt', CORRUPT);
  if (typeof parsed['profileId'] !== 'string' || !ID_PATTERN.test(parsed['profileId'])) {
    throw new BackupArchiveError('corrupt', CORRUPT);
  }
  if (typeof parsed['rev'] !== 'number' || typeof parsed['updatedAt'] !== 'string') {
    throw new BackupArchiveError('corrupt', CORRUPT);
  }
  if (!isRecord(parsed['doc'])) throw new BackupArchiveError('corrupt', CORRUPT);
  return parsed as BackupBoardRow;
}

async function readMedia(filename: string, bytes: Uint8Array): Promise<BackupMediaFile> {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) throw new BackupArchiveError('corrupt', CORRUPT);
  const sha256 = filename.slice(0, dot);
  const ext = filename.slice(dot + 1);
  if (!SHA_PATTERN.test(sha256) || !EXT_PATTERN.test(ext)) throw new BackupArchiveError('corrupt', CORRUPT);
  const hash = await sha256Hex(bytes);
  if (hash !== sha256) throw new BackupArchiveError('corrupt', CORRUPT);
  return { sha256, ext, bytes: new Uint8Array(bytes) };
}

function readSettings(bytes: Uint8Array): BackupSettingRow[] {
  const parsed = parseJson(bytes);
  if (!Array.isArray(parsed)) throw new BackupArchiveError('corrupt', CORRUPT);
  const keys = new Set<string>();
  const rows: BackupSettingRow[] = [];
  for (const entry of parsed) {
    if (!isRecord(entry) || typeof entry['key'] !== 'string' || entry['key'].length === 0) {
      throw new BackupArchiveError('corrupt', CORRUPT);
    }
    if (keys.has(entry['key'])) throw new BackupArchiveError('corrupt', CORRUPT);
    keys.add(entry['key']);
    if (!Object.prototype.hasOwnProperty.call(entry, 'value')) throw new BackupArchiveError('corrupt', CORRUPT);
    rows.push(entry as BackupSettingRow);
  }
  return rows;
}

function assertId(id: string): void {
  if (!ID_PATTERN.test(id)) throw new BackupArchiveError('corrupt', CORRUPT);
}

function directChild(path: string, folder: string): string | null {
  const prefix = `${folder}/`;
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  if (rest.length === 0 || rest.includes('/')) throw new BackupArchiveError('corrupt', CORRUPT);
  return rest;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const set = new Set(left);
  if (set.size !== left.length) return false;
  return right.every((id) => set.has(id));
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new BackupArchiveError('corrupt', CORRUPT);
  }
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function copyRecord<T extends object>(value: T): T {
  return { ...value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) => typeof entry === 'string');
}

function isSafeZipPath(path: string): boolean {
  if (path.length === 0 || path.startsWith('/') || path.includes('\\')) return false;
  return path.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}
