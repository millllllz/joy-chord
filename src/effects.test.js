import { describe, it, expect, beforeEach, vi } from 'vitest';
import { effects, init as initEffects } from './effects.js';
import { init as initAudio } from './audio.js';

describe('effects module', () => {
  beforeEach(() => {
    initAudio();
    effects.delayEnabled = true;
    effects.reverbEnabled = true;
    effects.delaySend = null;
    effects.reverbSend = null;
  });

  it('creates delay and reverb send nodes on init', () => {
    initEffects();
    expect(effects.delaySend).not.toBeNull();
    expect(effects.reverbSend).not.toBeNull();
  });

  it('sets delay send to enabled level initially', () => {
    effects.delayEnabled = true;
    initEffects();
    expect(effects.delaySend.gain.value).toBe(effects.DELAY_SEND_LEVEL);
  });

  it('sets delay send to zero if initially disabled', () => {
    effects.delayEnabled = false;
    initEffects();
    expect(effects.delaySend.gain.value).toBe(0);
  });

  it('sets reverb send to enabled level initially', () => {
    effects.reverbEnabled = true;
    initEffects();
    expect(effects.reverbSend.gain.value).toBe(effects.REVERB_SEND_LEVEL);
  });

  it('sets reverb send to zero if initially disabled', () => {
    effects.reverbEnabled = false;
    initEffects();
    expect(effects.reverbSend.gain.value).toBe(0);
  });

  it('toggles delay by ramping gain to level or zero', () => {
    initEffects();
    const cancelSpy = vi.spyOn(effects.delaySend.gain, 'cancelScheduledValues');
    const rampSpy = vi.spyOn(effects.delaySend.gain, 'linearRampToValueAtTime');

    effects.setDelayEnabled(false);
    expect(effects.delayEnabled).toBe(false);
    expect(cancelSpy).toHaveBeenCalled();
    expect(rampSpy).toHaveBeenCalledWith(0, expect.any(Number));
  });

  it('toggles reverb by ramping gain to level or zero', () => {
    initEffects();
    const cancelSpy = vi.spyOn(effects.reverbSend.gain, 'cancelScheduledValues');
    const rampSpy = vi.spyOn(effects.reverbSend.gain, 'linearRampToValueAtTime');

    effects.setReverbEnabled(false);
    expect(effects.reverbEnabled).toBe(false);
    expect(cancelSpy).toHaveBeenCalled();
    expect(rampSpy).toHaveBeenCalledWith(0, expect.any(Number));
  });

  it('exports configurable effect parameters', () => {
    expect(effects.DELAY_TIME).toBe(0.28);
    expect(effects.DELAY_FEEDBACK).toBe(0.32);
    expect(effects.DELAY_SEND_LEVEL).toBe(0.22);
    expect(effects.REVERB_DECAY).toBe(2.2);
    expect(effects.REVERB_SEND_LEVEL).toBe(0.18);
    expect(effects.FX_RAMP).toBe(0.05);
  });
});
