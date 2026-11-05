import type { BoardCell, BoardDoc } from '../../domain/board';

export const PROFILE_ID = '0193b0c2-aaaa-7c41-9f7e-2b1d3a4c5e6f';
export const HOME_BOARD_ID = '0193b0c2-7d1e-7c41-9f7e-2b1d3a4c5e6f';
export const DRINKS_BOARD_ID = '0193b0c2-7d1e-7c41-9f7e-2b1d3a4c5e70';

export const CELL_WATER = '0193b0c3-bbbb-7c41-9f7e-2b1d3a4c5e6f';
export const CELL_LONG = '0193b0c3-bbbb-7c41-9f7e-2b1d3a4c5e70';
export const CELL_MIXED = '0193b0c3-bbbb-7c41-9f7e-2b1d3a4c5e71';
export const CELL_HIDDEN = '0193b0c3-bbbb-7c41-9f7e-2b1d3a4c5e72';
export const CELL_LINK = '0193b0c3-bbbb-7c41-9f7e-2b1d3a4c5e73';
export const CELL_FOOD = '0193b0c3-bbbb-7c41-9f7e-2b1d3a4c5e74';
export const PARKED_ID = '0193b0c3-bbbb-7c41-9f7e-2b1d3a4c5e75';
export const CELL_JUICE = '0193b0c3-bbbb-7c41-9f7e-2b1d3a4c5e76';
export const CELL_BACK = '0193b0c3-bbbb-7c41-9f7e-2b1d3a4c5e77';

const LONG_LABEL = 'أنا عايز أروح المدرسة دلوقتي عشان آكل وأشرب';
const LONG_CELL_ID = '0193b0c3-bbbb-7c41-9f7e-2b1d3a4c5e80';
const LONG_BOARD_ID = '0193b0c3-bbbb-7c41-9f7e-2b1d3a4c5e81';

const tts: BoardCell['audio'] = { kind: 'tts' };

export const homeBoard = {
  schemaVersion: 1,
  id: HOME_BOARD_ID,
  profileId: PROFILE_ID,
  title: { ar: 'أكل' },
  rows: 4,
  cols: 5,
  layoutLocked: true,
  rev: 42,
  cells: {
    [CELL_WATER]: {
      row: 0,
      col: 0,
      label: 'مية',
      vocabKey: 'water',
      spoken: null,
      symbol: { pack: 'arasaac', key: '2248' },
      audio: { kind: 'pack' },
      linkBoardId: null,
      color: 'fitz-noun',
      hidden: false,
    },
    [CELL_LONG]: {
      row: 0,
      col: 1,
      label: LONG_LABEL,
      vocabKey: null,
      spoken: null,
      symbol: null,
      audio: tts,
      linkBoardId: null,
      color: 'fitz-noun',
      hidden: false,
    },
    [CELL_MIXED]: {
      row: 0,
      col: 2,
      label: 'ماء water 5',
      vocabKey: null,
      spoken: null,
      symbol: null,
      audio: tts,
      linkBoardId: null,
      color: 'fitz-noun',
      hidden: false,
    },
    [CELL_HIDDEN]: {
      row: 1,
      col: 0,
      label: 'مخفي',
      vocabKey: null,
      spoken: null,
      symbol: null,
      audio: tts,
      linkBoardId: null,
      color: 'fitz-noun',
      hidden: true,
    },
    [CELL_LINK]: {
      row: 0,
      col: 4,
      label: 'مشروبات',
      vocabKey: null,
      spoken: null,
      symbol: null,
      audio: tts,
      linkBoardId: DRINKS_BOARD_ID,
      color: 'fitz-noun',
      hidden: false,
    },
    [CELL_FOOD]: {
      row: 2,
      col: 2,
      label: 'أكل',
      vocabKey: null,
      spoken: 'الأكل',
      symbol: null,
      audio: tts,
      linkBoardId: null,
      color: 'fitz-noun',
      hidden: false,
    },
  },
  parked: [
    {
      id: PARKED_ID,
      row: 9,
      col: 9,
      label: 'متوقف',
      vocabKey: null,
      spoken: null,
      symbol: null,
      audio: tts,
      linkBoardId: null,
      color: 'fitz-noun',
      hidden: false,
    },
  ],
} satisfies BoardDoc;

export const drinksBoard = {
  schemaVersion: 1,
  id: DRINKS_BOARD_ID,
  profileId: PROFILE_ID,
  title: { ar: 'مشروبات' },
  rows: 2,
  cols: 2,
  layoutLocked: true,
  rev: 1,
  cells: {
    [CELL_JUICE]: {
      row: 0,
      col: 0,
      label: 'عصير',
      vocabKey: null,
      spoken: null,
      symbol: null,
      audio: tts,
      linkBoardId: null,
      color: 'fitz-noun',
      hidden: false,
    },
    [CELL_BACK]: {
      row: 0,
      col: 1,
      label: 'أكل',
      vocabKey: null,
      spoken: null,
      symbol: null,
      audio: tts,
      linkBoardId: HOME_BOARD_ID,
      color: 'fitz-noun',
      hidden: false,
    },
  },
  parked: [],
} satisfies BoardDoc;

const boards: Record<string, BoardDoc> = {
  [HOME_BOARD_ID]: homeBoard,
  [DRINKS_BOARD_ID]: drinksBoard,
};

/** Stable demo catalog. Every call returns this same record and the same docs. */
export function demoBoards(): Record<string, BoardDoc> {
  return boards;
}

/** One-cell board used to check a long Arabic label at a given column count. */
export function longLabelBoard(cols: number): BoardDoc {
  const cell: BoardCell = {
    row: 0,
    col: 0,
    label: LONG_LABEL,
    vocabKey: null,
    spoken: null,
    symbol: null,
    audio: tts,
    linkBoardId: null,
    color: 'fitz-noun',
    hidden: false,
  };
  return {
    schemaVersion: 1,
    id: LONG_BOARD_ID,
    profileId: PROFILE_ID,
    title: { ar: 'تجربة' },
    rows: 2,
    cols,
    layoutLocked: true,
    rev: 1,
    cells: { [LONG_CELL_ID]: cell },
    parked: [],
  };
}
