import { Injectable, computed, signal } from '@angular/core';
import type { BoardCell, BoardDoc } from '../../domain/board';
import type { ProfileGender } from '../../core/settings/setting-keys';
import { demoBoards } from './demo-boards';
import {
  LOADING_BOARD_ID,
  applyGender,
  buildCoreBoards,
  loadingBoard,
  vocabIndex,
  type VocabFile,
  type VocabIndex,
} from './vocab-index';

/**
 * Speak board catalog. Opens the P1.7 fixture boards and, once loaded,
 * the Egyptian core boards. Labels for empty vocab cells follow `gender`.
 */
@Injectable({ providedIn: 'root' })
export class BoardSession {
  /** Profile grammatical gender (`m` or `f`). Default is masculine until a profile loads. */
  readonly gender = signal<ProfileGender>('m');

  readonly boardId = signal(LOADING_BOARD_ID);

  private readonly core = signal<Record<string, BoardDoc>>({});
  private readonly index = signal<VocabIndex>(new Map());

  private readonly catalog = computed((): Record<string, BoardDoc> => ({
    [LOADING_BOARD_ID]: loadingBoard,
    ...demoBoards(),
    ...this.core(),
  }));

  /** Gender-resolved view of the open board. Always a document. */
  readonly board = computed(() => {
    const raw = this.catalog()[this.boardId()] ?? loadingBoard;
    return applyGender(raw, this.index(), this.gender());
  });

  setGender(gender: ProfileGender): void {
    this.gender.set(gender);
  }

  /** No-op when `id` is not in the catalog. */
  open(id: string): void {
    if (!Object.hasOwn(this.catalog(), id)) return;
    this.boardId.set(id);
  }

  /** A grid cell on the current board, including hidden. Parked cells are absent. */
  cell(id: string): (BoardCell & { id: string }) | null {
    const cell = this.board().cells[id];
    if (!cell) return null;
    return { id, ...cell };
  }

  /** Install an already-parsed vocab file. Used by tests and by `loadCore`. */
  useVocab(file: VocabFile): void {
    this.index.set(vocabIndex(file));
    this.core.set(buildCoreBoards(file));
    if (this.boardId() === LOADING_BOARD_ID) this.open('home');
  }

  /**
   * Fetch the core list from `/vocab/`. Failure leaves the placeholder board.
   * The JSON is not imported, so it stays out of the speak chunk.
   */
  async loadCore(): Promise<void> {
    try {
      const response = await fetch('/vocab/ar-eg-core.json');
      if (!response.ok) return;
      this.useVocab((await response.json()) as VocabFile);
    } catch {
      // Missing file in a unit test, or offline before the app shell cached it.
    }
  }
}
