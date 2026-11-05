import 'fake-indexeddb/auto';

import { TestBed } from '@angular/core/testing';
import { useGlobalIndexedDb } from '../../core/storage/use-global-indexeddb';

useGlobalIndexedDb();

import { provideRouter } from '@angular/router';
import { AppSettings } from '../../core/settings/app-settings';
import { BACKUP_REMINDER_AFTER_MS, BACKUP_NOW } from '../../core/storage/backup-reminder';
import { BackupService } from '../../core/storage/backup.service';
import { SAWTI_DB } from '../../core/storage/db-token';
import { SawtiDb } from '../../core/storage/sawti-db';
import { BACKUP_DOWNLOAD, BackupPage, SHARE_WARNING_EN } from './backup';

const NOW = Date.parse('2026-11-05T12:00:00.000Z');

describe('Backup page', () => {
  let db: SawtiDb;
  let download: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    db = new SawtiDb(`sawti-backup-ui-${crypto.randomUUID()}`);
    download = vi.fn();
  });

  afterEach(async () => {
    const name = db.name;
    db.close();
    await SawtiDb.delete(name);
  });

  async function setup(): Promise<{ fixture: ReturnType<typeof TestBed.createComponent<BackupPage>>; el: HTMLElement }> {
    await TestBed.configureTestingModule({
      imports: [BackupPage],
      providers: [
        provideRouter([]),
        { provide: SAWTI_DB, useValue: db },
        { provide: BACKUP_NOW, useValue: () => NOW },
        { provide: BACKUP_DOWNLOAD, useValue: download },
        { provide: BackupService, useValue: fakeBackups() },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(BackupPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('downloads only after the share warning is acknowledged', async () => {
    const { fixture, el } = await setup();
    const toggle = el.querySelector('[data-testid="encrypt-toggle"]');
    expect(toggle).toBeInstanceOf(HTMLInputElement);
    expect((toggle as HTMLInputElement).checked).toBe(false);

    click(el, 'export-button');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="share-warning"]')).not.toBeNull();
    expect(el.textContent).toContain(SHARE_WARNING_EN);
    expect(download).not.toHaveBeenCalled();

    click(el, 'share-ack');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(download).toHaveBeenCalledTimes(1);
    const filename = download.mock.calls[0]?.[1];
    expect(filename).toBe('sawti-2026-11-05.sawti');
  });

  it('shows the weekly reminder when the last backup is older than 7 days', async () => {
    await TestBed.configureTestingModule({
      imports: [BackupPage],
      providers: [
        provideRouter([]),
        { provide: SAWTI_DB, useValue: db },
        { provide: BACKUP_NOW, useValue: () => NOW },
        { provide: BACKUP_DOWNLOAD, useValue: download },
        { provide: BackupService, useValue: fakeBackups() },
      ],
    }).compileComponents();

    const settings = TestBed.inject(AppSettings);
    await settings.writeLastSuccessfulBackupAt(new Date(NOW - BACKUP_REMINDER_AFTER_MS - 1).toISOString());

    const due = TestBed.createComponent(BackupPage);
    await due.componentInstance.whenReady;
    due.detectChanges();
    expect(due.nativeElement.querySelector('[data-testid="backup-reminder"]')).not.toBeNull();
    due.destroy();

    await settings.writeLastSuccessfulBackupAt(new Date(NOW - 60_000).toISOString());
    const fresh = TestBed.createComponent(BackupPage);
    await fresh.componentInstance.whenReady;
    fresh.detectChanges();
    expect(fresh.nativeElement.querySelector('[data-testid="backup-reminder"]')).toBeNull();
  });
});

function fakeBackups(): Pick<BackupService, 'exportBytes' | 'inspect' | 'open' | 'restore'> {
  return {
    exportBytes: vi.fn(async () => Uint8Array.of(1, 2, 3)),
    inspect: vi.fn(() => 'plain' as const),
    open: vi.fn(),
    restore: vi.fn(),
  };
}

function click(root: ParentNode, testId: string): void {
  const node = root.querySelector(`[data-testid="${testId}"]`);
  if (!(node instanceof HTMLElement)) throw new Error(`missing ${testId}`);
  node.click();
}
