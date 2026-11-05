import { Injectable, inject, signal } from '@angular/core';
import { ACCESS_TIMING, PointerAccessFilter } from '../../core/access';
import { BoardSession } from './board-session';
import { CELL_SPEAKER } from './cell-speaker';
import { SentenceStore } from './sentence-store';
import { spokenText, type CellPhase, type SpeakMode, type SpokenPart } from './speak-contract';

/**
 * Turns a filtered cell activation into a speak, a sentence append, or a board link.
 * The sentence lives only in {@link SentenceStore}.
 */
@Injectable({ providedIn: 'root' })
export class SpeakController {
  private readonly session = inject(BoardSession);
  private readonly store = inject(SentenceStore);
  private readonly speaker = inject(CELL_SPEAKER);
  private readonly modeState = signal<SpeakMode>('tap');
  private readonly filter = new PointerAccessFilter(inject(ACCESS_TIMING), (id) => {
    this.accept(id);
  });

  readonly mode = this.modeState.asReadonly();
  readonly sentence = this.store.parts;

  setMode(mode: SpeakMode): void {
    this.modeState.set(mode);
  }

  onPhase(phase: CellPhase): void {
    if (phase.phase === 'down') this.filter.pointerDown(phase.cellId);
    else if (phase.phase === 'up') this.filter.pointerUp(phase.cellId);
    else this.filter.pointerCancel();
  }

  /** Speaks the current strip. An empty strip does not call the speaker. */
  speakSentence(): void {
    const parts = this.store.parts();
    if (parts.length === 0) return;
    this.speaker.speakSequence(parts);
  }

  deleteLast(): void {
    this.store.deleteLast();
  }

  clearSentence(): void {
    this.store.clear();
  }

  private accept(cellId: string): void {
    const cell = this.session.cell(cellId);
    if (!cell || cell.hidden) return;
    if (cell.linkBoardId) {
      this.session.open(cell.linkBoardId);
      return;
    }
    const part: SpokenPart = { id: cell.id, label: cell.label, text: spokenText(cell) };
    if (this.modeState() === 'tap') this.speaker.speakCell(part);
    else this.store.append(part);
  }
}
