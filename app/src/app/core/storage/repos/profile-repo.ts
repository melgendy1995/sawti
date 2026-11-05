import type { ProfileRow } from '../rows';
import type { SawtiDb } from '../sawti-db';
import { mutateProfile } from '../write';

export class ProfileRepo {
  constructor(private readonly db: SawtiDb) {}

  get(id: string): Promise<ProfileRow | undefined> {
    return this.db.profiles.get(id);
  }

  list(): Promise<ProfileRow[]> {
    return this.db.profiles.toArray();
  }

  put(row: ProfileRow): Promise<string> {
    const stored: ProfileRow = {
      ...row,
      updatedAt: new Date().toISOString(),
    };
    return mutateProfile(this.db, row.id, () => this.db.profiles.put(stored));
  }

  delete(id: string): Promise<void> {
    return mutateProfile(this.db, id, () => this.db.profiles.delete(id));
  }
}
