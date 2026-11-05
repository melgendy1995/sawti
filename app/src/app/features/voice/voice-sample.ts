/** Curated playback subset for /voice. Full list is content/voice-spike/words.json. */

export const SALMA_VOICE = 'ar-EG-SalmaNeural';
export const SHAKIR_VOICE = 'ar-EG-ShakirNeural';

export type SpikeVoiceId = typeof SALMA_VOICE | typeof SHAKIR_VOICE;
export type SpokenGender = 'm' | 'f';

export interface SpikeVoice {
  id: SpikeVoiceId;
  labelAr: string;
  labelEn: string;
}

export interface SampleWord {
  key: string;
  m: string;
  f: string;
}

export const SPIKE_VOICES: readonly SpikeVoice[] = [
  { id: SALMA_VOICE, labelAr: 'سلمى', labelEn: 'Salma' },
  { id: SHAKIR_VOICE, labelAr: 'شاكر', labelEn: 'Shakir' },
];

/** Gendered adjectives from the plan, plus a few needs and people. Ten keys. */
export const SAMPLE_WORDS: readonly SampleWord[] = [
  { key: 'want', m: 'عايز', f: 'عايزة' },
  { key: 'hungry', m: 'جعان', f: 'جعانة' },
  { key: 'tired', m: 'تعبان', f: 'تعبانة' },
  { key: 'happy', m: 'مبسوط', f: 'مبسوطة' },
  { key: 'sad', m: 'زعلان', f: 'زعلانة' },
  { key: 'cold', m: 'ساقع', f: 'ساقعة' },
  { key: 'water', m: 'ميّة', f: 'ميّة' },
  { key: 'bathroom', m: 'حمّام', f: 'حمّام' },
  { key: 'no', m: 'لأ', f: 'لأ' },
  { key: 'friend', m: 'صاحبي', f: 'صاحبتي' },
];

/** Stable clip name. Must match scripts/voice-spike/plan.mjs `clipFileName`. */
export function clipName(key: string, gender: SpokenGender, voice: SpikeVoiceId): string {
  return `${key}.${gender}.${voice}.mp3`;
}
