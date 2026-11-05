import { TestBed } from '@angular/core/testing';
import { SPEECH_SYNTHESIS, type SpeechSynthesisHost } from './tts-adapter';
import { WebSpeechTtsAdapter } from './web-speech-tts';

interface Synth {
  host: SpeechSynthesisHost;
  voices: SpeechSynthesisVoice[];
  spoken: SpeechSynthesisUtterance[];
  cancel: ReturnType<typeof vi.fn>;
  fire: () => void;
}

function voice(lang: string, voiceURI = lang): SpeechSynthesisVoice {
  return { lang, voiceURI, name: voiceURI, localService: false, default: false } as SpeechSynthesisVoice;
}

function createSynth(mode: 'end' | 'error' | 'throw' = 'end'): Synth {
  const voices: SpeechSynthesisVoice[] = [];
  const spoken: SpeechSynthesisUtterance[] = [];
  let listener: (() => void) | null = null;
  const cancel = vi.fn();
  const host: SpeechSynthesisHost = {
    getVoices: () => voices.slice(),
    speak: (utterance) => {
      if (mode === 'throw') throw new DOMException('refused', 'InvalidStateError');
      spoken.push(utterance);
      queueMicrotask(() => {
        if (mode === 'error') utterance.onerror?.(new Event('error') as SpeechSynthesisErrorEvent);
        else utterance.onend?.(new Event('end') as SpeechSynthesisEvent);
      });
    },
    cancel,
    addEventListener: (_type, next) => {
      listener = next;
    },
    removeEventListener: () => {
      listener = null;
    },
  };
  return { host, voices, spoken, cancel, fire: () => listener?.() };
}

function adapterFor(synth: SpeechSynthesisHost | null): WebSpeechTtsAdapter {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: SPEECH_SYNTHESIS, useValue: synth }],
  });
  return TestBed.inject(WebSpeechTtsAdapter);
}

describe('Web Speech TTS adapter', () => {
  beforeEach(() => {
    if (typeof globalThis.SpeechSynthesisUtterance !== 'undefined') return;
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string;
        lang = '';
        voice: SpeechSynthesisVoice | null = null;
        onend: ((event: Event) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;

        constructor(text: string) {
          this.text = text;
        }
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is unavailable when speechSynthesis is missing', async () => {
    const adapter = adapterFor(null);

    expect(adapter.isAvailable()).toBe(false);
    await expect(adapter.detectVoices()).resolves.toEqual([]);
    await expect(adapter.speak('ماء')).resolves.toBe(false);
    adapter.cancel();
  });

  it('lists voices that are already installed', async () => {
    const synth = createSynth();
    synth.voices.push(voice('ar-EG'));
    const adapter = adapterFor(synth.host);

    await expect(adapter.detectVoices()).resolves.toEqual([
      { voiceURI: 'ar-EG', name: 'ar-EG', lang: 'ar-EG', localService: false, default: false },
    ]);
  });

  it('waits for voiceschanged when the first list is empty', async () => {
    const synth = createSynth();
    const adapter = adapterFor(synth.host);

    const pending = adapter.detectVoices();
    synth.voices.push(voice('ar-SA', 'saudi'));
    synth.fire();

    await expect(pending).resolves.toEqual([
      { voiceURI: 'saudi', name: 'saudi', lang: 'ar-SA', localService: false, default: false },
    ]);
  });

  it('stops waiting when voiceschanged never fires', async () => {
    vi.useFakeTimers();
    const synth = createSynth();
    const adapter = adapterFor(synth.host);

    const pending = adapter.detectVoices();
    await vi.advanceTimersByTimeAsync(200);

    await expect(pending).resolves.toEqual([]);
  });

  it('speaks with ar-EG ahead of ar-SA', async () => {
    const synth = createSynth();
    synth.voices.push(voice('en-US'), voice('ar-SA', 'saudi'), voice('ar-EG', 'egypt'));
    const adapter = adapterFor(synth.host);

    await expect(adapter.speak('ماء')).resolves.toBe(true);
    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0]?.lang).toBe('ar-EG');
    expect(synth.spoken[0]?.voice?.voiceURI).toBe('egypt');
    expect(synth.spoken[0]?.text).toBe('ماء');
  });

  it('uses an explicit voice and falls back when that URI is missing', async () => {
    const synth = createSynth();
    synth.voices.push(voice('ar-EG', 'egypt'), voice('ar-SA', 'saudi'));
    const adapter = adapterFor(synth.host);

    await expect(adapter.speak('ماء', 'saudi')).resolves.toBe(true);
    expect(synth.spoken[0]?.voice?.voiceURI).toBe('saudi');

    await expect(adapter.speak('أكل', 'missing')).resolves.toBe(true);
    expect(synth.spoken[1]?.voice?.voiceURI).toBe('egypt');
  });

  it('does not claim speech when no Arabic voice exists', async () => {
    const synth = createSynth();
    synth.voices.push(voice('en-US'));
    const adapter = adapterFor(synth.host);

    await expect(adapter.speak('ماء')).resolves.toBe(false);
    expect(synth.spoken).toEqual([]);
  });

  it('does not claim speech for blank text, an utterance error, or a refused speak()', async () => {
    const blank = createSynth();
    blank.voices.push(voice('ar-EG'));
    await expect(adapterFor(blank.host).speak('   ')).resolves.toBe(false);
    expect(blank.spoken).toEqual([]);

    const errored = createSynth('error');
    errored.voices.push(voice('ar-EG'));
    await expect(adapterFor(errored.host).speak('ماء')).resolves.toBe(false);

    const refused = createSynth('throw');
    refused.voices.push(voice('ar-EG'));
    await expect(adapterFor(refused.host).speak('ماء')).resolves.toBe(false);
  });

  it('uses the last detected list if getVoices() is empty again at speak time', async () => {
    const synth = createSynth();
    synth.voices.push(voice('ar-EG', 'egypt'));
    const adapter = adapterFor(synth.host);
    await adapter.detectVoices();
    synth.voices.length = 0;

    await expect(adapter.speak('ماء')).resolves.toBe(true);
    expect(synth.spoken[0]?.lang).toBe('ar-EG');
  });

  it('swallows a DOMException from cancel and rethrows anything else', () => {
    const synth = createSynth();
    const adapter = adapterFor(synth.host);
    synth.cancel.mockImplementationOnce(() => {
      throw new DOMException('busy', 'InvalidStateError');
    });
    expect(() => adapter.cancel()).not.toThrow();

    synth.cancel.mockImplementationOnce(() => {
      throw new Error('broken');
    });
    expect(() => adapter.cancel()).toThrow('broken');
  });
});
