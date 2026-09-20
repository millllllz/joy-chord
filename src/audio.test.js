import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  audio,
  noteFreq,
  setWaveType,
  startVoice,
  stopVoice,
  setGlideEnabled,
  setGlideTime,
  setGlideEdgesEnabled,
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
    audio.glideEdgesEnabled = false;
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

  it('defaults glide-edges off and allows toggling it', () => {
    expect(audio.glideEdgesEnabled).toBe(false);
    setGlideEdgesEnabled(true);
    expect(audio.glideEdgesEnabled).toBe(true);
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

  describe('startVoice glide-in', () => {
    it('sets glideFromFreq first, then ramps to the target', () => {
      startVoice('a', 550, 300);
      const calls = audio.voices.get('a').osc.frequency.calls;
      expect(calls).toEqual([
        { method: 'setValueAtTime', value: 300, time: 0 },
        { method: 'linearRampToValueAtTime', value: 550, time: audio.GLIDE_TIME },
      ]);
    });

    it('sets the target directly, with no ramp, when no glideFromFreq is given', () => {
      startVoice('a', 550);
      const calls = audio.voices.get('a').osc.frequency.calls;
      expect(calls).toEqual([{ method: 'setValueAtTime', value: 550, time: 0 }]);
    });
  });

  describe('stopVoice glide-out', () => {
    it('ramps the oscillator toward glideToFreq, stretching the release to match GLIDE_TIME', () => {
      startVoice('a', 440);
      const voice = audio.voices.get('a');
      stopVoice('a', 660);
      expect(audio.voices.has('a')).toBe(false);
      // The RELEASE constant (0.08s) is shorter than the default GLIDE_TIME
      // (0.12s) — glide-out should win so the pitch actually gets there
      // before the voice goes silent, not cut off mid-slide.
      const freqCalls = voice.osc.frequency.calls;
      expect(freqCalls[freqCalls.length - 1]).toEqual({
        method: 'linearRampToValueAtTime', value: 660, time: audio.GLIDE_TIME,
      });
      const gainCalls = voice.gainNode.gain.calls;
      expect(gainCalls[gainCalls.length - 1]).toEqual({
        method: 'linearRampToValueAtTime', value: 0, time: audio.GLIDE_TIME,
      });
    });

    it('does not touch frequency when no glideToFreq is given', () => {
      startVoice('a', 440);
      const osc = audio.voices.get('a').osc;
      const freqCallsBefore = osc.frequency.calls.length;
      stopVoice('a');
      expect(osc.frequency.calls.length).toBe(freqCallsBefore);
    });
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

    it('does not leak the forEach array index into stopVoice as glideToFreq when edges are off', () => {
      // staleIds.forEach(id => stopVoice(id)) must stay explicit — passing
      // stopVoice directly to forEach would leak the index as a 2nd arg.
      setGlideEnabled(true);
      startVoice('a', 440);
      startVoice('b', 550);
      startVoice('c', 660);
      const bVoice = audio.voices.get('b');
      reconcileVoices(
        new Map([['a', 440], ['b', 550], ['c', 660]]),
        new Map(), // everything stale, nothing fresh - no pairs possible
      );
      // 'b' is index 1 in the sorted stale list; if the index leaked in as
      // glideToFreq, its oscillator would have been reprogrammed toward 1.
      const freqCalls = bVoice.osc.frequency.calls;
      expect(freqCalls.some(c => c.value === 1)).toBe(false);
    });

    describe('with glideEdgesEnabled', () => {
      beforeEach(() => {
        setGlideEnabled(true);
        setGlideEdgesEnabled(true);
      });

      it('glides a purely-added tone in from the nearest surviving tone', () => {
        startVoice('root', 440);
        startVoice('fifth', 660);
        reconcileVoices(
          new Map([['root', 440], ['fifth', 660]]),
          new Map([['root', 440], ['fifth', 660], ['seventh', 700]]),
        );
        // Nothing to pair with (root/fifth are untouched, not stale) — the
        // added 'seventh' should glide in from its nearest neighbor (700 is
        // closer to 660 than to 440).
        const calls = audio.voices.get('seventh').osc.frequency.calls;
        expect(calls[0]).toEqual({ method: 'setValueAtTime', value: 660, time: 0 });
        expect(calls[1]).toEqual({ method: 'linearRampToValueAtTime', value: 700, time: audio.GLIDE_TIME });
      });

      it('glides a purely-removed tone out toward the nearest surviving tone', () => {
        startVoice('root', 440);
        startVoice('fifth', 660);
        startVoice('seventh', 700);
        const seventhVoice = audio.voices.get('seventh');
        reconcileVoices(
          new Map([['root', 440], ['fifth', 660], ['seventh', 700]]),
          new Map([['root', 440], ['fifth', 660]]),
        );
        expect(audio.voices.has('seventh')).toBe(false);
        const freqCalls = seventhVoice.osc.frequency.calls;
        expect(freqCalls[freqCalls.length - 1]).toEqual({
          method: 'linearRampToValueAtTime', value: 660, time: audio.GLIDE_TIME,
        });
      });

      it('still uses hard start/stop for the surplus when edges are off', () => {
        setGlideEdgesEnabled(false);
        startVoice('root', 440);
        reconcileVoices(
          new Map([['root', 440]]),
          new Map([['root', 440], ['seventh', 700]]),
        );
        const calls = audio.voices.get('seventh').osc.frequency.calls;
        expect(calls).toEqual([{ method: 'setValueAtTime', value: 700, time: 0 }]);
      });

      it('does not glide a brand new chord\'s notes in from each other when nothing was held before', () => {
        // oldTarget is empty (no prior degree held) — every id in newTarget
        // is "leftover fresh" with no real antecedent, so each must attack
        // at its own pitch, not glide in from a sibling note of the same
        // chord it's part of.
        reconcileVoices(
          new Map(),
          new Map([['root', 440], ['third', 550], ['fifth', 660]]),
        );
        expect(audio.voices.get('root').osc.frequency.calls).toEqual([{ method: 'setValueAtTime', value: 440, time: 0 }]);
        expect(audio.voices.get('third').osc.frequency.calls).toEqual([{ method: 'setValueAtTime', value: 550, time: 0 }]);
        expect(audio.voices.get('fifth').osc.frequency.calls).toEqual([{ method: 'setValueAtTime', value: 660, time: 0 }]);
      });
    });
  });
});
