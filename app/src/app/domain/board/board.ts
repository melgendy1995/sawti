// Sawti board domain logic (plan v1.1 §2.6, §5.2 INV-1). Pure, immutable:
// every mutating op returns a new BoardDoc and never mutates its input. Unknown
// keys at the board and cell level are copied through untouched.

import {
  ApplyResult,
  BackupImportOp,
  BoardCell,
  BoardDoc,
  BoardOp,
  BoardOpError,
  CellInput,
  HideOp,
  MAX_GRID_SIZE,
  MIN_GRID_SIZE,
  MoveOp,
  PackUpdateOp,
  ParkedCell,
  ResizeOp,
  UnhideOp,
  UpsertOp,
} from './board.types';

/** Default content for a freshly created cell. Callers override via CellInput. */
const DEFAULT_CELL: Omit<BoardCell, 'row' | 'col'> = {
  label: '',
  vocabKey: null,
  spoken: null,
  symbol: null,
  audio: { kind: 'pack' },
  linkBoardId: null,
  color: '',
  hidden: false,
};

function isValidGridSize(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_GRID_SIZE && n <= MAX_GRID_SIZE;
}

/** True when `row`/`col` fall inside a `rows`×`cols` grid. */
export function inBounds(rows: number, cols: number, row: number, col: number): boolean {
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < rows && col >= 0 && col < cols;
}

/** The id of the cell occupying a slot, or null. Parked cells hold no slot. */
export function occupantAt(board: BoardDoc, row: number, col: number): string | null {
  for (const [id, cell] of Object.entries(board.cells)) {
    if (cell.row === row && cell.col === col) return id;
  }
  return null;
}

/** A grid (non-parked) cell by id, or undefined. */
export function getCell(board: BoardDoc, id: string): BoardCell | undefined {
  return board.cells[id];
}

/** True when `id` names a parked cell on this board. */
export function isParked(board: BoardDoc, id: string): boolean {
  return board.parked.some((p) => p.id === id);
}

/** Input to createBoard. Everything but the ids and title has a default. */
export interface CreateBoardInput {
  id: string;
  profileId: string;
  title: LocalizedTextLike;
  rows: number;
  cols: number;
  schemaVersion?: number;
  layoutLocked?: boolean;
  cells?: Record<string, BoardCell>;
  parked?: ParkedCell[];
  rev?: number;
  [extra: string]: unknown;
}

type LocalizedTextLike = Record<string, string>;

/** Build a valid, empty-by-default board. Throws BoardOpError('invalid-grid-size')
 *  for a grid outside [1, 12]. Unknown keys on `input` are preserved. */
export function createBoard(input: CreateBoardInput): BoardDoc {
  if (!isValidGridSize(input.rows) || !isValidGridSize(input.cols)) {
    throw new BoardOpError(
      'invalid-grid-size',
      `grid must be ${MIN_GRID_SIZE}..${MAX_GRID_SIZE} per edge, got ${input.rows}x${input.cols}`,
    );
  }
  const {
    id,
    profileId,
    title,
    rows,
    cols,
    schemaVersion,
    layoutLocked,
    cells,
    parked,
    rev,
    ...unknown
  } = input;
  return {
    ...unknown,
    schemaVersion: schemaVersion ?? 1,
    id,
    profileId,
    title,
    rows,
    cols,
    layoutLocked: layoutLocked ?? true,
    cells: cells ?? {},
    parked: parked ?? [],
    rev: rev ?? 0,
  };
}

/** Merge CellInput content onto a base cell, keeping the base `row`/`col`
 *  (position is never changed by a merge) and carrying unknown keys through. */
function mergeCellContent<T extends BoardCell>(base: T, input: CellInput): T {
  // Spread input then re-assert the base position: any row/col in `input` is
  // overwritten, so a merge can never move the cell.
  return { ...base, ...input, row: base.row, col: base.col } as T;
}

function bump(board: BoardDoc): BoardDoc {
  return { ...board, rev: board.rev + 1 };
}

function ok(board: BoardDoc): ApplyResult {
  return { ok: true, board };
}

function refuse(error: BoardOpError): ApplyResult {
  return { ok: false, error };
}

function applyUpsert(board: BoardDoc, op: UpsertOp): ApplyResult {
  const existing = board.cells[op.id];
  if (existing) {
    // Update in place: position is untouched, unknown keys preserved.
    const next = mergeCellContent(existing, op.cell);
    return ok(bump({ ...board, cells: { ...board.cells, [op.id]: next } }));
  }
  const parkedIdx = board.parked.findIndex((p) => p.id === op.id);
  if (parkedIdx >= 0) {
    // A parked cell keeps its slot-less state; upsert only edits content.
    const current = board.parked[parkedIdx];
    const next = mergeCellContent(current, op.cell);
    const parked = board.parked.slice();
    parked[parkedIdx] = next;
    return ok(bump({ ...board, parked }));
  }
  // New cell: needs an explicit, in-bounds, empty slot.
  const { row, col } = op.cell;
  if (row === undefined || col === undefined) {
    return refuse(new BoardOpError('missing-position', `new cell ${op.id} needs row and col`));
  }
  if (!inBounds(board.rows, board.cols, row, col)) {
    return refuse(new BoardOpError('out-of-bounds', `slot ${row},${col} is outside the grid`));
  }
  if (occupantAt(board, row, col) !== null) {
    return refuse(new BoardOpError('occupied-slot', `slot ${row},${col} is already occupied`));
  }
  const created = mergeCellContent({ ...DEFAULT_CELL, row, col } as BoardCell, op.cell);
  return ok(bump({ ...board, cells: { ...board.cells, [op.id]: created } }));
}

function applyHidden(board: BoardDoc, id: string, hidden: boolean): ApplyResult {
  const existing = board.cells[id];
  if (existing) {
    const next: BoardCell = { ...existing, hidden };
    return ok(bump({ ...board, cells: { ...board.cells, [id]: next } }));
  }
  const parkedIdx = board.parked.findIndex((p) => p.id === id);
  if (parkedIdx >= 0) {
    const parked = board.parked.slice();
    parked[parkedIdx] = { ...parked[parkedIdx], hidden };
    return ok(bump({ ...board, parked }));
  }
  return refuse(new BoardOpError('unknown-cell', `no cell ${id} to hide/unhide`));
}

function applyResize(board: BoardDoc, op: ResizeOp): ApplyResult {
  if (!isValidGridSize(op.rows) || !isValidGridSize(op.cols)) {
    return refuse(
      new BoardOpError(
        'invalid-grid-size',
        `grid must be ${MIN_GRID_SIZE}..${MAX_GRID_SIZE} per edge, got ${op.rows}x${op.cols}`,
      ),
    );
  }
  const cells: Record<string, BoardCell> = {};
  const newlyParked: ParkedCell[] = [];
  for (const [id, cell] of Object.entries(board.cells)) {
    if (inBounds(op.rows, op.cols, cell.row, cell.col)) {
      cells[id] = cell;
    } else {
      // No cell is deleted: it keeps its id and last row/col in `parked`.
      newlyParked.push({ ...cell, id });
    }
  }
  return ok(
    bump({
      ...board,
      rows: op.rows,
      cols: op.cols,
      cells,
      parked: [...board.parked, ...newlyParked],
    }),
  );
}

function applyMove(board: BoardDoc, op: MoveOp): ApplyResult {
  if (!inBounds(board.rows, board.cols, op.toRow, op.toCol)) {
    return refuse(new BoardOpError('out-of-bounds', `slot ${op.toRow},${op.toCol} is outside the grid`));
  }
  const occupant = occupantAt(board, op.toRow, op.toCol);
  if (occupant !== null && occupant !== op.id) {
    return refuse(new BoardOpError('occupied-slot', `slot ${op.toRow},${op.toCol} is already occupied`));
  }
  const gridCell = board.cells[op.id];
  if (gridCell) {
    const next: BoardCell = { ...gridCell, row: op.toRow, col: op.toCol };
    return ok(bump({ ...board, cells: { ...board.cells, [op.id]: next } }));
  }
  const parkedIdx = board.parked.findIndex((p) => p.id === op.id);
  if (parkedIdx >= 0) {
    // Move a parked cell back onto an empty slot: id leaves `parked`, re-enters
    // `cells`. This is an explicit move, not an auto-restore. Drop the `id` key
    // (cells are keyed by id) while carrying any unknown fields through.
    const content: Record<string, unknown> = { ...board.parked[parkedIdx] };
    delete content['id'];
    const parked = board.parked.slice();
    parked.splice(parkedIdx, 1);
    const next = { ...content, row: op.toRow, col: op.toCol } as unknown as BoardCell;
    return ok(bump({ ...board, cells: { ...board.cells, [op.id]: next }, parked }));
  }
  return refuse(new BoardOpError('unknown-cell', `no cell ${op.id} to move`));
}

function applyPackUpdate(board: BoardDoc, op: PackUpdateOp): ApplyResult {
  const existing = board.cells[op.id];
  if (existing) {
    const next = { ...existing, ...op.patch, row: existing.row, col: existing.col } as BoardCell;
    return ok(bump({ ...board, cells: { ...board.cells, [op.id]: next } }));
  }
  const parkedIdx = board.parked.findIndex((p) => p.id === op.id);
  if (parkedIdx >= 0) {
    const current = board.parked[parkedIdx];
    const next = {
      ...current,
      ...op.patch,
      id: current.id,
      row: current.row,
      col: current.col,
    } as ParkedCell;
    const parked = board.parked.slice();
    parked[parkedIdx] = next;
    return ok(bump({ ...board, parked }));
  }
  return refuse(new BoardOpError('unknown-cell', `no cell ${op.id} to packUpdate`));
}

function applyBackupImport(board: BoardDoc, op: BackupImportOp): ApplyResult {
  let cells = board.cells;
  let parked = board.parked;
  let changed = false;
  for (const [id, input] of Object.entries(op.cells)) {
    const existing = cells[id];
    if (existing) {
      // Merge content; position of an existing non-parked cell is held.
      cells = { ...cells, [id]: mergeCellContent(existing, input) };
      changed = true;
      continue;
    }
    const parkedIdx = parked.findIndex((p) => p.id === id);
    if (parkedIdx >= 0) {
      const next = mergeCellContent(parked[parkedIdx], input);
      parked = parked.slice();
      parked[parkedIdx] = next;
      changed = true;
      continue;
    }
    // New id: an empty in-grid slot if one is named and free, else parked.
    const { row, col } = input;
    const base = { ...DEFAULT_CELL, row: row ?? 0, col: col ?? 0 } as BoardCell;
    const content = mergeCellContent(base, { ...input, row: base.row, col: base.col });
    const placeable =
      row !== undefined &&
      col !== undefined &&
      inBounds(board.rows, board.cols, row, col) &&
      occupantForMap(cells, row, col) === null;
    if (placeable) {
      cells = { ...cells, [id]: content };
    } else {
      parked = [...parked, { ...content, id }];
    }
    changed = true;
  }
  if (!changed) return ok(board);
  return ok(bump({ ...board, cells, parked }));
}

function occupantForMap(cells: Record<string, BoardCell>, row: number, col: number): string | null {
  for (const [id, cell] of Object.entries(cells)) {
    if (cell.row === row && cell.col === col) return id;
  }
  return null;
}

/** Apply one op, returning either the next board or a typed refusal. Pure. */
export function applyOpResult(board: BoardDoc, op: BoardOp): ApplyResult {
  switch (op.type) {
    case 'upsert':
      return applyUpsert(board, op);
    case 'hide':
      return applyHidden(board, (op as HideOp).id, true);
    case 'unhide':
      return applyHidden(board, (op as UnhideOp).id, false);
    case 'resize':
      return applyResize(board, op);
    case 'move':
      return applyMove(board, op);
    case 'packUpdate':
      return applyPackUpdate(board, op);
    case 'backupImport':
      return applyBackupImport(board, op);
  }
}

/** Total reducer form: a refused op leaves the board unchanged (INV-1 property
 *  tests fold with this). Use `applyOpResult` when you need the typed error. */
export function applyOp(board: BoardDoc, op: BoardOp): BoardDoc {
  const result = applyOpResult(board, op);
  return result.ok ? result.board : board;
}
