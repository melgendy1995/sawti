// Shared P1.7 speak contract. Grid placement is a board fact: the speak grid
// is `direction: ltr` so CSS column 1 is the physical left, and these functions
// turn document row/col into that grid. Do not derive the column from the UI
// language (no Transloco here).

import type { BoardCell } from '../../domain/board';

export type BoardDirection = 'rtl' | 'ltr';

/** Default boards are RTL: document column 0 sits on the physical right. */
export const DEFAULT_BOARD_DIRECTION: BoardDirection = 'rtl';

export type SpeakMode = 'tap' | 'sentence';

/** One spoken piece. `text` is what a speaker says; `label` is what the strip shows. */
export interface SpokenPart {
  id: string;
  label: string;
  text: string;
}

export interface CellSpeaker {
  speakCell(part: SpokenPart): void;
  speakSequence(parts: readonly SpokenPart[]): void;
}

/** Pointer phase on a cell. The access filter decides whether it counts. */
export interface CellPhase {
  cellId: string;
  phase: 'down' | 'up' | 'cancel';
}

/**
 * CSS grid column (1-based) for a document column.
 * The grid element uses `direction: ltr`, so column 1 is the physical left.
 * RTL boards place document column 0 on the physical right.
 */
export function cssGridColumn(
  col: number,
  cols: number,
  direction: BoardDirection = DEFAULT_BOARD_DIRECTION,
): number {
  if (direction === 'rtl') return cols - col;
  return col + 1;
}

/** CSS grid row (1-based). Document rows grow downward; row 0 is the top. */
export function cssGridRow(row: number): number {
  return row + 1;
}

/** Spoken override when set and non-blank; otherwise the label. */
export function spokenText(cell: Pick<BoardCell, 'label' | 'spoken'>): string {
  const spoken = cell.spoken?.trim();
  return spoken ? spoken : cell.label;
}
