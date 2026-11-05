import { Injectable, InjectionToken, inject } from '@angular/core';
import type { DeviceVoice } from './device-voice';
import { SPEECH_SYNTHESIS } from './tts-adapter';
import type { SpeechSynthesisHost, TtsAdapter } from './tts-adapter';
import { pickArabicVoice } from './voice-rank';

/** `voiceschanged` is not guaranteed. Stop waiting so startup cannot hang. */
const VOICE_LIST_WAIT_MS = 200;

@Injectable({ providedIn: 'root' })
export class WebSpeechTtsAdapter implements TtsAdapter {
  private readonly synth = inject(SPEECH_SYNTHESIS);

  /**
   * `getVoices()` is often empty until `voiceschanged`. Speak still needs a
   * list if the browser clears it again between calls.
   */
  private voices: readonly DeviceVoice[] = [];

  isAvailable(): boolean {
    return this.synth !== null;
  }

  async detectVoices(): Promise<readonly DeviceVoice[]> {
    const synth = this.synth;
    if (synth === null) {
      this.voices = [];
      return [];
    }
    const ready = voicesOrEmpty(synth);
    if (ready.length > 0) {
      this.voices = ready;
      return ready;
    }
    const listed = await waitForVoices(synth);
    this.voices = listed;
    return listed;
  }

  speak(text: string, voiceURI?: string | null): Promise<boolean> {
    const synth = this.synth;
    if (synth === null) return Promise.resolve(false);
    const spoken = text.trim();
    if (spoken.length === 0) return Promise.resolve(false);
    if (typeof SpeechSynthesisUtterance === 'undefined') return Promise.resolve(false);

    const snapshot = readVoices(synth);
    const live = snapshot.live;
    const fresh = snapshot.mapped;
    // An empty read is a race. Do not drop a list we already observed.
    const listed = fresh.length > 0 ? fresh : this.voices;
    if (fresh.length > 0) this.voices = fresh;

    const chosen = chooseVoice(listed, voiceURI);
    if (chosen === null) return Promise.resolve(false);

    return new Promise((resolve) => {
      try {
        const utterance = new SpeechSynthesisUtterance(spoken);
        utterance.lang = chosen.lang;
        const match = live.find((voice) => voice.voiceURI === chosen.voiceURI);
        if (match !== undefined) utterance.voice = match;
        utterance.onend = () => resolve(true);
        utterance.onerror = () => resolve(false);
        synth.speak(utterance);
      } catch {
        resolve(false);
      }
    });
  }

  cancel(): void {
    const synth = this.synth;
    if (synth === null) return;
    try {
      synth.cancel();
    } catch (error) {
      if (error instanceof DOMException) return;
      throw error;
    }
  }
}

export const TTS_ADAPTER = new InjectionToken<TtsAdapter>('TTS_ADAPTER', {
  providedIn: 'root',
  factory: () => inject(WebSpeechTtsAdapter),
});

function chooseVoice(
  voices: readonly DeviceVoice[],
  voiceURI: string | null | undefined,
): DeviceVoice | null {
  if (voiceURI !== undefined && voiceURI !== null) {
    const named = voices.find((voice) => voice.voiceURI === voiceURI);
    if (named !== undefined) return named;
  }
  return pickArabicVoice(voices);
}

function toDeviceVoices(voices: readonly SpeechSynthesisVoice[]): DeviceVoice[] {
  return voices.map((voice) => ({
    voiceURI: voice.voiceURI,
    name: voice.name,
    lang: voice.lang,
    localService: voice.localService === true,
    default: voice.default === true,
  }));
}

function waitForVoices(synth: SpeechSynthesisHost): Promise<readonly DeviceVoice[]> {
  return new Promise((resolve) => {
    let settled = false;
    // Both paths must cancel the other, so the id lives outside the callback.
    const pending: { timer?: ReturnType<typeof setTimeout> } = {};
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(pending.timer);
      try {
        synth.removeEventListener('voiceschanged', finish);
      } catch {
        // Cleanup must not leave detectVoices pending.
      }
      resolve(voicesOrEmpty(synth));
    };
    pending.timer = setTimeout(finish, VOICE_LIST_WAIT_MS);
    synth.addEventListener('voiceschanged', finish);
  });
}

interface VoiceSnapshot {
  live: readonly SpeechSynthesisVoice[];
  mapped: DeviceVoice[];
}

/** A throwing `getVoices()` is an empty list, not a rejected call. */
function readVoices(synth: SpeechSynthesisHost): VoiceSnapshot {
  try {
    const live = synth.getVoices();
    return { live, mapped: toDeviceVoices(live) };
  } catch {
    return { live: [], mapped: [] };
  }
}

function voicesOrEmpty(synth: SpeechSynthesisHost): DeviceVoice[] {
  return readVoices(synth).mapped;
}
