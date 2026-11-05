// The soak manifest, verify summary, and the copyable report text for P0.6.
// Mahmoud pastes the report into ADR-02 after each device run. Pure functions
// so the report shape is unit-tested without touching IndexedDB or OPFS.

import type { MediaBackend } from './media-store';

/** One chunk's identity, written once and kept across reloads/reboots. */
export interface ChunkRecord {
  key: string;
  bytes: number;
  hash: string;
}

/**
 * What a soak write produced, stored alongside the blobs so a later session
 * (after reboot, after 14 days) can verify without rewriting. This is the
 * "stored hashes" the plan requires.
 */
export interface SoakManifest {
  backend: MediaBackend;
  writtenAtIso: string;
  chunkBytes: number;
  totalBytes: number;
  chunks: ChunkRecord[];
  /** Non-null when the write stopped early on QuotaExceededError. */
  quotaError: string | null;
}

/** Per-chunk verify outcome: re-read, re-hash, compare to the stored hash. */
export interface ChunkVerify {
  key: string;
  expected: string;
  actual: string | null;
  status: 'match' | 'mismatch' | 'missing' | 'error';
  error: string | null;
}

/** Roll-up of a verify pass. */
export interface VerifySummary {
  total: number;
  matched: number;
  mismatched: number;
  missing: number;
  errored: number;
  allMatch: boolean;
}

export function summarizeVerify(results: readonly ChunkVerify[]): VerifySummary {
  let matched = 0;
  let mismatched = 0;
  let missing = 0;
  let errored = 0;
  for (const result of results) {
    if (result.status === 'match') matched++;
    else if (result.status === 'mismatch') mismatched++;
    else if (result.status === 'missing') missing++;
    else errored++;
  }
  const total = results.length;
  return {
    total,
    matched,
    mismatched,
    missing,
    errored,
    // A zero-chunk pass is not a success: there is nothing to prove integrity.
    allMatch: total > 0 && matched === total,
  };
}

/** Environment + results gathered on device for one copyable report. */
export interface SoakReportInput {
  recordedAtIso: string;
  userAgent: string;
  /** From matchMedia('(display-mode: standalone)'). */
  displayModeStandalone: boolean;
  /** From navigator.standalone (iOS Safari home-screen flag), when present. */
  navigatorStandalone: boolean | null;
  persistRequested: boolean;
  persistGranted: boolean | null;
  persisted: boolean | null;
  estimateUsage: number | null;
  estimateQuota: number | null;
  backend: MediaBackend;
  manifest: SoakManifest | null;
  hashOfHashes: string | null;
  verify: VerifySummary | null;
  verifyResults: readonly ChunkVerify[];
  errors: readonly string[];
}

function num(value: number | null): string {
  return value === null || Number.isNaN(value) ? 'n/a' : String(value);
}

function tri(value: boolean | null): string {
  return value === null ? 'n/a' : String(value);
}

/**
 * Stable, LTR-safe text. Per-chunk hashes are summarised by hashOfHashes; a
 * mismatch or error lists the offending chunk keys so a device run stays
 * legible even at 20+ chunks.
 */
export function formatSoakReport(input: SoakReportInput): string {
  const manifest = input.manifest;
  const bad = input.verifyResults.filter((result) => result.status !== 'match');
  const lines = [
    'Sawti P0.6 storage soak',
    `timestamp: ${input.recordedAtIso}`,
    `userAgent: ${input.userAgent}`,
    `displayMode.standalone: ${input.displayModeStandalone}`,
    `navigator.standalone: ${tri(input.navigatorStandalone)}`,
    `persist.requested: ${input.persistRequested}`,
    `persist.granted: ${tri(input.persistGranted)}`,
    `persisted: ${tri(input.persisted)}`,
    `estimate.usageBytes: ${num(input.estimateUsage)}`,
    `estimate.quotaBytes: ${num(input.estimateQuota)}`,
    `backend: ${input.backend}`,
    `manifest.writtenAt: ${manifest?.writtenAtIso ?? 'n/a'}`,
    `manifest.chunkCount: ${manifest ? manifest.chunks.length : 0}`,
    `manifest.chunkBytes: ${manifest ? manifest.chunkBytes : 0}`,
    `manifest.totalBytes: ${manifest ? manifest.totalBytes : 0}`,
    `manifest.quotaError: ${manifest?.quotaError ?? 'none'}`,
    `hashOfHashes: ${input.hashOfHashes ?? 'n/a'}`,
  ];
  if (input.verify) {
    lines.push(
      `verify.total: ${input.verify.total}`,
      `verify.matched: ${input.verify.matched}`,
      `verify.mismatched: ${input.verify.mismatched}`,
      `verify.missing: ${input.verify.missing}`,
      `verify.errored: ${input.verify.errored}`,
      `verify.allMatch: ${input.verify.allMatch}`,
    );
  } else {
    lines.push('verify: not run');
  }
  lines.push(`badChunks: ${bad.length === 0 ? 'none' : bad.map((result) => result.key).join(',')}`);
  lines.push(`errors: ${input.errors.length === 0 ? 'none' : input.errors.join(' | ')}`);
  return lines.join('\n');
}
