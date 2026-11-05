/**
 * Nearest-rank percentile on a copy of the samples.
 * Rank is `ceil(percent/100 * n)` (1-based), so p95 of 30 taps is the 29th
 * ordered value: the smallest sample that covers at least 95% of the run.
 * Empty input returns null — a missing run is not a fake 0 ms.
 */
export function percentile(samples: readonly number[], rankPercent: number): number | null {
  if (samples.length === 0) return null;
  if (rankPercent <= 0 || rankPercent > 100) {
    throw new RangeError('rankPercent must be in (0, 100]');
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const rank = Math.ceil((rankPercent / 100) * sorted.length);
  return sorted[rank - 1];
}

export function p50(samples: readonly number[]): number | null {
  return percentile(samples, 50);
}

export function p95(samples: readonly number[]): number | null {
  return percentile(samples, 95);
}
