export type HearingChoice = 'unknown' | 'sound' | 'nothing';

export type ContextReadout = 'running' | 'suspended' | 'closed' | 'missing';

export type WarningCode =
  | 'confirm-hearing'
  | 'silent-switch'
  | 'missing-clip'
  | 'play-failed'
  | 'context-not-running';

export interface PlaybackFacts {
  gestureSeen: boolean;
  contextState: ContextReadout;
  /** True while AudioContext.resume() has not settled. Suppresses a false alarm on the first tap. */
  resumePending: boolean;
  clipReady: boolean;
  startThrew: boolean;
  decodeFailures: number;
  hearing: HearingChoice;
}

export interface ShownWarning {
  code: WarningCode;
  /** Alert text is the Sev-0 path. The confirm hint stays visible until the caregiver says they hear sound. */
  alert: boolean;
  arabic: string;
  english: string;
}

const MISSING_CLIP: ShownWarning = {
  code: 'missing-clip',
  alert: true,
  arabic: 'لا يوجد صوت.',
  english: 'No voice available.',
};

const PLAY_FAILED: ShownWarning = {
  code: 'play-failed',
  alert: true,
  arabic: 'تعذّر تشغيل الصوت.',
  english: 'Playback failed.',
};

const NOT_RUNNING: ShownWarning = {
  code: 'context-not-running',
  alert: true,
  arabic: 'الصوت غير شغّال. المس الشاشة مرة أخرى.',
  english: 'Audio is not running. Tap the screen again.',
};

const SILENT_SWITCH: ShownWarning = {
  code: 'silent-switch',
  alert: true,
  arabic: 'لا يوجد صوت. تحقق من مفتاح الصامت في الآيفون.',
  english: 'No sound. Check the iPhone silent switch.',
};

const CONFIRM_HEARING: ShownWarning = {
  code: 'confirm-hearing',
  alert: false,
  arabic: 'هل تسمع الصوت؟ إن لم تسمع شيئاً فاختر «لا أسمع شيئاً».',
  english: 'Do you hear sound? If not, choose “I hear nothing”.',
};

/**
 * Every path that can produce silence returns at least one bilingual warning.
 * The only empty result is: caregiver confirmed sound, clip is ready, start()
 * did not throw, nothing failed to decode, and the context is running
 * (or a resume call is still in flight, or no gesture has happened yet).
 */
export function warningsForPlayback(facts: PlaybackFacts): ShownWarning[] {
  const warnings: ShownWarning[] = [];
  if (!facts.clipReady || facts.decodeFailures > 0) warnings.push(MISSING_CLIP);
  if (facts.startThrew) warnings.push(PLAY_FAILED);
  if (contextStalled(facts)) warnings.push(NOT_RUNNING);
  if (facts.hearing === 'nothing') warnings.push(SILENT_SWITCH);
  else if (facts.hearing !== 'sound') warnings.push(CONFIRM_HEARING);
  return warnings;
}

function contextStalled(facts: PlaybackFacts): boolean {
  return facts.gestureSeen && !facts.resumePending && facts.contextState !== 'running';
}
