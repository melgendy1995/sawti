import { formatDiagnosticsReport, type DiagnosticsReportInput } from './diagnostics-report';

function report(overrides: Partial<DiagnosticsReportInput> = {}): string {
  return formatDiagnosticsReport({
    recordedAtIso: '2026-11-05T00:00:00.000Z',
    userAgent: 'TestAgent',
    sampleRate: 48000,
    contextState: 'running',
    audioSessionSupported: false,
    audioSessionType: null,
    baseLatencyMs: 5.2,
    outputLatencyMs: null,
    hearing: 'unknown',
    tapMs: [],
    ...overrides,
  });
}

describe('diagnostics report', () => {
  it('keeps tap order and leaves a short run incomplete', () => {
    const text = report({ tapMs: [5, 1, 9] });

    expect(text).toContain('timestamp: 2026-11-05T00:00:00.000Z');
    expect(text).toContain('userAgent: TestAgent');
    expect(text).toContain('sampleRate: 48000');
    expect(text).toContain('contextState: running');
    expect(text).toContain('audioSession: absent');
    expect(text).toContain('baseLatencyMs: 5.2');
    expect(text).toContain('outputLatencyMs: n/a');
    expect(text).toContain('p50Ms: 5');
    expect(text).toContain('p95Ms: 9');
    expect(text).toContain('budgetMs: 150');
    expect(text).toContain('verdict: incomplete');
    expect(text).toContain('1 5\n2 1\n3 9');
    expect(text).toContain('phone-camera check');
  });

  it('passes thirty taps at or under 150 ms and records playback session', () => {
    const text = report({
      tapMs: Array<number>(30).fill(12),
      audioSessionSupported: true,
      audioSessionType: 'playback',
      outputLatencyMs: 20,
      hearing: 'sound',
    });

    expect(text).toContain('audioSession: present type=playback');
    expect(text).toContain('outputLatencyMs: 20');
    expect(text).toContain('hearing: sound');
    expect(text).toContain('p95Ms: 12');
    expect(text).toContain('verdict: pass');
  });

  it('fails when the 29th ordered tap is slower than 150 ms', () => {
    const text = report({ tapMs: [...Array<number>(28).fill(10), 200, 220] });

    expect(text).toContain('p95Ms: 200');
    expect(text).toContain('verdict: fail');
    expect(text).toContain('30 220');
  });
});
