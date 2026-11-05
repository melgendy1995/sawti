import { InjectionToken } from '@angular/core';

/** How long a pointer must stay down, and how close two accepts may be. */
export interface AccessTiming {
  holdMs: number;
  debounceMs: number;
  /** `press` accepts when the hold elapses. `release` accepts on pointer-up after the hold. */
  activation: 'press' | 'release';
}

/** Defaults until the caregiver changes them (P1.10). A zero hold is a normal tap. */
export const DEFAULT_ACCESS_TIMING: AccessTiming = {
  holdMs: 0,
  debounceMs: 0,
  activation: 'release',
};

/**
 * Singleton the filter reads on each pointer event. Settings copy saved
 * caregiver values onto these fields. Do not replace the object.
 */
export const accessTimingLive: AccessTiming = {
  holdMs: DEFAULT_ACCESS_TIMING.holdMs,
  debounceMs: DEFAULT_ACCESS_TIMING.debounceMs,
  activation: DEFAULT_ACCESS_TIMING.activation,
};

export function applyAccessTiming(next: AccessTiming): void {
  accessTimingLive.holdMs = next.holdMs;
  accessTimingLive.debounceMs = next.debounceMs;
  accessTimingLive.activation = next.activation;
}

export const ACCESS_TIMING = new InjectionToken<AccessTiming>('ACCESS_TIMING', {
  providedIn: 'root',
  factory: () => accessTimingLive,
});

interface Press {
  cellId: string;
  downAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Hold delay and debounce for one pointer. Uses `Date.now` and `setTimeout`
 * so tests can drive it with fake timers. Nothing here is persisted.
 */
export class PointerAccessFilter {
  private press: Press | null = null;
  private lastAcceptAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly timing: AccessTiming,
    private readonly onAccept: (cellId: string) => void,
  ) {}

  pointerDown(cellId: string): void {
    this.dropPress();
    const press: Press = { cellId, downAt: Date.now(), timer: null };
    this.press = press;
    if (this.timing.activation !== 'press') return;
    press.timer = setTimeout(() => {
      if (this.press !== press) return;
      press.timer = null;
      this.tryAccept(press.cellId);
    }, this.timing.holdMs);
  }

  pointerUp(cellId: string): void {
    const press = this.press;
    if (!press || press.cellId !== cellId) {
      if (press) this.dropPress();
      return;
    }
    if (this.timing.activation === 'release') {
      const elapsed = Date.now() - press.downAt;
      this.press = null;
      if (elapsed >= this.timing.holdMs) this.tryAccept(cellId);
      return;
    }
    // Press mode already accepted from the timer, or the hold has not elapsed.
    this.dropPress();
  }

  pointerCancel(): void {
    this.dropPress();
  }

  private dropPress(): void {
    if (this.press?.timer != null) clearTimeout(this.press.timer);
    this.press = null;
  }

  private tryAccept(cellId: string): void {
    const now = Date.now();
    if (now - this.lastAcceptAt < this.timing.debounceMs) return;
    this.lastAcceptAt = now;
    this.onAccept(cellId);
  }
}
