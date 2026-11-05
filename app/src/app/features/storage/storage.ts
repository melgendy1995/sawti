import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  IndexedDbMediaStore,
  OpfsMediaStore,
  chunkKey,
  defaultSoakPlan,
  errorText,
  formatSoakReport,
  hashOfHashes,
  makeChunk,
  selfTest,
  sha256Hex,
  summarizeVerify,
  type ChunkVerify,
  type MediaBackend,
  type MediaStore,
  type SoakManifest,
  type SoakReportInput,
  type VerifySummary,
} from '../../core/storage';

type Phase = 'idle' | 'writing' | 'verifying';

// iOS Safari exposes a non-standard navigator.standalone flag.
interface IosNavigator {
  standalone?: boolean;
}

/**
 * P0.6 iOS storage soak test page (plan §6 P0.6, ADR-02).
 *
 * Device-only spike UI: write ~200 MB of patterned blobs + stored SHA-256
 * hashes into IndexedDB (and the same into OPFS), log persist()/estimate(),
 * and re-verify after a reboot and after 14 days without rewriting. It never
 * stores media of a real person — bytes are deterministic xorshift patterns.
 * Lazy-loaded so initial/speak budgets are untouched.
 */
@Component({
  selector: 'app-storage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './storage.html',
  styleUrl: './storage.scss',
})
export class StoragePage {
  private readonly doc = inject(DOCUMENT);
  private readonly stores: Record<MediaBackend, MediaStore> = {
    idb: new IndexedDbMediaStore(),
    opfs: new OpfsMediaStore(),
  };
  protected readonly backend = signal<MediaBackend>('idb');
  protected readonly plan = defaultSoakPlan();
  protected readonly phase = signal<Phase>('idle');
  protected readonly progress = signal(0);
  protected readonly manifest = signal<SoakManifest | null>(null);
  protected readonly verifySummary = signal<VerifySummary | null>(null);
  protected readonly verifyResults = signal<readonly ChunkVerify[]>([]);
  protected readonly hoh = signal<string | null>(null);
  protected readonly errors = signal<readonly string[]>([]);
  protected readonly copyNote = signal<'idle' | 'copied' | 'manual'>('idle');

  // persist()/estimate() readouts.
  protected readonly persistRequested = signal(false);
  protected readonly persistGranted = signal<boolean | null>(null);
  protected readonly persisted = signal<boolean | null>(null);
  protected readonly usage = signal<number | null>(null);
  protected readonly quota = signal<number | null>(null);

  protected readonly idbSupported = this.stores.idb.isSupported();
  protected readonly opfsSupported = this.stores.opfs.isSupported();
  protected readonly busy = computed(() => this.phase() !== 'idle');
  protected readonly displayStandalone = this.readDisplayStandalone();
  protected readonly navStandalone = this.readNavStandalone();

  protected readonly report = computed(() => formatSoakReport(this.reportInput()));
  protected readonly progressPct = computed(() => {
    const total = this.plan.chunkCount;
    return total === 0 ? 0 : Math.round((this.progress() / total) * 100);
  });

  private store(): MediaStore {
    return this.stores[this.backend()];
  }

  protected setBackend(backend: MediaBackend): void {
    if (this.busy()) return;
    this.backend.set(backend);
    this.clearResults();
  }

  /** Request durable storage; the returned grant is the P0.6 persist() log. */
  protected async requestPersist(): Promise<void> {
    this.persistRequested.set(true);
    try {
      if (navigator.storage?.persist) {
        this.persistGranted.set(await navigator.storage.persist());
      }
      await this.readPersistState();
    } catch (error) {
      this.pushError(error);
    }
  }

  /** Read persisted() + estimate() without requesting anything. */
  protected async readPersistState(): Promise<void> {
    try {
      if (navigator.storage?.persisted) {
        this.persisted.set(await navigator.storage.persisted());
      }
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        this.usage.set(estimate.usage ?? null);
        this.quota.set(estimate.quota ?? null);
      }
    } catch (error) {
      this.pushError(error);
    }
  }

  /** Probe the active backend once with a few KB, before the full soak. */
  protected async runSelfTest(): Promise<void> {
    if (this.busy()) return;
    const result = await selfTest(this.store(), 'self-test', makeChunk(999, 4096));
    if (!result.match) {
      this.pushError(`self-test ${result.backend} failed: ${result.error ?? 'hash mismatch'}`);
    } else {
      this.errors.update((list) => [...list, `self-test ${result.backend}: ok`]);
    }
  }
  /**
   * Write the full plan: one chunk at a time (bounded memory), hash each,
   * store blob + hash. A QuotaExceededError stops the loop but keeps whatever
   * was written so the report shows how far the phone got — no crash, no retry
   * that could brick a low-disk device.
   */
  protected async runWrite(): Promise<void> {
    if (this.busy()) return;
    this.clearResults();
    this.phase.set('writing');
    const store = this.store();
    const chunks: SoakManifest['chunks'] = [];
    let quotaError: string | null = null;
    try {
      await store.clear();
      for (let i = 0; i < this.plan.chunkCount; i++) {
        const key = chunkKey(i);
        const bytes = makeChunk(i, this.plan.chunkBytes);
        const hash = await sha256Hex(bytes);
        try {
          await store.write(key, new Blob([bytes as BlobPart]));
        } catch (error) {
          quotaError = errorText(error);
          this.pushError(`write stopped at ${key}: ${quotaError}`);
          break;
        }
        chunks.push({ key, bytes: bytes.byteLength, hash });
        this.progress.set(i + 1);
      }
      const manifest: SoakManifest = {
        backend: store.backend,
        writtenAtIso: new Date().toISOString(),
        chunkBytes: this.plan.chunkBytes,
        totalBytes: chunks.reduce((sum, chunk) => sum + chunk.bytes, 0),
        chunks,
        quotaError,
      };
      await this.saveManifest(store, manifest);
      this.manifest.set(manifest);
      this.hoh.set(await hashOfHashes(chunks.map((chunk) => chunk.hash)));
      await this.readPersistState();
    } catch (error) {
      this.pushError(error);
    } finally {
      this.phase.set('idle');
    }
  }

  /** Load a manifest written in a previous session (after reboot / 14 days). */
  protected async loadExisting(): Promise<void> {
    if (this.busy()) return;
    this.clearResults();
    try {
      const manifest = await this.readManifest(this.store());
      if (!manifest) {
        this.pushError('no manifest found for this backend (nothing written yet, or evicted)');
        return;
      }
      this.manifest.set(manifest);
      this.progress.set(manifest.chunks.length);
      this.hoh.set(await hashOfHashes(manifest.chunks.map((chunk) => chunk.hash)));
      await this.readPersistState();
    } catch (error) {
      this.pushError(error);
    }
  }

  /** Re-read every chunk, re-hash, compare to the stored hash. */
  protected async runVerify(): Promise<void> {
    if (this.busy()) return;
    const manifest = this.manifest();
    if (!manifest) {
      this.pushError('load or write a manifest before verifying');
      return;
    }
    this.phase.set('verifying');
    const store = this.store();
    const results: ChunkVerify[] = [];
    try {
      for (let i = 0; i < manifest.chunks.length; i++) {
        results.push(await this.verifyChunk(store, manifest.chunks[i]));
        this.progress.set(i + 1);
      }
      this.verifyResults.set(results);
      this.verifySummary.set(summarizeVerify(results));
      await this.readPersistState();
    } catch (error) {
      this.pushError(error);
    } finally {
      this.phase.set('idle');
    }
  }

  private async verifyChunk(store: MediaStore, record: SoakManifest['chunks'][number]): Promise<ChunkVerify> {
    try {
      const blob = await store.read(record.key);
      if (blob === null) {
        return { key: record.key, expected: record.hash, actual: null, status: 'missing', error: null };
      }
      const actual = await sha256Hex(await blob.arrayBuffer());
      return {
        key: record.key,
        expected: record.hash,
        actual,
        status: actual === record.hash ? 'match' : 'mismatch',
        error: null,
      };
    } catch (error) {
      return { key: record.key, expected: record.hash, actual: null, status: 'error', error: errorText(error) };
    }
  }

  /** Delete every blob and the manifest for the active backend. */
  protected async clearStore(): Promise<void> {
    if (this.busy()) return;
    try {
      await this.store().clear();
      this.clearResults();
      this.manifest.set(null);
      await this.readPersistState();
    } catch (error) {
      this.pushError(error);
    }
  }

  protected async copyReport(): Promise<void> {
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      this.copyNote.set('manual');
      return;
    }
    try {
      await clipboard.writeText(this.report());
      this.copyNote.set('copied');
    } catch (error) {
      if (error instanceof DOMException) {
        this.copyNote.set('manual');
        return;
      }
      throw error;
    }
  }

  protected bytesText(value: number | null): string {
    if (value === null || Number.isNaN(value)) return 'n/a';
    const mib = value / (1024 * 1024);
    return `${value} B (${(Math.round(mib * 10) / 10).toString()} MiB)`;
  }
  private static readonly MANIFEST_KEY = 'manifest.json';

  /** The manifest rides in the same store as a reserved JSON blob key. */
  private async saveManifest(store: MediaStore, manifest: SoakManifest): Promise<void> {
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    await store.write(StoragePage.MANIFEST_KEY, blob);
  }

  private async readManifest(store: MediaStore): Promise<SoakManifest | null> {
    const blob = await store.read(StoragePage.MANIFEST_KEY);
    if (blob === null) return null;
    return JSON.parse(await blob.text()) as SoakManifest;
  }

  private reportInput(): SoakReportInput {
    return {
      recordedAtIso: new Date().toISOString(),
      userAgent: navigator.userAgent,
      displayModeStandalone: this.displayStandalone,
      navigatorStandalone: this.navStandalone,
      persistRequested: this.persistRequested(),
      persistGranted: this.persistGranted(),
      persisted: this.persisted(),
      estimateUsage: this.usage(),
      estimateQuota: this.quota(),
      backend: this.backend(),
      manifest: this.manifest(),
      hashOfHashes: this.hoh(),
      verify: this.verifySummary(),
      verifyResults: this.verifyResults(),
      errors: this.errors(),
    };
  }

  private clearResults(): void {
    this.progress.set(0);
    this.verifySummary.set(null);
    this.verifyResults.set([]);
    this.hoh.set(null);
    this.errors.set([]);
    this.copyNote.set('idle');
  }

  private pushError(error: unknown): void {
    this.errors.update((list) => [...list, errorText(error)]);
  }

  private readDisplayStandalone(): boolean {
    const win = this.doc.defaultView;
    return !!win?.matchMedia && win.matchMedia('(display-mode: standalone)').matches;
  }

  private readNavStandalone(): boolean | null {
    const flag = (navigator as Navigator & IosNavigator).standalone;
    return typeof flag === 'boolean' ? flag : null;
  }
}
