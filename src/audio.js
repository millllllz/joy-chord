import { effects } from './effects.js';

const AudioCtx = window.AudioContext || window.webkitAudioContext;

export const audio = {
  ctx: null,
  voices: new Map(),
  FREQ_C4: 261.63,
  REVERB_DECAY: 2.2,
  currentWaveType: 'sine',
};

export function init() {
  if (!audio.ctx) {
    audio.ctx = new AudioCtx();
  }
  if (audio.ctx.state === 'suspended') {
    audio.ctx.resume();
  }
}

export function noteFreq(semitonesFromC4) {
  return audio.FREQ_C4 * Math.pow(2, semitonesFromC4 / 12);
}

export function createReverbImpulse() {
  const ctx = audio.ctx;
  const length = Math.floor(ctx.sampleRate * audio.REVERB_DECAY);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  const decayPerSample = Math.pow(0.001, 1 / length);
  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel);
    let envelope = 1;
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * envelope;
      envelope *= decayPerSample;
    }
  }
  return impulse;
}

export function startVoice(id, freq) {
  init();
  if (audio.voices.has(id)) return;

  const osc = audio.ctx.createOscillator();
  const gainNode = audio.ctx.createGain();

  osc.type = audio.currentWaveType;
  osc.frequency.setValueAtTime(freq, audio.ctx.currentTime);

  const ATTACK = 0.01;
  const GAIN = 0.15;
  gainNode.gain.setValueAtTime(0, audio.ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(GAIN, audio.ctx.currentTime + ATTACK);

  osc.connect(gainNode);
  gainNode.connect(audio.ctx.destination);
  gainNode.connect(effects.delaySend);
  gainNode.connect(effects.reverbSend);
  osc.start();

  audio.voices.set(id, { osc, gainNode });
}

export function stopVoice(id) {
  const voice = audio.voices.get(id);
  if (!voice) return;
  const { osc, gainNode } = voice;
  const now = audio.ctx.currentTime;
  const RELEASE = 0.08;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(gainNode.gain.value, now);
  gainNode.gain.linearRampToValueAtTime(0, now + RELEASE);
  osc.stop(now + RELEASE + 0.02);

  audio.voices.delete(id);
}

export function setWaveType(type) {
  audio.currentWaveType = type;
}
