import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  audio,
  noteFreq,
  setWaveType,
  startVoice,
  setGlideEnabled,
  setGlideTime,
  glideVoice,
  reconcileVoices,
} from './audio.js';

describe('audio module', () => {
  beforeEach(() => {
    audio.ctx = null;
    audio.voices = new Map();
    audio.currentWaveType = 'sine';
    audio.glideEnabled = false;
    audio.GLIDE_TIME = 0.12;
  });

  it('has constants defined', () => {
    expect(audio.FREQ_C4).toBe(261.63);
    expect(audio.REVERB_DECAY).toBe(2.2);
  });

  it('defaults glide off with a 120ms time', () => {
    expect(audio.glideEnabled).toBe(false);
    expect(audio.GLIDE_TIME).toBe(0.12);
  });

  it('allows setting glide enabled/time', () => {
    setGlideEnabled(true);
    expect(audio.glideEnabled).toBe(true);
    setGlideTime(0.25);
    expect(audio.GLIDE_TIME).toBe(0.25);
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

  describe('glideVoice', () => {
    it('reuses the same oscillator/gain node under the new id, ramping frequency', () => {
      startVoice('old', 440);
      const original = audio.voices.get('old');
      glideVoice('old', 'new', 550);
      expect(audio.voices.has('old')).toBe(false);
      expect(audio.voices.get('new')).toBe(original);
      expect(original.osc.frequency.value).toBe(550);
    });

    it('falls back to starting a fresh voice when there is nothing to glide from', () => {
      glideVoice('missing', 'new', 440);
      expect(audio.voices.get('new').osc.frequency.value).toBe(440);
    });
  });

  describe('reconcileVoices', () => {
    it('leaves ids present in both old and new targets untouched', () => {
      startVoice('a:0', 440);
      const original = audio.voices.get('a:0');
      reconcileVoices(new Map([['a:0', 440]]), new Map([['a:0', 440]]));
      expect(audio.voices.get('a:0')).toBe(original);
    });

    it('hard stops stale ids and hard starts fresh ids when glide is off', () => {
      startVoice('old', 440);
      reconcileVoices(new Map([['old', 440]]), new Map([['new', 550]]));
      expect(audio.voices.has('old')).toBe(false);
      expect(audio.voices.get('new').osc.frequency.value).toBe(550);
    });

    it('glides nearest-pitch pairs when enabled, instead of stopping/starting them', () => {
      setGlideEnabled(true);
      startVoice('lowOld', 300);
      startVoice('highOld', 700);
      const lowVoice = audio.voices.get('lowOld');
      const highVoice = audio.voices.get('highOld');

      reconcileVoices(
        new Map([['lowOld', 300], ['highOld', 700]]),
        new Map([['lowNew', 320], ['highNew', 750]]),
      );

      // Same nodes carried over under the new ids (no retrigger), each
      // ramped to its nearest-pitch partner.
      expect(audio.voices.get('lowNew')).toBe(lowVoice);
      expect(audio.voices.get('highNew')).toBe(highVoice);
      expect(lowVoice.osc.frequency.value).toBe(320);
      expect(highVoice.osc.frequency.value).toBe(750);
      expect(audio.voices.has('lowOld')).toBe(false);
      expect(audio.voices.has('highOld')).toBe(false);
    });

    it('hard starts/stops the surplus when the chord grows or shrinks, even with glide on', () => {
      setGlideEnabled(true);
      startVoice('root', 440);
      reconcileVoices(
        new Map([['root', 440]]),
        new Map([['root2', 460], ['third', 550], ['fifth', 660]]),
      );
      // One pairing partner glides; the other two fresh ids have nothing to
      // pair with, so they hard-start instead.
      expect(audio.voices.get('root2').osc.frequency.value).toBe(460);
      expect(audio.voices.get('third').osc.frequency.value).toBe(550);
      expect(audio.voices.get('fifth').osc.frequency.value).toBe(660);
      expect(audio.voices.size).toBe(3);
    });
  });
});
