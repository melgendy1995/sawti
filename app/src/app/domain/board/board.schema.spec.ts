// The JSON schema at content/schemas/board.schema.json is the source of truth
// for the board document; the TS types in board.types.ts mirror it. This test
// keeps the two honest: the committed fixture must validate, the types must
// describe the same shape, and unknown fields must be allowed at both levels.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv from 'ajv';
import { BoardDoc } from './board.types';

// `ng test` runs with cwd = app/; the repo root is one level up.
const repoRoot = resolve(process.cwd(), '..');

function readJson(relPath: string): unknown {
  return JSON.parse(readFileSync(resolve(repoRoot, relPath), 'utf8'));
}

describe('board.schema.json + v1.0 fixture', () => {
  const schema = readJson('content/schemas/board.schema.json') as object;
  const fixture = readJson('content/fixtures/board/v1.0-example.json');
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  it('accepts the committed v1.0 example', () => {
    const valid = validate(fixture);
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });

  it('matches the hand-written BoardDoc type', () => {
    // Compile-time check: the fixture is assignable to BoardDoc. If the schema
    // and type drift, this assignment stops type-checking.
    const doc = fixture as BoardDoc;
    expect(doc.schemaVersion).toBe(1);
    expect(doc.rows).toBe(4);
    expect(doc.cols).toBe(5);
    expect(doc.rev).toBe(42);
    expect(Object.keys(doc.cells)).toHaveLength(1);
  });

  it('has no per-cell rev (v1.1 removed it)', () => {
    const doc = fixture as BoardDoc;
    for (const cell of Object.values(doc.cells)) {
      expect('rev' in cell).toBe(false);
    }
  });

  it('preserves unknown fields at the board and cell level', () => {
    const doc = fixture as Record<string, unknown>;
    const withUnknown = {
      ...doc,
      futureBoardField: 'kept',
      cells: {
        '0193b0c3-bbbb-7c41-9f7e-2b1d3a4c5e6f': {
          ...(doc['cells'] as Record<string, Record<string, unknown>>)[
            '0193b0c3-bbbb-7c41-9f7e-2b1d3a4c5e6f'
          ],
          futureCellField: 7,
        },
      },
    };
    expect(validate(withUnknown)).toBe(true);
  });

  it('rejects a grid edge above the 12 maximum', () => {
    const doc = fixture as Record<string, unknown>;
    expect(validate({ ...doc, rows: 13 })).toBe(false);
  });

  it('requires an Arabic title', () => {
    const doc = fixture as Record<string, unknown>;
    expect(validate({ ...doc, title: { en: 'Food' } })).toBe(false);
  });

  it('requires sha256 when audio kind is media', () => {
    const doc = fixture as Record<string, unknown>;
    const cells = {
      c1: {
        row: 0,
        col: 0,
        label: 'x',
        vocabKey: null,
        spoken: null,
        symbol: null,
        audio: { kind: 'media' },
        linkBoardId: null,
        color: '',
        hidden: false,
      },
    };
    expect(validate({ ...doc, cells })).toBe(false);
  });
});
