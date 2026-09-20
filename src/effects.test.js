import { describe, it, expect, beforeEach } from 'vitest';
import {
  effects,
  init,
  setDelayEnabled,
  setReverbEnabled,
  setDelayTime,
  setDelayFeedback,
  setDelaySendLevel,
  setReverbDecay,
  setReverbSendLevel,
} from './effects.js';
import { audio } from './audio.js';

describe('effects module', () => {
  beforeEach(() => {
    effects.delayEnabled = true;
    effects.reverbEnabled = true;
    effects.delayNode = null;
    effects.delayFeedbackGain = null;
    effects.convolver = null;
    effects.delaySend = null;
    effects.reverbSend = null;
    audio.ctx = null;
  });

  it('exports configurable effect parameters', () => {
    expect(effects.DELAY_TIME).toBe(0.28);
    expect(effects.DELAY_FEEDBACK).toBe(0.32);
    expect(effects.DELAY_SEND_LEVEL).toBe(0.22);
    expect(effects.REVERB_DECAY).toBe(2.2);
    expect(effects.REVERB_SEND_LEVEL).toBe(0.18);
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

  it('regenerates the reverb impulse buffer when decay changes', () => {
    init();
    const before = effects.convolver.buffer;
    setReverbDecay(4);
    expect(effects.REVERB_DECAY).toBe(4);
    expect(audio.REVERB_DECAY).toBe(4);
    expect(effects.convolver.buffer).not.toBe(before);
  });
});
