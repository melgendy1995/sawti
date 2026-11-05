import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { VoicePage } from './voice';
import { VOICE_DRAFT_KEY } from './voice-report';

describe('Voice rating page', () => {
  beforeEach(async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 404 })));
    await TestBed.configureTestingModule({
      imports: [VoicePage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the P0.10 banner and has no child-data fields', async () => {
    const fixture = TestBed.createComponent(VoicePage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent ?? '';

    expect(text).toContain('P0.10');
    expect(text).toContain('لا بيانات أطفال');
    expect(text).toContain('render.mjs --dry-run');
    expect(text).toContain('does not choose the v1.0 voice');
    expect(el.querySelector('input[name="name"]')).toBeNull();
    expect(el.querySelector('input[name="age"]')).toBeNull();
    expect(el.querySelector('#rater-role')).toBeTruthy();
    expect(el.querySelectorAll('input[name="salma"]').length).toBe(5);
    expect(el.querySelectorAll('input[name="shakir"]').length).toBe(5);
  });

  it('stores a score in localStorage and does not submit', async () => {
    const fixture = TestBed.createComponent(VoicePage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const radio = el.querySelector<HTMLInputElement>('input[name="salma"][data-score="4"]');
    radio?.click();
    await fixture.whenStable();

    expect(el.querySelector('form')).toBeNull();
    const saved = localStorage.getItem(VOICE_DRAFT_KEY);
    expect(saved).toContain('"salma":4');
    expect(saved).not.toContain('childName');
  });
});

/** Node's test runner has no localStorage unless --localstorage-file is set. */
function memoryStorage(): Storage {
  const memory = new Map<string, string>();
  return {
    get length() {
      return memory.size;
    },
    clear() {
      memory.clear();
    },
    getItem(key: string) {
      return memory.get(key) ?? null;
    },
    key(index: number) {
      return [...memory.keys()][index] ?? null;
    },
    removeItem(key: string) {
      memory.delete(key);
    },
    setItem(key: string, value: string) {
      memory.set(key, value);
    },
  };
}
