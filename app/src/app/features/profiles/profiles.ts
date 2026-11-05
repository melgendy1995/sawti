import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppSettings } from '../../core/settings/app-settings';
import { ProfileDirectory } from '../../core/settings/profile-directory';
import type { ProfileGender } from '../../core/settings/setting-keys';
import type { ProfileRow } from '../../core/storage/rows';

/** Create, switch, and delete local profiles. Names stay on this device. */
@Component({
  selector: 'app-profiles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './profiles.html',
  styleUrl: './profiles.scss',
})
export class ProfilesPage {
  private readonly directory = inject(ProfileDirectory);
  private readonly settings = inject(AppSettings);

  protected readonly profiles = signal<readonly ProfileRow[]>([]);
  protected readonly activeId = signal<string | null>(null);
  protected readonly name = signal('');
  protected readonly gender = signal<ProfileGender>('m');
  protected readonly pendingDelete = signal<string | null>(null);
  protected readonly status = signal('');

  constructor() {
    void this.reload();
  }

  protected setGender(value: ProfileGender): void {
    this.gender.set(value);
  }

  protected onName(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.name.set(event.target.value);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.create();
  }

  protected async create(): Promise<void> {
    try {
      await this.directory.create(this.name(), this.gender());
      this.name.set('');
      this.status.set('تمت الإضافة');
      await this.reload();
    } catch {
      this.status.set('اكتب اسماً');
    }
  }

  protected async activate(id: string): Promise<void> {
    await this.directory.activate(id);
    await this.reload();
  }

  protected askDelete(id: string): void {
    this.pendingDelete.set(id);
  }

  protected async confirmDelete(id: string): Promise<void> {
    await this.directory.remove(id);
    this.pendingDelete.set(null);
    await this.reload();
  }

  private async reload(): Promise<void> {
    const [rows, active] = await Promise.all([
      this.directory.list(),
      this.settings.readActiveProfileId(),
    ]);
    this.profiles.set(rows);
    this.activeId.set(active);
  }
}
