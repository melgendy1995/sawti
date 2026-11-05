import { ChangeDetectionStrategy, Component, Injector, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CaregiverGate } from '../../core/access/caregiver-gate';
import { CaregiverHold } from '../../core/access/caregiver-hold';
import { AudioService } from '../../core/audio/audio-service';
import type { SpeakableCell } from '../../core/audio/audio-ports';
import { BoardSession } from './board-session';
import { CaregiverPinDialog } from './caregiver-pin-dialog';
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
  imports: [RouterLink, SpeakBoard, SentenceStrip, CaregiverHold, CaregiverPinDialog],
  templateUrl: './speak.html',
  styleUrl: './speak.scss',
})
export class Speak {
  protected readonly session = inject(BoardSession);
  protected readonly controller = inject(SpeakController);
  protected readonly audio = inject(AudioService);
  protected readonly gate = inject(CaregiverGate);
  private readonly injector = inject(Injector);

  constructor() {
    void this.session.loadCore();
    void this.loadProfileGender();
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

  /**
   * Profile gender lives on the profile row. The import is dynamic so Dexie
   * stays out of the speak chunk until a database is actually there.
   */
  private async loadProfileGender(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
      const { AppSettings } = await import('../../core/settings/app-settings');
      const { ProfileDirectory } = await import('../../core/settings/profile-directory');
      const settings = this.injector.get(AppSettings);
      const directory = this.injector.get(ProfileDirectory);
      const activeId = await settings.readActiveProfileId();
      const profiles = await directory.list();
      const row = profiles.find((profile) => profile.id === activeId) ?? profiles[0];
      if (!row) return;
      const gender = directory.genderOf(row);
      if (gender) this.session.setGender(gender);
    } catch {
      // Private mode or a test environment without a usable database.
    }
  }
}
