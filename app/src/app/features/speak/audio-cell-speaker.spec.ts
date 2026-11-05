import { TestBed } from '@angular/core/testing';
import { AudioService } from '../../core/audio/audio-service';
import type { ChainSource, SpeakableCell } from '../../core/audio/audio-ports';
import { AudioCellSpeaker } from './audio-cell-speaker';
import { BoardSession } from './board-session';
import { CELL_SPEAKER, MemoryCellSpeaker } from './cell-speaker';
import { CELL_WATER, HOME_BOARD_ID } from './demo-boards';

describe('CELL_SPEAKER wiring', () => {
  const spoken: SpeakableCell[] = [];
  const sequences: SpeakableCell[][] = [];

  beforeEach(() => {
    spoken.length = 0;
    sequences.length = 0;
    const audio = {
      speak: (cell: SpeakableCell): Promise<ChainSource> => {
        spoken.push(cell);
        return Promise.resolve('tts');
      },
      speakSequence: (cells: readonly SpeakableCell[]): Promise<void> => {
        sequences.push([...cells]);
        return Promise.resolve();
      },
    };
    TestBed.configureTestingModule({
      providers: [{ provide: AudioService, useValue: audio }],
    });
    TestBed.inject(BoardSession).open(HOME_BOARD_ID);
  });

  it('uses AudioCellSpeaker and keeps MemoryCellSpeaker as a separate double', () => {
    const speaker = TestBed.inject(CELL_SPEAKER);

    expect(speaker).toBeInstanceOf(AudioCellSpeaker);
    expect(speaker).not.toBe(TestBed.inject(MemoryCellSpeaker));
  });

  it('passes the board vocabKey into AudioService', () => {
    const speaker = TestBed.inject(CELL_SPEAKER);

    speaker.speakCell({ id: CELL_WATER, label: 'مية', text: 'الميّة' });
    speaker.speakCell({ id: 'missing', label: 'س', text: 'ص' });
    speaker.speakSequence([
      { id: CELL_WATER, label: 'مية', text: 'مية' },
      { id: 'missing', label: 'س', text: 'ص' },
    ]);

    expect(spoken).toEqual([
      { id: CELL_WATER, label: 'مية', text: 'الميّة', vocabKey: 'water' },
      { id: 'missing', label: 'س', text: 'ص', vocabKey: null },
    ]);
    expect(sequences).toEqual([
      [
        { id: CELL_WATER, label: 'مية', text: 'مية', vocabKey: 'water' },
        { id: 'missing', label: 'س', text: 'ص', vocabKey: null },
      ],
    ]);
  });
});
