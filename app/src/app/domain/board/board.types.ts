// Sawti board domain types (plan v1.1 §2.6, §5.2). Pure TS: no @angular/*, dexie
// or @capacitor/* imports. The JSON source of truth is
// content/schemas/board.schema.json; these types mirror it with per-cell `rev`
// removed (errata/v1.1 — the board-level `rev` is the only concurrency token).

/** Smallest and largest grid edge a board may have. A resize outside this is
 *  refused. 12 covers every grid size in the plan's layouts with headroom. */
export const MIN_GRID_SIZE = 1;
export const MAX_GRID_SIZE = 12;

/** Localized strings keyed by BCP-47-ish language tag (e.g. `ar`, `en`).
 *  Unknown locales are preserved; domain code never reads a specific one. */
export type LocalizedText = Record<string, string>;

/** A symbol reference into a pack (e.g. ARASAAC). `key` is the pack-local id. */
export interface SymbolRef {
  pack: string;
  key: string;
}

/** Where a cell's audio comes from. `media` carries the content hash of a blob
 *  stored by the media layer (P1.2); `pack` and `tts` resolve later. */
export type AudioSource =
  | { kind: 'pack' }
  | { kind: 'media'; sha256: string }
  | { kind: 'tts' };

/** One speakable cell. Keeps its slot even when hidden. `row`/`col` are grid
 *  indices only — the RTL visual flip happens at render time, not here. */
export interface BoardCell {
  row: number;
  col: number;
  label: string;
  /** Resolved later through the dialect pack; domain only stores it. */
  vocabKey: string | null;
  /** Overrides spoken text when set. */
  spoken: string | null;
  symbol: SymbolRef | null;
  audio: AudioSource;
  linkBoardId: string | null;
  color: string;
  hidden: boolean;
}

/** A cell that fell outside the grid after a resize. It keeps its id and its
 *  last `row`/`col` so a caregiver can place it again. Parked is never
 *  deletion: no id disappears, and growing the grid back does not auto-restore. */
export interface ParkedCell extends BoardCell {
  id: string;
}

/** The board document. Unknown keys at this level are preserved by every domain
 *  function; this type only names the fields domain logic understands. */
export interface BoardDoc {
  schemaVersion: number;
  id: string;
  profileId: string;
  title: LocalizedText;
  rows: number;
  cols: number;
  layoutLocked: boolean;
  cells: Record<string, BoardCell>;
  parked: ParkedCell[];
  rev: number;
}

/** Cell content supplied to an op. Known fields are optional; unknown fields are
 *  carried through unchanged. `row`/`col` only ever place a *new* cell. */
export interface CellInput {
  row?: number;
  col?: number;
  label?: string;
  vocabKey?: string | null;
  spoken?: string | null;
  symbol?: SymbolRef | null;
  audio?: AudioSource;
  linkBoardId?: string | null;
  color?: string;
  hidden?: boolean;
  [extra: string]: unknown;
}

/** Pack-facing fields a `packUpdate` may change. Never touches `row`/`col`. */
export interface PackPatch {
  symbol?: SymbolRef | null;
  audio?: AudioSource;
  vocabKey?: string | null;
  color?: string;
  [extra: string]: unknown;
}

// --- Operations (discriminated union on `type`). Only `move` may change a
//     position, and only for the cell it names. `swap` arrives with B-18 under
//     the same rule and is deliberately NOT implemented here.

/** Add a new cell, or update fields of an existing one. Never changes the
 *  `row`/`col` of an existing (grid or parked) cell. Placing a new cell needs an
 *  empty in-grid slot; an occupied or out-of-bounds slot is refused. */
export interface UpsertOp {
  type: 'upsert';
  id: string;
  cell: CellInput;
}

/** Mark a cell hidden. The slot stays reserved. */
export interface HideOp {
  type: 'hide';
  id: string;
}

/** Clear a cell's hidden flag. */
export interface UnhideOp {
  type: 'unhide';
  id: string;
}

/** Change the grid size. Cells outside the new bounds move to `parked`; no cell
 *  is deleted and growing back does not auto-unpark. */
export interface ResizeOp {
  type: 'resize';
  rows: number;
  cols: number;
}

/** Move the named cell to an empty in-grid slot. The only v1.0 op that changes a
 *  position. A parked cell may be moved back this way (not an auto-restore). */
export interface MoveOp {
  type: 'move';
  id: string;
  toRow: number;
  toCol: number;
}

/** Update pack-facing fields of a cell without changing its position. */
export interface PackUpdateOp {
  type: 'packUpdate';
  id: string;
  patch: PackPatch;
}

/** Merge/restore cell content and unknown fields by id without moving existing
 *  non-parked cells. New ids go to an empty slot, else to `parked`. This is the
 *  domain op behind a backup restore; zip parsing is P1.11, not here. */
export interface BackupImportOp {
  type: 'backupImport';
  cells: Record<string, CellInput>;
}

export type BoardOp =
  | UpsertOp
  | HideOp
  | UnhideOp
  | ResizeOp
  | MoveOp
  | PackUpdateOp
  | BackupImportOp;

/** Every op except `move` — the ops that must never change a position. */
export type NonMoveOp = Exclude<BoardOp, MoveOp>;

export type BoardOpErrorCode =
  | 'invalid-grid-size'
  | 'occupied-slot'
  | 'out-of-bounds'
  | 'missing-position'
  | 'unknown-cell';

/** Typed refusal from a board op. `applyOpResult` returns it; the total
 *  `applyOp` swallows it and returns the board unchanged. */
export class BoardOpError extends Error {
  readonly code: BoardOpErrorCode;
  constructor(code: BoardOpErrorCode, message: string) {
    super(message);
    this.name = 'BoardOpError';
    this.code = code;
  }
}

/** Result of applying one op: either the next board, or a typed refusal. */
export type ApplyResult = { ok: true; board: BoardDoc } | { ok: false; error: BoardOpError };
