// P1.2: v1.0 fixture opens, unknown keys round-trip, snapshots stay at 10.
// fake-indexeddb stands in for the browser. This does not prove iOS keeps data.

import 'fake-indexeddb/auto';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { applyOpResult, type BoardDoc } from '../../domain/board';
import { loadV1Fixture, type V1Fixture } from './fixture-db';
import { BoardRepo, MediaRepo, PackRepo, ProfileRepo, SettingsRepo } from './repos';
import { SawtiDb } from './sawti-db';
import { pruneSnapshots, snapshotProfile } from './snapshot';
import { APP_DELETION_WARNING, storageStatus } from './storage-status';
import { mutateProfile } from './write';

const repoRoot = resolve(process.cwd(), '..');
const CELL = '0193b0c3-bbbb-7c41-9f7e-2b1d3a4c5e6f';
const PROFILE = '0193b0c2-aaaa-7c41-9f7e-2b1d3a4c5e6f';
const BOARD = '0193b0c2-7d1e-7c41-9f7e-2b1d3a4c5e6f';

function readFixture(): V1Fixture {
  const raw: unknown = JSON.parse(
    readFileSync(resolve(repoRoot, 'content/fixtures/db/v1.0/sawti.json'), 'utf8'),
  );
  return raw as V1Fixture;
}

describe('SawtiDb v1.0', () => {
  let db: SawtiDb;

  beforeEach(() => {
    db = new SawtiDb(`sawti-p12-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    const name = db.name;
    db.close();
    await SawtiDb.delete(name);
  });

  it('opens the committed fixture with unknown board, cell, profile, and setting keys intact', async () => {
    await loadV1Fixture(db, readFixture());

    const profile = await db.profiles.get(PROFILE);
    const board = await db.boards.get(BOARD);
    const setting = await db.settings.get('locale');
    const cell = board?.doc.cells[CELL] as { futureCellField?: string; row: number } | undefined;

    expect(profile?.['futureProfileField']).toBe('keep-profile');
    expect(profile?.name['ar']).toBe('مثال');
    expect(board?.rev).toBe(42);
    expect(board?.rev).toBe(board?.doc.rev);
    expect((board?.doc as BoardDoc & { futureField?: string }).futureField).toBe('keep-board');
    expect(cell?.futureCellField).toBe('keep-cell');
    expect(cell?.row).toBe(0);
    expect(setting?.value).toBe('ar');
    expect(setting?.['futureSetting']).toBe(true);
    expect(db.verno).toBe(1);
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      'boards',
      'media',
      'packItems',
      'packs',
      'profiles',
      'settings',
      'snapshots',
    ]);
  });

  it('keeps unknown keys through a domain op and a board save, without moving the cell', async () => {
    await loadV1Fixture(db, readFixture());
    const repo = new BoardRepo(db);
    const before = await repo.get(BOARD);
    if (!before) throw new Error('fixture board missing');

    const preview = applyOpResult(before.doc, { type: 'hide', id: CELL });
    if (!preview.ok) throw preview.error;
    const hidden = preview.board.cells[CELL] as { futureCellField?: string; row: number; col: number };
    expect(hidden.futureCellField).toBe('keep-cell');
    expect(hidden.row).toBe(0);
    expect(hidden.col).toBe(0);
    expect((preview.board as BoardDoc & { futureField?: string }).futureField).toBe('keep-board');

    const saved = await repo.applyBuiltOp(BOARD, { type: 'hide', id: CELL });
    const stored = await repo.get(BOARD);
    const storedCell = stored?.doc.cells[CELL] as { hidden: boolean; row: number; futureCellField?: string };

    expect(saved.cells[CELL]?.hidden).toBe(true);
    expect(stored?.rev).toBe(saved.rev);
    expect(storedCell?.hidden).toBe(true);
    expect(storedCell?.row).toBe(0);
    expect(storedCell?.futureCellField).toBe('keep-cell');
    expect((stored?.doc as BoardDoc & { futureField?: string }).futureField).toBe('keep-board');
  });

  it('round-trips unknown keys on profile, settings, pack item, and the media index', async () => {
    const profiles = new ProfileRepo(db);
    const settings = new SettingsRepo(db);
    const packs = new PackRepo(db);
    const media = new MediaRepo(db);

    await profiles.put({
      id: PROFILE,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      name: { ar: 'مثال', en: 'Example' },
      futureProfileField: 'keep-profile',
    });
    await settings.put(PROFILE, { key: 'locale', value: 'ar', futureSetting: true });
    await packs.putItem({
      key: 'eg-core:want_water:f',
      packId: 'eg-core',
      fileRef: 'abc',
      text: 'ماء',
      gloss: 'water',
    });
    await media.record({
      sha256: 'abc',
      bytes: 12,
      createdAt: '2026-01-02T00:00:00.000Z',
      backend: 'idb',
      namespace: 'media',
      note: 'index-only',
    });

    expect((await profiles.get(PROFILE))?.['futureProfileField']).toBe('keep-profile');
    expect((await settings.get('locale'))?.['futureSetting']).toBe(true);
    expect((await packs.getItem('eg-core:want_water:f'))?.['gloss']).toBe('water');
    const indexed = await media.get('abc');
    expect(indexed?.bytes).toBe(12);
    expect(indexed?.['note']).toBe('index-only');
    expect(indexed && 'blob' in indexed).toBe(false);
    expect(await media.usage()).toBe(12);
  });

  it('prunes to the last 10 snapshots for that profile and leaves other profiles alone', async () => {
    for (let day = 1; day <= 12; day += 1) {
      const stamp = `2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z`;
      await snapshotProfile(db, PROFILE, stamp);
    }
    await snapshotProfile(db, 'other-profile', '2026-06-01T00:00:00.000Z');

    await pruneSnapshots(db, PROFILE);

    const kept = await db.snapshots.where('profileId').equals(PROFILE).toArray();
    const dates = kept.map((row) => row.createdAt).sort();
    expect(dates).toHaveLength(10);
    expect(dates[0]).toBe('2026-01-03T00:00:00.000Z');
    expect(dates[9]).toBe('2026-01-12T00:00:00.000Z');
    expect(await db.snapshots.where('profileId').equals('other-profile').count()).toBe(1);
  });

  it('a board save keeps at most 10 snapshots, and a failed write keeps none', async () => {
    await loadV1Fixture(db, readFixture());
    const repo = new BoardRepo(db);
    const row = await repo.get(BOARD);
    if (!row) throw new Error('fixture board missing');

    for (let i = 0; i < 11; i += 1) {
      await repo.save(row.doc);
    }
    expect(await db.snapshots.where('profileId').equals(PROFILE).count()).toBe(10);

    const before = await db.snapshots.count();
    await expect(
      mutateProfile(db, PROFILE, () => Promise.reject(new Error('nope'))),
    ).rejects.toThrow('nope');
    expect(await db.snapshots.count()).toBe(before);
  });

  it('reports the newest snapshot and the app-deletion warning', async () => {
    await snapshotProfile(db, PROFILE, '2026-03-01T00:00:00.000Z');
    await snapshotProfile(db, PROFILE, '2026-04-01T00:00:00.000Z');

    const status = await storageStatus(db, 40);

    expect(status.lastSnapshotAt).toBe('2026-04-01T00:00:00.000Z');
    expect(status.mediaBytes).toBe(40);
    expect(status.deletionWarning).toBe(APP_DELETION_WARNING);
    expect(status.deletionWarning).toContain('Home Screen');
  });
});
