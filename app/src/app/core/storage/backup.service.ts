import { Injectable, inject } from '@angular/core';

import { SAWTI_DB } from './db-token';
import {
  backupBlobsFromAppMedia,
  exportDatabase,
  inspectBackupContainer,
  openBackupBytes,
  previewBackup,
  restorePlainBackup,
  type BackupBlobStore,
  type BackupPreview,
  type OpenedBackup,
} from './backup-io';
import { selectWebMediaStore } from './select-web-media';

/** Caregiver backup facade. The page never imports Dexie. */
@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly db = inject(SAWTI_DB);
  private storePromise: Promise<BackupBlobStore> | null = null;

  async exportBytes(passphrase: string | null, now: Date): Promise<Uint8Array> {
    const blobs = await this.blobs();
    return exportDatabase(this.db, blobs, { passphrase, now });
  }

  inspect(bytes: Uint8Array): 'plain' | 'encrypted' {
    return inspectBackupContainer(bytes);
  }

  async open(bytes: Uint8Array, passphrase: string | null): Promise<OpenedBackup & BackupPreview> {
    const opened = await openBackupBytes(bytes, passphrase);
    return { ...opened, ...previewBackup(opened) };
  }

  async restore(opened: OpenedBackup): Promise<void> {
    const blobs = await this.blobs();
    await restorePlainBackup(this.db, blobs, opened.plain);
  }

  private blobs(): Promise<BackupBlobStore> {
    this.storePromise ??= selectWebMediaStore().then(backupBlobsFromAppMedia);
    return this.storePromise;
  }
}
