/** Local shape for `navigator.audioSession` (iOS). No extra package. */
export interface WebAudioSession {
  type: string;
}

/** `Navigator` itself does not declare `audioSession` (iOS-only). Tests pass the second shape. */
export type AudioSessionHost = Navigator | { audioSession?: WebAudioSession };

export interface PlaybackSessionResult {
  supported: boolean;
  type: string | null;
  applied: boolean;
}

export interface AudioSessionReadout {
  supported: boolean;
  type: string | null;
}

/**
 * Ask the platform to keep playing while the hardware silent switch is on.
 * A missing API is normal on Android and desktop. A DOMException means the
 * browser exposed the object but refused the change — the caller still has
 * to show a warning rather than assume the switch is off.
 */
export function requestPlaybackSession(nav: AudioSessionHost): PlaybackSessionResult {
  const session = sessionOrNull(nav);
  if (!session) return { supported: false, type: null, applied: false };
  try {
    session.type = 'playback';
  } catch (error) {
    if (error instanceof DOMException) {
      return { supported: true, type: session.type, applied: false };
    }
    throw error;
  }
  return { supported: true, type: session.type, applied: session.type === 'playback' };
}

export function readAudioSession(nav: AudioSessionHost): AudioSessionReadout {
  const session = sessionOrNull(nav);
  if (!session) return { supported: false, type: null };
  return { supported: true, type: session.type };
}

/** Resume only when the page is visible and the context has been suspended. */
export function contextNeedsResume(state: string, pageVisible: boolean): boolean {
  return pageVisible && state === 'suspended';
}

function sessionOrNull(nav: AudioSessionHost): WebAudioSession | null {
  if (!('audioSession' in nav)) return null;
  const session = nav.audioSession;
  if (!session || typeof session.type !== 'string') return null;
  return session;
}
