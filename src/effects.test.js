import { describe, it, expect, beforeEach } from 'vitest';
import {
  effects,
  init,
  setDelayEnabled,
  setReverbEnabled,
  setFilterEnabled,
  setDelayTime,
  setDelayFeedback,
  setDelaySendLevel,
  setReverbDecay,
  setReverbSendLevel,
  setFilterCutoff,
  setFilterResonance,
  setTremoloEnabled,
  setTremoloRate,
  setTremoloDepth,
} from './effects.js';
import { audio, startVoice } from './audio.js';

describe('effects module', () => {
  beforeEach(() => {
    effects.delayEnabled = true;
    effects.reverbEnabled = true;
    effects.filterEnabled = true;
    effects.tremoloEnabled = false;
    effects.delayNode = null;
    effects.delayFeedbackGain = null;
    effects.convolver = null;
    effects.delaySend = null;
    effects.reverbSend = null;
    effects.filterNode = null;
    effects.tremoloGain = null;
    effects.tremoloLFO = null;
    effects.tremoloDepthGain = null;
    audio.ctx = null;
    audio.voices = new Map();
  });

  it('exports configurable effect parameters', () => {
    expect(effects.DELAY_TIME).toBe(0.28);
    expect(effects.DELAY_FEEDBACK).toBe(0.32);
    expect(effects.DELAY_SEND_LEVEL).toBe(0.22);
    expect(effects.REVERB_DECAY).toBe(2.2);
    expect(effects.REVERB_SEND_LEVEL).toBe(0.18);
    expect(effects.FILTER_CUTOFF).toBe(2500);
    expect(effects.FILTER_RESONANCE).toBe(1);
    expect(effects.TREMOLO_RATE).toBe(5);
    expect(effects.TREMOLO_DEPTH).toBe(0.5);
    expect(effects.FX_RAMP).toBe(0.05);
  });

  it('tracks delay enabled state', () => {
    effects.delayEnabled = false;
    expect(effects.delayEnabled).toBe(false);
    effects.delayEnabled = true;
    expect(effects.delayEnabled).toBe(true);
  });

  it('tracks reverb enabled state', () => {
    effects.reverbEnabled = false;
    expect(effects.reverbEnabled).toBe(false);
    effects.reverbEnabled = true;
    expect(effects.reverbEnabled).toBe(true);
  });

  it('tracks filter enabled state', () => {
    effects.filterEnabled = false;
    expect(effects.filterEnabled).toBe(false);
    effects.filterEnabled = true;
    expect(effects.filterEnabled).toBe(true);
  });

  it('tracks tremolo enabled state, defaulting off', () => {
    expect(effects.tremoloEnabled).toBe(false);
    effects.tremoloEnabled = true;
    expect(effects.tremoloEnabled).toBe(true);
  });

  it('parameter setters update state even before init() has run', () => {
    setDelayTime(0.5);
    expect(effects.DELAY_TIME).toBe(0.5);
    setDelayFeedback(0.6);
    expect(effects.DELAY_FEEDBACK).toBe(0.6);
    setDelaySendLevel(0.4);
    expect(effects.DELAY_SEND_LEVEL).toBe(0.4);
    setReverbDecay(3.5);
    expect(effects.REVERB_DECAY).toBe(3.5);
    setReverbSendLevel(0.3);
    expect(effects.REVERB_SEND_LEVEL).toBe(0.3);
    setFilterCutoff(4000);
    expect(effects.FILTER_CUTOFF).toBe(4000);
    setFilterResonance(6);
    expect(effects.FILTER_RESONANCE).toBe(6);
    setTremoloRate(7);
    expect(effects.TREMOLO_RATE).toBe(7);
    setTremoloDepth(0.8);
    expect(effects.TREMOLO_DEPTH).toBe(0.8);
  });

  it('pushes delay parameter changes live onto the audio nodes once initialized', () => {
    init();
    setDelayTime(0.6);
    expect(effects.delayNode.delayTime.value).toBe(0.6);
    setDelayFeedback(0.5);
    expect(effects.delayFeedbackGain.gain.value).toBe(0.5);
    setDelaySendLevel(0.7);
    expect(effects.delaySend.gain.value).toBe(0.7);
  });

  it('does not push the send level live while the effect is disabled', () => {
    init();
    setDelayEnabled(false);
    setDelaySendLevel(0.9);
    expect(effects.DELAY_SEND_LEVEL).toBe(0.9);
    expect(effects.delaySend.gain.value).not.toBe(0.9);
  });

  it('pushes filter parameter changes live onto the audio node once initialized', () => {
    init();
    setFilterCutoff(5000);
    expect(effects.filterNode.frequency.value).toBe(5000);
    setFilterResonance(8);
    expect(effects.filterNode.Q.value).toBe(8);
  });

  it('does not push filter cutoff/resonance live while the filter is disabled', () => {
    init();
    setFilterEnabled(false);
    setFilterCutoff(5000);
    setFilterResonance(8);
    expect(effects.FILTER_CUTOFF).toBe(5000);
    expect(effects.FILTER_RESONANCE).toBe(8);
    expect(effects.filterNode.frequency.value).not.toBe(5000);
    expect(effects.filterNode.Q.value).not.toBe(8);
  });

  it('ramps the filter fully open (not just silent) when disabled, since it sits in the dry path', () => {
    init();
    setFilterEnabled(false);
    expect(effects.filterNode.frequency.value).toBeGreaterThan(15000);
    expect(effects.filterNode.Q.value).toBeLessThan(0.01);
  });

  it('restores the configured cutoff/resonance when re-enabled', () => {
    init();
    setFilterCutoff(3300);
    setFilterResonance(4);
    setFilterEnabled(false);
    setFilterEnabled(true);
    expect(effects.filterNode.frequency.value).toBe(3300);
    expect(effects.filterNode.Q.value).toBe(4);
  });

  it('pushes tremolo rate live onto the LFO once initialized', () => {
    init();
    setTremoloRate(9);
    expect(effects.tremoloLFO.frequency.value).toBe(9);
  });

  it('does not push tremolo depth live while disabled, but does once enabled', () => {
    init();
    setTremoloDepth(0.9);
    expect(effects.TREMOLO_DEPTH).toBe(0.9);
    // Stays at its init()-time value (disabled means depth 0) rather than
    // jumping to the new target while the effect is off.
    expect(effects.tremoloDepthGain.gain.value).toBe(0);
    setTremoloEnabled(true);
    setTremoloDepth(0.6);
    expect(effects.tremoloDepthGain.gain.value).toBe(0.3);
    expect(effects.tremoloGain.gain.value).toBe(0.7);
  });

  it('ramps tremolo depth to 0 (not a bypass) when disabled, since it sits in the dry path', () => {
    init();
    setTremoloEnabled(true);
    expect(effects.tremoloDepthGain.gain.value).toBeGreaterThan(0);
    setTremoloEnabled(false);
    expect(effects.tremoloDepthGain.gain.value).toBe(0);
    expect(effects.tremoloGain.gain.value).toBe(1);
  });

  it('restores the configured depth when re-enabled', () => {
    init();
    setTremoloDepth(0.4);
    setTremoloEnabled(true);
    setTremoloEnabled(false);
    setTremoloEnabled(true);
    expect(effects.tremoloDepthGain.gain.value).toBe(0.2);
    expect(effects.tremoloGain.gain.value).toBe(0.8);
  });

  it('routes each voice through filter then tremolo rather than straight to destination', () => {
    init();
    startVoice('test-voice', 440);
    const voice = audio.voices.get('test-voice');
    expect(voice.gainNode.connections).toEqual([effects.filterNode]);
    expect(effects.filterNode.connections).toEqual([effects.tremoloGain]);
    expect(effects.tremoloGain.connections).toContain(audio.ctx.destination);
    expect(effects.tremoloGain.connections).toContain(effects.delaySend);
    expect(effects.tremoloGain.connections).toContain(effects.reverbSend);
  });

  it('drives the tremolo gain stage from an LFO scaled by depth/2', () => {
    init();
    expect(effects.tremoloLFO.connections).toContain(effects.tremoloDepthGain);
    expect(effects.tremoloDepthGain.connections).toContain(effects.tremoloGain.gain);
  });

  it('routes the delay output into the reverb so repeats are not dry', () => {
    init();
    expect(effects.delayNode.connections).toContain(effects.reverbSend);
    expect(effects.delayNode.connections).toContain(audio.ctx.destination);
  });

  it('does not feed the reverb back into the delay', () => {
    init();
    expect(effects.convolver.connections).not.toContain(effects.delaySend);
    expect(effects.convolver.connections).not.toContain(effects.delayNode);
    expect(effects.reverbSend.connections).not.toContain(effects.delayNode);
  });

  it('regenerates the reverb impulse buffer when decay changes', () => {
    init();
    const before = effects.convolver.buffer;
    setReverbDecay(4);
    expect(effects.REVERB_DECAY).toBe(4);
    expect(audio.REVERB_DECAY).toBe(4);
    expect(effects.convolver.buffer).not.toBe(before);
  });
});
