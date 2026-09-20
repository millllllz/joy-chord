import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { audio, init as initAudio } from './audio.js';

describe('audio module', () => {
  beforeEach(() => {
    // Reset audio state before each test
    audio.ctx = null;
    audio.voices = new Map();
  });

  it('initializes audio context on first use', () => {
    initAudio();
    expect(audio.ctx).not.toBeNull();
    expect(audio.ctx.constructor.name).toMatch(/AudioContext/);
  });

  it('reuses audio context on second init', () => {
    initAudio();
    const ctx1 = audio.ctx;
    initAudio();
    expect(audio.ctx).toBe(ctx1);
  });

  it('resumes suspended audio context', () => {
    initAudio();
    audio.ctx.state = 'suspended';
    const resumeSpy = vi.spyOn(audio.ctx, 'resume');
    initAudio();
    expect(resumeSpy).toHaveBeenCalled();
  });

  it('calculates note frequency correctly from semitones', () => {
    initAudio();
    const freq = audio.noteFreq(0); // C4
    expect(freq).toBeCloseTo(261.63, 1);

    const freqUp12 = audio.noteFreq(12); // C5
    expect(freqUp12).toBeCloseTo(261.63 * 2, 1);
  });

  it('starts a voice with oscillator and gain node', () => {
    initAudio();
    audio.startVoice('test-voice', 440);

    expect(audio.voices.has('test-voice')).toBe(true);
    const voice = audio.voices.get('test-voice');
    expect(voice).toHaveProperty('osc');
    expect(voice).toHaveProperty('gainNode');
  });

  it('does not start duplicate voice if already playing', () => {
    initAudio();
    audio.startVoice('test-voice', 440);
    const firstVoice = audio.voices.get('test-voice');

    audio.startVoice('test-voice', 440);
    expect(audio.voices.get('test-voice')).toBe(firstVoice);
  });

  it('stops a voice and removes it from map', () => {
    initAudio();
    audio.startVoice('test-voice', 440);
    expect(audio.voices.has('test-voice')).toBe(true);

    audio.stopVoice('test-voice');
    expect(audio.voices.has('test-voice')).toBe(false);
  });

  it('ignores stop request for non-existent voice', () => {
    initAudio();
    expect(() => audio.stopVoice('non-existent')).not.toThrow();
  });

  it('creates reverb impulse with correct length', () => {
    initAudio();
    const impulse = audio.createReverbImpulse();
    const expectedLength = Math.floor(audio.ctx.sampleRate * audio.REVERB_DECAY);
    expect(impulse.length).toBe(expectedLength);
    expect(impulse.numberOfChannels).toBe(2);
  });

  it('allows setting waveform type', () => {
    initAudio();
    audio.setWaveType('square');
    expect(audio.currentWaveType).toBe('square');

    audio.setWaveType('sine');
    expect(audio.currentWaveType).toBe('sine');
  });
});
