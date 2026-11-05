import 'fake-indexeddb/auto';

import { TestBed } from '@angular/core/testing';
import { useGlobalIndexedDb } from '../storage/use-global-indexeddb';

useGlobalIndexedDb();
import { DEFAULT_ACCESS_TIMING, accessTimingLive, applyAccessTiming } from '../access/pointer-filter';
import { SAWTI_DB } from '../storage/db-token';
import { SawtiDb } from '../storage/sawti-db';
import { SpeakController } from '../../features/speak/speak-controller';
import { AppSettings } from './app-settings';
import { ProfileDirectory } from './profile-directory';
import { SETTING_GRID_SIZE } from './setting-keys';

describe('Profiles and settings', () => {
  let db: SawtiDb;

  beforeEach(() => {
    db = new SawtiDb(`sawti-settings-${crypto.randomUUID()}`);
    TestBed.configureTestingModule({
      providers: [{ provide: SAWTI_DB, useValue: db }],
    });
  });

  afterEach(async () => {
    applyAccessTiming(DEFAULT_ACCESS_TIMING);
    const name = db.name;
    db.close();
    await SawtiDb.delete(name);
  });

  it('stores speak mode, grid size, access timing, and the active profile', async () => {
    const settings = TestBed.inject(AppSettings);
    const directory = TestBed.inject(ProfileDirectory);

    const created = await directory.create('أحمد', 'm');
    expect(created.name['ar']).toBe('أحمد');
    expect(directory.genderOf(created)).toBe('m');
    expect(await settings.readActiveProfileId()).toBe(created.id);

    await directory.setGender(created.id, 'f');
    await settings.writeGridSize({ rows: 3, cols: 6 });
    await settings.writeSpeakMode('sentence');
    await settings.writeAccessTiming({ holdMs: 80, debounceMs: 40, activation: 'press' });
    await settings.applySavedAccessTiming();

    expect(accessTimingLive).toEqual({ holdMs: 80, debounceMs: 40, activation: 'press' });
    expect(await settings.readSpeakMode()).toBe('sentence');
    expect(await settings.readGridSize()).toEqual({ rows: 3, cols: 6 });
    expect(await settings.readAccessTiming()).toEqual({ holdMs: 80, debounceMs: 40, activation: 'press' });
    expect(await TestBed.inject(AppSettings).readSpeakMode()).toBe('sentence');

    const row = await db.profiles.get(created.id);
    expect(row?.['gender']).toBe('f');
    expect(row?.name['ar']).toBe('أحمد');
  });

  it('keeps unknown profile and setting keys', async () => {
    const directory = TestBed.inject(ProfileDirectory);
    const settings = TestBed.inject(AppSettings);
    const created = await directory.create('تجربة', 'm');
    const existing = await db.profiles.get(created.id);
    if (!existing) throw new Error('missing profile');
    await db.profiles.put({ ...existing, futureProfileField: 'keep-profile' });

    await directory.setGender(created.id, 'f');
    const profile = await db.profiles.get(created.id);
    expect(profile?.['futureProfileField']).toBe('keep-profile');
    expect(profile?.['gender']).toBe('f');

    await db.settings.put({ key: SETTING_GRID_SIZE, value: { rows: 1, cols: 1 }, futureSetting: true });
    await settings.writeGridSize({ rows: 2, cols: 4 });
    const grid = await db.settings.get(SETTING_GRID_SIZE);
    expect(grid?.['futureSetting']).toBe(true);
    expect(grid?.value).toEqual({ rows: 2, cols: 4 });
  });

  it('switches and deletes profiles after a confirm path in the directory', async () => {
    const directory = TestBed.inject(ProfileDirectory);
    const settings = TestBed.inject(AppSettings);
    const first = await directory.create('أحمد', 'm');
    const second = await directory.create('تجربة', 'f');
    expect(await settings.readActiveProfileId()).toBe(first.id);

    await directory.activate(second.id);
    expect(await settings.readActiveProfileId()).toBe(second.id);

    await directory.remove(second.id);
    expect(await settings.readActiveProfileId()).toBe(first.id);
    expect(await directory.list()).toHaveLength(1);

    await directory.remove(first.id);
    expect(await settings.readActiveProfileId()).toBeNull();
    expect(await directory.list()).toEqual([]);
  });

  it('uses the saved speak mode as the speak screen initial mode', async () => {
    const settings = TestBed.inject(AppSettings);
    await settings.writeSpeakMode('sentence');
    await settings.writeAccessTiming({ holdMs: 25, debounceMs: 0, activation: 'release' });

    const controller = TestBed.inject(SpeakController);
    await vi.waitFor(() => {
      expect(controller.mode()).toBe('sentence');
      expect(accessTimingLive.holdMs).toBe(25);
    });
  });
});
