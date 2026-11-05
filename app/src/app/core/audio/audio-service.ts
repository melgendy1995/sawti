import { Injectable, inject, signal } from '@angular/core';
import { AudioEngine } from './audio-engine';
import {
  CLIP_IDENTITY,
  NO_VOICE_BANNER,
  PACK_CLIP_RESOLVER,
  RECORDING_RESOLVER,
  type ChainSource,
  type ReadyClip,
  type SpeakableCell,
} from './audio-ports';
import { CLIP_DECODER } from './clip-decoder';
import { TTS_ADAPTER } from './tts/web-speech-tts';
import type { DeviceVoice } from './tts/device-voice';
import { pickArabicVoice } from './tts/voice-rank';

/**
 * Runtime chain for one cell: caregiver recording, then pack clip, then
 * device TTS, then large on-screen text. Resolvers run at prefetch.
 * A tap only reads decoded buffers.
 */
@Injectable({ providedIn: 'root' })
export class AudioService {
  private readonly recordingsResolver = inject(RECORDING_RESOLVER);
  private readonly packResolver = inject(PACK_CLIP_RESOLVER);
  private readonly identity = inject(CLIP_IDENTITY);
  private readonly decoder = inject(CLIP_DECODER);
  private readonly tts = inject(TTS_ADAPTER);
  private readonly engine = inject(AudioEngine);

  private readonly recordings = new Map<string, AudioBuffer>();
  private readonly packs = new Map<string, AudioBuffer>();
  private current: AudioBufferSourceNode | null = null;

  private readonly bannerState = signal<string | null>(null);
  private readonly fallbackTextState = signal<string | null>(null);
  private readonly sourceState = signal<ChainSource | null>(null);
  private readonly voiceState = signal<readonly DeviceVoice[]>([]);
  private readonly selectedState = signal<DeviceVoice | null>(null);
  private readonly ttsState = signal(false);

  readonly fallbackBanner = this.bannerState.asReadonly();
  readonly spokenFallbackText = this.fallbackTextState.asReadonly();
  readonly lastSource = this.sourceState.asReadonly();
  readonly voices = this.voiceState.asReadonly();
  readonly selectedVoice = this.selectedState.asReadonly();
  readonly ttsAvailable = this.ttsState.asReadonly();

  /** Decode the open board. May fetch. `speak` must not. */
  async prefetch(cells: readonly SpeakableCell[]): Promise<void> {
    void this.refreshVoices();
    for (const cell of cells) {
      try {
        await this.prefetchCell(cell);
      } catch {
        // One bad cell must not leave the rest of the board silent.
      }
    }
  }

  async refreshVoices(): Promise<void> {
    this.ttsState.set(this.tts.isAvailable());
    try {
      const voices = await this.tts.detectVoices();
      this.voiceState.set(voices);
      this.selectedState.set(pickArabicVoice(voices));
    } catch {
      this.voiceState.set([]);
      this.selectedState.set(null);
    }
  }

  /** Play one cell. Never throws. Never calls the resolvers or `fetch`. */
  speak(cell: SpeakableCell): Promise<ChainSource> {
    return this.speakOne(cell, true, false);
  }

  /**
   * Speak a sentence in order. An empty list leaves the banner as it is.
   * Any cell with no audio keeps the banner and shows those words.
   */
  async speakSequence(cells: readonly SpeakableCell[]): Promise<void> {
    if (cells.length === 0) return;
    const missed: string[] = [];
    let interrupt = true;
    for (const cell of cells) {
      const source = await this.speakOne(cell, interrupt, true);
      interrupt = false;
      if (source === 'text') missed.push(displayText(cell));
    }
    if (missed.length === 0) {
      this.bannerState.set(null);
      this.fallbackTextState.set(null);
      return;
    }
    this.bannerState.set(NO_VOICE_BANNER);
    this.fallbackTextState.set(missed.join(' '));
  }

  private async prefetchCell(cell: SpeakableCell): Promise<void> {
    const recording = await this.recordingsResolver.resolve(cell);
    if (recording) {
      const buffer = await this.takeClip(recording);
      if (buffer) {
        this.recordings.set(cell.id, buffer);
        return;
      }
    }
    const vocabKey = cell.vocabKey?.trim();
    if (!vocabKey) return;
    const clip = await this.packResolver.resolve({
      vocabKey,
      gender: this.identity.gender,
      voice: this.identity.voice,
    });
    if (!clip) return;
    const buffer = await this.takeClip(clip);
    if (buffer) this.packs.set(this.packKey(vocabKey), buffer);
  }

  private async takeClip(clip: ReadyClip): Promise<AudioBuffer | null> {
    if (clip.buffer) return clip.buffer;
    if (clip.bytes) return this.decoder.decode(clip.bytes);
    const url = clip.url?.trim();
    if (!url) return null;
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();
      return await this.decoder.decode(bytes);
    } catch {
      return null;
    }
  }

  private async speakOne(
    cell: SpeakableCell,
    interrupt: boolean,
    waitForBuffer: boolean,
  ): Promise<ChainSource> {
    if (interrupt) this.interrupt();
    this.engine.unlock();

    const recorded = this.recordings.get(cell.id);
    if (recorded) {
      const started = await this.startBuffer(recorded, waitForBuffer);
      if (started) return this.played('recording');
    }

    const vocabKey = cell.vocabKey?.trim();
    if (vocabKey) {
      const packed = this.packs.get(this.packKey(vocabKey));
      if (packed) {
        const started = await this.startBuffer(packed, waitForBuffer);
        if (started) return this.played('pack');
      }
    }

    const spoken = await this.speakWithTts(displayText(cell));
    if (spoken) return this.played('tts');
    return this.showText(cell);
  }

  private interrupt(): void {
    const node = this.current;
    this.current = null;
    if (node) {
      try {
        node.stop();
      } catch (error) {
        if (!(error instanceof DOMException)) throw error;
      }
    }
    this.tts.cancel();
  }

  private startBuffer(buffer: AudioBuffer, waitUntilEnd: boolean): Promise<boolean> {
    const node = this.decoder.play(buffer);
    if (node === null) return Promise.resolve(false);
    this.current = node;
    if (!waitUntilEnd) return Promise.resolve(true);
    return new Promise((resolve) => {
      node.onended = () => {
        node.disconnect();
        resolve(true);
      };
    });
  }

  private async speakWithTts(text: string): Promise<boolean> {
    if (!this.tts.isAvailable()) return false;
    if (this.voiceState().length === 0) await this.refreshVoices();
    const voice = this.selectedState();
    if (!voice) return false;
    try {
      return await this.tts.speak(text, voice.voiceURI);
    } catch {
      return false;
    }
  }

  private packKey(vocabKey: string): string {
    return `${vocabKey}\0${this.identity.gender}\0${this.identity.voice}`;
  }

  private played(source: Exclude<ChainSource, 'text'>): ChainSource {
    this.bannerState.set(null);
    this.fallbackTextState.set(null);
    this.sourceState.set(source);
    return source;
  }

  private showText(cell: SpeakableCell): ChainSource {
    this.bannerState.set(NO_VOICE_BANNER);
    this.fallbackTextState.set(displayText(cell));
    this.sourceState.set('text');
    return 'text';
  }
}

function displayText(cell: SpeakableCell): string {
  const text = cell.text.trim();
  return text.length > 0 ? text : cell.label;
}
