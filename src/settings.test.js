import { describe, it, expect, beforeEach } from 'vitest';
import { settings, init as initSettings } from './settings.js';

describe('settings module', () => {
  beforeEach(() => {
    settings.currentKeyRoot = 0;
    settings.currentWaveType = 'sine';
  });

  it('tracks current key root', () => {
    expect(settings.currentKeyRoot).toBe(0);
    settings.setKeyRoot(3);
    expect(settings.currentKeyRoot).toBe(3);
  });

  it('ignores duplicate key root changes', () => {
    settings.setKeyRoot(3);
    settings.setKeyRoot(3);
    expect(settings.currentKeyRoot).toBe(3);
  });

  it('tracks current waveform type', () => {
    expect(settings.currentWaveType).toBe('sine');
    settings.setWaveType('square');
    expect(settings.currentWaveType).toBe('square');
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
