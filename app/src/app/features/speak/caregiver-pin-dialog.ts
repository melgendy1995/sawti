import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CaregiverGate } from '../../core/access/caregiver-gate';

/** Numeric caregiver PIN. The value is hashed before it is stored. */
@Component({
  selector: 'app-caregiver-pin-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './caregiver-pin-dialog.html',
  styleUrl: './caregiver-pin-dialog.scss',
})
export class CaregiverPinDialog {
  protected readonly gate = inject(CaregiverGate);
  protected readonly pin = signal('');
  protected readonly confirmPin = signal('');

  protected onPin(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.pin.set(event.target.value);
  }

  protected onConfirm(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.confirmPin.set(event.target.value);
  }

  protected submit(): void {
    void this.gate.submitPin(this.pin(), this.confirmPin());
  }
}
