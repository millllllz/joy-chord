import { describe, it, expect, beforeEach } from 'vitest';
import { settings, setHoldEnabled } from './settings.js';
// setKeyRoot/setOctave live in degree-joystick.js, which owns re-voicing
// whatever is currently held; settings.js only holds the values they write.
import { setKeyRoot, setOctave } from './degree-joystick.js';
import { OCTAVE_RANGE } from './settings.js';

describe('settings module', () => {
  beforeEach(() => {
    settings.currentKeyRoot = 0;
    settings.octaveOffset = 0;
    settings.holdEnabled = false;
  });

  it('tracks current key root', () => {
    expect(settings.currentKeyRoot).toBe(0);
    setKeyRoot(3);
    expect(settings.currentKeyRoot).toBe(3);
  });

  it('ignores duplicate key root changes', () => {
    setKeyRoot(3);
    setKeyRoot(3);
    expect(settings.currentKeyRoot).toBe(3);
  });

  it('tracks octave offset', () => {
    expect(settings.octaveOffset).toBe(0);
    setOctave(2);
    expect(settings.octaveOffset).toBe(2);
    setOctave(-2);
    expect(settings.octaveOffset).toBe(-2);
  });

  it('ignores duplicate octave changes', () => {
    setOctave(1);
    setOctave(1);
    expect(settings.octaveOffset).toBe(1);
  });

  it('exports the -2..2 octave range', () => {
    expect(OCTAVE_RANGE).toEqual([-2, -1, 0, 1, 2]);
  });

  it('exports KEY_NAMES with 12 pitches', () => {
    expect(settings.KEY_NAMES).toHaveLength(12);
    expect(settings.KEY_NAMES[0]).toBe('C');
  });

  it('exports WAVE_TYPES with standard waveforms', () => {
    expect(settings.WAVE_TYPES).toContain('sine');
    expect(settings.WAVE_TYPES).toContain('square');
    expect(settings.WAVE_TYPES).toContain('sawtooth');
    expect(settings.WAVE_TYPES).toContain('triangle');
  });

  it('defaults hold off and allows toggling it', () => {
    expect(settings.holdEnabled).toBe(false);
    setHoldEnabled(true);
    expect(settings.holdEnabled).toBe(true);
    setHoldEnabled(false);
    expect(settings.holdEnabled).toBe(false);
  });
});
