import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SpeakController } from './speak-controller';

/** Sentence strip and the speak-on-tap / sentence mode switch. */
@Component({
  selector: 'app-sentence-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sentence-strip.html',
  styleUrl: './sentence-strip.scss',
})
export class SentenceStrip {
  protected readonly controller = inject(SpeakController);
}
