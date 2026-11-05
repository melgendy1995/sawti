import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ACCESS_TIMING } from '../../core/access';
import { AudioService } from '../../core/audio/audio-service';
import { TTS_ADAPTER, type TtsAdapter } from '../../core/audio/tts';
import { CELL_SPEAKER, MemoryCellSpeaker } from './cell-speaker';
import {
  CELL_BACK,
  CELL_FOOD,
  CELL_HIDDEN,
  CELL_JUICE,
  CELL_LINK,
  CELL_MIXED,
  CELL_WATER,
  PARKED_ID,
  longLabelBoard,
} from './demo-boards';
import { SentenceStrip } from './sentence-strip';
import { Speak } from './speak';
import { SpeakBoard } from './speak-board';
import { cssGridColumn, cssGridRow } from './speak-contract';

/** Exact Egyptian test sentence from the P0.3 acceptance criteria. */
const TEST_SENTENCE =
  'السَّلام عليكم، أنا عايز الميّة والأكل من المدرسة. لا، لأ، لأنّ، الله. هى عايزة تروح.';

const LONG_LABEL = 'أنا عايز أروح المدرسة دلوقتي عشان آكل وأشرب';

function pointer(type: 'pointerdown' | 'pointerup', button: HTMLElement): void {
  button.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1 }));
}

function activate(button: HTMLElement): void {
  pointer('pointerdown', button);
  pointer('pointerup', button);
}

function slot(root: ParentNode, id: string): HTMLElement {
  const element = root.querySelector(`[data-cell-id="${id}"]`);
  if (!(element instanceof HTMLElement)) throw new Error(`missing slot ${id}`);
  return element;
}

function buttonFor(root: ParentNode, id: string): HTMLButtonElement {
  const button = slot(root, id).querySelector('button');
  if (!(button instanceof HTMLButtonElement)) throw new Error(`missing button ${id}`);
  return button;
}

describe('Speak screen', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Speak],
      providers: [provideRouter([]), { provide: CELL_SPEAKER, useExisting: MemoryCellSpeaker }],
    }).compileComponents();
  });

  async function setup(): Promise<{ fixture: ReturnType<typeof TestBed.createComponent<Speak>>; el: HTMLElement }> {
    const fixture = TestBed.createComponent(Speak);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('renders the exact Egyptian test sentence inside a <bdi>', async () => {
    const { el } = await setup();
    const bdi = el.querySelector('[data-testid="test-sentence"] bdi');
    expect(bdi).toBeTruthy();
    expect(bdi?.textContent?.trim()).toBe(TEST_SENTENCE);
  });

  it('links to the audio board, diagnostics, storage, and voice rating', async () => {
    const { el } = await setup();
    const hrefs = [...el.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href'));
    expect(hrefs).toEqual(['/audio', '/audio/diagnostics', '/storage', '/voice']);
  });

  it('renders each label in a <bdi> and a symbol key when the cell has one', async () => {
    const { el } = await setup();
    const water = buttonFor(el, CELL_WATER);
    const label = water.querySelector('bdi');
    expect(label?.textContent?.trim()).toBe('مية');
    expect(water.querySelector('[data-testid="cell-symbol"]')?.textContent?.trim()).toBe('2248');
    expect(water.querySelector('img')).toBeNull();

    const mixed = buttonFor(el, CELL_MIXED).querySelector('bdi');
    expect(mixed?.textContent?.trim()).toBe('ماء water 5');
  });

  it('keeps a hidden cell in its slot and does not render a parked cell', async () => {
    const { el } = await setup();
    const hidden = slot(el, CELL_HIDDEN);
    expect(hidden.getAttribute('data-hidden')).toBe('true');
    expect(hidden.querySelector('button')).toBeNull();
    expect(hidden.style.gridRow).toBe(String(cssGridRow(1)));
    expect(hidden.style.gridColumn).toBe(String(cssGridColumn(0, 5)));
    expect(el.querySelector(`[data-cell-id="${PARKED_ID}"]`)).toBeNull();
    expect(el.textContent).not.toContain('متوقف');
  });

  it('positions cells from the document, not from DOM order', async () => {
    const { el } = await setup();
    const grid = el.querySelector('[data-testid="speak-grid"]') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(5, minmax(0, 1fr))');
    expect(grid.style.gridTemplateRows).toBe('repeat(4, minmax(0, 1fr))');

    for (const element of el.querySelectorAll<HTMLElement>('[data-testid="cell-slot"]')) {
      const row = Number(element.getAttribute('data-row'));
      const col = Number(element.getAttribute('data-col'));
      expect(element.style.gridRow).toBe(String(cssGridRow(row)));
      expect(element.style.gridColumn).toBe(String(cssGridColumn(col, 5)));
    }

    expect(slot(el, CELL_WATER).style.gridColumn).toBe('5');
    expect(slot(el, CELL_LINK).style.gridColumn).toBe('1');
  });

  it('keeps grid-row and grid-column when the container size changes', async () => {
    const { fixture, el } = await setup();
    const before = [...el.querySelectorAll<HTMLElement>('[data-testid="cell-slot"]')].map((element) => ({
      id: element.getAttribute('data-cell-id'),
      row: element.style.gridRow,
      col: element.style.gridColumn,
    }));

    for (const width of ['140px', '960px', '320px']) {
      el.style.inlineSize = width;
      const grid = el.querySelector('[data-testid="speak-grid"]') as HTMLElement;
      grid.style.inlineSize = width;
      window.dispatchEvent(new Event('resize'));
      fixture.detectChanges();
      await fixture.whenStable();

      for (const previous of before) {
        const element = slot(el, previous.id ?? '');
        expect(element.style.gridRow).toBe(previous.row);
        expect(element.style.gridColumn).toBe(previous.col);
      }
    }
  });

  it('speaks a cell immediately in speak-on-tap mode and does not fill the strip', async () => {
    const { fixture, el } = await setup();
    const speaker = TestBed.inject(MemoryCellSpeaker);

    expect(el.querySelector('[data-testid="mode-tap"]')?.getAttribute('aria-pressed')).toBe('true');
    activate(buttonFor(el, CELL_FOOD));
    fixture.detectChanges();

    expect(speaker.cells()).toEqual([{ id: CELL_FOOD, label: 'أكل', text: 'الأكل' }]);
    expect(speaker.sequences()).toEqual([]);
    expect(el.querySelectorAll('[data-testid="sentence-word"]')).toHaveLength(0);
  });

  it('appends, speaks, deletes the last word, and clears in sentence mode', async () => {
    const { fixture, el } = await setup();
    const speaker = TestBed.inject(MemoryCellSpeaker);

    (el.querySelector('[data-testid="mode-sentence"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="mode-sentence"]')?.getAttribute('aria-pressed')).toBe('true');

    activate(buttonFor(el, CELL_WATER));
    activate(buttonFor(el, CELL_FOOD));
    activate(buttonFor(el, CELL_MIXED));
    fixture.detectChanges();

    const words = () =>
      [...el.querySelectorAll('[data-testid="sentence-word"]')].map((node) => node.textContent?.trim());
    expect(words()).toEqual(['مية', 'أكل', 'ماء water 5']);
    expect(speaker.cells()).toEqual([]);

    (el.querySelector('[data-testid="sentence-speak"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(speaker.sequences()).toEqual([
      [
        { id: CELL_WATER, label: 'مية', text: 'مية' },
        { id: CELL_FOOD, label: 'أكل', text: 'الأكل' },
        { id: CELL_MIXED, label: 'ماء water 5', text: 'ماء water 5' },
      ],
    ]);

    (el.querySelector('[data-testid="sentence-delete"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(words()).toEqual(['مية', 'أكل']);

    (el.querySelector('[data-testid="sentence-clear"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(words()).toEqual([]);

    (el.querySelector('[data-testid="sentence-speak"]') as HTMLButtonElement).click();
    (el.querySelector('[data-testid="sentence-delete"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(speaker.sequences()).toHaveLength(1);
    expect(words()).toEqual([]);
  });

  it('keeps the strip when switching back to speak-on-tap', async () => {
    const { fixture, el } = await setup();
    const speaker = TestBed.inject(MemoryCellSpeaker);

    (el.querySelector('[data-testid="mode-sentence"]') as HTMLButtonElement).click();
    activate(buttonFor(el, CELL_WATER));
    fixture.detectChanges();

    (el.querySelector('[data-testid="mode-tap"]') as HTMLButtonElement).click();
    activate(buttonFor(el, CELL_FOOD));
    fixture.detectChanges();

    const words = [...el.querySelectorAll('[data-testid="sentence-word"]')].map((node) =>
      node.textContent?.trim(),
    );
    expect(words).toEqual(['مية']);
    expect(speaker.cells()).toEqual([{ id: CELL_FOOD, label: 'أكل', text: 'الأكل' }]);
  });

  it('opens a linked board and comes back without speaking the link', async () => {
    const { fixture, el } = await setup();
    const speaker = TestBed.inject(MemoryCellSpeaker);

    activate(buttonFor(el, CELL_LINK));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(buttonFor(el, CELL_JUICE).textContent).toContain('عصير');
    expect(el.querySelector(`[data-cell-id="${CELL_WATER}"]`)).toBeNull();
    expect(slot(el, CELL_JUICE).style.gridColumn).toBe(String(cssGridColumn(0, 2)));
    expect(slot(el, CELL_BACK).style.gridColumn).toBe(String(cssGridColumn(1, 2)));
    expect(speaker.cells()).toEqual([]);

    activate(buttonFor(el, CELL_BACK));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(buttonFor(el, CELL_WATER).textContent).toContain('مية');
    expect(speaker.cells()).toEqual([]);
  });
});

describe('Speak screen access timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('requires the hold and then debounces a second tap', async () => {
    await TestBed.configureTestingModule({
      imports: [Speak],
      providers: [
        provideRouter([]),
        { provide: CELL_SPEAKER, useExisting: MemoryCellSpeaker },
        { provide: ACCESS_TIMING, useValue: { holdMs: 300, debounceMs: 400, activation: 'release' } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(Speak);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const speaker = TestBed.inject(MemoryCellSpeaker);

    const pressFor = (ms: number): void => {
      const button = buttonFor(el, CELL_WATER);
      pointer('pointerdown', button);
      if (ms > 0) vi.advanceTimersByTime(ms);
      pointer('pointerup', button);
      fixture.detectChanges();
    };

    pressFor(299);
    expect(speaker.cells()).toEqual([]);

    pressFor(300);
    expect(speaker.cells().map((part) => part.id)).toEqual([CELL_WATER]);

    pressFor(300);
    expect(speaker.cells()).toHaveLength(1);

    vi.advanceTimersByTime(400);
    pressFor(300);
    expect(speaker.cells()).toHaveLength(2);
  });
});

describe('SpeakBoard long labels', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpeakBoard],
    }).compileComponents();
  });

  it('wraps a long Arabic label without overflow at more than one grid size', async () => {
    const fixture = TestBed.createComponent(SpeakBoard);
    for (const cols of [2, 4, 6]) {
      fixture.componentRef.setInput('board', longLabelBoard(cols));
      fixture.detectChanges();
      await fixture.whenStable();

      const root = fixture.nativeElement as HTMLElement;
      const grid = root.querySelector('[data-testid="speak-grid"]') as HTMLElement;
      const cell = slot(root, '0193b0c3-bbbb-7c41-9f7e-2b1d3a4c5e80');
      const button = buttonFor(root, '0193b0c3-bbbb-7c41-9f7e-2b1d3a4c5e80');
      const label = button.querySelector('bdi');

      expect(label?.textContent?.trim()).toBe(LONG_LABEL);
      expect(grid.style.gridTemplateColumns).toBe(`repeat(${cols}, minmax(0, 1fr))`);
      expect(cell.style.gridColumn).toBe(String(cssGridColumn(0, cols)));
      expect(cell.style.gridRow).toBe('1');

      for (const width of ['160px', '640px']) {
        root.style.inlineSize = width;
        grid.style.inlineSize = width;
        fixture.detectChanges();
        const placed = cell.style.gridColumn;
        expect(placed).toBe(String(cssGridColumn(0, cols)));
        const style = getComputedStyle(button);
        expect(style.overflowWrap).toBe('anywhere');
        expect(style.whiteSpace).toBe('normal');
        expect(style.getPropertyValue('overflow-inline') || style.overflowX).toBe('hidden');
        expect(style.getPropertyValue('overflow-block') || style.overflowY).toBe('hidden');
        if (button.clientWidth > 0) {
          expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth + 1);
        }
      }
    }
  });
});

describe('SentenceStrip', () => {
  it('is created with the speak screen controls', async () => {
    await TestBed.configureTestingModule({
      imports: [SentenceStrip],
    }).compileComponents();
    const fixture = TestBed.createComponent(SentenceStrip);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="sentence-speak"]')?.textContent?.trim()).toBe('انطق');
    expect(el.querySelector('[data-testid="sentence-delete"]')?.textContent?.trim()).toBe('احذف الأخير');
    expect(el.querySelector('[data-testid="sentence-clear"]')?.textContent?.trim()).toBe('امسح');
  });
});

describe('Speak no-voice banner', () => {
  const silentTts: TtsAdapter = {
    isAvailable: () => false,
    detectVoices: async () => [],
    speak: async () => false,
    cancel: () => undefined,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Speak],
      providers: [
        provideRouter([]),
        { provide: CELL_SPEAKER, useExisting: MemoryCellSpeaker },
        { provide: TTS_ADAPTER, useValue: silentTts },
      ],
    }).compileComponents();
  });

  it('shows لا يوجد صوت and the spoken text when no source can play', async () => {
    const fixture = TestBed.createComponent(Speak);
    fixture.detectChanges();
    await TestBed.inject(AudioService).speak({
      id: 'none',
      label: 'مية',
      text: 'ماء',
      vocabKey: null,
    });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="no-voice-banner"]')?.textContent).toContain('لا يوجد صوت');
    expect(el.querySelector('[data-testid="spoken-fallback"] bdi')?.textContent?.trim()).toBe('ماء');
    expect(el.querySelector('[data-testid="test-sentence"] bdi')?.textContent).toContain('السَّلام عليكم');
  });
});
