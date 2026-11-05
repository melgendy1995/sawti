import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SwUpdate, type VersionReadyEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { clearBlockingNotice } from './notice-host';
import { APP_RELOAD } from './reload';
import { isSpeakUrl } from './speak-route';
import { UpdateService } from './update.service';
import { VersionCheck } from './version-check';
import { parseVersionDocument } from './version-document';
import {
  APP_VERSION_CODE,
  VERSION_CHECK_INTERVAL_MS,
  VERSION_CHECK_STAMP_KEY,
  VERSION_JSON_URL,
  VERSION_STAMP_STORE,
  type VersionStampStore,
} from './version.tokens';

function memoryStamps(): VersionStampStore & { snapshot(): string | null } {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    snapshot: () => entries.get(VERSION_CHECK_STAMP_KEY) ?? null,
  };
}

@Component({
  selector: 'app-update-spec-blank',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Blank {}

const READY: VersionReadyEvent = {
  type: 'VERSION_READY',
  currentVersion: { hash: 'current' },
  latestVersion: { hash: 'next' },
};

const VALID_DOC = {
  latestVersion: '1.2.0',
  latestVersionCode: 12,
  minSupportedVersionCode: 8,
  apkUrl: 'https://github.com/melgendy1995/sawti/releases',
  certSha256: 'abc',
  releasedAt: '2026-04-01T00:00:00Z',
};

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('isSpeakUrl', () => {
  it('treats the speak route and the empty redirect as the speak screen', () => {
    expect(isSpeakUrl('')).toBe(true);
    expect(isSpeakUrl('/')).toBe(true);
    expect(isSpeakUrl('/speak')).toBe(true);
    expect(isSpeakUrl('/speak/')).toBe(true);
    expect(isSpeakUrl('/speak?board=home')).toBe(true);
    expect(isSpeakUrl(null)).toBe(true);
  });

  it('does not treat other routes as the speak screen', () => {
    expect(isSpeakUrl('/voice')).toBe(false);
    expect(isSpeakUrl('/storage')).toBe(false);
    expect(isSpeakUrl('/audio/diagnostics')).toBe(false);
  });
});

describe('UpdateService', () => {
  const versionUpdates = new Subject<VersionReadyEvent>();
  const unrecoverable = new Subject<{ type: 'UNRECOVERABLE_STATE'; reason: string }>();
  const reload = vi.fn();
  const sw = {
    isEnabled: true,
    versionUpdates: versionUpdates.asObservable(),
    unrecoverable: unrecoverable.asObservable(),
    checkForUpdate: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
    activateUpdate: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  };

  beforeEach(async () => {
    reload.mockReset();
    sw.isEnabled = true;
    sw.checkForUpdate.mockReset();
    sw.checkForUpdate.mockResolvedValue(false);
    sw.activateUpdate.mockReset();
    sw.activateUpdate.mockResolvedValue(true);
    clearBlockingNotice();

    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'speak', component: Blank },
          { path: 'voice', component: Blank },
          { path: '', pathMatch: 'full', redirectTo: 'speak' },
        ]),
        { provide: SwUpdate, useValue: sw },
        { provide: APP_RELOAD, useValue: reload },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    clearBlockingNotice();
    TestBed.resetTestingModule();
  });

  async function open(url: string): Promise<{ updates: UpdateService; router: Router }> {
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    return { updates: TestBed.inject(UpdateService), router };
  }

  it('does not activate or reload when a version becomes ready on the speak screen', async () => {
    const { updates } = await open('/speak');
    await updates.checkOnLaunch();

    versionUpdates.next(READY);

    expect(sw.activateUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(updates.updateAvailable()).toBe(true);
  });

  it('does not reload a waiting update during launch while the url is /speak', async () => {
    const { updates } = await open('/speak');
    sw.checkForUpdate.mockResolvedValue(true);

    await updates.checkOnLaunch();

    expect(sw.activateUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(updates.updateAvailable()).toBe(true);
  });

  it('does not reload when the empty redirect has landed on speak', async () => {
    const { updates, router } = await open('/');
    expect(router.url).toBe('/speak');
    sw.checkForUpdate.mockResolvedValue(true);

    await updates.checkOnLaunch();

    expect(reload).not.toHaveBeenCalled();
  });

  it('activates a waiting update once during launch when the url is not speak', async () => {
    const { updates } = await open('/voice');
    sw.checkForUpdate.mockResolvedValue(true);

    await updates.checkOnLaunch();

    expect(sw.activateUpdate).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload a version that arrives after launch, even off the speak screen', async () => {
    const { updates } = await open('/voice');
    await updates.checkOnLaunch();

    versionUpdates.next(READY);

    expect(sw.activateUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(updates.updateAvailable()).toBe(true);
  });

  it('applyNow activates and reloads even on the speak screen', async () => {
    const { updates } = await open('/speak');
    await updates.checkOnLaunch();

    await updates.applyNow();

    expect(sw.activateUpdate).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows an Arabic unrecoverable notice and reloads only from that action', async () => {
    const { updates } = await open('/speak');
    await updates.checkOnLaunch();

    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'missing chunk' });

    expect(updates.unrecoverableMessage()).toContain('تعذّر');
    expect(reload).not.toHaveBeenCalled();
    const notice = document.getElementById('sawti-update-notice');
    expect(notice?.textContent).toContain('تعذّر');
    notice?.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('VersionCheck', () => {
  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();
  let stamps: ReturnType<typeof memoryStamps>;

  beforeEach(() => {
    stamps = memoryStamps();
    clearBlockingNotice();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    clearBlockingNotice();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  function configure(appVersionCode = 8): VersionCheck {
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_VERSION_CODE, useValue: appVersionCode },
        { provide: VERSION_JSON_URL, useValue: '/version.json' },
        { provide: VERSION_STAMP_STORE, useValue: stamps },
      ],
    });
    return TestBed.inject(VersionCheck);
  }

  it('fetches with cache no-store and skips another check inside 24 hours', async () => {
    fetchMock.mockResolvedValue(jsonResponse(VALID_DOC));
    const versions = configure();
    const now = 1_700_000_000_000;

    const first = await versions.check(now);
    const second = await versions.check(now + VERSION_CHECK_INTERVAL_MS - 1);

    expect(first.status).toBe('update-available');
    expect(first.updateAvailable).toBe(true);
    expect(first.updateRequired).toBe(false);
    expect(second.status).toBe('skipped');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });
    expect(stamps.snapshot()).toBe(String(now));
  });

  it('checks again once the daily interval has elapsed', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...VALID_DOC, latestVersionCode: 8 }));
    const versions = configure();
    const now = 50_000;

    await versions.check(now);
    const again = await versions.check(now + VERSION_CHECK_INTERVAL_MS);

    expect(again.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not crash or stamp when version.json is missing or invalid', async () => {
    const versions = configure();
    fetchMock.mockResolvedValueOnce(jsonResponse(null, false));
    const missing = await versions.check(10);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new Error('not json')),
    } as Response);
    const invalid = await versions.check(20);
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const offline = await versions.check(30);

    expect(missing.status).toBe('unavailable');
    expect(invalid.status).toBe('unavailable');
    expect(offline.status).toBe('unavailable');
    expect(versions.updateRequired()).toBe(false);
    expect(versions.blockReason()).toBeNull();
    expect(stamps.snapshot()).toBeNull();
  });

  it('blocks when minSupportedVersionCode is newer than the running version code', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ...VALID_DOC,
        minSupportedVersionCode: 9,
        latestVersionCode: 12,
      }),
    );
    const versions = configure(8);

    const result = await versions.check(99);

    expect(result.status).toBe('update-required');
    expect(result.updateRequired).toBe(true);
    expect(versions.blockReason()).toContain('لم يعد مدعوماً');
    const notice = document.getElementById('sawti-update-notice');
    expect(notice?.textContent).toContain('يلزم تحديث');
    const link = notice?.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://github.com/melgendy1995/sawti/releases');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not block when the running version code equals minSupportedVersionCode', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ...VALID_DOC, minSupportedVersionCode: 8, latestVersionCode: 8 }),
    );
    const versions = configure(8);

    const result = await versions.check(99);

    expect(result.status).toBe('ok');
    expect(result.updateRequired).toBe(false);
    expect(document.getElementById('sawti-update-notice')).toBeNull();
  });

  it('parses the nested android plan shape', () => {
    const document = parseVersionDocument({
      android: {
        latestVersionCode: 12,
        latestVersionName: '1.1.2',
        minSupportedVersionCode: 8,
        apkUrl: 'https://github.com/melgendy1995/sawti/releases/download/v1.1.2/sawti.apk',
        signingCertSha256: 'deadbeef',
      },
      web: { latestVersion: '1.1.2' },
    });

    expect(document).toMatchObject({
      latestVersion: '1.1.2',
      latestVersionCode: 12,
      minSupportedVersionCode: 8,
      certSha256: 'deadbeef',
    });
  });
});
