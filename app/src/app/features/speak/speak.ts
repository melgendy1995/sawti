import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Speak route placeholder (P0.3 app skeleton).
 *
 * This is NOT the full speak grid (that arrives in P1). It exists only to prove
 * the RTL shell: it renders a fixed Egyptian test sentence so Arabic joining
 * (lam-alef, tashkeel) can be checked on device and in the shaping test.
 *
 * The sentence is wrapped in <bdi> so a mixed Arabic/Latin/digit context never
 * reorders it (see also unicode-bidi: isolate in the stylesheet).
 */
@Component({
  selector: 'app-speak',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './speak.html',
  styleUrl: './speak.scss',
})
export class Speak {
  /** Exact Egyptian test sentence required by P0.3 acceptance criteria. */
  protected readonly testSentence =
    'السَّلام عليكم، أنا عايز الميّة والأكل من المدرسة. لا، لأ، لأنّ، الله. هى عايزة تروح.';
}
