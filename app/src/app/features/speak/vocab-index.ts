import type { BoardCell, BoardDoc } from '../../domain/board';
import type { ProfileGender } from '../../core/settings/setting-keys';
import { PROFILE_ID } from './demo-boards';

/** One gendered pair. `m` and `f` may match when the word does not agree. */
export interface VocabForms {
  m: string;
  f: string;
}

/** One core-vocab entry. Mirrors `content/schemas/vocab.schema.json`. */
export interface VocabItem {
  vocabKey: string;
  category: string;
  color: string;
  gloss_en: string;
  agreement: boolean;
  display: VocabForms;
  speak: VocabForms;
  board: string;
  row: number;
  col: number;
  reviewStatus: string;
}

/** The committed vocabulary document (`ar-EG`, `reviewStatus: ai-draft`). */
export interface VocabFile {
  schemaVersion: number;
  dialect: string;
  reviewStatus: string;
  items: readonly VocabItem[];
}

export type VocabIndex = ReadonlyMap<string, VocabItem>;

export const LOADING_BOARD_ID = 'loading';

const TTS: BoardCell['audio'] = { kind: 'tts' };

interface BoardMeta {
  rows: number;
  cols: number;
  title: string;
}

/** Grid sizes from the P1.3 layout. The last cell of every board except `home` is a back link. */
const BOARD_META: Record<string, BoardMeta> = {
  home: { rows: 8, cols: 6, title: 'الرئيسية' },
  food: { rows: 4, cols: 5, title: 'أكل' },
  drinks: { rows: 3, cols: 4, title: 'مشروبات' },
  people: { rows: 4, cols: 5, title: 'ناس' },
  family: { rows: 3, cols: 4, title: 'العيلة' },
  body: { rows: 4, cols: 5, title: 'الجسم' },
  feelings: { rows: 4, cols: 4, title: 'الإحساس' },
  actions: { rows: 6, cols: 6, title: 'أفعال' },
  describe: { rows: 6, cols: 5, title: 'وصف' },
  places: { rows: 4, cols: 4, title: 'أماكن' },
  school: { rows: 4, cols: 4, title: 'المدرسة' },
  objects: { rows: 5, cols: 5, title: 'حاجات' },
  clothes: { rows: 4, cols: 4, title: 'هدوم' },
  animals: { rows: 4, cols: 4, title: 'حيوانات' },
  questions: { rows: 3, cols: 4, title: 'أسئلة' },
  social: { rows: 4, cols: 4, title: 'كلام' },
  time: { rows: 4, cols: 4, title: 'الوقت' },
  routines: { rows: 4, cols: 5, title: 'يومي' },
  health: { rows: 3, cols: 4, title: 'الصحة' },
  outside: { rows: 4, cols: 4, title: 'بره' },
  kitchen: { rows: 4, cols: 4, title: 'المطبخ' },
  play: { rows: 4, cols: 4, title: 'لعب' },
  quick: { rows: 4, cols: 5, title: 'جمل سريعة' },
};

/** Category links on `home` rows 4–7. Row 7 keeps col 4 and col 5 empty. */
const HOME_LINKS: readonly string[] = [
  'food',
  'drinks',
  'people',
  'family',
  'body',
  'feelings',
  'actions',
  'describe',
  'places',
  'school',
  'objects',
  'clothes',
  'animals',
  'questions',
  'social',
  'time',
  'routines',
  'health',
  'outside',
  'kitchen',
  'play',
  'quick',
];

export const loadingBoard: BoardDoc = {
  schemaVersion: 1,
  id: LOADING_BOARD_ID,
  profileId: PROFILE_ID,
  title: { ar: 'صوتي' },
  rows: 1,
  cols: 1,
  layoutLocked: true,
  cells: {},
  parked: [],
  rev: 0,
};

export function vocabIndex(file: VocabFile): VocabIndex {
  return new Map(file.items.map((item) => [item.vocabKey, item]));
}

/**
 * Fills empty labels from the active profile gender.
 * A cell that already has a label (the P1.7 fixture) is left as stored.
 */
export function applyGender(board: BoardDoc, index: VocabIndex, gender: ProfileGender): BoardDoc {
  let changed = false;
  const cells: Record<string, BoardCell> = {};
  for (const [id, cell] of Object.entries(board.cells)) {
    const next = resolveCell(cell, index, gender);
    if (next !== cell) changed = true;
    cells[id] = next;
  }
  return changed ? { ...board, cells } : board;
}

export function buildCoreBoards(file: VocabFile): Record<string, BoardDoc> {
  const boards: Record<string, BoardDoc> = {};
  for (const [id, meta] of Object.entries(BOARD_META)) {
    boards[id] = emptyBoard(id, meta);
  }
  for (const item of file.items) {
    const board = boards[item.board];
    if (!board) continue;
    board.cells[`vk-${item.vocabKey}`] = wordCell(item);
  }
  addHomeLinks(boards);
  for (const board of Object.values(boards)) {
    if (board.id === 'home') continue;
    addBackLink(board);
  }
  return boards;
}

function resolveCell(cell: BoardCell, index: VocabIndex, gender: ProfileGender): BoardCell {
  if (cell.label.trim() !== '' || cell.vocabKey === null) return cell;
  const item = index.get(cell.vocabKey);
  if (!item) return cell;
  return {
    ...cell,
    label: item.display[gender],
    spoken: item.speak[gender],
  };
}

function emptyBoard(id: string, meta: BoardMeta): BoardDoc {
  return {
    schemaVersion: 1,
    id,
    profileId: PROFILE_ID,
    title: { ar: meta.title },
    rows: meta.rows,
    cols: meta.cols,
    layoutLocked: true,
    cells: {},
    parked: [],
    rev: 1,
  };
}

function wordCell(item: VocabItem): BoardCell {
  return {
    row: item.row,
    col: item.col,
    label: '',
    vocabKey: item.vocabKey,
    spoken: null,
    symbol: item.vocabKey === 'water' ? { pack: 'arasaac', key: '2248' } : null,
    audio: TTS,
    linkBoardId: null,
    color: item.color,
    hidden: false,
  };
}

function addHomeLinks(boards: Record<string, BoardDoc>): void {
  const home = boards['home'];
  if (!home) return;
  HOME_LINKS.forEach((target, index) => {
    const meta = BOARD_META[target];
    if (!meta) return;
    home.cells[`link-home-${target}`] = {
      row: 4 + Math.floor(index / 6),
      col: index % 6,
      label: meta.title,
      vocabKey: null,
      spoken: null,
      symbol: null,
      audio: TTS,
      linkBoardId: target,
      color: 'fitz-function',
      hidden: false,
    };
  });
}

function addBackLink(board: BoardDoc): void {
  board.cells[`link-${board.id}-home`] = {
    row: board.rows - 1,
    col: board.cols - 1,
    label: 'الرئيسية',
    vocabKey: null,
    spoken: null,
    symbol: null,
    audio: TTS,
    linkBoardId: 'home',
    color: 'fitz-function',
    hidden: false,
  };
}
