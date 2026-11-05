import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { AudioCellSpeaker } from './audio-cell-speaker';
import type { CellSpeaker, SpokenPart } from './speak-contract';

/**
 * Test double for the speak port. Records what would be spoken and plays nothing.
 * Production taps use {@link AudioCellSpeaker} through `CELL_SPEAKER`.
 */
@Injectable({ providedIn: 'root' })
export class MemoryCellSpeaker implements CellSpeaker {
  private readonly spokenCells = signal<readonly SpokenPart[]>([]);
  private readonly spokenSequences = signal<readonly (readonly SpokenPart[])[]>([]);

  readonly cells = this.spokenCells.asReadonly();
  readonly sequences = this.spokenSequences.asReadonly();

  speakCell(part: SpokenPart): void {
    this.spokenCells.update((cells) => [...cells, part]);
  }

  speakSequence(parts: readonly SpokenPart[]): void {
    this.spokenSequences.update((sequences) => [...sequences, [...parts]]);
  }
}

export const CELL_SPEAKER = new InjectionToken<CellSpeaker>('CELL_SPEAKER', {
  providedIn: 'root',
  factory: () => inject(AudioCellSpeaker),
});
