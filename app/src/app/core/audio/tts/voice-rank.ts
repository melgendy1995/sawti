import type { DeviceVoice } from './device-voice';

/**
 * Lower is better. 0 = ar-EG, 1 = ar-SA, 2 = any other ar / ar-*, null = not Arabic.
 * Match is case-insensitive. `_` is treated as `-`. `ar-EG` and `ar-EG-something` both rank 0.
 * Bare `ar` ranks 2.
 */
export function arabicVoiceRank(lang: string): 0 | 1 | 2 | null {
  const tag = lang.trim().toLowerCase().replace(/_/g, '-');
  if (tag !== 'ar' && !tag.startsWith('ar-')) return null;
  if (tag === 'ar-eg' || tag.startsWith('ar-eg-')) return 0;
  if (tag === 'ar-sa' || tag.startsWith('ar-sa-')) return 1;
  return 2;
}

/**
 * Best Arabic voice. Dialect order beats localService and default.
 * Same rank: the earlier voice in `voices` wins (stable).
 * Returns null when none are Arabic.
 */
export function pickArabicVoice(voices: readonly DeviceVoice[]): DeviceVoice | null {
  let best: DeviceVoice | null = null;
  let bestRank: 0 | 1 | 2 | null = null;
  for (const voice of voices) {
    const rank = arabicVoiceRank(voice.lang);
    if (rank === null) continue;
    if (bestRank === null || rank < bestRank) {
      best = voice;
      bestRank = rank;
    }
  }
  return best;
}
