import { Injectable, inject } from '@angular/core';
import { SAWTI_DB } from '../storage/db-token';
import { ProfileRepo, SettingsRepo } from '../storage/repos';
import type { ProfileRow } from '../storage/rows';
import { AppSettings } from './app-settings';
import { PROFILE_GENDER_FIELD, SETTING_ACTIVE_PROFILE, type ProfileGender } from './setting-keys';

/** Local profiles in Dexie. Gender is the `gender` field on the profile row (`m` or `f`). */
@Injectable({ providedIn: 'root' })
export class ProfileDirectory {
  private readonly profiles = new ProfileRepo(inject(SAWTI_DB));
  private readonly settings = new SettingsRepo(inject(SAWTI_DB));
  private readonly appSettings = inject(AppSettings);

  list(): Promise<ProfileRow[]> {
    return this.profiles.list();
  }

  async create(nameAr: string, gender: ProfileGender): Promise<ProfileRow> {
    const trimmed = nameAr.trim();
    if (!trimmed) throw new Error('empty name');
    const now = new Date().toISOString();
    const row: ProfileRow = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      name: { ar: trimmed },
      [PROFILE_GENDER_FIELD]: gender,
    };
    await this.profiles.put(row);
    if (!(await this.appSettings.readActiveProfileId())) {
      await this.appSettings.writeActiveProfileId(row.id);
    }
    return row;
  }

  async setGender(id: string, gender: ProfileGender): Promise<void> {
    const row = await this.profiles.get(id);
    if (!row) return;
    await this.profiles.put({ ...row, [PROFILE_GENDER_FIELD]: gender });
  }

  activate(id: string): Promise<void> {
    return this.appSettings.writeActiveProfileId(id);
  }

  async remove(id: string): Promise<void> {
    const active = await this.appSettings.readActiveProfileId();
    await this.profiles.delete(id);
    if (active !== id) return;
    const rest = await this.profiles.list();
    const next = rest[0];
    if (next) {
      await this.appSettings.writeActiveProfileId(next.id);
      return;
    }
    await this.settings.delete(id, SETTING_ACTIVE_PROFILE);
  }

  genderOf(row: ProfileRow): ProfileGender | null {
    const value = row[PROFILE_GENDER_FIELD];
    return value === 'm' || value === 'f' ? value : null;
  }
}
