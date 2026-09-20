import { describe, it, expect, beforeEach, vi } from 'vitest';
import { audio, noteFreq, setWaveType, startVoice } from './audio.js';

describe('audio module', () => {
  beforeEach(() => {
    audio.ctx = null;
    audio.voices = new Map();
    audio.currentWaveType = 'sine';
  });

  it('has constants defined', () => {
    expect(audio.FREQ_C4).toBe(261.63);
    expect(audio.REVERB_DECAY).toBe(2.2);
  });

  it('calculates note frequency correctly from semitones', () => {
    const freq = noteFreq(0);
    expect(freq).toBeCloseTo(261.63, 1);

    const freqUp12 = noteFreq(12);
    expect(freqUp12).toBeCloseTo(261.63 * 2, 1);

    const freqUp1 = noteFreq(1);
    expect(freqUp1).toBeCloseTo(261.63 * Math.pow(2, 1 / 12), 1);
  });

  it('allows setting waveform type', () => {
    setWaveType('square');
    expect(audio.currentWaveType).toBe('square');

    setWaveType('sine');
    expect(audio.currentWaveType).toBe('sine');
  });

  it('voice map starts empty', () => {
    expect(audio.voices.size).toBe(0);
  });

  it('applies the selected waveform to new voices', () => {
    setWaveType('sawtooth');
    startVoice('a', 440);
    expect(audio.voices.get('a').osc.type).toBe('sawtooth');
  });

  it('retunes sustaining voices when the waveform changes', () => {
    startVoice('a', 440);
    startVoice('b', 550);
    setWaveType('triangle');
    expect([...audio.voices.values()].map(v => v.osc.type)).toEqual(['triangle', 'triangle']);
  });
});
