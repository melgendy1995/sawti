import { Injectable, inject } from '@angular/core';
import { SAWTI_DB } from '../storage/db-token';
import { ProfileRepo, SettingsRepo } from '../storage/repos';
import type { SettingRow } from '../storage/rows';
import {
  SETTING_ACTIVE_PROFILE,
  SETTING_CAREGIVER_PIN,
  type CaregiverPinRecord,
} from '../settings/setting-keys';

/**
 * Salt + hash for the caregiver PIN. Loaded only through a dynamic import
 * so the speak chunk does not pull Dexie in until the gate is used.
 */
@Injectable({ providedIn: 'root' })
export class CaregiverPinStore {
  private readonly settings = new SettingsRepo(inject(SAWTI_DB));
  private readonly profiles = new ProfileRepo(inject(SAWTI_DB));

  async read(): Promise<CaregiverPinRecord | null> {
    const row = await this.settings.get(SETTING_CAREGIVER_PIN);
    return isPinRecord(row?.value) ? row.value : null;
  }

  async write(record: CaregiverPinRecord): Promise<void> {
    const existing = await this.settings.get(SETTING_CAREGIVER_PIN);
    const profileId = await this.profileId();
    const stored: SettingRow = { ...existing, key: SETTING_CAREGIVER_PIN, value: record };
    await this.settings.put(profileId, stored);
  }

  private async profileId(): Promise<string> {
    const active = await this.settings.get(SETTING_ACTIVE_PROFILE);
    if (typeof active?.value === 'string' && active.value.length > 0) return active.value;
    const first = (await this.profiles.list())[0];
    return first?.id ?? 'local';
  }
}

function isPinRecord(value: unknown): value is CaregiverPinRecord {
  if (value === null || typeof value !== 'object') return false;
  const row = value as CaregiverPinRecord;
  return typeof row.salt === 'string' && row.salt.length > 0 && typeof row.hash === 'string' && row.hash.length > 0;
}
