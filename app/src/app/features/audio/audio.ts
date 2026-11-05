import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AudioEngine } from '../../core/audio/audio-engine';
import { type HearingChoice } from '../../core/audio/hearing-warnings';
import { SPIKE_CELLS } from '../../core/audio/spike-cells';
import { HearingBanner } from './hearing-banner';

@Component({
  selector: 'app-audio-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HearingBanner],
  templateUrl: './audio.html',
  styleUrls: ['./spike-page.scss', './audio.scss'],
})
export class AudioBoard implements OnInit {
  private readonly engine = inject(AudioEngine);
  private alive = true;

  protected readonly cells = SPIKE_CELLS;
  protected readonly warnings = this.engine.warnings;
  protected readonly hearing = this.engine.hearing;
  protected readonly failedIds = this.engine.failedIds;
  protected readonly phase = signal<'decoding' | 'ready'>('decoding');

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.alive = false;
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  protected chooseHearing(choice: HearingChoice): void {
    this.engine.setHearing(choice);
  }

  protected onCellPointerUp(event: PointerEvent, cellId: string): void {
    const pointerUpMs = performance.now();
    if (this.phase() !== 'ready') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.engine.playCell(cellId, pointerUpMs);
  }

  protected onCellKeydown(event: KeyboardEvent, cellId: string): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (this.phase() !== 'ready') return;
    this.engine.playCell(cellId, performance.now());
  }

  private async load(): Promise<void> {
    try {
      await this.engine.decodeCells(SPIKE_CELLS);
    } finally {
      if (this.alive) this.phase.set('ready');
    }
  }
}
