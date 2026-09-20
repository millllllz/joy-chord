import { describe, it, expect, beforeEach } from 'vitest';
import { effects, setDelayEnabled, setReverbEnabled } from './effects.js';

describe('effects module', () => {
  beforeEach(() => {
    effects.delayEnabled = true;
    effects.reverbEnabled = true;
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
});
