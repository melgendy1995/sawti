import { Injectable, inject } from '@angular/core';
import { AudioService } from '../../core/audio/audio-service';
import type { SpeakableCell } from '../../core/audio/audio-ports';
import { BoardSession } from './board-session';
import type { CellSpeaker, SpokenPart } from './speak-contract';

@Injectable({ providedIn: 'root' })
export class AudioCellSpeaker implements CellSpeaker {
  private readonly audio = inject(AudioService);
  private readonly session = inject(BoardSession);

  speakCell(part: SpokenPart): void {
    void this.audio.speak(this.toCell(part));
  }

  speakSequence(parts: readonly SpokenPart[]): void {
    void this.audio.speakSequence(parts.map((part) => this.toCell(part)));
  }

  private toCell(part: SpokenPart): SpeakableCell {
    const cell = this.session.cell(part.id);
    return {
      id: part.id,
      label: part.label,
      text: part.text,
      vocabKey: cell?.vocabKey ?? null,
    };
  }
}
