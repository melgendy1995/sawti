import { Injectable, computed, signal } from '@angular/core';
import { ClipDecodeError, clipUrlFor, decodeSpikeClip } from './clip-decode';
import type { DiagnosticsReportInput } from './diagnostics-report';
import {
  type ContextReadout,
  type HearingChoice,
  type PlaybackFacts,
  warningsForPlayback,
} from './hearing-warnings';
import {
  contextNeedsResume,
  readAudioSession,
  requestPlaybackSession,
} from './playback-session';
import { type SpikeCell } from './spike-cells';
import { startBuffer } from './start-buffer';

export type PlayFailure = 'missing-clip' | 'play-failed' | 'no-context';

export interface PlayMark {
  cellId: string;
  tapToStartMs: number;
  started: boolean;
  reason: PlayFailure | null;
}

interface DecodeOutcome {
  id: string;
  ok: boolean;
}

/**
 * One AudioContext for the spike. Created on first use, resumed inside a
 * user gesture, and resumed again when the page returns from background.
 */
@Injectable({ providedIn: 'root' })
export class AudioEngine {
  readonly failedIds = signal<ReadonlySet<string>>(new Set());
  readonly gestureSeen = signal(false);
  readonly contextState = signal<ContextReadout>('missing');
  readonly resumePending = signal(false);
  readonly hearing = signal<HearingChoice>('unknown');
  readonly lastPlayReason = signal<PlayFailure | null>(null);

  readonly playbackFacts = computed<PlaybackFacts>(() => ({
    gestureSeen: this.gestureSeen(),
    contextState: this.contextState(),
    resumePending: this.resumePending(),
    clipReady: this.lastPlayReason() !== 'missing-clip',
    startThrew: this.lastPlayReason() === 'play-failed',
    decodeFailures: this.failedIds().size,
    hearing: this.hearing(),
  }));

  readonly warnings = computed(() => warningsForPlayback(this.playbackFacts()));

  private context: AudioContext | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private resumeEpoch = 0;

  constructor() {
    document.addEventListener('pointerdown', this.resumeFromGesture, true);
    document.addEventListener('keydown', this.resumeFromGesture, true);
    document.addEventListener('visibilitychange', this.onForeground);
    window.addEventListener('pageshow', this.onForeground);
  }

  setHearing(choice: HearingChoice): void {
    this.hearing.set(choice);
  }

  /** Decode on board open. A later tap only reads `buffers`. */
  async decodeCells(cells: readonly SpikeCell[]): Promise<void> {
    const context = this.ensureContext();
    if (!context) {
      this.mergeFailures(cells.map((cell) => ({ id: cell.id, ok: false })));
      return;
    }
    const outcomes = await Promise.all(cells.map((cell) => this.decodeOne(context, cell)));
    this.mergeFailures(outcomes);
  }

  /**
   * Start a decoded buffer. `pointerUpMs` is `performance.now()` from the
   * pointerup handler; the returned delta ends at `AudioBufferSourceNode.start()`.
   */
  playCell(cellId: string, pointerUpMs: number): PlayMark {
    this.resumeFromGesture();
    const context = this.context;
    if (!context) return this.record(cellId, pointerUpMs, false, 'no-context');
    const buffer = this.buffers.get(cellId);
    if (!buffer) return this.record(cellId, pointerUpMs, false, 'missing-clip');
    try {
      startBuffer(context, buffer);
    } catch (error) {
      if (error instanceof DOMException) {
        return this.record(cellId, pointerUpMs, false, 'play-failed');
      }
      throw error;
    }
    return this.record(cellId, pointerUpMs, true, null);
  }

  reportInput(tapMs: readonly number[], recordedAtIso: string, userAgent: string): DiagnosticsReportInput {
    const context = this.context;
    const session = readAudioSession(navigator);
    return {
      recordedAtIso,
      userAgent,
      sampleRate: context?.sampleRate ?? null,
      contextState: this.contextState(),
      audioSessionSupported: session.supported,
      audioSessionType: session.type,
      baseLatencyMs: context ? context.baseLatency * 1000 : null,
      outputLatencyMs: outputLatencyMs(context),
      hearing: this.hearing(),
      tapMs,
    };
  }

  private readonly resumeFromGesture = (): void => {
    this.gestureSeen.set(true);
    const context = this.ensureContext();
    if (!context) {
      this.contextState.set('missing');
      return;
    }
    requestPlaybackSession(navigator);
    if (context.state !== 'suspended') {
      this.resumePending.set(false);
      this.publishState(context);
      return;
    }
    this.beginResume(context);
  };

  private readonly onForeground = (): void => {
    const context = this.context;
    if (!context) return;
    const visible = document.visibilityState === 'visible';
    if (!contextNeedsResume(context.state, visible)) {
      this.publishState(context);
      return;
    }
    requestPlaybackSession(navigator);
    this.beginResume(context);
  };

  private beginResume(context: AudioContext): void {
    const epoch = ++this.resumeEpoch;
    this.resumePending.set(true);
    void this.settleResume(context, epoch);
  }

  private async settleResume(context: AudioContext, epoch: number): Promise<void> {
    try {
      await context.resume();
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
    }
    if (epoch !== this.resumeEpoch) return;
    this.resumePending.set(false);
    this.publishState(context);
  }

  private async decodeOne(context: AudioContext, cell: SpikeCell): Promise<DecodeOutcome> {
    try {
      const buffer = await decodeSpikeClip(context, cell.id, clipUrlFor(cell.file));
      this.buffers.set(cell.id, buffer);
      return { id: cell.id, ok: true };
    } catch (error) {
      if (error instanceof ClipDecodeError) return { id: cell.id, ok: false };
      throw error;
    }
  }

  private mergeFailures(outcomes: readonly DecodeOutcome[]): void {
    this.failedIds.update((current) => {
      const next = new Set(current);
      for (const outcome of outcomes) {
        if (outcome.ok) next.delete(outcome.id);
        else next.add(outcome.id);
      }
      return next;
    });
  }

  private record(cellId: string, pointerUpMs: number, started: boolean, reason: PlayFailure | null): PlayMark {
    if (reason === 'missing-clip' || reason === 'play-failed') this.lastPlayReason.set(reason);
    else if (started) this.lastPlayReason.set(null);
    if (this.context) this.publishState(this.context);
    return { cellId, tapToStartMs: performance.now() - pointerUpMs, started, reason };
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof AudioContext === 'undefined') {
      this.contextState.set('missing');
      return null;
    }
    // Set before the context exists so iOS can classify the session as playback.
    requestPlaybackSession(navigator);
    try {
      this.context = new AudioContext();
    } catch (error) {
      if (error instanceof DOMException) {
        this.contextState.set('missing');
        return null;
      }
      throw error;
    }
    this.publishState(this.context);
    return this.context;
  }

  private publishState(context: AudioContext): void {
    const state = context.state;
    if (state === 'running' || state === 'suspended' || state === 'closed') {
      this.contextState.set(state);
      return;
    }
    this.contextState.set('missing');
  }
}

function outputLatencyMs(context: AudioContext | null): number | null {
  if (!context || !('outputLatency' in context)) return null;
  const seconds = context.outputLatency;
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) return null;
  return seconds * 1000;
}
