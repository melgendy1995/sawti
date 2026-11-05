import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { applyAccessTiming, type AccessTiming } from '../../core/access/pointer-filter';
import { CaregiverGate } from '../../core/access/caregiver-gate';
import { AppSettings, type SpeakModeSetting } from '../../core/settings/app-settings';
import { ProfileDirectory } from '../../core/settings/profile-directory';
import type { ProfileGender } from '../../core/settings/setting-keys';
import { BACKUP_NOW, isBackupReminderDue } from '../../core/storage/backup-reminder';

/**
 * Caregiver preferences. Grid size is a preferred default for a later reader.
 * It does not change the current board document.
 */
@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class SettingsPage {
  private readonly settings = inject(AppSettings);
  private readonly profiles = inject(ProfileDirectory);
  private readonly gate = inject(CaregiverGate);
  private readonly router = inject(Router);
  private readonly now = inject(BACKUP_NOW);

  protected readonly gender = signal<ProfileGender>('m');
  protected readonly rows = signal(4);
  protected readonly cols = signal(5);
  protected readonly speakMode = signal<SpeakModeSetting>('tap');
  protected readonly holdMs = signal(0);
  protected readonly debounceMs = signal(0);
  protected readonly activation = signal<AccessTiming['activation']>('release');
  protected readonly status = signal('');
  protected readonly backupReminder = signal(false);

  constructor() {
    void this.load();
  }

  protected lock(): void {
    this.gate.lock();
    void this.router.navigateByUrl('/speak');
  }

  protected setGender(value: ProfileGender): void {
    this.gender.set(value);
  }

  protected setSpeakMode(value: SpeakModeSetting): void {
    this.speakMode.set(value);
  }

  protected onActivation(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const value = event.target.value;
    if (value === 'press' || value === 'release') this.activation.set(value);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.save();
  }

  protected onRows(event: Event): void {
    this.rows.set(readCount(event, this.rows()));
  }

  protected onCols(event: Event): void {
    this.cols.set(readCount(event, this.cols()));
  }

  protected onHold(event: Event): void {
    this.holdMs.set(readDelay(event, this.holdMs()));
  }

  protected onDebounce(event: Event): void {
    this.debounceMs.set(readDelay(event, this.debounceMs()));
  }

  protected async save(): Promise<void> {
    const timing: AccessTiming = {
      holdMs: this.holdMs(),
      debounceMs: this.debounceMs(),
      activation: this.activation(),
    };
    const grid = { rows: this.rows(), cols: this.cols() };
    try {
      await this.saveGender();
      await this.settings.writeGridSize(grid);
      await this.settings.writeSpeakMode(this.speakMode());
      await this.settings.writeAccessTiming(timing);
      applyAccessTiming(timing);
      this.status.set('تم الحفظ');
    } catch {
      this.status.set('تعذر الحفظ');
    }
  }

  private async load(): Promise<void> {
    try {
      const [mode, grid, timing, activeId, listed] = await Promise.all([
        this.settings.readSpeakMode(),
        this.settings.readGridSize(),
        this.settings.readAccessTiming(),
        this.settings.readActiveProfileId(),
        this.profiles.list(),
      ]);
      if (mode) this.speakMode.set(mode);
      if (grid) {
        this.rows.set(grid.rows);
        this.cols.set(grid.cols);
      }
      if (timing) {
        this.holdMs.set(timing.holdMs);
        this.debounceMs.set(timing.debounceMs);
        this.activation.set(timing.activation);
      }
      const active = listed.find((row) => row.id === activeId);
      const gender = active ? this.profiles.genderOf(active) : null;
      if (gender) this.gender.set(gender);
      const lastBackup = await this.settings.readLastSuccessfulBackupAt();
      this.backupReminder.set(isBackupReminderDue(lastBackup, this.now()));
    } catch {
      this.status.set('تعذر القراءة');
    }
  }

  private async saveGender(): Promise<void> {
    const activeId = await this.settings.readActiveProfileId();
    const listed = await this.profiles.list();
    const active = listed.find((row) => row.id === activeId);
    if (!active) {
      const created = await this.profiles.create('تجربة', this.gender());
      await this.profiles.activate(created.id);
      return;
    }
    await this.profiles.setGender(active.id, this.gender());
  }
}

function readCount(event: Event, fallback: number): number {
  const raw = event.target instanceof HTMLInputElement ? Number(event.target.value) : Number.NaN;
  if (!Number.isInteger(raw) || raw < 1 || raw > 12) return fallback;
  return raw;
}

function readDelay(event: Event, fallback: number): number {
  const raw = event.target instanceof HTMLInputElement ? Number(event.target.value) : Number.NaN;
  if (!Number.isFinite(raw) || raw < 0) return fallback;
  return raw;
}
