import { Injectable, InjectionToken, inject } from '@angular/core';
import { AudioEngine } from './audio-engine';
import { requestPlaybackSession } from './playback-session';

export interface ClipDecoder {
  /** Unlock + `audioSession.type = 'playback'` + start the buffer. Return the node, or null if it did not start. */
  play(buffer: AudioBuffer): AudioBufferSourceNode | null;
  /** Decode bytes on the shared AudioContext. Prefetch only. Null on failure. */
  decode(bytes: ArrayBuffer): Promise<AudioBuffer | null>;
}

@Injectable({ providedIn: 'root' })
export class WebClipDecoder implements ClipDecoder {
  private readonly engine = inject(AudioEngine);

  play(buffer: AudioBuffer): AudioBufferSourceNode | null {
    requestPlaybackSession(navigator);
    return this.engine.playReady(buffer);
  }

  decode(bytes: ArrayBuffer): Promise<AudioBuffer | null> {
    return this.engine.decodeBytes(bytes);
  }
}

export const CLIP_DECODER = new InjectionToken<ClipDecoder>('CLIP_DECODER', {
  providedIn: 'root',
  factory: () => inject(WebClipDecoder),
});
