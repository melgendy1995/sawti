import type { MediaRow } from '../rows';
import type { SawtiDb } from '../sawti-db';

/** Media index only. No Blob is written to Dexie. */
export class MediaRepo {
  constructor(private readonly db: SawtiDb) {}

  get(sha256: string): Promise<MediaRow | undefined> {
    return this.db.media.get(sha256);
  }

  record(row: MediaRow): Promise<string> {
    return this.db.media.put({ ...row });
  }

  delete(sha256: string): Promise<void> {
    return this.db.media.delete(sha256);
  }

  async usage(): Promise<number> {
    const rows = await this.db.media.toArray();
    let total = 0;
    for (const row of rows) total += row.bytes;
    return total;
  }
}
