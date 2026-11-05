import 'fake-indexeddb/auto';

import { TestBed } from '@angular/core/testing';
import { useGlobalIndexedDb } from '../../core/storage/use-global-indexeddb';

useGlobalIndexedDb();
import { provideRouter } from '@angular/router';
import { CAREGIVER_HIDE_LOCK_MS, CAREGIVER_HOLD_MS, CaregiverGate } from '../../core/access';
import { hashPin, newSaltHex } from '../../core/access/pin-hash';
import { CaregiverPinStore } from '../../core/access/caregiver-pin-store';
import { SAWTI_DB } from '../../core/storage/db-token';
import { SawtiDb } from '../../core/storage/sawti-db';
import { SETTING_CAREGIVER_PIN } from '../../core/settings/setting-keys';
import { CELL_WATER } from './demo-boards';
import { Speak } from './speak';

function pointer(
  type: 'pointerdown' | 'pointerup' | 'pointerleave' | 'pointercancel',
  target: EventTarget,
  x: number,
  y: number,
): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      button: 0,
      clientX: x,
      clientY: y,
    }),
  );
}

function buttonFor(root: ParentNode, id: string): HTMLButtonElement {
  const button = root.querySelector(`[data-cell-id="${id}"] button`);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`missing button ${id}`);
  return button;
}

describe('Caregiver gate', () => {
  let db: SawtiDb;

  beforeEach(async () => {
    db = new SawtiDb(`sawti-gate-${crypto.randomUUID()}`);
    await TestBed.configureTestingModule({
      imports: [Speak],
      providers: [provideRouter([]), { provide: SAWTI_DB, useValue: db }],
    }).compileComponents();
  });

  afterEach(async () => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    const name = db.name;
    db.close();
    await SawtiDb.delete(name);
  });

  async function setup(): Promise<{ fixture: ReturnType<typeof TestBed.createComponent<Speak>>; el: HTMLElement }> {
    const fixture = TestBed.createComponent(Speak);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('never opens the gate for many random short taps', async () => {
    const { fixture, el } = await setup();
    vi.useFakeTimers();
    const title = target(el);
    const water = buttonFor(el, CELL_WATER);
    const targets: EventTarget[] = [el, title, water, document.body];

    for (let i = 0; i < 200; i += 1) {
      const node = targets[i % targets.length] ?? title;
      const x = (i * 47) % 900;
      const y = (i * 19) % 700;
      const hold = (i * 13) % 400;
      pointer('pointerdown', node, x, y);
      if (hold > 0) vi.advanceTimersByTime(hold);
      const end = i % 11 === 0 ? 'pointerleave' : i % 17 === 0 ? 'pointercancel' : 'pointerup';
      pointer(end, node, x + 3, y + 2);
    }

    fixture.detectChanges();
    expect(el.querySelector('[data-testid="caregiver-pin-dialog"]')).toBeNull();
    expect(TestBed.inject(CaregiverGate).promptOpen()).toBe(false);
    expect(TestBed.inject(CaregiverGate).unlocked()).toBe(false);
    expect(el.querySelector('[data-testid="settings-link"]')).toBeNull();
  });

  it('ignores a fast tap on the caregiver target', async () => {
    const { fixture, el } = await setup();
    vi.useFakeTimers();
    const title = target(el);

    pointer('pointerdown', title, 20, 20);
    vi.advanceTimersByTime(CAREGIVER_HOLD_MS - 1);
    pointer('pointerup', title, 20, 20);
    vi.advanceTimersByTime(CAREGIVER_HOLD_MS);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="caregiver-pin-dialog"]')).toBeNull();
    expect(TestBed.inject(CaregiverGate).promptOpen()).toBe(false);
  });

  it('cancels the hold when the pointer leaves the target', async () => {
    const { fixture, el } = await setup();
    vi.useFakeTimers();
    const title = target(el);

    pointer('pointerdown', title, 4, 4);
    vi.advanceTimersByTime(200);
    pointer('pointerleave', title, 400, 400);
    vi.advanceTimersByTime(CAREGIVER_HOLD_MS);
    fixture.detectChanges();

    expect(TestBed.inject(CaregiverGate).promptOpen()).toBe(false);
  });

  it('opens the PIN dialog after a real hold, rejects a wrong PIN, and accepts the right one', async () => {
    const salt = newSaltHex();
    await TestBed.inject(CaregiverPinStore).write({ salt, hash: await hashPin('1234', salt) });

    const { fixture, el } = await setup();
    const gate = TestBed.inject(CaregiverGate);
    vi.useFakeTimers();
    const title = target(el);

    pointer('pointerdown', title, 12, 12);
    await vi.advanceTimersByTimeAsync(CAREGIVER_HOLD_MS);
    vi.useRealTimers();
    fixture.detectChanges();
    await fixture.whenStable();

    const dialog = el.querySelector('[data-testid="caregiver-pin-dialog"]');
    expect(dialog).toBeTruthy();
    expect(el.querySelector('[data-testid="caregiver-pin-confirm"]')).toBeNull();

    await enterPin(fixture, '0000');
    expect(el.querySelector('[data-testid="caregiver-pin-error"]')?.textContent).toContain('غير صحيح');
    expect(gate.unlocked()).toBe(false);
    expect(el.querySelector('[data-testid="settings-link"]')).toBeNull();
    expect(el.querySelector('[data-testid="caregiver-pin-dialog"]')).toBeTruthy();

    await enterPin(fixture, '1234');
    expect(gate.unlocked()).toBe(true);
    expect(el.querySelector('[data-testid="caregiver-pin-dialog"]')).toBeNull();
    expect(el.querySelector('[data-testid="settings-link"]')?.getAttribute('href')).toBe('/settings');

    const stored = await db.settings.get(SETTING_CAREGIVER_PIN);
    const value = stored?.value as { salt?: string; hash?: string; pin?: string };
    expect(value.pin).toBeUndefined();
    expect(value.salt).toBe(salt);
    expect(value.hash).toBe(await hashPin('1234', salt));
    expect(value.hash).not.toBe('1234');
  });

  it('locks again after the tab stays hidden for 60 seconds', async () => {
    const gate = TestBed.inject(CaregiverGate);
    expect(await gate.submitPin('2468', '2468')).toBe(true);
    expect(gate.unlocked()).toBe(true);
    vi.useFakeTimers();

    setVisibility('hidden');
    vi.advanceTimersByTime(CAREGIVER_HIDE_LOCK_MS - 1);
    expect(gate.unlocked()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(gate.unlocked()).toBe(false);
    expect(gate.promptOpen()).toBe(false);

    expect(await gate.submitPin('2468')).toBe(true);
    setVisibility('hidden');
    vi.advanceTimersByTime(1_000);
    setVisibility('visible');
    vi.advanceTimersByTime(CAREGIVER_HIDE_LOCK_MS);
    expect(gate.unlocked()).toBe(true);
  });
});

function target(root: ParentNode): HTMLElement {
  const title = root.querySelector('[data-testid="caregiver-target"]');
  if (!(title instanceof HTMLElement)) throw new Error('missing caregiver target');
  return title;
}

async function enterPin(
  fixture: ReturnType<typeof TestBed.createComponent<Speak>>,
  pin: string,
): Promise<void> {
  const root = fixture.nativeElement as HTMLElement;
  const input = root.querySelector('[data-testid="caregiver-pin-input"]');
  const submit = root.querySelector('[data-testid="caregiver-pin-submit"]');
  if (!(input instanceof HTMLInputElement) || !(submit instanceof HTMLButtonElement)) {
    throw new Error('missing pin controls');
  }
  input.value = pin;
  input.dispatchEvent(new Event('input'));
  submit.click();
  const gate = TestBed.inject(CaregiverGate);
  await vi.waitFor(() => {
    if (pin === '1234') expect(gate.unlocked()).toBe(true);
    else expect(gate.pinError()).toContain('غير صحيح');
  });
  fixture.detectChanges();
}

function setVisibility(state: 'hidden' | 'visible'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}
