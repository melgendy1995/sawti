// INV-1 property tests (plan v1.1 §5.2, errata E6). Folds random op sequences
// over random valid boards at 10k runs.
//
//   - Non-move property: after any sequence of upsert/hide/resize/packUpdate/
//     backupImport ops, a cell that is still present and not parked sits at the
//     exact [row, col] it started at. Only `move` may change a position.
//   - Move property: a single move changes at most the named cell's position;
//     every other cell holds, or the move was refused and the board is intact.

import fc from 'fast-check';
import { applyOp, applyOpResult } from './board';
import {
  AudioSource,
  BoardCell,
  BoardDoc,
  CellInput,
  MoveOp,
  NonMoveOp,
  SymbolRef,
} from './board.types';

const NUM_RUNS = 10_000;

const arbAudio: fc.Arbitrary<AudioSource> = fc.oneof(
  fc.constant<AudioSource>({ kind: 'pack' }),
  fc.string({ minLength: 4, maxLength: 8 }).map((sha256): AudioSource => ({ kind: 'media', sha256 })),
  fc.constant<AudioSource>({ kind: 'tts' }),
);

const arbSymbol: fc.Arbitrary<SymbolRef | null> = fc.option(
  fc.record({ pack: fc.constantFrom('arasaac', 'local'), key: fc.string({ maxLength: 6 }) }),
  { nil: null },
);

type FullContent = Omit<BoardCell, 'row' | 'col' | 'hidden'>;

/** Full cell content (no row/col) for seeding a board. */
const arbFullContent: fc.Arbitrary<FullContent> = fc.record({
  label: fc.string({ maxLength: 8 }),
  vocabKey: fc.option(fc.string({ maxLength: 6 }), { nil: null }),
  spoken: fc.option(fc.string({ maxLength: 6 }), { nil: null }),
  symbol: arbSymbol,
  audio: arbAudio,
  linkBoardId: fc.option(fc.string({ maxLength: 6 }), { nil: null }),
  color: fc.constantFrom('', 'fitz-noun', 'fitz-verb'),
});

/** Partial content for op payloads; unknown keys included sometimes. */
const arbPartialContent: fc.Arbitrary<CellInput> = fc
  .record(
    {
      label: fc.string({ maxLength: 8 }),
      vocabKey: fc.option(fc.string({ maxLength: 6 }), { nil: null }),
      spoken: fc.option(fc.string({ maxLength: 6 }), { nil: null }),
      symbol: arbSymbol,
      audio: arbAudio,
      color: fc.constantFrom('', 'fitz-noun', 'fitz-verb'),
      futureField: fc.string({ maxLength: 4 }),
    },
    { requiredKeys: [] },
  )
  .map((r) => r as CellInput);

interface CellSpec {
  content: FullContent;
  hidden: boolean;
  parked: boolean;
  posSeed: number;
}

const arbCellSpec: fc.Arbitrary<CellSpec> = fc.record({
  content: arbFullContent,
  hidden: fc.boolean(),
  parked: fc.boolean(),
  posSeed: fc.nat({ max: 200 }),
});

/** Valid boards: unique ids (index-based), distinct in-bounds placed cells,
 *  some hidden, some parked. Carries a board-level unknown field. */
function arbBoard(): fc.Arbitrary<BoardDoc> {
  return fc
    .record({
      rows: fc.integer({ min: 1, max: 6 }),
      cols: fc.integer({ min: 1, max: 6 }),
      specs: fc.array(arbCellSpec, { maxLength: 15 }),
    })
    .map(({ rows, cols, specs }) => {
      const total = rows * cols;
      const used = new Set<number>();
      const cells: Record<string, BoardCell> = {};
      const parked: BoardDoc['parked'] = [];

      specs.forEach((spec, i) => {
        const id = `c${i}`;
        const content = spec.content;
        const slotOf = (n: number) => ({ row: Math.floor(n / cols), col: n % cols });
        const full: Omit<BoardCell, 'row' | 'col'> = {
          label: content.label,
          vocabKey: content.vocabKey,
          spoken: content.spoken,
          symbol: content.symbol,
          audio: content.audio,
          linkBoardId: content.linkBoardId,
          color: content.color,
          hidden: spec.hidden,
        };
        if (spec.parked || used.size >= total) {
          const { row, col } = slotOf(spec.posSeed % total);
          parked.push({ id, row, col, ...full });
          return;
        }
        // Pick the first free slot starting at posSeed, deterministically.
        let slot = spec.posSeed % total;
        while (used.has(slot)) slot = (slot + 1) % total;
        used.add(slot);
        const { row, col } = slotOf(slot);
        cells[id] = { row, col, ...full };
      });

      return {
        schemaVersion: 1,
        id: 'prop-board',
        profileId: 'prop-profile',
        title: { ar: 'لوحة', en: 'Board' },
        rows,
        cols,
        layoutLocked: true,
        cells,
        parked,
        rev: 0,
        boardExtra: 'keep-me',
      } as BoardDoc;
    });
}

/** Ids biased to overlap with the index-based board ids (c0..c14). */
const arbId: fc.Arbitrary<string> = fc.oneof(
  fc.integer({ min: 0, max: 14 }).map((n) => `c${n}`),
  fc.string({ minLength: 1, maxLength: 4 }),
);

const arbNonMoveOp: fc.Arbitrary<NonMoveOp> = fc.oneof(
  fc.record({ id: arbId, cell: arbPartialContent.chain((c) =>
    fc.record({ row: fc.integer({ min: 0, max: 6 }), col: fc.integer({ min: 0, max: 6 }) }).map(
      (pos) => ({ ...c, ...pos }),
    ),
  ) }).map((r): NonMoveOp => ({ type: 'upsert', id: r.id, cell: r.cell })),
  fc.record({ id: arbId }).map((r): NonMoveOp => ({ type: 'hide', id: r.id })),
  fc.record({ id: arbId }).map((r): NonMoveOp => ({ type: 'unhide', id: r.id })),
  fc
    .record({ rows: fc.integer({ min: 1, max: 6 }), cols: fc.integer({ min: 1, max: 6 }) })
    .map((r): NonMoveOp => ({ type: 'resize', rows: r.rows, cols: r.cols })),
  fc
    .record({ id: arbId, patch: fc.record({ symbol: arbSymbol, audio: arbAudio, color: fc.string({ maxLength: 4 }) }, { requiredKeys: [] }) })
    .map((r): NonMoveOp => ({ type: 'packUpdate', id: r.id, patch: r.patch })),
  fc
    .dictionary(arbId, arbPartialContent.chain((c) =>
      fc.record({ row: fc.integer({ min: 0, max: 6 }), col: fc.integer({ min: 0, max: 6 }) }).map(
        (pos) => ({ ...c, ...pos }),
      ),
    ), { maxKeys: 4 })
    .map((cells): NonMoveOp => ({ type: 'backupImport', cells })),
);

const arbMoveOp: fc.Arbitrary<MoveOp> = fc.record({
  id: arbId,
  toRow: fc.integer({ min: 0, max: 6 }),
  toCol: fc.integer({ min: 0, max: 6 }),
}).map((r) => ({ type: 'move', ...r }));

describe('INV-1 property: non-move ops never change a surviving cell position', () => {
  it(`holds over ${NUM_RUNS} random boards and op sequences`, () => {
    fc.assert(
      fc.property(arbBoard(), fc.array(arbNonMoveOp, { maxLength: 50 }), (board, ops) => {
        const after = ops.reduce(applyOp, board);
        for (const [id, cell] of Object.entries(board.cells)) {
          const now = after.cells[id];
          if (now && !after.parked.some((p) => p.id === id)) {
            expect([now.row, now.col]).toEqual([cell.row, cell.col]);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it(`conserves every cell id (no deletions) over ${NUM_RUNS} runs`, () => {
    fc.assert(
      fc.property(arbBoard(), fc.array(arbNonMoveOp, { maxLength: 50 }), (board, ops) => {
        const originalIds = new Set([
          ...Object.keys(board.cells),
          ...board.parked.map((p) => p.id),
        ]);
        const after = ops.reduce(applyOp, board);
        const afterIds = new Set([
          ...Object.keys(after.cells),
          ...after.parked.map((p) => p.id),
        ]);
        for (const id of originalIds) {
          expect(afterIds.has(id)).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('move property: only the named cell may change position', () => {
  it(`holds over ${NUM_RUNS} random boards and moves`, () => {
    fc.assert(
      fc.property(arbBoard(), arbMoveOp, (board, move) => {
        const result = applyOpResult(board, move);
        if (!result.ok) {
          // Refused: the board is returned unchanged (reference-identical).
          expect(applyOp(board, move)).toBe(board);
          return;
        }
        const after = result.board;
        // The named cell is now at the requested slot.
        expect([after.cells[move.id].row, after.cells[move.id].col]).toEqual([
          move.toRow,
          move.toCol,
        ]);
        // Every other originally-placed cell holds its slot.
        for (const [id, cell] of Object.entries(board.cells)) {
          if (id === move.id) continue;
          expect([after.cells[id].row, after.cells[id].col]).toEqual([cell.row, cell.col]);
        }
        // Every other parked cell stays parked, unchanged.
        for (const p of board.parked) {
          if (p.id === move.id) continue;
          const still = after.parked.find((x) => x.id === p.id);
          expect(still).toBeDefined();
          expect([still?.row, still?.col]).toEqual([p.row, p.col]);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
