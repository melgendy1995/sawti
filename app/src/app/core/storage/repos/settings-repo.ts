import type { SettingRow } from '../rows';
import type { SawtiDb } from '../sawti-db';
import { mutateProfile } from '../write';

/** Settings are global. `profileId` only chooses which profile snapshot records the edit. */
export class SettingsRepo {
  constructor(private readonly db: SawtiDb) {}

  get(key: string): Promise<SettingRow | undefined> {
    return this.db.settings.get(key);
  }

  list(): Promise<SettingRow[]> {
    return this.db.settings.toArray();
  }

  put(profileId: string, row: SettingRow): Promise<string> {
    const stored: SettingRow = { ...row };
    return mutateProfile(this.db, profileId, () => this.db.settings.put(stored));
  }

  delete(profileId: string, key: string): Promise<void> {
    return mutateProfile(this.db, profileId, () => this.db.settings.delete(key));
  }
}
