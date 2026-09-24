import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vocoder, setVocoderEnabled } from './vocoder.js';
import { effects, init as initEffects } from './effects.js';
import { audio } from './audio.js';
import { debug } from './debug.js';

describe('vocoder module', () => {
  beforeEach(() => {
    effects.vocoderEnabled = false;
    effects.vocoderCarrierBus = null;
    effects.vocoderOutputBus = null;
    effects.vocoderSend = null;
    effects.delaySend = null;
    effects.reverbSend = null;
    effects.filterNode = null;
    effects.tremoloGain = null;
    effects.tremoloLFO = null;
    effects.tremoloDepthGain = null;
    effects.delayNode = null;
    effects.delayFeedbackGain = null;
    effects.convolver = null;
    audio.ctx = null;
    audio.voices = new Map();
    vocoder.bands = [];
    vocoder.micStream = null;
    vocoder.micSource = null;
    // debugLog (called on a denied/unsupported mic request) writes straight
    // to debug.panel, which only debug.js's own init() normally sets from
    // the real DOM — stub it directly rather than pulling that init in too.
    debug.panel = { appendChild: vi.fn(), scrollTop: 0 };
    navigator.mediaDevices.getUserMedia.mockClear();
    // Same stable-track reasoning as the default mock in test-setup.js —
    // reset back to it explicitly since the "denied" test below replaces
    // the implementation and needs restoring between tests.
    navigator.mediaDevices.getUserMedia.mockImplementation(() => {
      const track = { stop: vi.fn() };
      return Promise.resolve({ getTracks: () => [track] });
    });
  });

  it('requests the mic and turns the send on when enabled', async () => {
    initEffects();
    await setVocoderEnabled(true);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(effects.vocoderEnabled).toBe(true);
    expect(effects.vocoderSend.gain.value).toBe(effects.VOCODER_SEND_LEVEL);
  });

  it('builds one bandpass/rectifier/envelope/gain chain per band, tapping the carrier bus', async () => {
    initEffects();
    await setVocoderEnabled(true);
    expect(vocoder.bands.length).toBeGreaterThan(1);
    expect(effects.vocoderCarrierBus.connections.length).toBe(vocoder.bands.length);
    // connections is only ever recorded on the connecting side (see
    // test-setup.js), so "every band feeds the shared output bus" is
    // checked from each band's own bandGain rather than from the bus.
    vocoder.bands.forEach(({ bandGain }) => {
      expect(bandGain.connections).toContain(effects.vocoderOutputBus);
    });
  });

  it('connects the mic source into every band', async () => {
    initEffects();
    await setVocoderEnabled(true);
    expect(vocoder.micSource.connections).toHaveLength(vocoder.bands.length);
  });

  it('reuses the same bands across repeated enable cycles instead of rebuilding them', async () => {
    initEffects();
    await setVocoderEnabled(true);
    const bandsAfterFirst = vocoder.bands;
    await setVocoderEnabled(false);
    await setVocoderEnabled(true);
    expect(vocoder.bands).toBe(bandsAfterFirst);
  });

  it('stops the mic tracks and turns the send off when disabled', async () => {
    initEffects();
    await setVocoderEnabled(true);
    const stopSpy = vocoder.micStream.getTracks()[0].stop;
    await setVocoderEnabled(false);
    expect(stopSpy).toHaveBeenCalled();
    expect(effects.vocoderEnabled).toBe(false);
    expect(effects.vocoderSend.gain.value).toBe(0);
    expect(vocoder.micStream).toBeNull();
    expect(vocoder.micSource).toBeNull();
  });

  it('is a no-op when already in the requested state', async () => {
    initEffects();
    await setVocoderEnabled(true);
    navigator.mediaDevices.getUserMedia.mockClear();
    await setVocoderEnabled(true);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it('stays disabled and does not throw when mic permission is denied', async () => {
    initEffects();
    navigator.mediaDevices.getUserMedia.mockImplementation(() =>
      Promise.reject(new DOMException('denied', 'NotAllowedError'))
    );
    await expect(setVocoderEnabled(true)).resolves.toBeUndefined();
    expect(effects.vocoderEnabled).toBe(false);
    expect(effects.vocoderSend.gain.value).toBe(0);
  });
});
