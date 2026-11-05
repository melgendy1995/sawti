import { contextNeedsResume, readAudioSession, requestPlaybackSession } from './playback-session';

describe('playback audio session', () => {
  it('sets type playback when the browser exposes audioSession', () => {
    const session = { type: 'auto' };

    expect(requestPlaybackSession({ audioSession: session })).toEqual({
      supported: true,
      type: 'playback',
      applied: true,
    });
    expect(session.type).toBe('playback');
  });

  it('reports an absent audioSession instead of throwing', () => {
    expect(requestPlaybackSession({ audioSession: undefined })).toEqual({
      supported: false,
      type: null,
      applied: false,
    });
    expect(readAudioSession({ audioSession: undefined })).toEqual({ supported: false, type: null });
  });

  it('keeps the previous type when the browser refuses playback', () => {
    const session = {
      current: 'ambient',
      get type(): string {
        return this.current;
      },
      set type(_next: string) {
        throw new DOMException('refused', 'NotAllowedError');
      },
    };

    expect(requestPlaybackSession({ audioSession: session })).toEqual({
      supported: true,
      type: 'ambient',
      applied: false,
    });
  });

  it.each([
    ['suspended', true, true],
    ['suspended', false, false],
    ['running', true, false],
    ['closed', true, false],
  ] as const)('needs resume only for a visible suspended context (%s, visible=%s)', (state, visible, expected) => {
    expect(contextNeedsResume(state, visible)).toBe(expected);
  });
});
