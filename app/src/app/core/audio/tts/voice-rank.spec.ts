import { arabicVoiceRank, pickArabicVoice } from './voice-rank';
import type { DeviceVoice } from './device-voice';

function voice(lang: string, extra: Partial<DeviceVoice> = {}): DeviceVoice {
  return {
    voiceURI: extra.voiceURI ?? lang,
    name: extra.name ?? lang,
    lang,
    localService: extra.localService ?? false,
    default: extra.default ?? false,
  };
}

describe('Arabic voice preference', () => {
  it.each([
    ['ar-EG', 0],
    ['AR-eg', 0],
    ['ar_EG', 0],
    ['ar-EG-x-male', 0],
    ['ar-SA', 1],
    ['ar-sa', 1],
    ['ar', 2],
    ['ar-AE', 2],
    ['ar-MA', 2],
    ['en-US', null],
    ['', null],
  ] as const)('ranks %s as %s', (lang, rank) => {
    expect(arabicVoiceRank(lang)).toBe(rank);
  });

  it('picks ar-EG, then ar-SA, then any other Arabic voice', () => {
    const egyptian = voice('ar-EG', { name: 'Egypt' });
    const saudi = voice('ar-SA', { name: 'Saudi', localService: true, default: true });
    const gulf = voice('ar-AE', { name: 'Gulf', localService: true });

    expect(pickArabicVoice([voice('en-US'), saudi, gulf, egyptian])).toBe(egyptian);
    expect(pickArabicVoice([gulf, saudi, voice('en-GB')])).toBe(saudi);
    expect(pickArabicVoice([voice('fr-FR'), gulf])).toBe(gulf);
    expect(pickArabicVoice([voice('en-US')])).toBeNull();
  });

  it('keeps the earlier voice when two share a rank', () => {
    const first = voice('ar-EG', { voiceURI: 'first', name: 'First' });
    const second = voice('ar-eg', { voiceURI: 'second', name: 'Second', localService: true });

    expect(pickArabicVoice([second, first])).toBe(second);
  });
});
