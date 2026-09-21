import { describe, it, expect, beforeEach, vi } from 'vitest';
import { audio } from './audio.js';
import {
  arpeggiator,
  ORDER_NAMES,
  setArpEnabled,
  setArpOrder,
  setArpRate,
  updateArpChord,
} from './arpeggiator.js';

// Records the id that's sounding after each of `ticks` timer steps (the
// first step already fired by the time updateArpChord/setArpOrder returns,
// so callers should account for that themselves rather than this helper
// re-triggering it).
function collectSteps(ticks) {
  const seen = [];
  for (let i = 0; i < ticks; i++) {
    vi.advanceTimersByTime(1000 / arpeggiator.RATE_HZ);
    seen.push(arpeggiator.soundingId);
  }
  return seen;
}

describe('arpeggiator module', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllTimers();
    audio.ctx = null;
    audio.voices = new Map();
    arpeggiator.enabled = false;
    arpeggiator.order = 'up';
    arpeggiator.RATE_HZ = 8;
    arpeggiator.sequence = [];
    arpeggiator.stepIndex = 0;
    arpeggiator.timerId = null;
    arpeggiator.soundingId = null;
  });

  it('defaults to disabled, up order, 8Hz', () => {
    expect(arpeggiator.enabled).toBe(false);
    expect(arpeggiator.order).toBe('up');
    expect(arpeggiator.RATE_HZ).toBe(8);
  });

  it('does nothing on updateArpChord while disabled', () => {
    updateArpChord(new Map([['1:0', 261.63], ['1:4', 329.63], ['1:7', 392]]));
    expect(audio.voices.size).toBe(0);
  });

  it('steps through chord notes one at a time once enabled', () => {
    setArpEnabled(true);
    updateArpChord(new Map([['1:0', 261.63], ['1:4', 329.63], ['1:7', 392]]));

    // First tick fires immediately on chord-in.
    expect(audio.voices.size).toBe(1);
    expect(audio.voices.has('1:0')).toBe(true);

    vi.advanceTimersByTime(1000 / 8);
    expect(audio.voices.size).toBe(1);
    expect(audio.voices.has('1:4')).toBe(true);

    vi.advanceTimersByTime(1000 / 8);
    expect(audio.voices.has('1:7')).toBe(true);

    // Wraps back to the first note.
    vi.advanceTimersByTime(1000 / 8);
    expect(audio.voices.has('1:0')).toBe(true);
  });

  it('stops the sounding voice and timer when the chord empties', () => {
    setArpEnabled(true);
    updateArpChord(new Map([['1:0', 261.63]]));
    expect(audio.voices.size).toBe(1);

    updateArpChord(new Map());
    expect(audio.voices.size).toBe(0);
    expect(arpeggiator.timerId).toBe(null);

    // No further ticks after being cleared.
    vi.advanceTimersByTime(1000);
    expect(audio.voices.size).toBe(0);
  });

  it('stops the sounding voice and timer when disabled', () => {
    setArpEnabled(true);
    updateArpChord(new Map([['1:0', 261.63], ['1:4', 329.63]]));
    expect(audio.voices.size).toBe(1);

    setArpEnabled(false);
    expect(audio.voices.size).toBe(0);
    expect(arpeggiator.timerId).toBe(null);

    vi.advanceTimersByTime(1000);
    expect(audio.voices.size).toBe(0);
  });

  it('rebuilds the timer interval when the rate changes mid-play', () => {
    setArpEnabled(true);
    updateArpChord(new Map([['1:0', 261.63], ['1:4', 329.63]]));
    // Restarting the timer ticks immediately, advancing the step itself.
    setArpRate(4);
    expect(audio.voices.has('1:4')).toBe(true);

    vi.advanceTimersByTime(1000 / 4);
    expect(audio.voices.has('1:0')).toBe(true);
  });

  it('ignores an unknown order name', () => {
    setArpOrder('bogus');
    expect(arpeggiator.order).toBe('up');
  });

  it('lists up, down, up-down, down-up, and random', () => {
    expect(ORDER_NAMES).toEqual(['up', 'down', 'up-down', 'down-up', 'random']);
  });

  it('down order walks the chord highest to lowest', () => {
    setArpEnabled(true);
    setArpOrder('down');
    updateArpChord(new Map([['1:0', 261.63], ['1:4', 329.63], ['1:7', 392]]));
    expect(arpeggiator.soundingId).toBe('1:7');
    expect(collectSteps(3)).toEqual(['1:4', '1:0', '1:7']);
  });

  it('up-down order goes up then back down without repeating the ends', () => {
    setArpEnabled(true);
    setArpOrder('up-down');
    updateArpChord(new Map([['1:0', 261.63], ['1:4', 329.63], ['1:7', 392], ['1:11', 493.88]]));
    expect(arpeggiator.soundingId).toBe('1:0');
    // up: 0,4,7,11 then down (excluding both ends): 7,4 — then repeats.
    expect(collectSteps(6)).toEqual(['1:4', '1:7', '1:11', '1:7', '1:4', '1:0']);
  });

  it('down-up order goes down then back up without repeating the ends', () => {
    setArpEnabled(true);
    setArpOrder('down-up');
    updateArpChord(new Map([['1:0', 261.63], ['1:4', 329.63], ['1:7', 392], ['1:11', 493.88]]));
    expect(arpeggiator.soundingId).toBe('1:11');
    expect(collectSteps(6)).toEqual(['1:7', '1:4', '1:0', '1:4', '1:7', '1:11']);
  });

  it('up-down does not double up on a 2-note chord', () => {
    setArpEnabled(true);
    setArpOrder('up-down');
    updateArpChord(new Map([['1:0', 261.63], ['1:4', 329.63]]));
    expect(arpeggiator.soundingId).toBe('1:0');
    expect(collectSteps(3)).toEqual(['1:4', '1:0', '1:4']);
  });

  it('down-up on a 2-note chord goes down then up with no extra repeats', () => {
    setArpEnabled(true);
    setArpOrder('down-up');
    updateArpChord(new Map([['1:0', 261.63], ['1:4', 329.63]]));
    expect(arpeggiator.soundingId).toBe('1:4');
    expect(collectSteps(3)).toEqual(['1:0', '1:4', '1:0']);
  });


  it('random order only ever plays ids from the held chord', () => {
    setArpEnabled(true);
    setArpOrder('random');
    const ids = ['1:0', '1:4', '1:7'];
    updateArpChord(new Map(ids.map((id, i) => [id, 200 + i])));
    const steps = [arpeggiator.soundingId, ...collectSteps(20)];
    steps.forEach(id => expect(ids).toContain(id));
  });
});
