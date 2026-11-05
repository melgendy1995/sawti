/**
 * Caregiver gate timing (P1.10, plan §5.3).
 *
 * The gate opens only after a pointer stays on the dedicated target for
 * `CAREGIVER_HOLD_MS` (1.2 s). A normal tap, and the cell-pointer path, are
 * much shorter (`ACCESS_TIMING.holdMs` defaults to 0). Releasing early or
 * leaving the target cancels the hold.
 *
 * Once unlocked, the session stays open until the caregiver locks it, or the
 * tab stays hidden for `CAREGIVER_HIDE_LOCK_MS` (60 s). Unlock is memory only:
 * a reload starts locked.
 */
export const CAREGIVER_HOLD_MS = 1200;

export const CAREGIVER_HIDE_LOCK_MS = 60_000;

/** Digits only. Chosen by the caregiver the first time the dialog is used. */
export const CAREGIVER_PIN_MIN = 4;
export const CAREGIVER_PIN_MAX = 8;
