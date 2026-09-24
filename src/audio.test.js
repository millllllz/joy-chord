import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  audio,
  noteFreq,
  setWaveType,
  startVoice,
  stopVoice,
  setUnisonEnabled,
  setUnisonVoices,
  setUnisonDetune,
  setUnisonSpread,
  setGlideEnabled,
  setGlideTime,
  setEnvelopeAttack,
  setEnvelopeDecay,
  setEnvelopeSustain,
  setEnvelopeRelease,
  glideVoice,
  reconcileVoices,
} from './audio.js';

describe('audio module', () => {
  beforeEach(() => {
    audio.ctx = null;
    audio.voices = new Map();
    audio.currentWaveType = 'sine';
    audio.unisonEnabled = false;
    audio.UNISON_VOICES = 3;
    audio.UNISON_DETUNE = 12;
    audio.UNISON_SPREAD = 0.6;
    audio.glideEnabled = false;
    audio.GLIDE_TIME = 0.12;
    audio.ENVELOPE_ATTACK = 0.01;
    audio.ENVELOPE_DECAY = 0.1;
    audio.ENVELOPE_SUSTAIN = 0.7;
    audio.ENVELOPE_RELEASE = 0.08;
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

  describe('unison', () => {
    it('defaults off, 3 voices, 12 cents detune, 0.6 spread', () => {
      expect(audio.unisonEnabled).toBe(false);
      expect(audio.UNISON_VOICES).toBe(3);
      expect(audio.UNISON_DETUNE).toBe(12);
      expect(audio.UNISON_SPREAD).toBe(0.6);
    });

    it('allows setting each parameter', () => {
      setUnisonEnabled(true);
      expect(audio.unisonEnabled).toBe(true);
      setUnisonVoices(4);
      expect(audio.UNISON_VOICES).toBe(4);
      setUnisonDetune(20);
      expect(audio.UNISON_DETUNE).toBe(20);
      setUnisonSpread(0.3);
      expect(audio.UNISON_SPREAD).toBe(0.3);
    });

    it('with unison off, a voice is still exactly one oscillator, undetuned, no panner', () => {
      startVoice('a', 440);
      const voice = audio.voices.get('a');
      expect(voice.oscs).toHaveLength(1);
      expect(voice.osc).toBe(voice.oscs[0]);
      expect(voice.osc.detune.value).toBe(0);
      // No panner means the oscillator connects straight to the shared
      // gain node, not through an intermediate stereo panner.
      expect(voice.osc.connections).toEqual([voice.gainNode]);
    });

    it('with unison on, a voice is UNISON_VOICES oscillators', () => {
      setUnisonEnabled(true);
      startVoice('a', 440);
      expect(audio.voices.get('a').oscs).toHaveLength(3);
    });

    it('spreads detune symmetrically, with the centre oscillator undetuned (odd voice count)', () => {
      setUnisonEnabled(true);
      setUnisonVoices(3);
      setUnisonDetune(10);
      startVoice('a', 440);
      const detunes = audio.voices.get('a').oscs.map(o => o.detune.value);
      expect(detunes).toEqual([-10, 0, 10]);
    });

    it('spreads detune symmetrically with no centre oscillator (even voice count)', () => {
      setUnisonEnabled(true);
      setUnisonVoices(4);
      setUnisonDetune(9);
      startVoice('a', 440);
      const detunes = audio.voices.get('a').oscs.map(o => Math.round(o.detune.value * 100) / 100);
      expect(detunes).toEqual([-9, -3, 3, 9]);
    });

    it('pans every non-centre oscillator through its own panner, matching the detune spread', () => {
      setUnisonEnabled(true);
      setUnisonVoices(3);
      setUnisonSpread(0.5);
      startVoice('a', 440);
      const [left, center, right] = audio.voices.get('a').oscs;
      // Centre oscillator (t=0): straight to the shared gain node.
      expect(center.connections).toEqual([audio.voices.get('a').gainNode]);
      // Outer oscillators: routed through a panner first, not directly.
      expect(left.connections).toHaveLength(1);
      expect(left.connections[0]).not.toBe(audio.voices.get('a').gainNode);
      expect(left.connections[0].pan.value).toBeCloseTo(-0.5);
      expect(right.connections[0].pan.value).toBeCloseTo(0.5);
    });

    it('divides peak gain by voice count, so unison changes width and timbre, not loudness', () => {
      startVoice('quiet', 440); // unison off: 1 voice
      const soloPeak = audio.voices.get('quiet').gainNode.gain.calls
        .find(c => c.method === 'linearRampToValueAtTime').value;

      setUnisonEnabled(true);
      setUnisonVoices(3);
      startVoice('thick', 440); // unison on: 3 voices
      const unisonPeak = audio.voices.get('thick').gainNode.gain.calls
        .find(c => c.method === 'linearRampToValueAtTime').value;

      expect(unisonPeak).toBeCloseTo(soloPeak / 3);
    });

    it('applies the current waveform to every oscillator in the stack', () => {
      setUnisonEnabled(true);
      setWaveType('sawtooth');
      startVoice('a', 440);
      audio.voices.get('a').oscs.forEach(o => expect(o.type).toBe('sawtooth'));
    });

    it('setWaveType retunes every oscillator in an already-sounding unison voice', () => {
      setUnisonEnabled(true);
      startVoice('a', 440);
      setWaveType('square');
      audio.voices.get('a').oscs.forEach(o => expect(o.type).toBe('square'));
    });

    it('stopVoice ramps and stops every oscillator in the stack', () => {
      setUnisonEnabled(true);
      startVoice('a', 440);
      const oscs = audio.voices.get('a').oscs;
      const stopSpies = oscs.map(o => vi.spyOn(o, 'stop'));
      stopVoice('a');
      stopSpies.forEach(spy => expect(spy).toHaveBeenCalled());
    });

    it('stopVoice glide-out ramps every oscillator toward the same target frequency', () => {
      setUnisonEnabled(true);
      startVoice('a', 440);
      const oscs = audio.voices.get('a').oscs; // captured before stopVoice deletes the entry
      stopVoice('a', 550);
      oscs.forEach(o => {
        const last = o.frequency.calls[o.frequency.calls.length - 1];
        expect(last).toEqual({ method: 'linearRampToValueAtTime', value: 550, time: audio.GLIDE_TIME });
      });
    });

    it('glideVoice ramps every oscillator in the stack to the new frequency', () => {
      setUnisonEnabled(true);
      startVoice('old', 440);
      const oscs = audio.voices.get('old').oscs;
      glideVoice('old', 'new', 880);
      oscs.forEach(o => {
        const last = o.frequency.calls[o.frequency.calls.length - 1];
        expect(last).toEqual({ method: 'linearRampToValueAtTime', value: 880, time: audio.GLIDE_TIME });
      });
      expect(audio.voices.get('new').oscs).toBe(oscs);
    });
  });

  describe('envelope (ADSR)', () => {
    it('defaults to 10ms attack, 100ms decay, 70% sustain, 80ms release', () => {
      expect(audio.ENVELOPE_ATTACK).toBe(0.01);
      expect(audio.ENVELOPE_DECAY).toBe(0.1);
      expect(audio.ENVELOPE_SUSTAIN).toBe(0.7);
      expect(audio.ENVELOPE_RELEASE).toBe(0.08);
    });

    it('allows setting all four stages', () => {
      setEnvelopeAttack(0.05);
      setEnvelopeDecay(0.2);
      setEnvelopeSustain(0.4);
      setEnvelopeRelease(0.3);
      expect(audio.ENVELOPE_ATTACK).toBe(0.05);
      expect(audio.ENVELOPE_DECAY).toBe(0.2);
      expect(audio.ENVELOPE_SUSTAIN).toBe(0.4);
      expect(audio.ENVELOPE_RELEASE).toBe(0.3);
    });

    it('schedules a 0 -> peak -> peak*sustain ramp at start, in that order', () => {
      setEnvelopeAttack(0.02);
      setEnvelopeDecay(0.1);
      setEnvelopeSustain(0.5);
      startVoice('a', 440);
      const calls = audio.voices.get('a').gainNode.gain.calls;
      expect(calls).toHaveLength(3);
      expect(calls[0]).toEqual({ method: 'setValueAtTime', value: 0, time: 0 });
      expect(calls[1]).toEqual({ method: 'linearRampToValueAtTime', value: 0.15, time: 0.02 });
      // sustain level is a fraction of the same peak gain used above (0.15),
      // not an independent volume — 0.15 * 0.5 = 0.075. Attack + decay
      // (0.02 + 0.1) is a float sum, so compare the time loosely.
      expect(calls[2].method).toBe('linearRampToValueAtTime');
      expect(calls[2].value).toBeCloseTo(0.075, 10);
      expect(calls[2].time).toBeCloseTo(0.12, 10);
    });

    it('holds at the sustain level indefinitely once decay finishes (no further scheduled changes)', () => {
      startVoice('a', 440);
      const gain = audio.voices.get('a').gainNode.gain;
      const callCountAfterStart = gain.calls.length;
      // Nothing else touches the gain param until stopVoice is called.
      expect(gain.calls.length).toBe(callCountAfterStart);
      expect(gain.value).toBeCloseTo(0.15 * 0.7, 5);
    });

    it('releases from whatever the current level is, over ENVELOPE_RELEASE', () => {
      setEnvelopeRelease(0.5);
      startVoice('a', 440);
      const gain = audio.voices.get('a').gainNode.gain;
      // Simulate having been stopped mid-decay, before reaching sustain —
      // the mock's linearRampToValueAtTime already collapsed .value to the
      // decay's target, so instead assert the release call's shape directly.
      stopVoice('a');
      const lastCall = gain.calls[gain.calls.length - 1];
      expect(lastCall).toEqual({ method: 'linearRampToValueAtTime', value: 0, time: 0.5 });
    });

    it('changing envelope settings does not retroactively affect an already-scheduled voice', () => {
      startVoice('a', 440);
      const originalCalls = [...audio.voices.get('a').gainNode.gain.calls];
      setEnvelopeAttack(0.9);
      setEnvelopeSustain(0.1);
      expect(audio.voices.get('a').gainNode.gain.calls).toEqual(originalCalls);
    });
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

    it('glides the surplus in from its nearest surviving neighbor when the chord grows, even with only one pairing partner', () => {
      setGlideEnabled(true);
      startVoice('root', 440);
      reconcileVoices(
        new Map([['root', 440]]),
        new Map([['root2', 460], ['third', 550], ['fifth', 660]]),
      );
      // 'root2' pairs directly with 'root' and glides to it. 'third' and
      // 'fifth' have no pairing partner (surplus), so edges-glide eases each
      // in from its nearest sibling in the new chord (see the calls below)
      // instead of attacking cold — but they still land on their own true
      // pitch once the ramp completes, same as a plain attack would.
      expect(audio.voices.get('root2').osc.frequency.value).toBe(460);
      expect(audio.voices.get('third').osc.frequency.value).toBe(550);
      expect(audio.voices.get('fifth').osc.frequency.value).toBe(660);
      expect(audio.voices.size).toBe(3);
      // 'third' (550) is nearer 'root2' (460) than 'fifth' (660); 'fifth'
      // (660) is nearer 'third' (550) than 'root2' (460) — each glides in
      // from that nearest sibling rather than its own pitch.
      expect(audio.voices.get('third').osc.frequency.calls[0]).toEqual({ method: 'setValueAtTime', value: 460, time: 0 });
      expect(audio.voices.get('fifth').osc.frequency.calls[0]).toEqual({ method: 'setValueAtTime', value: 550, time: 0 });
    });

    it('does not leak the forEach array index into stopVoice as glideToFreq', () => {
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

    describe('edges glide', () => {
      beforeEach(() => {
        setGlideEnabled(true);
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
