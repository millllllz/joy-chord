import { effects } from './effects.js';

const AudioCtx = window.AudioContext || window.webkitAudioContext;

export const audio = {
  ctx: null,
  voices: new Map(),
  FREQ_C4: 261.63,
  REVERB_DECAY: 2.2,
  currentWaveType: 'sine',
  glideEnabled: false,
  GLIDE_TIME: 0.12,
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
  gainNode.connect(effects.filterNode);
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
  // Retune sustaining voices too, so the change is audible while a chord
  // is still held rather than only on the next note.
  audio.voices.forEach(({ osc }) => { osc.type = type; });
}

export function setGlideEnabled(enabled) {
  audio.glideEnabled = enabled;
}

export function setGlideTime(seconds) {
  audio.GLIDE_TIME = seconds;
}

// Slides an existing, still-sounding voice to a new pitch/id instead of
// stopping and restarting it — same oscillator and gain node throughout, so
// there's no retriggered attack, just a pitch ramp. Re-keying audio.voices
// from oldId to newId keeps later lookups (stopVoice, another glide) working
// under the id the voice is now logically playing.
export function glideVoice(oldId, newId, newFreq) {
  const voice = audio.voices.get(oldId);
  if (!voice) {
    startVoice(newId, newFreq);
    return;
  }
  const { osc } = voice;
  const now = audio.ctx.currentTime;
  osc.frequency.cancelScheduledValues(now);
  osc.frequency.setValueAtTime(osc.frequency.value, now);
  osc.frequency.linearRampToValueAtTime(newFreq, now + audio.GLIDE_TIME);

  audio.voices.delete(oldId);
  audio.voices.set(newId, voice);
}

// Reconciles a voicing transition from oldTarget to newTarget (both
// Map<id, freq>). Ids present in both are already correct and untouched
// (startVoice no-ops on an existing id). The rest — ids only in oldTarget
// ("stale") and only in newTarget ("fresh") — are either hard
// stopped/started, or, with glide on, paired off nearest-pitch-to-
// nearest-pitch and glided; any surplus on the longer side (the chord grew
// or shrank) still hard starts/stops since it has no pairing partner.
export function reconcileVoices(oldTarget, newTarget) {
  const staleIds = [...oldTarget.keys()].filter(id => !newTarget.has(id));
  const freshIds = [...newTarget.keys()].filter(id => !oldTarget.has(id));

  if (!audio.glideEnabled) {
    staleIds.forEach(stopVoice);
    freshIds.forEach(id => startVoice(id, newTarget.get(id)));
    return;
  }

  staleIds.sort((a, b) => oldTarget.get(a) - oldTarget.get(b));
  freshIds.sort((a, b) => newTarget.get(a) - newTarget.get(b));
  const pairCount = Math.min(staleIds.length, freshIds.length);
  for (let i = 0; i < pairCount; i++) {
    glideVoice(staleIds[i], freshIds[i], newTarget.get(freshIds[i]));
  }
  staleIds.slice(pairCount).forEach(stopVoice);
  freshIds.slice(pairCount).forEach(id => startVoice(id, newTarget.get(id)));
}
