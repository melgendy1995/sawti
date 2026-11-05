import 'fake-indexeddb/auto';

import { useGlobalIndexedDb } from './use-global-indexeddb';

useGlobalIndexedDb();

import { unzipNamedFiles, zipNamedFiles } from '../backup';
import { sha256Hex } from './sha256';
import { SawtiDb } from './sawti-db';
import type { BoardRow, ProfileRow, SettingRow } from './rows';
import type { BoardCell, BoardDoc } from '../../domain/board';
import {
  type BackupBlobStore,
  exportDatabase,
  openBackupBytes,
  restorePlainBackup,
} from './backup-io';

const PASSPHRASE = 'حصان-صحيح-نورة';

describe('backup round trip', () => {
  let db: SawtiDb;
  let blobs: MemoryBlobs;

  beforeEach(() => {
    db = new SawtiDb(`sawti-backup-${crypto.randomUUID()}`);
    blobs = new MemoryBlobs();
  });

  afterEach(async () => {
    const name = db.name;
    db.close();
    await SawtiDb.delete(name);
  });

  it('restores profile and board docs and media hashes from a plain archive', async () => {
    const seeded = await seed(db, blobs);
    const archived = await exportDatabase(db, blobs, {
      now: new Date('2026-02-02T00:00:00.000Z'),
    });

    await db.profiles.put({ ...seeded.profile, name: { ar: 'تغير', en: 'Changed' } });
    await db.settings.put({ key: 'locale', value: 'en', futureSetting: false });
    await blobs.delete(seeded.sha256, 'media');

    const opened = await openBackupBytes(archived, null);
    expect(opened.encrypted).toBe(false);
    expect(opened.plain.manifest.schemaVersion).toBe(1);
    expect(opened.plain.manifest.encrypted).toBe(false);
    await restorePlainBackup(db, blobs, opened.plain, new Date('2026-03-03T00:00:00.000Z'));

    expect(await db.profiles.get(seeded.profile.id)).toEqual(seeded.profile);
    expect(await db.boards.get(seeded.board.id)).toEqual(seeded.board);
    expect(await db.settings.get('locale')).toEqual(seeded.setting);
    const restored = await blobs.read(seeded.sha256, 'media');
    expect(restored).not.toBeNull();
    expect(await sha256Hex(restored ?? new Uint8Array())).toBe(seeded.sha256);

    const snaps = await db.snapshots.where('profileId').equals(seeded.profile.id).toArray();
    expect(snaps.length).toBeGreaterThan(0);
    expect(snaps.length).toBeLessThanOrEqual(10);
    expect(snaps.some((row) => row.payload.profile?.name['ar'] === 'تغير')).toBe(true);
  });

  it(
    'restores the same docs from a passphrase archive',
    async () => {
      const seeded = await seed(db, blobs);
      const archived = await exportDatabase(db, blobs, { passphrase: PASSPHRASE });
      await db.profiles.put({ ...seeded.profile, name: { ar: 'تغير', en: 'Changed' } });

      const opened = await openBackupBytes(archived, PASSPHRASE);
      expect(opened.encrypted).toBe(true);
      expect(opened.plain.media).toHaveLength(1);
      await restorePlainBackup(db, blobs, opened.plain);

      expect(await db.profiles.get(seeded.profile.id)).toEqual(seeded.profile);
      expect(await db.boards.get(seeded.board.id)).toEqual(seeded.board);
      const restored = await blobs.read(seeded.sha256, 'media');
      expect(await sha256Hex(restored ?? new Uint8Array())).toBe(seeded.sha256);
    },
    120_000,
  );

  it(
    'rejects a wrong passphrase and leaves the database as it was',
    async () => {
      const seeded = await seed(db, blobs);
      const archived = await exportDatabase(db, blobs, { passphrase: PASSPHRASE });
      await db.profiles.put({ ...seeded.profile, name: { ar: 'باقٍ', en: 'Stays' } });
      const before = await fingerprint(db);

      await expect(openBackupBytes(archived, 'كلمة-غلط')).rejects.toThrow(/Wrong passphrase/);
      expect(await fingerprint(db)).toEqual(before);
      expect((await db.profiles.get(seeded.profile.id))?.name['ar']).toBe('باقٍ');
    },
    120_000,
  );

  it('rejects a corrupt zip and leaves the database as it was', async () => {
    await seed(db, blobs);
    const before = await fingerprint(db);
    await expect(openBackupBytes(Uint8Array.of(1, 2, 3, 4), null)).rejects.toThrow(/damaged/);
    expect(await fingerprint(db)).toEqual(before);
  });

  it(
    'rejects a truncated payload and leaves the database as it was',
    async () => {
      await seed(db, blobs);
      const archived = await exportDatabase(db, blobs, { passphrase: PASSPHRASE });
      const outer = unzipNamedFiles(archived);
      const payload = outer['payload.bin'];
      const envelope = outer['envelope.json'];
      if (payload === undefined || envelope === undefined) throw new Error('missing encrypted parts');
      const broken = zipNamedFiles({
        'envelope.json': envelope,
        'payload.bin': payload.slice(0, Math.max(4, Math.floor(payload.length / 2))),
      });
      const before = await fingerprint(db);

      await expect(openBackupBytes(broken, PASSPHRASE)).rejects.toThrow(/damaged|Wrong passphrase/);
      expect(await fingerprint(db)).toEqual(before);
    },
    120_000,
  );

  it('rejects a future schemaVersion and leaves the database as it was', async () => {
    await seed(db, blobs);
    const encoder = new TextEncoder();
    const future = zipNamedFiles({
      'manifest.json': encoder.encode(
        JSON.stringify({
          schemaVersion: 99,
          appVersion: '9.0.0',
          createdAt: '2026-11-05T00:00:00.000Z',
          profileIds: [],
          encrypted: false,
        }),
      ),
      'settings.json': encoder.encode('[]'),
    });
    const before = await fingerprint(db);

    await expect(openBackupBytes(future, null)).rejects.toThrow(/Update the app/);
    expect(await fingerprint(db)).toEqual(before);
  });
});

interface Seeded {
  profile: ProfileRow;
  board: BoardRow;
  setting: SettingRow;
  sha256: string;
}

async function seed(db: SawtiDb, blobs: BackupBlobStore): Promise<Seeded> {
  const profile: ProfileRow = {
    id: 'nour',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    name: { ar: 'نورة', en: 'Noura' },
    futureProfileField: 'keep-profile',
  };
  const cell = {
    row: 0,
    col: 0,
    label: 'مية',
    vocabKey: 'water',
    spoken: null,
    symbol: null,
    audio: { kind: 'pack' },
    linkBoardId: null,
    color: 'fitz-noun',
    hidden: false,
    futureCellField: 'keep-cell',
  } as BoardCell;
  const doc = {
    schemaVersion: 1,
    id: 'food',
    profileId: 'nour',
    title: { ar: 'أكل', en: 'Food' },
    rows: 2,
    cols: 2,
    layoutLocked: true,
    cells: { water: cell },
    parked: [],
    rev: 3,
    futureField: 'keep-board',
  } as BoardDoc;
  const board: BoardRow = {
    id: 'food',
    profileId: 'nour',
    doc,
    rev: 3,
    updatedAt: '2026-01-02T00:00:00.000Z',
    futureBoardKey: 'keep-row',
  };
  const setting: SettingRow = { key: 'locale', value: 'ar', futureSetting: true };
  const bytes = Uint8Array.of(9, 8, 7, 6, 5);
  const sha256 = await sha256Hex(bytes);

  await db.profiles.put(profile);
  await db.boards.put(board);
  await db.settings.put(setting);
  await db.media.put({
    sha256,
    bytes: bytes.byteLength,
    createdAt: '2026-01-03T00:00:00.000Z',
    backend: 'idb',
    namespace: 'media',
  });
  await blobs.write(sha256, 'media', bytes);
  return { profile, board, setting, sha256 };
}

async function fingerprint(db: SawtiDb): Promise<unknown> {
  return {
    profiles: await db.profiles.toArray(),
    boards: await db.boards.toArray(),
    settings: await db.settings.toArray(),
    media: await db.media.toArray(),
    snapshots: await db.snapshots.toArray(),
  };
}

class MemoryBlobs implements BackupBlobStore {
  readonly backend = 'idb' as const;
  private readonly rows = new Map<string, Uint8Array>();

  async read(sha256: string, namespace: string): Promise<Uint8Array | null> {
    const hit = this.rows.get(`${namespace}__${sha256}`);
    return hit === undefined ? null : new Uint8Array(hit);
  }

  async write(sha256: string, namespace: string, bytes: Uint8Array): Promise<void> {
    this.rows.set(`${namespace}__${sha256}`, new Uint8Array(bytes));
  }

  async delete(sha256: string, namespace: string): Promise<void> {
    this.rows.delete(`${namespace}__${sha256}`);
  }
}
