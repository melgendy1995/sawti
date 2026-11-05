import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  VOICE_DRAFT_KEY,
  emptyDraft,
  formatVoiceReport,
  isRaterRole,
  parseDraft,
  ROLE_LABELS,
  RATER_ROLES,
  type RaterRole,
  type VoiceDraft,
} from './voice-report';
import {
  SAMPLE_WORDS,
  SPIKE_VOICES,
  clipName,
  type SpokenGender,
  type SpikeVoiceId,
} from './voice-sample';

/**
 * P0.5 anonymous voice-rating page. Local draft only: no submit, no telemetry,
 * no child fields. Not a live survey — ratings wait for the P0.10 notice.
 */
@Component({
  selector: 'app-voice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './voice.html',
  styleUrl: './voice.scss',
})
export class VoicePage implements OnInit {
  private readonly doc = inject(DOCUMENT);
  private readonly commentBox = viewChild<ElementRef<HTMLTextAreaElement>>('commentBox');
  private player: HTMLAudioElement | null = null;
  private generation = 0;

  /** Set once so typing does not rewrite the textarea and jump the caret. */
  protected readonly initialComment: string;

  protected readonly voices = SPIKE_VOICES;
  protected readonly words = SAMPLE_WORDS;
  protected readonly roles = RATER_ROLES;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly scores = [1, 2, 3, 4, 5] as const;

  protected readonly draft = signal<VoiceDraft>(emptyDraft());
  protected readonly clipsReady = signal<boolean | null>(null);
  protected readonly playing = signal(false);
  protected readonly playError = signal(false);
  protected readonly copyNote = signal<'idle' | 'copied' | 'manual'>('idle');
  protected readonly reportText = signal('');

  constructor() {
    const loaded = this.loadDraft();
    this.initialComment = loaded.comment;
    this.draft.set(loaded);
    inject(DestroyRef).onDestroy(() => {
      this.generation += 1;
      this.player?.pause();
    });
  }

  ngOnInit(): void {
    void this.probe();
  }

  protected setRole(value: string): void {
    const role: RaterRole | '' = isRaterRole(value) ? value : '';
    this.draft.update((draft) => ({ ...draft, role }));
    this.save();
  }

  protected setScore(which: 'salma' | 'shakir', score: number): void {
    this.draft.update((draft) => ({ ...draft, [which]: score }));
    this.save();
  }

  protected setComment(value: string): void {
    this.draft.update((draft) => ({ ...draft, comment: value.slice(0, 500) }));
    this.save();
  }

  protected controlValue(event: Event): string {
    const target = event.target;
    if (target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return target.value;
    return '';
  }

  protected clearDraft(): void {
    this.generation += 1;
    this.player?.pause();
    this.playing.set(false);
    this.draft.set(emptyDraft());
    this.reportText.set('');
    this.copyNote.set('idle');
    const box = this.commentBox()?.nativeElement;
    if (box) box.value = '';
    try {
      localStorage.removeItem(VOICE_DRAFT_KEY);
    } catch {
      // Storage can throw in private mode. The in-memory draft is already clear.
    }
  }

  protected async copyReport(): Promise<void> {
    const text = formatVoiceReport({
      recordedAtIso: new Date().toISOString(),
      userAgent: navigator.userAgent,
      draft: this.draft(),
    });
    this.reportText.set(text);
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      this.copyNote.set('manual');
      return;
    }
    try {
      await clipboard.writeText(text);
      this.copyNote.set('copied');
    } catch (error) {
      if (error instanceof DOMException) {
        this.copyNote.set('manual');
        return;
      }
      throw error;
    }
  }

  protected playOne(key: string, gender: SpokenGender, voice: SpikeVoiceId): void {
    this.generation += 1;
    const generation = this.generation;
    this.playing.set(true);
    void this.start(clipName(key, gender, voice), generation, false).then((ok) => {
      if (generation !== this.generation) return;
      this.playError.set(!ok);
      this.playing.set(false);
    });
  }

  protected playAll(): void {
    this.generation += 1;
    const generation = this.generation;
    this.playing.set(true);
    this.playError.set(false);
    void this.runAll(generation).then(() => {
      if (generation === this.generation) this.playing.set(false);
    });
  }

  protected stop(): void {
    this.generation += 1;
    this.player?.pause();
    this.playing.set(false);
  }

  private async runAll(generation: number): Promise<void> {
    for (const voice of SPIKE_VOICES) {
      for (const word of SAMPLE_WORDS) {
        for (const gender of ['m', 'f'] as const) {
          if (generation !== this.generation) return;
          await this.start(clipName(word.key, gender, voice.id), generation, true);
        }
      }
    }
  }

  /** Unlock-on-gesture: callers are click handlers. Resolves false when the file is missing. */
  private start(file: string, generation: number, waitForEnd: boolean): Promise<boolean> {
    const player = this.ensurePlayer();
    player.pause();
    let settled = false;
    return new Promise((resolve) => {
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        player.removeEventListener('ended', onEnded);
        player.removeEventListener('error', onError);
        resolve(ok);
      };
      const onEnded = () => finish(true);
      const onError = () => finish(false);
      if (waitForEnd) {
        player.addEventListener('ended', onEnded);
        player.addEventListener('error', onError);
      }
      player.src = this.urlFor(file);
      player
        .play()
        .then(() => {
          if (generation !== this.generation) {
            player.pause();
            finish(false);
            return;
          }
          this.markHeard(file);
          if (!waitForEnd) finish(true);
        })
        .catch(() => finish(false));
    });
  }

  private ensurePlayer(): HTMLAudioElement {
    if (!this.player) {
      this.player = new Audio();
      this.player.preload = 'none';
    }
    return this.player;
  }

  private markHeard(file: string): void {
    this.draft.update((draft) => {
      if (draft.heard.includes(file)) return draft;
      return { ...draft, heard: [...draft.heard, file] };
    });
    this.save();
  }

  private urlFor(file: string): string {
    return new URL(`voice-spike/${file}`, this.doc.baseURI).href;
  }

  private async probe(): Promise<void> {
    const file = clipName(SAMPLE_WORDS[0].key, 'm', SPIKE_VOICES[0].id);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(this.urlFor(file), { method: 'GET', signal: controller.signal });
      this.clipsReady.set(response.ok);
    } catch {
      this.clipsReady.set(false);
    } finally {
      clearTimeout(timer);
    }
  }

  private loadDraft(): VoiceDraft {
    try {
      return parseDraft(localStorage.getItem(VOICE_DRAFT_KEY));
    } catch {
      return emptyDraft();
    }
  }

  private save(): void {
    try {
      localStorage.setItem(VOICE_DRAFT_KEY, JSON.stringify(this.draft()));
    } catch {
      // Private mode can block storage. Copy report still uses the in-memory draft.
    }
  }
}
