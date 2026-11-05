import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { BoardCell, BoardDoc } from '../../domain/board';
import { cssGridColumn, cssGridRow, type CellPhase } from './speak-contract';

type SlotCell = BoardCell & { id: string };

@Component({
  selector: 'app-speak-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './speak-board.html',
  styleUrl: './speak-board.scss',
})
export class SpeakBoard {
  readonly board = input.required<BoardDoc>();
  readonly phase = output<CellPhase>();

  /** Grid cells only. Parked cells are not slots. */
  protected readonly cells = computed((): readonly SlotCell[] =>
    Object.entries(this.board().cells).map(([id, cell]) => ({ id, ...cell })),
  );

  protected readonly cssGridRow = cssGridRow;
  protected readonly cssGridColumn = cssGridColumn;

  protected onPointerDown(event: PointerEvent, cellId: string): void {
    event.preventDefault();
    this.phase.emit({ cellId, phase: 'down' });
  }

  protected onPointerUp(cellId: string): void {
    this.phase.emit({ cellId, phase: 'up' });
  }

  protected onPointerCancel(cellId: string): void {
    this.phase.emit({ cellId, phase: 'cancel' });
  }

  protected onContextMenu(event: Event): void {
    event.preventDefault();
  }
}
