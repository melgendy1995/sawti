import { Injectable, computed, signal } from '@angular/core';
import type { BoardCell } from '../../domain/board';
import { HOME_BOARD_ID, demoBoards } from './demo-boards';

/** In-memory speak board. Opens only ids present in the demo catalog. */
@Injectable({ providedIn: 'root' })
export class BoardSession {
  readonly boardId = signal(HOME_BOARD_ID);
  readonly board = computed(() => demoBoards()[this.boardId()]);

  /** No-op when `id` is not a demo board. */
  open(id: string): void {
    if (!Object.hasOwn(demoBoards(), id)) return;
    this.boardId.set(id);
  }

  /** A grid cell on the current board, including hidden. Parked cells are absent. */
  cell(id: string): (BoardCell & { id: string }) | null {
    const cell = this.board()?.cells[id];
    if (!cell) return null;
    return { id, ...cell };
  }
}
