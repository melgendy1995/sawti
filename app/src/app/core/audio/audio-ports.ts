import { InjectionToken } from '@angular/core';

export const NO_VOICE_BANNER = 'لا يوجد صوت';

export type ChainSource = 'recording' | 'pack' | 'tts' | 'text';

/** What speak() needs. `text` is the spoken string (spoken override or label). */
export interface SpeakableCell {
  id: string;
  label: string;
  text: string;
  vocabKey: string | null;
}

/** Already-decoded buffer, raw bytes, or a URL. Prefetch may fetch. speak() must not. */
export interface ReadyClip {
  buffer?: AudioBuffer;
  bytes?: ArrayBuffer;
  url?: string;
}

export interface RecordingResolver {
  resolve(cell: SpeakableCell): ReadyClip | null | Promise<ReadyClip | null>;
}

export interface PackClipQuery {
  vocabKey: string;
  gender: string;
  voice: string;
}

export interface PackClipResolver {
  resolve(query: PackClipQuery): ReadyClip | null | Promise<ReadyClip | null>;
}

/** Placeholder until P1.6 packs and P1.10 profile voice exist. Not an Azure voice id. */
export interface ClipIdentity {
  gender: string;
  voice: string;
}

/** P1.5 recordings are not wired yet. Resolving to null is the normal case. */
export const RECORDING_RESOLVER = new InjectionToken<RecordingResolver>('RECORDING_RESOLVER', {
  providedIn: 'root',
  factory: () => ({ resolve: () => null }),
});

/** P1.6 pack clips are not wired yet. Resolving to null is the normal case. */
export const PACK_CLIP_RESOLVER = new InjectionToken<PackClipResolver>('PACK_CLIP_RESOLVER', {
  providedIn: 'root',
  factory: () => ({ resolve: () => null }),
});

/** Placeholder gender and voice until the profile screen exists. */
export const CLIP_IDENTITY = new InjectionToken<ClipIdentity>('CLIP_IDENTITY', {
  providedIn: 'root',
  factory: () => ({ gender: 'f', voice: 'default' }),
});
