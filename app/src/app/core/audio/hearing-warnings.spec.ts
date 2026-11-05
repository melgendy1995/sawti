import { type PlaybackFacts, warningsForPlayback } from './hearing-warnings';

function facts(overrides: Partial<PlaybackFacts> = {}): PlaybackFacts {
  return {
    gestureSeen: true,
    contextState: 'running',
    resumePending: false,
    clipReady: true,
    startThrew: false,
    decodeFailures: 0,
    hearing: 'sound',
    ...overrides,
  };
}

describe('playback warnings', () => {
  it.each([
    ['confirmed sound with a running clip', facts(), []],
    ['no gesture yet on a suspended context', facts({ gestureSeen: false, contextState: 'suspended', hearing: 'unknown' }), ['confirm-hearing']],
    ['resume still in flight', facts({ contextState: 'suspended', resumePending: true }), []],
    ['caregiver has not said they hear sound', facts({ hearing: 'unknown' }), ['confirm-hearing']],
    ['caregiver hears nothing while the context is running', facts({ hearing: 'nothing' }), ['silent-switch']],
    ['tapped cell has no buffer', facts({ clipReady: false }), ['missing-clip']],
    ['a clip failed to decode', facts({ decodeFailures: 2 }), ['missing-clip']],
    ['start() threw', facts({ startThrew: true }), ['play-failed']],
    ['gesture left the context suspended', facts({ contextState: 'suspended' }), ['context-not-running']],
    ['context is missing after a gesture', facts({ contextState: 'missing', hearing: 'unknown' }), ['context-not-running', 'confirm-hearing']],
    ['muted confirmation plus a missing clip', facts({ clipReady: false, hearing: 'nothing' }), ['missing-clip', 'silent-switch']],
  ] as const)('%s', (_name, input, codes) => {
    const warnings = warningsForPlayback(input);

    expect(warnings.map((warning) => warning.code)).toEqual([...codes]);
    for (const warning of warnings) {
      expect(warning.arabic).toMatch(/[\u0600-\u06FF]/);
      expect(warning.english).toMatch(/[A-Za-z]/);
      expect(warning.alert).toBe(warning.code !== 'confirm-hearing');
    }
  });
});
