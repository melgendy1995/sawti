import { Injectable, inject, signal } from '@angular/core';
import { showBlockingNotice } from './notice-host';
import { httpsUrl, parseVersionDocument, type VersionDocument } from './version-document';
import {
  APP_VERSION_CODE,
  VERSION_CHECK_INTERVAL_MS,
  VERSION_CHECK_STAMP_KEY,
  VERSION_JSON_URL,
  VERSION_STAMP_STORE,
} from './version.tokens';

export type VersionCheckStatus =
  | 'ok'
  | 'update-available'
  | 'update-required'
  | 'skipped'
  | 'unavailable';

export interface VersionCheckResult {
  status: VersionCheckStatus;
  document: VersionDocument | null;
  updateRequired: boolean;
  updateAvailable: boolean;
}

const UPDATE_REQUIRED_ARABIC =
  'يلزم تحديث التطبيق. هذا الإصدار لم يعد مدعوماً لأسباب أمان أو بيانات.';

@Injectable({ providedIn: 'root' })
export class VersionCheck {
  private readonly url = inject(VERSION_JSON_URL);
  private readonly appVersionCode = inject(APP_VERSION_CODE);
  private readonly stamps = inject(VERSION_STAMP_STORE);

  readonly updateRequired = signal(false);
  readonly updateAvailable = signal(false);
  /** Arabic blocking reason. Null when this build is still supported. */
  readonly blockReason = signal<string | null>(null);
  readonly document = signal<VersionDocument | null>(null);

  /**
   * Reads version.json unless the last successful parse was under 24 hours ago.
   * `now` is injectable so tests do not need fake timers. Never throws.
   */
  async check(now = Date.now()): Promise<VersionCheckResult> {
    try {
      return await this.checkOnce(now);
    } catch {
      return this.publish(unavailable());
    }
  }

  private async checkOnce(now: number): Promise<VersionCheckResult> {
    const stamp = this.readStamp();
    if (stamp !== null && now - stamp < VERSION_CHECK_INTERVAL_MS) {
      // A skipped check must not clear a block that an earlier parse already raised.
      return skipped();
    }

    let response: Response;
    try {
      response = await fetch(this.url, { cache: 'no-store' });
    } catch {
      return this.publish(unavailable());
    }
    if (!response.ok) {
      return this.publish(unavailable());
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return this.publish(unavailable());
    }

    const document = parseVersionDocument(body);
    if (document === null) {
      return this.publish(unavailable());
    }

    this.writeStamp(now);
    return this.publish(this.decide(document));
  }

  private readStamp(): number | null {
    try {
      const raw = this.stamps.getItem(VERSION_CHECK_STAMP_KEY);
      if (raw === null) {
        return null;
      }
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }

  private writeStamp(now: number): void {
    try {
      this.stamps.setItem(VERSION_CHECK_STAMP_KEY, String(now));
    } catch {
      // A store that refuses writes must not crash the speak screen.
    }
  }

  private decide(document: VersionDocument): VersionCheckResult {
    const updateRequired = document.minSupportedVersionCode > this.appVersionCode;
    const updateAvailable = document.latestVersionCode > this.appVersionCode;
    let status: VersionCheckStatus = 'ok';
    if (updateRequired) {
      status = 'update-required';
    } else if (updateAvailable) {
      status = 'update-available';
    }
    return { status, document, updateRequired, updateAvailable };
  }

  private publish(result: VersionCheckResult): VersionCheckResult {
    this.document.set(result.document);
    this.updateRequired.set(result.updateRequired);
    this.updateAvailable.set(result.updateAvailable);
    this.blockReason.set(result.updateRequired ? UPDATE_REQUIRED_ARABIC : null);
    if (result.updateRequired && result.document !== null) {
      const href = httpsUrl(result.document.apkUrl) ?? undefined;
      showBlockingNotice({
        arabic: UPDATE_REQUIRED_ARABIC,
        actionLabel: 'فتح صفحة الإصدار',
        ...(href === undefined ? {} : { href }),
      });
    }
    return result;
  }
}

function unavailable(): VersionCheckResult {
  return { status: 'unavailable', document: null, updateRequired: false, updateAvailable: false };
}

function skipped(): VersionCheckResult {
  return { status: 'skipped', document: null, updateRequired: false, updateAvailable: false };
}
