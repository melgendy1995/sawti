import { DOCUMENT } from '@angular/common';
import { Injectable, Injector, inject, signal } from '@angular/core';
import type { CaregiverPinRecord } from '../settings/setting-keys';
import { CAREGIVER_HIDE_LOCK_MS } from './caregiver-timing';
import { hashPin, hashesEqual, isNumericPin, newSaltHex } from './pin-hash';

interface PinStore {
  read(): Promise<CaregiverPinRecord | null>;
  write(record: CaregiverPinRecord): Promise<void>;
}

/**
 * In-memory caregiver session (P1.10).
 *
 * `unlocked` is not written to storage. A reload constructs a new service
 * and starts locked. Hiding the tab for {@link CAREGIVER_HIDE_LOCK_MS} locks
 * it again. The PIN dialog (`promptOpen`) is not the unlocked state.
 */
@Injectable({ providedIn: 'root' })
export class CaregiverGate {
  private readonly doc = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly promptOpenState = signal(false);
  private readonly unlockedState = signal(false);
  private readonly pinErrorState = signal<string | null>(null);
  private readonly pinModeState = signal<'verify' | 'create'>('verify');

  readonly promptOpen = this.promptOpenState.asReadonly();
  readonly unlocked = this.unlockedState.asReadonly();
  readonly pinError = this.pinErrorState.asReadonly();
  readonly pinMode = this.pinModeState.asReadonly();

  constructor() {
    this.doc.addEventListener('visibilitychange', () => {
      this.onVisibility();
    });
  }

  /** Opens the PIN dialog. Does not unlock. */
  openPrompt(): void {
    this.promptOpenState.set(true);
    this.pinErrorState.set(null);
    void this.refreshMode();
  }

  dismissPrompt(): void {
    this.promptOpenState.set(false);
    this.pinErrorState.set(null);
  }

  /**
   * Create mode stores salt + hash when `pin` and `confirm` match.
   * Verify mode unlocks only when the attempt hashes to the stored digest.
   * A rejection leaves the gate locked and the dialog open.
   */
  async submitPin(pin: string, confirm = ''): Promise<boolean> {
    if (!isNumericPin(pin)) {
      this.pinErrorState.set('أدخل رقماً من 4 إلى 8 أرقام');
      return false;
    }

    let store: PinStore;
    try {
      store = await this.store();
    } catch {
      this.pinErrorState.set('تعذر قراءة الرمز');
      return false;
    }

    let existing: CaregiverPinRecord | null;
    try {
      existing = await store.read();
    } catch {
      this.pinErrorState.set('تعذر قراءة الرمز');
      return false;
    }

    if (!existing) {
      this.pinModeState.set('create');
      if (pin !== confirm) {
        this.pinErrorState.set('الرمزان غير متطابقين');
        return false;
      }
      try {
        const salt = newSaltHex();
        await store.write({ salt, hash: await hashPin(pin, salt) });
      } catch {
        this.pinErrorState.set('تعذر حفظ الرمز');
        return false;
      }
      this.unlockSession();
      return true;
    }

    this.pinModeState.set('verify');
    const attempt = await hashPin(pin, existing.salt);
    if (!hashesEqual(attempt, existing.hash)) {
      this.pinErrorState.set('الرمز غير صحيح');
      return false;
    }
    this.unlockSession();
    return true;
  }

  /** Caregiver lock, and the hide-timeout lock. */
  lock(): void {
    this.clearHideTimer();
    this.unlockedState.set(false);
    this.promptOpenState.set(false);
    this.pinErrorState.set(null);
  }

  private unlockSession(): void {
    this.pinErrorState.set(null);
    this.promptOpenState.set(false);
    this.unlockedState.set(true);
  }

  private async refreshMode(): Promise<void> {
    try {
      const record = await (await this.store()).read();
      if (!this.promptOpenState()) return;
      this.pinModeState.set(record ? 'verify' : 'create');
    } catch {
      if (!this.promptOpenState()) return;
      this.pinModeState.set('verify');
      this.pinErrorState.set('تعذر قراءة الرمز');
    }
  }

  private async store(): Promise<PinStore> {
    const { CaregiverPinStore } = await import('./caregiver-pin-store');
    return this.injector.get(CaregiverPinStore);
  }

  private onVisibility(): void {
    if (this.doc.visibilityState === 'hidden') {
      if (!this.unlockedState() || this.hideTimer !== null) return;
      this.hideTimer = setTimeout(() => {
        this.hideTimer = null;
        this.lock();
      }, CAREGIVER_HIDE_LOCK_MS);
      return;
    }
    this.clearHideTimer();
  }

  private clearHideTimer(): void {
    if (this.hideTimer === null) return;
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }
}
