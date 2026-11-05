import { p50, p95 } from './percentile';

/** Plan §6 P0.4 / §5.8: in-browser pointerup → start() budget. Not ear latency. */
export const TAP_TO_START_BUDGET_MS = 150;

export const DIAGNOSTIC_TAP_COUNT = 30;

export type TapToStartVerdict = 'pass' | 'fail' | 'incomplete';

export interface DiagnosticsReportInput {
  recordedAtIso: string;
  userAgent: string;
  sampleRate: number | null;
  contextState: string;
  audioSessionSupported: boolean;
  audioSessionType: string | null;
  baseLatencyMs: number | null;
  outputLatencyMs: number | null;
  hearing: string;
  tapMs: readonly number[];
}

export function tapToStartVerdict(p95Ms: number | null, sampleCount: number): TapToStartVerdict {
  if (sampleCount < DIAGNOSTIC_TAP_COUNT || p95Ms === null) return 'incomplete';
  return p95Ms <= TAP_TO_START_BUDGET_MS ? 'pass' : 'fail';
}

export function formatReportNumber(value: number | null): string {
  if (value === null || Number.isNaN(value)) return 'n/a';
  return String(Math.round(value * 1000) / 1000);
}

/** Stable, copyable text. Tap lines stay in tap order; p50/p95 use nearest-rank. */
export function formatDiagnosticsReport(input: DiagnosticsReportInput): string {
  const median = p50(input.tapMs);
  const tail = p95(input.tapMs);
  const verdict = tapToStartVerdict(tail, input.tapMs.length);
  const session = input.audioSessionSupported
    ? `present type=${input.audioSessionType ?? 'n/a'}`
    : 'absent';
  const lines = [
    'Sawti P0.4 audio diagnostics',
    `timestamp: ${input.recordedAtIso}`,
    `userAgent: ${input.userAgent}`,
    `sampleRate: ${formatReportNumber(input.sampleRate)}`,
    `contextState: ${input.contextState}`,
    `audioSession: ${session}`,
    `baseLatencyMs: ${formatReportNumber(input.baseLatencyMs)}`,
    `outputLatencyMs: ${formatReportNumber(input.outputLatencyMs)}`,
    `hearing: ${input.hearing}`,
    `tapCount: ${input.tapMs.length}`,
    `p50Ms: ${formatReportNumber(median)}`,
    `p95Ms: ${formatReportNumber(tail)}`,
    `budgetMs: ${TAP_TO_START_BUDGET_MS}`,
    `verdict: ${verdict}`,
    'note: tap-to-start is pointerup to AudioBufferSourceNode.start(); ear latency is a separate phone-camera check',
    'tapsMs:',
    ...input.tapMs.map((ms, index) => `${index + 1} ${formatReportNumber(ms)}`),
  ];
  return lines.join('\n');
}
