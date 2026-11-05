import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { SwUpdate, type VersionEvent } from '@angular/service-worker';
import { showBlockingNotice } from './notice-host';
import { APP_RELOAD } from './reload';
import { isSpeakUrl } from './speak-route';

const UNRECOVERABLE_ARABIC =
  'تعذّر تشغيل هذه النسخة من التطبيق. أعد التحميل عندما لا يتكلم أحد.';

/**
 * PWA app-shell updates.
 *
 * Automatic activate+reload is forbidden while the router URL is the speak
 * screen. A waiting update may apply once during `checkOnLaunch()` only when
 * that URL is not speak. After launch, newly detected versions wait for
 * `applyNow()` (caregiver mode, P1.10).
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly sw = inject(SwUpdate);
  private readonly router = inject(Router);
  private readonly reload = inject(APP_RELOAD);
  private readonly destroyRef = inject(DestroyRef);

  /** A downloaded shell update is waiting. Caregiver mode calls `applyNow()`. */
  readonly updateAvailable = signal(false);

  /** Arabic copy while the service worker is unrecoverable. Null when healthy. */
  readonly unrecoverableMessage = signal<string | null>(null);

  private launchOpen = true;
  private applying = false;

  constructor() {
    if (!this.sw.isEnabled) {
      this.launchOpen = false;
      return;
    }
    this.sw.versionUpdates.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this.onVersion(event);
    });
    this.sw.unrecoverable.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.onUnrecoverable();
    });
  }

  /** Launch check. Applies a waiting update once, unless the URL is the speak screen. */
  async checkOnLaunch(): Promise<void> {
    if (!this.sw.isEnabled) {
      this.launchOpen = false;
      return;
    }
    try {
      const ready = await this.sw.checkForUpdate();
      if (ready) {
        await this.applyWaitingUpdate();
      }
    } catch {
      // A failed check must not block startup.
    } finally {
      this.launchOpen = false;
    }
  }

  /** Caregiver "Update now". Reloads even on the speak screen. */
  async applyNow(): Promise<void> {
    await this.activateAndReload();
  }

  /** The unrecoverable notice button. This is the only reload for that state. */
  reloadAfterUnrecoverable(): void {
    this.reload();
  }

  private onVersion(event: VersionEvent): void {
    if (event.type !== 'VERSION_READY') {
      return;
    }
    if (!this.launchOpen) {
      this.updateAvailable.set(true);
      return;
    }
    void this.applyWaitingUpdate();
  }

  private async applyWaitingUpdate(): Promise<void> {
    if (this.isOnSpeakScreen()) {
      this.updateAvailable.set(true);
      return;
    }
    await this.activateAndReload();
  }

  private isOnSpeakScreen(): boolean {
    return isSpeakUrl(this.router.url);
  }

  private async activateAndReload(): Promise<void> {
    if (this.applying) {
      return;
    }
    this.applying = true;
    try {
      if (this.sw.isEnabled) {
        await this.sw.activateUpdate();
      }
      this.reload();
    } catch {
      this.applying = false;
      this.updateAvailable.set(true);
    }
  }

  private onUnrecoverable(): void {
    this.unrecoverableMessage.set(UNRECOVERABLE_ARABIC);
    showBlockingNotice({
      arabic: UNRECOVERABLE_ARABIC,
      actionLabel: 'إعادة التحميل',
      onAction: () => {
        this.reloadAfterUnrecoverable();
      },
    });
  }
}
