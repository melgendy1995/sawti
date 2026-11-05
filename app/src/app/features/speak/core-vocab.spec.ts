import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import Ajv from 'ajv';
import { CELL_SPEAKER, MemoryCellSpeaker } from './cell-speaker';
import { BoardSession } from './board-session';
import { Speak } from './speak';
import { applyGender, buildCoreBoards, type VocabFile, type VocabItem } from './vocab-index';

const repoRoot = resolve(process.cwd(), '..');

const QUICK_KEYS = ['want', 'hungry', 'tired', 'happy', 'sad'] as const;

function readText(relPath: string): string {
  return readFileSync(resolve(repoRoot, relPath), 'utf8');
}

function readJson(relPath: string): unknown {
  return JSON.parse(readText(relPath));
}

/** Parser for the flat core-vocab YAML this phase writes. Not a general YAML loader. */
function parseVocabYaml(text: string): VocabFile {
  const items: VocabItem[] = [];
  let current: VocabItem | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('- vocabKey:')) {
      if (current) items.push(current);
      current = {
        vocabKey: after(line, '- vocabKey:'),
        category: '',
        color: '',
        gloss_en: '',
        agreement: false,
        display: { m: '', f: '' },
        speak: { m: '', f: '' },
        board: '',
        row: 0,
        col: 0,
        reviewStatus: '',
      };
      continue;
    }
    if (!current) continue;
    if (line.startsWith('category:')) current.category = after(line, 'category:');
    else if (line.startsWith('color:')) current.color = after(line, 'color:');
    else if (line.startsWith('gloss_en:')) current.gloss_en = unquote(after(line, 'gloss_en:'));
    else if (line.startsWith('agreement:')) current.agreement = after(line, 'agreement:') === 'true';
    else if (line.startsWith('display:')) current.display = parseForms(line);
    else if (line.startsWith('speak:')) current.speak = parseForms(line);
    else if (line.startsWith('board:')) current.board = after(line, 'board:');
    else if (line.startsWith('row:')) current.row = Number(after(line, 'row:'));
    else if (line.startsWith('col:')) current.col = Number(after(line, 'col:'));
    else if (line.startsWith('reviewStatus:')) current.reviewStatus = after(line, 'reviewStatus:');
  }
  if (current) items.push(current);
  return { schemaVersion: 1, dialect: 'ar-EG', reviewStatus: 'ai-draft', items };
}

function after(line: string, label: string): string {
  return line.slice(label.length).trim();
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

function parseForms(line: string): { m: string; f: string } {
  const match = line.match(/\{ m: "(.*)", f: "(.*)" \}$/);
  if (!match) throw new Error(`bad forms: ${line}`);
  return { m: match[1] ?? '', f: match[2] ?? '' };
}

function labelOf(root: ParentNode, id: string): string {
  const node = root.querySelector(`[data-cell-id="${id}"] [data-testid="cell-label"]`);
  return node?.textContent?.trim() ?? '';
}

describe('ar-EG core vocabulary', () => {
  const schema = readJson('content/schemas/vocab.schema.json') as object;
  const json = readJson('app/public/vocab/ar-eg-core.json') as VocabFile;
  const yaml = parseVocabYaml(readText('content/vocab/ar-eg-core.yaml'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  it('accepts the YAML and the generated JSON', () => {
    expect(validate(yaml)).toBe(true);
    expect(validate.errors ?? []).toEqual([]);
    expect(validate(json)).toBe(true);
    expect(yaml).toEqual(json);
  });

  it('has 380–420 unique ai-draft keys in Egyptian Arabic', () => {
    expect(json.dialect).toBe('ar-EG');
    expect(json.reviewStatus).toBe('ai-draft');
    expect(json.items.length).toBeGreaterThanOrEqual(380);
    expect(json.items.length).toBeLessThanOrEqual(420);
    const keys = json.items.map((item) => item.vocabKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const item of json.items) {
      expect(item.reviewStatus).toBe('ai-draft');
      expect(item).not.toHaveProperty('ssml');
    }
    expect(readText('content/vocab/ar-eg-core.yaml')).not.toContain('approved');
  });

  it('gives agreement items two display forms and keeps the others identical', () => {
    const slots = new Set<string>();
    for (const item of json.items) {
      slots.add(`${item.board}:${item.row}:${item.col}`);
      if (item.agreement) {
        expect(item.display.m).not.toBe(item.display.f);
      } else {
        expect(item.display.m).toBe(item.display.f);
        expect(item.speak.m).toBe(item.speak.f);
      }
    }
    expect(slots.size).toBe(json.items.length);
  });

  it('keeps the voice-spike spellings for the original 50 keys', () => {
    const spike = readJson('content/voice-spike/words.json') as {
      key: string;
      spoken: { m: string; f: string };
    }[];
    const byKey = new Map(json.items.map((item) => [item.vocabKey, item]));
    expect(spike).toHaveLength(50);
    for (const word of spike) {
      const item = byKey.get(word.key);
      expect(item?.display).toEqual(word.spoken);
      expect(item?.speak).toEqual(word.spoken);
    }
  });

  it('puts water at food 0,0 and builds quick phrases from vocabKeys', () => {
    const water = json.items.find((item) => item.vocabKey === 'water');
    expect(water).toMatchObject({ board: 'food', row: 0, col: 0, color: 'fitz-noun' });

    const boards = buildCoreBoards(json);
    const quick = boards['quick'];
    expect(quick).toBeTruthy();
    const wordCells = Object.values(quick.cells).filter((cell) => cell.vocabKey !== null);
    expect(wordCells.every((cell) => cell.label === '' && cell.spoken === null)).toBe(true);
    const keys = wordCells.map((cell) => cell.vocabKey);
    for (const key of QUICK_KEYS) expect(keys).toContain(key);
    expect(quick.cells['link-quick-home']?.vocabKey).toBeNull();
    expect(quick.cells['vk-want']?.label).toBe('');

    const food = boards['food'];
    expect(food.cells['vk-water']).toMatchObject({
      row: 0,
      col: 0,
      color: 'fitz-noun',
      symbol: { pack: 'arasaac', key: '2248' },
    });
  });

  it('switches quick-phrase labels when the profile gender switches', async () => {
    await TestBed.configureTestingModule({
      imports: [Speak],
      providers: [provideRouter([]), { provide: CELL_SPEAKER, useExisting: MemoryCellSpeaker }],
    }).compileComponents();

    const fixture = TestBed.createComponent(Speak);
    const session = TestBed.inject(BoardSession);
    session.useVocab(json);
    session.open('quick');
    session.setGender('m');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(labelOf(el, 'vk-want')).toBe('عايز');
    expect(labelOf(el, 'vk-hungry')).toBe('جعان');
    expect(labelOf(el, 'vk-tired')).toBe('تعبان');
    expect(labelOf(el, 'vk-happy')).toBe('مبسوط');
    expect(labelOf(el, 'vk-sad')).toBe('زعلان');

    session.setGender('f');
    fixture.detectChanges();

    expect(labelOf(el, 'vk-want')).toBe('عايزة');
    expect(labelOf(el, 'vk-hungry')).toBe('جعانة');
    expect(labelOf(el, 'vk-tired')).toBe('تعبانة');
    expect(labelOf(el, 'vk-happy')).toBe('مبسوطة');
    expect(labelOf(el, 'vk-sad')).toBe('زعلانة');

    const masculine = applyGender(buildCoreBoards(json)['quick'], new Map(), 'm');
    expect(masculine.cells['vk-want']?.label).toBe('');
  });

  it('lists the same rows in the review CSV', () => {
    const lines = readText('docs/p1.3-core-vocab-review.csv').trim().split(/\r?\n/);
    expect(lines[0]).toBe(
      'key,category,color,display_m,display_f,speak_m,speak_f,gloss_en,board,row,col,agreement,reviewStatus',
    );
    expect(lines.length - 1).toBe(json.items.length);
    const first = parseCsvLine(lines[1] ?? '');
    expect(first[0]).toBe(json.items[0]?.vocabKey);
    expect(first[12]).toBe('ai-draft');
  });
});

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let index = 0;
  while (index < line.length) {
    if (line[index] !== '"') break;
    let value = '';
    index += 1;
    while (index < line.length) {
      if (line[index] === '"' && line[index + 1] === '"') {
        value += '"';
        index += 2;
        continue;
      }
      if (line[index] === '"') {
        index += 1;
        break;
      }
      value += line[index];
      index += 1;
    }
    fields.push(value);
    if (line[index] === ',') index += 1;
  }
  return fields;
}
