import { TestBed } from '@angular/core/testing';
import { AudioService } from './audio-service';
import {
  CLIP_IDENTITY,
  NO_VOICE_BANNER,
  PACK_CLIP_RESOLVER,
  RECORDING_RESOLVER,
  type PackClipQuery,
  type ReadyClip,
  type SpeakableCell,
} from './audio-ports';
import { CLIP_DECODER, type ClipDecoder } from './clip-decoder';
import type { DeviceVoice } from './tts/device-voice';
import { TTS_ADAPTER, type TtsAdapter } from './tts';

const CELL: SpeakableCell = { id: 'cell-1', label: 'مية', text: 'ماء', vocabKey: 'water' };

function tagged(tag: string): AudioBuffer {
  return { tag } as unknown as AudioBuffer;
}

interface Harness {
  service: AudioService;
  played: AudioBuffer[];
  decoded: ArrayBuffer[];
  spoken: string[];
  recordingCalls: number;
  packQueries: PackClipQuery[];
  fetchSpy: ReturnType<typeof vi.fn>;
  nodes: { stop: ReturnType<typeof vi.fn> }[];
}

function arabicVoice(): DeviceVoice {
  return { voiceURI: 'ar-EG', name: 'Egypt', lang: 'ar-EG', localService: true, default: false };
}

async function harness(options: {
  recording?: ReadyClip | null;
  /** When set, only this cell id receives `recording`. Other cells resolve to null. */
  recordingForId?: string;
  pack?: ReadyClip | null;
  tts?: boolean;
  voices?: readonly DeviceVoice[];
  play?: ClipDecoder['play'];
  identity?: { gender: string; voice: string };
}): Promise<Harness> {
  const played: AudioBuffer[] = [];
  const decoded: ArrayBuffer[] = [];
  const spoken: string[] = [];
  const packQueries: PackClipQuery[] = [];
  const nodes: { stop: ReturnType<typeof vi.fn> }[] = [];
  let recordingCalls = 0;
  const fetchSpy = vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(4),
  }));
  vi.stubGlobal('fetch', fetchSpy);

  const decoder: ClipDecoder = {
    play: options.play
      ? options.play
      : (buffer) => {
          played.push(buffer);
          const node = {
            stop: vi.fn(),
            disconnect: vi.fn(),
            onended: null as ((ev: Event) => void) | null,
          };
          nodes.push(node);
          queueMicrotask(() => node.onended?.(new Event('ended')));
          return node as unknown as AudioBufferSourceNode;
        },
    decode: async (bytes) => {
      decoded.push(bytes);
      return tagged(`decoded-${decoded.length}`);
    },
  };

  const tts: TtsAdapter = {
    isAvailable: () => options.tts !== false,
    detectVoices: async () => options.voices ?? (options.tts === false ? [] : [arabicVoice()]),
    speak: async (text) => {
      if (options.tts === false) return false;
      spoken.push(text);
      return true;
    },
    cancel: () => undefined,
  };

  TestBed.configureTestingModule({
    providers: [
      {
        provide: RECORDING_RESOLVER,
        useValue: {
          resolve: (cell: SpeakableCell) => {
            recordingCalls += 1;
            if (options.recordingForId !== undefined && cell.id !== options.recordingForId) return null;
            return options.recording ?? null;
          },
        },
      },
      {
        provide: PACK_CLIP_RESOLVER,
        useValue: {
          resolve: (query: PackClipQuery) => {
            packQueries.push(query);
            return options.pack ?? null;
          },
        },
      },
      { provide: CLIP_DECODER, useValue: decoder },
      { provide: TTS_ADAPTER, useValue: tts },
      { provide: CLIP_IDENTITY, useValue: options.identity ?? { gender: 'f', voice: 'default' } },
    ],
  });

  return {
    service: TestBed.inject(AudioService),
    played,
    decoded,
    spoken,
    get recordingCalls() {
      return recordingCalls;
    },
    packQueries,
    fetchSpy,
    nodes,
  };
}

describe('AudioService fallback chain', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    { recording: true, pack: true, tts: true, source: 'recording' },
    { recording: true, pack: true, tts: false, source: 'recording' },
    { recording: true, pack: false, tts: true, source: 'recording' },
    { recording: true, pack: false, tts: false, source: 'recording' },
    { recording: false, pack: true, tts: true, source: 'pack' },
    { recording: false, pack: true, tts: false, source: 'pack' },
    { recording: false, pack: false, tts: true, source: 'tts' },
    { recording: false, pack: false, tts: false, source: 'text' },
  ] as const)(
    'recording=$recording pack=$pack tts=$tts chooses $source',
    async ({ recording, pack, tts, source }) => {
      const recorded = tagged('recording');
      const packed = tagged('pack');
      const rig = await harness({
        recording: recording ? { buffer: recorded } : null,
        pack: pack ? { buffer: packed } : null,
        tts,
      });

      await rig.service.prefetch([CELL]);
      const fetches = rig.fetchSpy.mock.calls.length;
      const recordingsBefore = rig.recordingCalls;
      const packsBefore = rig.packQueries.length;

      const chosen = await rig.service.speak(CELL);

      expect(chosen).toBe(source);
      expect(rig.service.lastSource()).toBe(source);
      expect(rig.fetchSpy.mock.calls.length).toBe(fetches);
      expect(rig.recordingCalls).toBe(recordingsBefore);
      expect(rig.packQueries.length).toBe(packsBefore);
      expect(rig.packQueries.length).toBe(recording ? 0 : 1);
      if (source === 'recording') expect(rig.played).toEqual([recorded]);
      if (source === 'pack') expect(rig.played).toEqual([packed]);
      expect(rig.spoken).toEqual(source === 'tts' ? ['ماء'] : []);
      if (source === 'text') {
        expect(rig.played).toEqual([]);
        expect(rig.service.fallbackBanner()).toBe(NO_VOICE_BANNER);
        expect(rig.service.spokenFallbackText()).toBe('ماء');
      } else {
        expect(rig.service.fallbackBanner()).toBeNull();
        expect(rig.service.spokenFallbackText()).toBeNull();
      }
    },
  );

  it('asks the pack resolver for vocabKey, gender, and voice', async () => {
    const rig = await harness({
      pack: { buffer: tagged('pack') },
      tts: false,
      identity: { gender: 'm', voice: 'shakir' },
    });

    await rig.service.prefetch([CELL]);

    expect(rig.packQueries).toEqual([{ vocabKey: 'water', gender: 'm', voice: 'shakir' }]);
  });

  it('decodes a recording URL while the board opens and does not fetch again on tap', async () => {
    const rig = await harness({
      recording: { url: 'https://example.invalid/rec.mp3' },
      tts: false,
    });

    await rig.service.prefetch([CELL]);
    expect(rig.fetchSpy).toHaveBeenCalledTimes(1);
    expect(rig.fetchSpy).toHaveBeenCalledWith('https://example.invalid/rec.mp3');
    expect(rig.decoded).toHaveLength(1);

    rig.fetchSpy.mockClear();
    await rig.service.speak(CELL);

    expect(rig.fetchSpy).not.toHaveBeenCalled();
    expect(rig.decoded).toHaveLength(1);
    expect(rig.service.lastSource()).toBe('recording');
    expect(rig.played).toEqual([tagged('decoded-1')]);
  });

  it('does not fetch or ask resolvers when speak runs before prefetch', async () => {
    const rig = await harness({
      recording: { url: 'https://example.invalid/rec.mp3' },
      pack: { url: 'https://example.invalid/pack.mp3' },
      tts: false,
    });

    const source = await rig.service.speak(CELL);

    expect(source).toBe('text');
    expect(rig.fetchSpy).not.toHaveBeenCalled();
    expect(rig.recordingCalls).toBe(0);
    expect(rig.packQueries).toEqual([]);
    expect(rig.service.fallbackBanner()).toBe(NO_VOICE_BANNER);
  });

  it('prefers an already-decoded buffer over a URL on the same clip', async () => {
    const recorded = tagged('ready');
    const rig = await harness({
      recording: { buffer: recorded, url: 'https://example.invalid/rec.mp3' },
      tts: false,
    });

    await rig.service.prefetch([CELL]);
    await rig.service.speak(CELL);

    expect(rig.fetchSpy).not.toHaveBeenCalled();
    expect(rig.played).toEqual([recorded]);
  });

  it('decodes bytes at prefetch and plays that buffer on tap', async () => {
    const rig = await harness({
      recording: { bytes: new ArrayBuffer(8) },
      tts: false,
    });

    await rig.service.prefetch([CELL]);
    expect(rig.decoded).toHaveLength(1);
    await rig.service.speak(CELL);

    expect(rig.decoded).toHaveLength(1);
    expect(rig.fetchSpy).not.toHaveBeenCalled();
    expect(rig.played[0]).toEqual(tagged('decoded-1'));
  });

  it('falls through to the pack clip when the recording buffer will not start', async () => {
    const recorded = tagged('recording');
    const packed = tagged('pack');
    const played: AudioBuffer[] = [];
    let plays = 0;
    vi.stubGlobal('fetch', vi.fn());
    TestBed.configureTestingModule({
      providers: [
        {
          provide: RECORDING_RESOLVER,
          useValue: {
            resolve: (cell: SpeakableCell) => (cell.id === 'has-recording' ? { buffer: recorded } : null),
          },
        },
        { provide: PACK_CLIP_RESOLVER, useValue: { resolve: () => ({ buffer: packed }) } },
        {
          provide: CLIP_DECODER,
          useValue: {
            play: (buffer: AudioBuffer) => {
              plays += 1;
              if (plays === 1) return null;
              played.push(buffer);
              return { stop: vi.fn(), disconnect: vi.fn(), onended: null } as unknown as AudioBufferSourceNode;
            },
            decode: async () => null,
          } satisfies ClipDecoder,
        },
        {
          provide: TTS_ADAPTER,
          useValue: {
            isAvailable: () => false,
            detectVoices: async () => [],
            speak: async () => false,
            cancel: () => undefined,
          } satisfies TtsAdapter,
        },
      ],
    });
    const service = TestBed.inject(AudioService);
    const withRecording: SpeakableCell = { ...CELL, id: 'has-recording' };

    await service.prefetch([withRecording, { ...CELL, id: 'pack-only' }]);
    await expect(service.speak(withRecording)).resolves.toBe('pack');

    expect(played).toEqual([packed]);
    expect(service.fallbackBanner()).toBeNull();
  });

  it('shows the label when the spoken text is blank', async () => {
    const rig = await harness({ recording: null, pack: null, tts: false });

    await rig.service.speak({ ...CELL, text: '   ' });

    expect(rig.service.spokenFallbackText()).toBe('مية');
    expect(rig.service.fallbackBanner()).toBe(NO_VOICE_BANNER);
  });

  it('keeps the banner for the words in a sentence that had no audio', async () => {
    const recorded = tagged('recording');
    const rig = await harness({
      recording: { buffer: recorded },
      recordingForId: CELL.id,
      tts: false,
    });
    const silent: SpeakableCell = { id: 'other', label: 'أكل', text: 'الأكل', vocabKey: null };
    await rig.service.prefetch([CELL, silent]);

    await rig.service.speakSequence([CELL, silent]);

    expect(rig.played).toEqual([recorded]);
    expect(rig.service.fallbackBanner()).toBe(NO_VOICE_BANNER);
    expect(rig.service.spokenFallbackText()).toBe('الأكل');
    expect(rig.service.lastSource()).toBe('text');
  });

  it('leaves the banner alone when the sentence is empty', async () => {
    const rig = await harness({ tts: false });
    await rig.service.speak(CELL);
    expect(rig.service.fallbackBanner()).toBe(NO_VOICE_BANNER);

    await rig.service.speakSequence([]);

    expect(rig.service.fallbackBanner()).toBe(NO_VOICE_BANNER);
    expect(rig.service.spokenFallbackText()).toBe('ماء');
  });

  it('stops the previous buffer when a new cell is spoken', async () => {
    const rig = await harness({
      recording: { buffer: tagged('recording') },
      tts: false,
    });
    await rig.service.prefetch([CELL]);
    await rig.service.speak(CELL);
    await rig.service.speak(CELL);

    expect(rig.nodes[0]?.stop).toHaveBeenCalledTimes(1);
    expect(rig.played).toHaveLength(2);
  });
});
