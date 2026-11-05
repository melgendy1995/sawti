/** Global `settings` table keys. Values are JSON-like Dexie fields, not a second board model. */

/** Id of the profile the speak screen and settings edits snapshot against. */
export const SETTING_ACTIVE_PROFILE = 'activeProfileId';

/**
 * Preferred grid size for a later speak/editor read.
 * `{ rows, cols }`. This does not mutate a `BoardDoc`.
 */
export const SETTING_GRID_SIZE = 'gridSize';

/** `'tap'` (speak on press) or `'sentence'`. Initial speak-screen mode when present. */
export const SETTING_SPEAK_MODE = 'speakMode';

/** `{ holdMs, debounceMs, activation }`. Copied onto the live `ACCESS_TIMING` object. */
export const SETTING_ACCESS_TIMING = 'accessTiming';

/**
 * `{ salt, hash }`. `salt` is 16 random bytes as lower-case hex.
 * `hash` is SHA-256 hex of the UTF-8 string `${salt}:${pin}`.
 * The PIN itself is never stored.
 */
export const SETTING_CAREGIVER_PIN = 'caregiverPin';

/** Profile row field (not a settings key). Plan §2.9 values. */
export const PROFILE_GENDER_FIELD = 'gender';

export type ProfileGender = 'm' | 'f';

export interface GridSizeSetting {
  rows: number;
  cols: number;
}

export interface CaregiverPinRecord {
  salt: string;
  hash: string;
}

export type { AccessTiming } from '../access/pointer-filter';
