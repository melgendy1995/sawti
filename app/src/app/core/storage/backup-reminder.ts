import { InjectionToken } from '@angular/core';

export { SETTING_LAST_SUCCESSFUL_BACKUP } from '../settings/setting-keys';

/** Show the reminder when no successful export exists inside this window. */
export const BACKUP_REMINDER_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Clock for the reminder. Tests pass a fixed timestamp. */
export const BACKUP_NOW = new InjectionToken<() => number>('BACKUP_NOW', {
  providedIn: 'root',
  factory: () => () => Date.now(),
});

/**
 * True when `lastIso` is missing, not a parseable time, or at least 7 days
 * before `nowMs`. Equal to the boundary counts as due.
 */
export function isBackupReminderDue(lastIso: string | null | undefined, nowMs: number): boolean {
  if (lastIso == null || lastIso.length === 0) return true;
  const then = Date.parse(lastIso);
  if (Number.isNaN(then)) return true;
  return nowMs - then >= BACKUP_REMINDER_AFTER_MS;
}
