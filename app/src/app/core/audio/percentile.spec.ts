import { p50, p95, percentile } from './percentile';

describe('nearest-rank percentile', () => {
  it('returns null for an empty run instead of a fake zero', () => {
    expect(percentile([], 95)).toBeNull();
    expect(p50([])).toBeNull();
    expect(p95([])).toBeNull();
  });

  it('rejects a rank outside (0, 100]', () => {
    expect(() => percentile([1], 0)).toThrow(RangeError);
    expect(() => percentile([1], 101)).toThrow(RangeError);
  });

  it('uses the ordered sample at ceil(percent * n), not tap order', () => {
    expect(p50([5, 1, 9])).toBe(5);
    expect(p95([5, 1, 9])).toBe(9);
  });

  it('takes p95 of 30 taps from the 29th ordered sample', () => {
    const samples = [...Array<number>(28).fill(10), 400, 500];
    expect(p50(samples)).toBe(10);
    expect(p95(samples)).toBe(400);
  });
});
