import { InjectionToken } from '@angular/core';
import type { DeviceVoice } from './device-voice';

export interface TtsAdapter {
  /** The speech API exists. Does not mean an Arabic voice is installed. */
  isAvailable(): boolean;
  /**
   * Read `getVoices()`. If the list is empty, wait for one `voiceschanged`
   * or a short timeout (200ms), whichever comes first, then return the list
   * (possibly empty). Must not hang.
   */
  detectVoices(): Promise<readonly DeviceVoice[]>;
  /**
   * Speak `text`. When `voiceURI` is null, pick `pickArabicVoice`.
   * Resolves true after the utterance ends (onend).
   * Resolves false (never throws) when the API is missing, text is blank,
   * no usable voice was found, `speak` throws, or the utterance errors.
   * A missing Arabic voice is false — do not pretend speech happened.
   * If `voiceURI` is set and that voice exists, use it. If it does not exist, fall back to pickArabicVoice; if that is also null, return false.
   */
  speak(text: string, voiceURI?: string | null): Promise<boolean>;
  cancel(): void;
}

/**
 * Future native engine. P1.8 does NOT implement this and does NOT add a
 * Capacitor TTS plugin. Android WebView uses WebSpeechTtsAdapter.
 */
export interface NativeTtsAdapter extends TtsAdapter {
  readonly kind: 'native';
}

/**
 * Host the adapter reads. Tests provide a fake. The default factory returns
 * the global `speechSynthesis` when it exists, otherwise null.
 */
export interface SpeechSynthesisHost {
  getVoices(): SpeechSynthesisVoice[];
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  addEventListener(type: 'voiceschanged', listener: () => void): void;
  removeEventListener(type: 'voiceschanged', listener: () => void): void;
}

export const SPEECH_SYNTHESIS = new InjectionToken<SpeechSynthesisHost | null>('SPEECH_SYNTHESIS', {
  providedIn: 'root',
  factory: () => {
    if (typeof speechSynthesis === 'undefined') return null;
    return speechSynthesis;
  },
});
