import { InjectionToken } from '@angular/core';

/** The two methods the daily stamp needs. `localStorage` in the app; a map in tests. */
export interface VersionStampStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Relative by default so tests stub it and production is not a hard-coded domain. */
export const VERSION_JSON_URL = new InjectionToken<string>('VERSION_JSON_URL', {
  providedIn: 'root',
  factory: () => '/version.json',
});

/** Android versionCode of this build. P1.14 supplies the real code. No Capacitor plugin. */
export const APP_VERSION_CODE = new InjectionToken<number>('APP_VERSION_CODE', {
  providedIn: 'root',
  factory: () => 1,
});

export const VERSION_CHECK_STAMP_KEY = 'sawti.versionJsonCheckedAt';

export const VERSION_STAMP_STORE = new InjectionToken<VersionStampStore>('VERSION_STAMP_STORE', {
  providedIn: 'root',
  factory: () => ({
    getItem: (key) => readLocalStamp(key),
    setItem: (key, value) => writeLocalStamp(key, value),
  }),
});

function readLocalStamp(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeLocalStamp(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Private mode must not crash the speak screen.
  }
}

export const VERSION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
