import { describe, it, expect, beforeEach } from 'vitest';
import { settings, setKeyRoot } from './settings.js';

describe('settings module', () => {
  beforeEach(() => {
    settings.currentKeyRoot = 0;
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
});
