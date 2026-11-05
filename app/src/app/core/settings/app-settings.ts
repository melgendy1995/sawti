import { Injectable, inject } from '@angular/core';
import { applyAccessTiming, type AccessTiming } from '../access/pointer-filter';
import { SAWTI_DB } from '../storage/db-token';
import { ProfileRepo, SettingsRepo } from '../storage/repos';
import type { ProfileRow, SettingRow } from '../storage/rows';
import {
  PROFILE_GENDER_FIELD,
  SETTING_ACCESS_TIMING,
  SETTING_ACTIVE_PROFILE,
  SETTING_GRID_SIZE,
  SETTING_SPEAK_MODE,
  type GridSizeSetting,
} from './setting-keys';

export type SpeakModeSetting = 'tap' | 'sentence';

/**
 * Global caregiver preferences in the Dexie `settings` table.
 * Writes snapshot against the active profile (P1.2). The caregiver PIN
 * key is not read or written here.
 */
@Injectable({ providedIn: 'root' })
export class AppSettings {
  private readonly db = inject(SAWTI_DB);
  private readonly settings = new SettingsRepo(this.db);
  private readonly profiles = new ProfileRepo(this.db);

  async readSpeakMode(): Promise<SpeakModeSetting | null> {
    const value = (await this.settings.get(SETTING_SPEAK_MODE))?.value;
    return value === 'tap' || value === 'sentence' ? value : null;
  }

  writeSpeakMode(mode: SpeakModeSetting): Promise<void> {
    return this.writeValue(SETTING_SPEAK_MODE, mode);
  }

  async readGridSize(): Promise<GridSizeSetting | null> {
    const value = (await this.settings.get(SETTING_GRID_SIZE))?.value;
    return isGridSize(value) ? value : null;
  }

  writeGridSize(size: GridSizeSetting): Promise<void> {
    return this.writeValue(SETTING_GRID_SIZE, size);
  }

  async readAccessTiming(): Promise<AccessTiming | null> {
    const value = (await this.settings.get(SETTING_ACCESS_TIMING))?.value;
    return isAccessTiming(value) ? value : null;
  }

  writeAccessTiming(timing: AccessTiming): Promise<void> {
    return this.writeValue(SETTING_ACCESS_TIMING, timing);
  }

  /** Copy a saved timing onto the live filter object. Missing values stay at the defaults. */
  async applySavedAccessTiming(): Promise<void> {
    const saved = await this.readAccessTiming();
    if (saved) applyAccessTiming(saved);
  }

  async readActiveProfileId(): Promise<string | null> {
    const value = (await this.settings.get(SETTING_ACTIVE_PROFILE))?.value;
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  writeActiveProfileId(id: string): Promise<void> {
    return this.putSetting(SETTING_ACTIVE_PROFILE, id, id);
  }

  private async writeValue(key: string, value: unknown): Promise<void> {
    const profileId = await this.profileIdForSnapshot();
    await this.putSetting(key, value, profileId);
  }

  private async putSetting(key: string, value: unknown, profileId: string): Promise<void> {
    const existing = await this.settings.get(key);
    const stored: SettingRow = { ...existing, key, value };
    await this.settings.put(profileId, stored);
  }

  /**
   * Snapshot target: the active profile when that row exists, otherwise the
   * first profile, otherwise a new fictional profile named تجربة.
   */
  private async profileIdForSnapshot(): Promise<string> {
    const activeId = await this.readActiveProfileId();
    if (activeId) {
      const active = await this.profiles.get(activeId);
      if (active) return activeId;
    }
    const first = (await this.profiles.list())[0];
    if (first) {
      await this.putSetting(SETTING_ACTIVE_PROFILE, first.id, first.id);
      return first.id;
    }
    const now = new Date().toISOString();
    const created: ProfileRow = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      name: { ar: 'تجربة' },
      [PROFILE_GENDER_FIELD]: 'm',
    };
    await this.profiles.put(created);
    await this.putSetting(SETTING_ACTIVE_PROFILE, created.id, created.id);
    return created.id;
  }
}

function isGridSize(value: unknown): value is GridSizeSetting {
  if (value === null || typeof value !== 'object') return false;
  const row = value as GridSizeSetting;
  return isGridCount(row.rows) && isGridCount(row.cols);
}

function isGridCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12;
}

function isAccessTiming(value: unknown): value is AccessTiming {
  if (value === null || typeof value !== 'object') return false;
  const row = value as AccessTiming;
  return isDelay(row.holdMs) && isDelay(row.debounceMs) && (row.activation === 'press' || row.activation === 'release');
}

function isDelay(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
