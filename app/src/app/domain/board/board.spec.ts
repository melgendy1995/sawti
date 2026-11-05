// INV-1 guards as explicit unit tests (plan v1.1 §5.2). The property test in
// board.property.spec.ts folds random op sequences; these pin the named edge
// cases so a regression says which rule broke.

import {
  applyOp,
  applyOpResult,
  createBoard,
  getCell,
  inBounds,
  isParked,
  occupantAt,
} from './board';
import { BoardCell, BoardDoc, BoardOp } from './board.types';

const PROFILE = '0193b0c2-aaaa-7c41-9f7e-2b1d3a4c5e6f';

function cell(row: number, col: number, over: Partial<BoardCell> = {}): BoardCell {
  return {
    row,
    col,
    label: `c${row}${col}`,
    vocabKey: null,
    spoken: null,
    symbol: null,
    audio: { kind: 'pack' },
    linkBoardId: null,
    color: '',
    hidden: false,
    ...over,
  };
}

function sampleBoard(): BoardDoc {
  return createBoard({
    id: 'b1',
    profileId: PROFILE,
    title: { ar: 'أكل', en: 'Food' },
    rows: 3,
    cols: 3,
    cells: {
      a: cell(0, 0, { label: 'مية' }),
      b: cell(1, 1),
      c: cell(2, 2, { hidden: true }),
    },
  });
}

describe('createBoard', () => {
  it('fills defaults and sets schemaVersion 1', () => {
    const b = createBoard({ id: 'b', profileId: PROFILE, title: { ar: 'س' }, rows: 2, cols: 2 });
    expect(b.schemaVersion).toBe(1);
    expect(b.layoutLocked).toBe(true);
    expect(b.cells).toEqual({});
    expect(b.parked).toEqual([]);
    expect(b.rev).toBe(0);
  });

  it('refuses a grid outside 1..12', () => {
    expect(() => createBoard({ id: 'b', profileId: PROFILE, title: { ar: 's' }, rows: 0, cols: 2 })).toThrow(
      /grid must be/,
    );
    expect(() => createBoard({ id: 'b', profileId: PROFILE, title: { ar: 's' }, rows: 2, cols: 13 })).toThrow(
      /grid must be/,
    );
  });

  it('preserves unknown board keys', () => {
    const b = createBoard({
      id: 'b',
      profileId: PROFILE,
      title: { ar: 's' },
      rows: 2,
      cols: 2,
      futureThing: { nested: true },
    });
    expect((b as unknown as Record<string, unknown>)['futureThing']).toEqual({ nested: true });
  });
});

describe('helpers', () => {
  it('getCell / isParked / occupantAt', () => {
    const b = sampleBoard();
    expect(getCell(b, 'a')?.label).toBe('مية');
    expect(getCell(b, 'missing')).toBeUndefined();
    expect(occupantAt(b, 1, 1)).toBe('b');
    expect(occupantAt(b, 0, 2)).toBeNull();
    expect(isParked(b, 'a')).toBe(false);
  });

  it('inBounds rejects negatives and overflow', () => {
    expect(inBounds(3, 3, 0, 0)).toBe(true);
    expect(inBounds(3, 3, 2, 2)).toBe(true);
    expect(inBounds(3, 3, 3, 0)).toBe(false);
    expect(inBounds(3, 3, -1, 0)).toBe(false);
  });
});

describe('INV-1: a position only changes when move names the cell', () => {
  it('upsert never changes an existing cell position', () => {
    const b = sampleBoard();
    const after = applyOp(b, { type: 'upsert', id: 'a', cell: { row: 2, col: 2, label: 'new' } });
    expect([after.cells['a'].row, after.cells['a'].col]).toEqual([0, 0]);
    expect(after.cells['a'].label).toBe('new');
    expect(after.rev).toBe(b.rev + 1);
  });

  it('upsert of a new cell needs an empty in-grid slot', () => {
    const b = sampleBoard();
    const okRes = applyOpResult(b, { type: 'upsert', id: 'd', cell: { row: 0, col: 1, label: 'd' } });
    expect(okRes.ok).toBe(true);

    const occupied = applyOpResult(b, { type: 'upsert', id: 'e', cell: { row: 0, col: 0 } });
    expect(occupied.ok).toBe(false);
    if (!occupied.ok) expect(occupied.error.code).toBe('occupied-slot');

    const oob = applyOpResult(b, { type: 'upsert', id: 'f', cell: { row: 9, col: 9 } });
    expect(oob.ok).toBe(false);
    if (!oob.ok) expect(oob.error.code).toBe('out-of-bounds');

    const noPos = applyOpResult(b, { type: 'upsert', id: 'g', cell: { label: 'g' } });
    expect(noPos.ok).toBe(false);
    if (!noPos.ok) expect(noPos.error.code).toBe('missing-position');
  });

  it('hide / unhide keep the slot', () => {
    const b = sampleBoard();
    const hidden = applyOp(b, { type: 'hide', id: 'a' });
    expect(hidden.cells['a'].hidden).toBe(true);
    expect([hidden.cells['a'].row, hidden.cells['a'].col]).toEqual([0, 0]);
    const shown = applyOp(hidden, { type: 'unhide', id: 'a' });
    expect(shown.cells['a'].hidden).toBe(false);
    expect([shown.cells['a'].row, shown.cells['a'].col]).toEqual([0, 0]);
  });

  it('hide refuses an unknown cell', () => {
    const res = applyOpResult(sampleBoard(), { type: 'hide', id: 'zzz' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('unknown-cell');
  });

  it('packUpdate changes pack fields but not position', () => {
    const b = sampleBoard();
    const after = applyOp(b, {
      type: 'packUpdate',
      id: 'b',
      patch: { symbol: { pack: 'arasaac', key: '1' }, color: 'fitz-verb' },
    });
    expect(after.cells['b'].symbol).toEqual({ pack: 'arasaac', key: '1' });
    expect(after.cells['b'].color).toBe('fitz-verb');
    expect([after.cells['b'].row, after.cells['b'].col]).toEqual([1, 1]);
  });
});

describe('INV-1: resize parks, never deletes', () => {
  it('moves out-of-bounds cells to parked, keeping every id', () => {
    const b = sampleBoard();
    const shrunk = applyOp(b, { type: 'resize', rows: 2, cols: 2 });
    expect(shrunk.rows).toBe(2);
    expect(Object.keys(shrunk.cells).sort()).toEqual(['a', 'b']);
    expect(shrunk.parked.map((p) => p.id)).toEqual(['c']);
    // parked cell kept its last row/col and content
    const parkedC = shrunk.parked[0];
    expect([parkedC.row, parkedC.col]).toEqual([2, 2]);
    expect(parkedC.hidden).toBe(true);
    // id set is conserved
    const idsAfter = [...Object.keys(shrunk.cells), ...shrunk.parked.map((p) => p.id)].sort();
    expect(idsAfter).toEqual(['a', 'b', 'c']);
  });

  it('growing back does not auto-unpark', () => {
    const b = sampleBoard();
    const shrunk = applyOp(b, { type: 'resize', rows: 2, cols: 2 });
    const grown = applyOp(shrunk, { type: 'resize', rows: 3, cols: 3 });
    expect(grown.parked.map((p) => p.id)).toEqual(['c']);
    expect(getCell(grown, 'c')).toBeUndefined();
    expect(isParked(grown, 'c')).toBe(true);
  });

  it('refuses an invalid resize and leaves the board unchanged', () => {
    const b = sampleBoard();
    const res = applyOpResult(b, { type: 'resize', rows: 0, cols: 3 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('invalid-grid-size');
    expect(applyOp(b, { type: 'resize', rows: 0, cols: 3 })).toEqual(b);
  });
});

describe('move: the only position-changing op', () => {
  it('moves the named cell to an empty slot', () => {
    const b = sampleBoard();
    const after = applyOp(b, { type: 'move', id: 'a', toRow: 0, toCol: 1 });
    expect([after.cells['a'].row, after.cells['a'].col]).toEqual([0, 1]);
    // others held
    expect([after.cells['b'].row, after.cells['b'].col]).toEqual([1, 1]);
  });

  it('refuses a move onto an occupied slot; source stays put', () => {
    const b = sampleBoard();
    const res = applyOpResult(b, { type: 'move', id: 'a', toRow: 1, toCol: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('occupied-slot');
    const unchanged = applyOp(b, { type: 'move', id: 'a', toRow: 1, toCol: 1 });
    expect([unchanged.cells['a'].row, unchanged.cells['a'].col]).toEqual([0, 0]);
  });

  it('refuses an out-of-bounds move', () => {
    const res = applyOpResult(sampleBoard(), { type: 'move', id: 'a', toRow: 9, toCol: 0 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('out-of-bounds');
  });

  it('allows moving a cell onto its own current slot', () => {
    const b = sampleBoard();
    const after = applyOp(b, { type: 'move', id: 'b', toRow: 1, toCol: 1 });
    expect([after.cells['b'].row, after.cells['b'].col]).toEqual([1, 1]);
  });

  it('moves a parked cell back onto an empty slot (not auto-restore)', () => {
    const b = sampleBoard();
    const shrunk = applyOp(b, { type: 'resize', rows: 2, cols: 2 });
    expect(isParked(shrunk, 'c')).toBe(true);
    const restored = applyOp(shrunk, { type: 'move', id: 'c', toRow: 0, toCol: 1 });
    expect(isParked(restored, 'c')).toBe(false);
    expect([restored.cells['c'].row, restored.cells['c'].col]).toEqual([0, 1]);
    expect(restored.cells['c'].hidden).toBe(true);
  });

  it('refuses a move of an unknown cell', () => {
    const res = applyOpResult(sampleBoard(), { type: 'move', id: 'zzz', toRow: 0, toCol: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('unknown-cell');
  });
});

describe('backupImport: merge content by id, never move existing cells', () => {
  it('merges existing cell content without changing its position', () => {
    const b = sampleBoard();
    const after = applyOp(b, {
      type: 'backupImport',
      cells: { a: { label: 'restored', row: 2, col: 2 } },
    });
    expect(after.cells['a'].label).toBe('restored');
    expect([after.cells['a'].row, after.cells['a'].col]).toEqual([0, 0]);
  });

  it('places a new id in an empty slot, else parks it', () => {
    const b = sampleBoard();
    const after = applyOp(b, {
      type: 'backupImport',
      cells: {
        d: { row: 0, col: 1, label: 'd' },
        e: { row: 0, col: 0, label: 'collides-with-a' },
      },
    });
    expect([after.cells['d'].row, after.cells['d'].col]).toEqual([0, 1]);
    expect(isParked(after, 'e')).toBe(true);
  });

  it('is a no-op (no rev bump) when given no cells', () => {
    const b = sampleBoard();
    const after = applyOp(b, { type: 'backupImport', cells: {} });
    expect(after.rev).toBe(b.rev);
  });

  it('merges into a parked cell by id', () => {
    const b = sampleBoard();
    const shrunk = applyOp(b, { type: 'resize', rows: 2, cols: 2 });
    const after = applyOp(shrunk, { type: 'backupImport', cells: { c: { label: 'edited' } } });
    const parkedC = after.parked.find((p) => p.id === 'c');
    expect(parkedC?.label).toBe('edited');
    expect([parkedC?.row, parkedC?.col]).toEqual([2, 2]);
  });
});

describe('unknown fields survive every op', () => {
  function boardWithUnknowns(): BoardDoc {
    const b = sampleBoard() as unknown as Record<string, unknown>;
    b['boardExtra'] = 'keep-me';
    (b['cells'] as Record<string, Record<string, unknown>>)['a']['cellExtra'] = 42;
    return b as unknown as BoardDoc;
  }

  const ops: { name: string; op: BoardOp }[] = [
    { name: 'upsert', op: { type: 'upsert', id: 'a', cell: { label: 'x' } } },
    { name: 'hide', op: { type: 'hide', id: 'a' } },
    { name: 'unhide', op: { type: 'unhide', id: 'a' } },
    { name: 'resize', op: { type: 'resize', rows: 3, cols: 3 } },
    { name: 'packUpdate', op: { type: 'packUpdate', id: 'a', patch: { color: 'z' } } },
    { name: 'move', op: { type: 'move', id: 'a', toRow: 0, toCol: 1 } },
    { name: 'backupImport', op: { type: 'backupImport', cells: { a: { label: 'y' } } } },
  ];

  for (const { name, op } of ops) {
    it(`${name} keeps board-level and cell-level unknown keys`, () => {
      const after = applyOp(boardWithUnknowns(), op) as unknown as Record<string, unknown>;
      expect(after['boardExtra']).toBe('keep-me');
      const a = (after['cells'] as Record<string, Record<string, unknown>>)['a'];
      expect(a['cellExtra']).toBe(42);
    });
  }
});
