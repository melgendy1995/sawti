import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Speak } from './speak';

/** Exact Egyptian test sentence from the P0.3 acceptance criteria. */
const TEST_SENTENCE =
  'السَّلام عليكم، أنا عايز الميّة والأكل من المدرسة. لا، لأ، لأنّ، الله. هى عايزة تروح.';

describe('Speak (shell placeholder)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Speak],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(Speak);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the exact Egyptian test sentence inside a <bdi>', async () => {
    const fixture = TestBed.createComponent(Speak);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const bdi = el.querySelector('[data-testid="test-sentence"] bdi');
    expect(bdi).toBeTruthy();
    expect(bdi?.textContent?.trim()).toBe(TEST_SENTENCE);
  });

  it('links to the audio board, diagnostics, storage, and voice rating', async () => {
    const fixture = TestBed.createComponent(Speak);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const hrefs = [...el.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href'));
    expect(hrefs).toEqual(['/audio', '/audio/diagnostics', '/storage', '/voice']);
  });
});
