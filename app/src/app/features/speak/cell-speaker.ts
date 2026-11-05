import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import type { CellSpeaker, SpokenPart } from './speak-contract';

/**
 * Narrow speak port for P1.7. Records what would be spoken.
 * Clip playback and the fallback chain are P1.8 — this does not play audio.
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
  factory: () => inject(MemoryCellSpeaker),
});
