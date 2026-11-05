import {
  formatSoakReport,
  summarizeVerify,
  type ChunkVerify,
  type SoakManifest,
  type SoakReportInput,
} from './soak-report';
import { chunkKey, makeChunk, makePlan } from './soak-chunks';

function verify(status: ChunkVerify['status'], key = 'chunk-0001'): ChunkVerify {
  return {
    key,
    expected: 'aa',
    actual: status === 'match' ? 'aa' : status === 'mismatch' ? 'bb' : null,
    status,
    error: status === 'error' ? 'boom' : null,
  };
}

const manifest: SoakManifest = {
  backend: 'idb',
  writtenAtIso: '2026-11-05T00:00:00.000Z',
  chunkBytes: 1024,
  totalBytes: 2048,
  chunks: [
    { key: 'chunk-0000', bytes: 1024, hash: 'h0' },
    { key: 'chunk-0001', bytes: 1024, hash: 'h1' },
  ],
  quotaError: null,
};

function input(overrides: Partial<SoakReportInput> = {}): SoakReportInput {
  return {
    recordedAtIso: '2026-11-05T12:00:00.000Z',
    userAgent: 'TestAgent',
    displayModeStandalone: true,
    navigatorStandalone: true,
    persistRequested: true,
    persistGranted: true,
    persisted: true,
    estimateUsage: 2048,
    estimateQuota: 200000,
    backend: 'idb',
    manifest,
    hashOfHashes: 'deadbeef',
    verify: null,
    verifyResults: [],
    errors: [],
    ...overrides,
  };
}

describe('summarizeVerify', () => {
  it('counts each status and only passes when every chunk matched', () => {
    const summary = summarizeVerify([verify('match'), verify('match', 'chunk-0002')]);
    expect(summary).toEqual({
      total: 2,
      matched: 2,
      mismatched: 0,
      missing: 0,
      errored: 0,
      allMatch: true,
    });
  });

  it('does not pass a mix, and never passes an empty run', () => {
    const mixed = summarizeVerify([verify('match'), verify('mismatch'), verify('missing'), verify('error')]);
    expect(mixed.matched).toBe(1);
    expect(mixed.mismatched).toBe(1);
    expect(mixed.missing).toBe(1);
    expect(mixed.errored).toBe(1);
    expect(mixed.allMatch).toBe(false);
    expect(summarizeVerify([]).allMatch).toBe(false);
  });
});

describe('formatSoakReport', () => {
  it('includes environment, persist, estimate, and manifest facts', () => {
    const text = formatSoakReport(input());
    expect(text).toContain('timestamp: 2026-11-05T12:00:00.000Z');
    expect(text).toContain('userAgent: TestAgent');
    expect(text).toContain('displayMode.standalone: true');
    expect(text).toContain('navigator.standalone: true');
    expect(text).toContain('persist.granted: true');
    expect(text).toContain('estimate.usageBytes: 2048');
    expect(text).toContain('estimate.quotaBytes: 200000');
    expect(text).toContain('backend: idb');
    expect(text).toContain('manifest.chunkCount: 2');
    expect(text).toContain('hashOfHashes: deadbeef');
    expect(text).toContain('verify: not run');
    expect(text).toContain('badChunks: none');
    expect(text).toContain('errors: none');
  });

  it('renders n/a for unknown persist/estimate and lists bad chunks and errors', () => {
    const results = [verify('match'), verify('mismatch', 'chunk-0007')];
    const text = formatSoakReport(
      input({
        navigatorStandalone: null,
        persistGranted: null,
        persisted: null,
        estimateUsage: null,
        estimateQuota: null,
        verify: summarizeVerify(results),
        verifyResults: results,
        errors: ['QuotaExceededError: full'],
      }),
    );
    expect(text).toContain('navigator.standalone: n/a');
    expect(text).toContain('persist.granted: n/a');
    expect(text).toContain('estimate.usageBytes: n/a');
    expect(text).toContain('verify.allMatch: false');
    expect(text).toContain('badChunks: chunk-0007');
    expect(text).toContain('errors: QuotaExceededError: full');
  });
});

describe('soak chunks', () => {
  it('is deterministic per index and pads keys to numeric order', () => {
    expect(chunkKey(0)).toBe('chunk-0000');
    expect(chunkKey(12)).toBe('chunk-0012');
    expect([chunkKey(2), chunkKey(10)].sort()).toEqual(['chunk-0002', 'chunk-0010']);

    const first = makeChunk(3, 256);
    expect(first).toEqual(makeChunk(3, 256));
    expect(first).not.toEqual(makeChunk(4, 256));
    expect(first.byteLength).toBe(256);
  });

  it('rejects a non-positive plan', () => {
    expect(() => makePlan(0, 10)).toThrow(RangeError);
    expect(() => makePlan(10, 0)).toThrow(RangeError);
    expect(makePlan(20, 1024)).toEqual({ chunkCount: 20, chunkBytes: 1024, totalBytes: 20480 });
  });
});
