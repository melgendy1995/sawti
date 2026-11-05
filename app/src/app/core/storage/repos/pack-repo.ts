import type { PackItemRow, PackRow } from '../rows';
import type { SawtiDb } from '../sawti-db';

/** Installed-pack index. Unzip, zip hash, and zip delete are P1.6, not here. */
export class PackRepo {
  constructor(private readonly db: SawtiDb) {}

  get(id: string): Promise<PackRow | undefined> {
    return this.db.packs.get(id);
  }

  list(): Promise<PackRow[]> {
    return this.db.packs.toArray();
  }

  put(row: PackRow): Promise<string> {
    return this.db.packs.put({ ...row });
  }

  getItem(key: string): Promise<PackItemRow | undefined> {
    return this.db.packItems.get(key);
  }

  itemsByPack(packId: string): Promise<PackItemRow[]> {
    return this.db.packItems.where('packId').equals(packId).toArray();
  }

  putItem(row: PackItemRow): Promise<string> {
    return this.db.packItems.put({ ...row });
  }
}
