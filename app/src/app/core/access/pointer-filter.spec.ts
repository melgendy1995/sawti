import { PointerAccessFilter, type AccessTiming } from './pointer-filter';

function filter(timing: AccessTiming): { accepted: string[]; gate: PointerAccessFilter } {
  const accepted: string[] = [];
  const gate = new PointerAccessFilter(timing, (id) => accepted.push(id));
  return { accepted, gate };
}

describe('PointerAccessFilter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a release only after the pointer has stayed down for holdMs', () => {
    const { accepted, gate } = filter({ holdMs: 200, debounceMs: 0, activation: 'release' });

    gate.pointerDown('water');
    vi.advanceTimersByTime(199);
    gate.pointerUp('water');
    expect(accepted).toEqual([]);

    gate.pointerDown('water');
    vi.advanceTimersByTime(200);
    gate.pointerUp('water');
    expect(accepted).toEqual(['water']);
  });

  it('accepts an immediate release when holdMs is 0', () => {
    const { accepted, gate } = filter({ holdMs: 0, debounceMs: 0, activation: 'release' });
    gate.pointerDown('water');
    gate.pointerUp('water');
    expect(accepted).toEqual(['water']);
  });

  it('accepts press mode when the hold elapses, and not again on pointer-up', () => {
    const { accepted, gate } = filter({ holdMs: 150, debounceMs: 0, activation: 'press' });

    gate.pointerDown('food');
    vi.advanceTimersByTime(149);
    expect(accepted).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(accepted).toEqual(['food']);

    gate.pointerUp('food');
    expect(accepted).toEqual(['food']);
  });

  it('does not accept press mode when the pointer lifts before the hold', () => {
    const { accepted, gate } = filter({ holdMs: 150, debounceMs: 0, activation: 'press' });
    gate.pointerDown('food');
    vi.advanceTimersByTime(50);
    gate.pointerUp('food');
    vi.advanceTimersByTime(200);
    expect(accepted).toEqual([]);
  });

  it('does not accept a press that is cancelled before the hold', () => {
    const { accepted, gate } = filter({ holdMs: 150, debounceMs: 0, activation: 'press' });
    gate.pointerDown('food');
    gate.pointerCancel();
    vi.advanceTimersByTime(200);
    expect(accepted).toEqual([]);
  });

  it('drops a second accept that arrives inside the debounce window', () => {
    const { accepted, gate } = filter({ holdMs: 0, debounceMs: 500, activation: 'release' });

    gate.pointerDown('water');
    gate.pointerUp('water');
    gate.pointerDown('food');
    gate.pointerUp('food');
    expect(accepted).toEqual(['water']);

    vi.advanceTimersByTime(500);
    gate.pointerDown('food');
    gate.pointerUp('food');
    expect(accepted).toEqual(['water', 'food']);
  });

  it('does not accept a pointer-up for a different cell', () => {
    const { accepted, gate } = filter({ holdMs: 0, debounceMs: 0, activation: 'release' });
    gate.pointerDown('water');
    gate.pointerUp('food');
    expect(accepted).toEqual([]);
  });

  it('cancels a pending press when a new pointer-down starts', () => {
    const { accepted, gate } = filter({ holdMs: 100, debounceMs: 0, activation: 'press' });
    gate.pointerDown('water');
    vi.advanceTimersByTime(40);
    gate.pointerDown('food');
    vi.advanceTimersByTime(100);
    expect(accepted).toEqual(['food']);
  });

  it('treats pointer-cancel with no active press as a no-op', () => {
    const { accepted, gate } = filter({ holdMs: 0, debounceMs: 0, activation: 'release' });
    gate.pointerCancel();
    expect(accepted).toEqual([]);
  });
});
