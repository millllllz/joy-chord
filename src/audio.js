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
  // Sub-option of glide, only meaningful while glideEnabled is also true:
  // extends gliding to voices with no pairing partner (a chord tone purely
  // added or removed, not replaced) by having them glide to/from the
  // nearest surviving chord tone instead of attacking/releasing in place.
  glideEdgesEnabled: false,
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

// `glideFromFreq`, if given, is an edges-glide starting pitch (see
// reconcileVoices): the oscillator starts there and ramps to `freq` over
// GLIDE_TIME instead of starting directly at `freq`, so a newly-added chord
// tone can slide in from a neighboring one rather than just attacking cold.
export function startVoice(id, freq, glideFromFreq) {
  init();
  if (audio.voices.has(id)) return;

  const osc = audio.ctx.createOscillator();
  const gainNode = audio.ctx.createGain();

  osc.type = audio.currentWaveType;
  const now = audio.ctx.currentTime;
  if (glideFromFreq != null) {
    osc.frequency.setValueAtTime(glideFromFreq, now);
    osc.frequency.linearRampToValueAtTime(freq, now + audio.GLIDE_TIME);
  } else {
    osc.frequency.setValueAtTime(freq, now);
  }

  const ATTACK = 0.01;
  const GAIN = 0.15;
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(GAIN, now + ATTACK);

  osc.connect(gainNode);
  gainNode.connect(effects.filterNode);
  osc.start();

  audio.voices.set(id, { osc, gainNode });
}

// `glideToFreq`, if given, is an edges-glide target pitch: the oscillator
// ramps toward it (stretching the release to match GLIDE_TIME so the pitch
// actually gets there before the voice is silent) instead of releasing at
// its current pitch, so a departing chord tone can slide toward a
// neighboring one rather than just cutting off in place.
export function stopVoice(id, glideToFreq) {
  const voice = audio.voices.get(id);
  if (!voice) return;
  const { osc, gainNode } = voice;
  const now = audio.ctx.currentTime;
  const RELEASE = 0.08;
  const duration = glideToFreq != null ? Math.max(RELEASE, audio.GLIDE_TIME) : RELEASE;

  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(gainNode.gain.value, now);
  gainNode.gain.linearRampToValueAtTime(0, now + duration);

  if (glideToFreq != null) {
    osc.frequency.cancelScheduledValues(now);
    osc.frequency.setValueAtTime(osc.frequency.value, now);
    osc.frequency.linearRampToValueAtTime(glideToFreq, now + duration);
  }

  osc.stop(now + duration + 0.02);

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

export function setGlideEdgesEnabled(enabled) {
  audio.glideEdgesEnabled = enabled;
}

// The closest value in `candidates` to `target`, or `target` itself (a
// zero-distance, effectively-no-op glide) if there's nothing to compare
// against — a chord always has at least a root in practice, but this keeps
// the edges-glide callers safe rather than assuming a non-empty list.
function nearestFreq(candidates, target) {
  if (candidates.length === 0) return target;
  return candidates.reduce((best, f) => (Math.abs(f - target) < Math.abs(best - target) ? f : best));
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
// nearest-pitch and glided. Any surplus on the longer side (the chord grew
// or shrank) has no pairing partner: normally that still hard starts/stops
// it, but with glideEdgesEnabled on, it instead glides to/from the nearest
// tone that will actually survive the transition — a fresh tone eases in
// from a neighbor instead of attacking cold, a stale one eases out toward
// one instead of cutting off in place.
export function reconcileVoices(oldTarget, newTarget) {
  const staleIds = [...oldTarget.keys()].filter(id => !newTarget.has(id));
  const freshIds = [...newTarget.keys()].filter(id => !oldTarget.has(id));

  if (!audio.glideEnabled) {
    staleIds.forEach(id => stopVoice(id));
    freshIds.forEach(id => startVoice(id, newTarget.get(id)));
    return;
  }

  staleIds.sort((a, b) => oldTarget.get(a) - oldTarget.get(b));
  freshIds.sort((a, b) => newTarget.get(a) - newTarget.get(b));
  const pairCount = Math.min(staleIds.length, freshIds.length);
  for (let i = 0; i < pairCount; i++) {
    glideVoice(staleIds[i], freshIds[i], newTarget.get(freshIds[i]));
  }

  const leftoverStale = staleIds.slice(pairCount);
  const leftoverFresh = freshIds.slice(pairCount);

  if (!audio.glideEdgesEnabled) {
    leftoverStale.forEach(id => stopVoice(id));
    leftoverFresh.forEach(id => startVoice(id, newTarget.get(id)));
    return;
  }

  const finalFreqs = [...newTarget.values()];
  leftoverStale.forEach(id => {
    stopVoice(id, nearestFreq(finalFreqs, oldTarget.get(id)));
  });
  leftoverFresh.forEach(id => {
    const freq = newTarget.get(id);
    const others = [...newTarget.entries()].filter(([otherId]) => otherId !== id).map(([, f]) => f);
    startVoice(id, freq, nearestFreq(others, freq));
  });
}
