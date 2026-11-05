import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AudioEngine } from '../../core/audio/audio-engine';
import {
  DIAGNOSTIC_TAP_COUNT,
  TAP_TO_START_BUDGET_MS,
  formatDiagnosticsReport,
  formatReportNumber,
  tapToStartVerdict,
} from '../../core/audio/diagnostics-report';
import { type HearingChoice } from '../../core/audio/hearing-warnings';
import { p50, p95 } from '../../core/audio/percentile';
import { DIAGNOSTIC_CELL } from '../../core/audio/spike-cells';
import { HearingBanner } from './hearing-banner';

@Component({
  selector: 'app-audio-diagnostics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HearingBanner],
  templateUrl: './diagnostics.html',
  styleUrls: ['./spike-page.scss', './diagnostics.scss'],
})
export class AudioDiagnostics implements OnInit {
  private readonly engine = inject(AudioEngine);
  private alive = true;

  protected readonly cell = DIAGNOSTIC_CELL;
  protected readonly tapGoal = DIAGNOSTIC_TAP_COUNT;
  protected readonly budgetMs = TAP_TO_START_BUDGET_MS;
  protected readonly warnings = this.engine.warnings;
  protected readonly hearing = this.engine.hearing;
  protected readonly phase = signal<'decoding' | 'ready'>('decoding');
  protected readonly samples = signal<readonly number[]>([]);
  protected readonly rejected = signal(false);
  protected readonly copyNote = signal<'idle' | 'copied' | 'manual'>('idle');
  protected readonly recordedAt = signal(new Date().toISOString());

  protected readonly median = computed(() => p50(this.samples()));
  protected readonly tail = computed(() => p95(this.samples()));
  protected readonly verdict = computed(() => tapToStartVerdict(this.tail(), this.samples().length));
  protected readonly meter = computed(() =>
    this.engine.reportInput(this.samples(), this.recordedAt(), navigator.userAgent),
  );
  protected readonly report = computed(() => formatDiagnosticsReport(this.meter()));

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

  protected onMeasurePointerUp(event: PointerEvent): void {
    const pointerUpMs = performance.now();
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.countTap(pointerUpMs);
  }

  /** Keyboard can play the tone. It is not a pointerup sample, so it is not counted. */
  protected onMeasureKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (this.phase() !== 'ready') return;
    this.engine.playCell(this.cell.id, performance.now());
  }

  protected reset(): void {
    this.samples.set([]);
    this.rejected.set(false);
    this.copyNote.set('idle');
    this.recordedAt.set(new Date().toISOString());
  }

  protected async copyReport(): Promise<void> {
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      this.copyNote.set('manual');
      return;
    }
    try {
      await clipboard.writeText(this.report());
    } catch (error) {
      if (error instanceof DOMException) {
        this.copyNote.set('manual');
        return;
      }
      throw error;
    }
    this.copyNote.set('copied');
  }

  protected numberText(value: number | null): string {
    return formatReportNumber(value);
  }

  private countTap(pointerUpMs: number): void {
    if (this.phase() !== 'ready') return;
    if (this.samples().length >= DIAGNOSTIC_TAP_COUNT) return;
    this.takeSample(pointerUpMs);
  }

  private takeSample(pointerUpMs: number): void {
    const mark = this.engine.playCell(this.cell.id, pointerUpMs);
    if (!mark.started) {
      this.rejected.set(true);
      return;
    }
    this.rejected.set(false);
    this.samples.update((current) => [...current, mark.tapToStartMs]);
    this.recordedAt.set(new Date().toISOString());
  }

  private async load(): Promise<void> {
    try {
      await this.engine.decodeCells([this.cell]);
    } finally {
      if (this.alive) this.phase.set('ready');
    }
  }
}
