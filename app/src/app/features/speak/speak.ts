import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AudioService } from '../../core/audio/audio-service';
import type { SpeakableCell } from '../../core/audio/audio-ports';
import { BoardSession } from './board-session';
import { SentenceStrip } from './sentence-strip';
import { SpeakBoard } from './speak-board';
import { SpeakController } from './speak-controller';
import { spokenText, type CellPhase } from './speak-contract';

/**
 * Speak screen (P1.7). The grid is positioned from the board document.
 * The sentence strip is memory-only. Spike links and the Egyptian test
 * sentence stay reachable for device checks.
 */
@Component({
  selector: 'app-speak',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SpeakBoard, SentenceStrip],
  templateUrl: './speak.html',
  styleUrl: './speak.scss',
})
export class Speak {
  protected readonly session = inject(BoardSession);
  protected readonly controller = inject(SpeakController);
  protected readonly audio = inject(AudioService);

  constructor() {
    effect(() => {
      const board = this.session.board();
      const cells: SpeakableCell[] = Object.entries(board.cells).map(([id, cell]) => ({
        id,
        label: cell.label,
        text: spokenText(cell),
        vocabKey: cell.vocabKey,
      }));
      void this.audio.prefetch(cells);
    });
  }

  /** Exact Egyptian test sentence required by the P0.3 acceptance criteria. */
  protected readonly testSentence =
    'السَّلام عليكم، أنا عايز الميّة والأكل من المدرسة. لا، لأ، لأنّ، الله. هى عايزة تروح.';

  protected onPhase(phase: CellPhase): void {
    this.controller.onPhase(phase);
  }
}
