// Public API of the board domain module (plan v1.1 §2.6, §5.2). Pure TS only:
// no @angular/*, dexie or @capacitor/* imports.

export type {
  AudioSource,
  BoardCell,
  BoardDoc,
  BoardOp,
  BoardOpErrorCode,
  BackupImportOp,
  CellInput,
  HideOp,
  LocalizedText,
  MoveOp,
  NonMoveOp,
  PackPatch,
  PackUpdateOp,
  ParkedCell,
  ResizeOp,
  SymbolRef,
  UnhideOp,
  UpsertOp,
  ApplyResult,
} from './board.types';

export { BoardOpError, MAX_GRID_SIZE, MIN_GRID_SIZE } from './board.types';

export {
  applyOp,
  applyOpResult,
  createBoard,
  getCell,
  inBounds,
  isParked,
  occupantAt,
} from './board';

export type { CreateBoardInput } from './board';
