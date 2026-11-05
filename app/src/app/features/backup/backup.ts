import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, InjectionToken, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppSettings } from '../../core/settings/app-settings';
import { BackupService } from '../../core/storage/backup.service';
import { BACKUP_NOW, isBackupReminderDue } from '../../core/storage/backup-reminder';
import type { OpenedBackup } from '../../core/storage/backup-io';

export const SHARE_WARNING_EN =
  'This file contains your child\'s words, photos and family voices. Anyone who receives it can open it. Add a passphrase, or send it only to people you trust.';

export const SHARE_WARNING_AR =
  'هذا الملف فيه كلام طفلك وصوره وأصوات العائلة. أي شخص يصله الملف يستطيع فتحه. أضف كلمة سر، أو أرسله فقط لمن تثق به.';

export const PASSPHRASE_LOSS_AR =
  'إذا نسيت كلمة السر، لا يمكن فتح هذه النسخة. التطبيق لا يحفظ كلمة السر.';

export const PASSPHRASE_LOSS_EN =
  'If you lose this passphrase, the backup cannot be opened. Sawti does not store the passphrase.';

/** Builds an object URL and clicks a temporary anchor. Tests replace `BACKUP_DOWNLOAD`. */
export function downloadSawtiFile(doc: Document, bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  doc.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const BACKUP_DOWNLOAD = new InjectionToken<(bytes: Uint8Array, filename: string) => void>(
  'BACKUP_DOWNLOAD',
  {
    providedIn: 'root',
    factory: () => {
      const doc = inject(DOCUMENT);
      return (bytes: Uint8Array, filename: string) => downloadSawtiFile(doc, bytes, filename);
    },
  },
);

@Component({
  selector: 'app-backup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './backup.html',
  styleUrl: './backup.scss',
})
export class BackupPage {
  protected readonly shareWarningAr = SHARE_WARNING_AR;
  protected readonly shareWarningEn = SHARE_WARNING_EN;
  protected readonly passphraseLossAr = PASSPHRASE_LOSS_AR;
  protected readonly passphraseLossEn = PASSPHRASE_LOSS_EN;

  private readonly backups = inject(BackupService);
  private readonly settings = inject(AppSettings);
  private readonly now = inject(BACKUP_NOW);
  private readonly download = inject(BACKUP_DOWNLOAD);

  protected readonly encrypt = signal(false);
  protected readonly warningOpen = signal(false);
  protected readonly reminder = signal(false);
  protected readonly errorText = signal('');
  protected readonly status = signal('');
  protected readonly busy = signal(false);
  protected readonly importKind = signal<'plain' | 'encrypted' | null>(null);
  protected readonly preview = signal<{
    encrypted: boolean;
    profileNames: string[];
    boardCount: number;
    mediaCount: number;
  } | null>(null);

  /** Resolves after the reminder has been read. Tests wait on this. */
  readonly whenReady: Promise<void>;

  private passphrase = '';
  private importPassphrase = '';
  private pendingBytes: Uint8Array | null = null;
  private importFile: Uint8Array | null = null;
  private opened: OpenedBackup | null = null;

  constructor() {
    this.whenReady = this.loadReminder();
  }

  protected onEncrypt(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.encrypt.set(event.target.checked);
    if (!event.target.checked) this.passphrase = '';
  }

  protected onPassphrase(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.passphrase = event.target.value;
  }

  protected onImportPassphrase(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.importPassphrase = event.target.value;
  }

  protected requestExport(): void {
    this.errorText.set('');
    if (this.encrypt() && this.passphrase.length === 0) {
      this.errorText.set('اكتب كلمة السر قبل التصدير. Enter a passphrase before export.');
      return;
    }
    void this.prepareExport();
  }

  protected cancelShare(): void {
    this.warningOpen.set(false);
    this.pendingBytes = null;
  }

  protected acknowledgeShare(): void {
    const bytes = this.pendingBytes;
    if (bytes === null) return;
    const filename = sawtiFilename(this.now());
    this.download(bytes, filename);
    this.pendingBytes = null;
    this.warningOpen.set(false);
    void this.markExported();
  }

  protected onFile(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    this.preview.set(null);
    this.opened = null;
    this.importKind.set(null);
    this.importFile = null;
    this.errorText.set('');
    if (!file) return;
    void this.readImport(file);
  }

  protected loadPreview(): void {
    const bytes = this.importFile;
    if (bytes === null) return;
    void this.openImport(bytes);
  }

  protected confirmImport(): void {
    const opened = this.opened;
    if (opened === null || this.busy()) return;
    void this.runRestore(opened);
  }

  private async prepareExport(): Promise<void> {
    this.busy.set(true);
    try {
      const passphrase = this.encrypt() ? this.passphrase : null;
      this.pendingBytes = await this.backups.exportBytes(passphrase, new Date(this.now()));
      this.warningOpen.set(true);
    } catch (error) {
      this.pendingBytes = null;
      this.errorText.set(messageOf(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async markExported(): Promise<void> {
    try {
      await this.settings.writeLastSuccessfulBackupAt(new Date(this.now()).toISOString());
      this.reminder.set(false);
      this.status.set('تم تنزيل النسخة.');
    } catch (error) {
      this.errorText.set(messageOf(error));
    }
  }

  private async readImport(file: File): Promise<void> {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      this.importFile = bytes;
      const kind = this.backups.inspect(bytes);
      this.importKind.set(kind);
      if (kind === 'plain') await this.openImport(bytes);
    } catch (error) {
      this.errorText.set(messageOf(error));
    }
  }

  private async openImport(bytes: Uint8Array): Promise<void> {
    this.busy.set(true);
    try {
      const passphrase = this.importKind() === 'encrypted' ? this.importPassphrase : null;
      const opened = await this.backups.open(bytes, passphrase);
      this.opened = opened;
      this.preview.set({
        encrypted: opened.encrypted,
        profileNames: opened.profileNames,
        boardCount: opened.boardCount,
        mediaCount: opened.mediaCount,
      });
      this.errorText.set('');
    } catch (error) {
      this.opened = null;
      this.preview.set(null);
      this.errorText.set(messageOf(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async runRestore(opened: OpenedBackup): Promise<void> {
    this.busy.set(true);
    try {
      await this.backups.restore(opened);
      this.status.set('تم استيراد النسخة.');
      await this.loadReminder();
    } catch (error) {
      this.errorText.set(messageOf(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async loadReminder(): Promise<void> {
    try {
      const last = await this.settings.readLastSuccessfulBackupAt();
      this.reminder.set(isBackupReminderDue(last, this.now()));
    } catch {
      this.reminder.set(true);
    }
  }
}

function sawtiFilename(nowMs: number): string {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  return `sawti-${day}.sawti`;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  return 'تعذر إكمال العملية. The backup could not be completed.';
}
