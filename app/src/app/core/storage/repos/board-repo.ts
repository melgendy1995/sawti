import { applyOpResult, type BoardDoc, type BoardOp } from '../../../domain/board';

import type { BoardRow } from '../rows';
import type { SawtiDb } from '../sawti-db';
import { mutateProfile } from '../write';

export class BoardRepo {
  constructor(private readonly db: SawtiDb) {}

  get(id: string): Promise<BoardRow | undefined> {
    return this.db.boards.get(id);
  }

  listByProfile(profileId: string): Promise<BoardRow[]> {
    return this.db.boards.where('profileId').equals(profileId).toArray();
  }

  /** Stores `doc` as the same object the caller passed. Does not move cells. */
  save(doc: BoardDoc): Promise<string> {
    const row: BoardRow = {
      id: doc.id,
      profileId: doc.profileId,
      doc,
      rev: doc.rev,
      updatedAt: new Date().toISOString(),
    };
    return mutateProfile(this.db, doc.profileId, () => this.db.boards.put(row));
  }

  /** The only repository method that calls a domain op. */
  async applyBuiltOp(boardId: string, op: BoardOp): Promise<BoardDoc> {
    const row = await this.get(boardId);
    if (!row) throw new Error(`missing board: ${boardId}`);
    const result = applyOpResult(row.doc, op);
    if (!result.ok) throw result.error;
    await this.save(result.board);
    return result.board;
  }
}
