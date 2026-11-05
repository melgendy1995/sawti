import { Directive, ElementRef, OnDestroy, inject } from '@angular/core';
import { CAREGIVER_HOLD_MS } from './caregiver-timing';
import { CaregiverGate } from './caregiver-gate';

/**
 * Opens the caregiver PIN dialog after a 1200 ms hold on the host.
 * A shorter press, a pointer that leaves, or a cancel does nothing.
 * This is not the cell {@link PointerAccessFilter} path.
 */
@Directive({
  selector: '[appCaregiverHold]',
  host: {
    '(pointerdown)': 'onDown($event)',
    '(pointerup)': 'onEnd($event)',
    '(pointercancel)': 'onEnd($event)',
    '(pointerleave)': 'onEnd($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class CaregiverHold implements OnDestroy {
  private readonly gate = inject(CaregiverGate);
  private readonly host = inject(ElementRef<HTMLElement>);
  private pointerId: number | null = null;
  private downAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    this.cancel();
  }

  protected onDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    if (event.currentTarget !== this.host.nativeElement) return;
    this.cancel();
    this.pointerId = event.pointerId;
    this.downAt = Date.now();
    const pointerId = event.pointerId;
    const downAt = this.downAt;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.pointerId !== pointerId) return;
      if (Date.now() - downAt < CAREGIVER_HOLD_MS) return;
      this.pointerId = null;
      this.gate.openPrompt();
    }, CAREGIVER_HOLD_MS);
  }

  protected onEnd(event: PointerEvent): void {
    if (this.pointerId === null || event.pointerId !== this.pointerId) return;
    this.cancel();
  }

  protected onContextMenu(event: Event): void {
    event.preventDefault();
  }

  private cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pointerId = null;
  }
}
