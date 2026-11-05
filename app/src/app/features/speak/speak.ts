import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CaregiverGate } from '../../core/access/caregiver-gate';
import { CaregiverHold } from '../../core/access/caregiver-hold';
import { BoardSession } from './board-session';
import { CaregiverPinDialog } from './caregiver-pin-dialog';
import { SentenceStrip } from './sentence-strip';
import { SpeakBoard } from './speak-board';
import { SpeakController } from './speak-controller';
import type { CellPhase } from './speak-contract';

/**
 * Speak screen (P1.7). The grid is positioned from the board document.
 * The sentence strip is memory-only. Spike links and the Egyptian test
 * sentence stay reachable for device checks.
 */
@Component({
  selector: 'app-speak',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SpeakBoard, SentenceStrip, CaregiverHold, CaregiverPinDialog],
  templateUrl: './speak.html',
  styleUrl: './speak.scss',
})
export class Speak {
  protected readonly session = inject(BoardSession);
  protected readonly controller = inject(SpeakController);
  protected readonly gate = inject(CaregiverGate);

  /** Exact Egyptian test sentence required by the P0.3 acceptance criteria. */
  protected readonly testSentence =
    'السَّلام عليكم، أنا عايز الميّة والأكل من المدرسة. لا، لأ، لأنّ، الله. هى عايزة تروح.';

  protected onPhase(phase: CellPhase): void {
    this.controller.onPhase(phase);
  }
}
