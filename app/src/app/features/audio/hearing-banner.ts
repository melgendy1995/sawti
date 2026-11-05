import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { type HearingChoice, type ShownWarning } from '../../core/audio/hearing-warnings';

@Component({
  selector: 'app-hearing-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hearing-banner.html',
  styleUrl: './hearing-banner.scss',
})
export class HearingBanner {
  readonly warnings = input.required<readonly ShownWarning[]>();
  readonly hearing = input.required<HearingChoice>();
  readonly hearingChange = output<HearingChoice>();

  protected choose(choice: HearingChoice): void {
    this.hearingChange.emit(choice);
  }
}
