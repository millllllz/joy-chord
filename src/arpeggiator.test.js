import { describe, it, expect, beforeEach, vi } from 'vitest';
import { audio } from './audio.js';
import {
  arpeggiator,
  setArpEnabled,
  setArpOrder,
  setArpRate,
  updateArpChord,
} from './arpeggiator.js';

describe('arpeggiator module', () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
});
