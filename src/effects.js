import { audio, init as initAudio, createReverbImpulse } from './audio.js';

export const effects = {
  delaySend: null,
  delayEnabled: true,
  reverbSend: null,
  reverbEnabled: true,
  filterNode: null,
  // Off by default now — with delay/reverb pushed heavier below, a lowpass
  // on top by default made the whole mix read muddy/dark; leaving it off
  // lets someone reach for it deliberately instead of fighting it first.
  filterEnabled: false,
  tremoloGain: null,
  tremoloLFO: null,
  tremoloDepthGain: null,
  tremoloEnabled: false,
  delayNode: null,
  delayFeedbackGain: null,
  convolver: null,
  DELAY_TIME: 0.28,
  DELAY_FEEDBACK: 0.5,
  DELAY_SEND_LEVEL: 0.38,
  REVERB_DECAY: 3.5,
  REVERB_SEND_LEVEL: 0.35,
  FILTER_CUTOFF: 2500,
  FILTER_RESONANCE: 1,
  TREMOLO_RATE: 5,
  TREMOLO_DEPTH: 0.5,
  FX_RAMP: 0.05,
};

// Unlike delay/reverb (parallel sends with an untouched dry path underneath),
// the filter and tremolo are inserts — every voice routes through both (see
// audio.js), so neither has a separate dry path to fall back to when it's
// "off". Instead their parameters ramp to these values, passing audio
// through each node effectively unaffected while it stays in the graph.
const FILTER_BYPASS_FREQ = 20000;
const FILTER_BYPASS_Q = 0.0001;

export function init() {
  initAudio();

  effects.filterNode = audio.ctx.createBiquadFilter();
  effects.filterNode.type = 'lowpass';
  effects.filterNode.frequency.value = effects.filterEnabled ? effects.FILTER_CUTOFF : FILTER_BYPASS_FREQ;
  effects.filterNode.Q.value = effects.filterEnabled ? effects.FILTER_RESONANCE : FILTER_BYPASS_Q;

  // Classic tremolo circuit: an LFO scaled to depth/2 feeds the gain-stage's
  // `gain` AudioParam, which sits at a baseline of (1 - depth/2) — so the
  // two sum to swing between (1 - depth) and 1 rather than modulating around
  // silence. lfo.connect(depthGain) is audio-rate, not a discrete step.
  effects.tremoloGain = audio.ctx.createGain();
  const tremoloDepth = effects.tremoloEnabled ? effects.TREMOLO_DEPTH : 0;
  effects.tremoloGain.gain.value = 1 - tremoloDepth / 2;

  effects.tremoloDepthGain = audio.ctx.createGain();
  effects.tremoloDepthGain.gain.value = tremoloDepth / 2;

  effects.tremoloLFO = audio.ctx.createOscillator();
  effects.tremoloLFO.type = 'sine';
  effects.tremoloLFO.frequency.value = effects.TREMOLO_RATE;
  effects.tremoloLFO.connect(effects.tremoloDepthGain);
  effects.tremoloDepthGain.connect(effects.tremoloGain.gain);
  effects.tremoloLFO.start();

  effects.delaySend = audio.ctx.createGain();
  effects.delaySend.gain.value = effects.delayEnabled ? effects.DELAY_SEND_LEVEL : 0;

  effects.delayNode = audio.ctx.createDelay(1.0);
  effects.delayNode.delayTime.value = effects.DELAY_TIME;

  effects.delayFeedbackGain = audio.ctx.createGain();
  effects.delayFeedbackGain.gain.value = effects.DELAY_FEEDBACK;

  effects.delaySend.connect(effects.delayNode);
  effects.delayNode.connect(effects.delayFeedbackGain);
  effects.delayFeedbackGain.connect(effects.delayNode);
  effects.delayNode.connect(audio.ctx.destination);

  effects.reverbSend = audio.ctx.createGain();
  effects.reverbSend.gain.value = effects.reverbEnabled ? effects.REVERB_SEND_LEVEL : 0;

  effects.convolver = audio.ctx.createConvolver();
  effects.convolver.buffer = createReverbImpulse();

  effects.reverbSend.connect(effects.convolver);
  effects.convolver.connect(audio.ctx.destination);

  // Feed the repeats into the reverb as well, not just the dry voices.
  // Without this the echoes are completely dry: at short delay times they
  // land while the original note's reverb tail is still ringing and pass as
  // reverberant, but at long ones they arrive into silence and the space
  // audibly drops out from the first repeat on. Safe from runaway because
  // nothing downstream of the reverb feeds back into the delay.
  effects.delayNode.connect(effects.reverbSend);

  // Every voice connects only to the filter (see audio.js); it feeds the
  // tremolo stage, which fans out to the dry destination and both effect
  // sends — so filter then tremolo both land before the delay/reverb taps,
  // and the echoes/tail pulse and get filtered too.
  effects.filterNode.connect(effects.tremoloGain);
  effects.tremoloGain.connect(audio.ctx.destination);
  effects.tremoloGain.connect(effects.delaySend);
  effects.tremoloGain.connect(effects.reverbSend);
}

export function setFilterEnabled(enabled) {
  effects.filterEnabled = enabled;
  if (audio.ctx) {
    const now = audio.ctx.currentTime;
    const targetFreq = enabled ? effects.FILTER_CUTOFF : FILTER_BYPASS_FREQ;
    const targetQ = enabled ? effects.FILTER_RESONANCE : FILTER_BYPASS_Q;
    effects.filterNode.frequency.cancelScheduledValues(now);
    effects.filterNode.frequency.setValueAtTime(effects.filterNode.frequency.value, now);
    effects.filterNode.frequency.linearRampToValueAtTime(targetFreq, now + effects.FX_RAMP);
    effects.filterNode.Q.cancelScheduledValues(now);
    effects.filterNode.Q.setValueAtTime(effects.filterNode.Q.value, now);
    effects.filterNode.Q.linearRampToValueAtTime(targetQ, now + effects.FX_RAMP);
  }
}

export function setFilterCutoff(hz) {
  effects.FILTER_CUTOFF = hz;
  if (effects.filterNode && effects.filterEnabled) effects.filterNode.frequency.value = hz;
}

export function setFilterResonance(q) {
  effects.FILTER_RESONANCE = q;
  if (effects.filterNode && effects.filterEnabled) effects.filterNode.Q.value = q;
}

export function setTremoloEnabled(enabled) {
  effects.tremoloEnabled = enabled;
  if (audio.ctx) {
    const now = audio.ctx.currentTime;
    const targetDepth = enabled ? effects.TREMOLO_DEPTH : 0;
    effects.tremoloDepthGain.gain.cancelScheduledValues(now);
    effects.tremoloDepthGain.gain.setValueAtTime(effects.tremoloDepthGain.gain.value, now);
    effects.tremoloDepthGain.gain.linearRampToValueAtTime(targetDepth / 2, now + effects.FX_RAMP);
    effects.tremoloGain.gain.cancelScheduledValues(now);
    effects.tremoloGain.gain.setValueAtTime(effects.tremoloGain.gain.value, now);
    effects.tremoloGain.gain.linearRampToValueAtTime(1 - targetDepth / 2, now + effects.FX_RAMP);
  }
}

export function setTremoloRate(hz) {
  effects.TREMOLO_RATE = hz;
  if (effects.tremoloLFO) effects.tremoloLFO.frequency.value = hz;
}

export function setTremoloDepth(depth) {
  effects.TREMOLO_DEPTH = depth;
  // Only push it live if the effect is currently on — otherwise this just
  // updates the target the next "enabled" ramp will go to.
  if (effects.tremoloDepthGain && effects.tremoloGain && effects.tremoloEnabled) {
    effects.tremoloDepthGain.gain.value = depth / 2;
    effects.tremoloGain.gain.value = 1 - depth / 2;
  }
}

export function setDelayEnabled(enabled) {
  effects.delayEnabled = enabled;
  if (audio.ctx) {
    const now = audio.ctx.currentTime;
    effects.delaySend.gain.cancelScheduledValues(now);
    effects.delaySend.gain.setValueAtTime(effects.delaySend.gain.value, now);
    effects.delaySend.gain.linearRampToValueAtTime(enabled ? effects.DELAY_SEND_LEVEL : 0, now + effects.FX_RAMP);
  }
}

export function setReverbEnabled(enabled) {
  effects.reverbEnabled = enabled;
  if (audio.ctx) {
    const now = audio.ctx.currentTime;
    effects.reverbSend.gain.cancelScheduledValues(now);
    effects.reverbSend.gain.setValueAtTime(effects.reverbSend.gain.value, now);
    effects.reverbSend.gain.linearRampToValueAtTime(enabled ? effects.REVERB_SEND_LEVEL : 0, now + effects.FX_RAMP);
  }
}

export function setDelayTime(seconds) {
  effects.DELAY_TIME = seconds;
  if (effects.delayNode) effects.delayNode.delayTime.value = seconds;
}

export function setDelayFeedback(amount) {
  effects.DELAY_FEEDBACK = amount;
  if (effects.delayFeedbackGain) effects.delayFeedbackGain.gain.value = amount;
}

export function setDelaySendLevel(level) {
  effects.DELAY_SEND_LEVEL = level;
  // Only push it live if the effect is currently on — otherwise this just
  // updates the target level the next "enabled" ramp will go to.
  if (effects.delaySend && effects.delayEnabled) effects.delaySend.gain.value = level;
}

// Changing decay regenerates the impulse response buffer, which is too
// expensive to do on every 'input' event of a dragged slider — callers
// should only invoke this on 'change' (i.e. once the drag settles).
export function setReverbDecay(seconds) {
  effects.REVERB_DECAY = seconds;
  audio.REVERB_DECAY = seconds;
  if (effects.convolver && audio.ctx) {
    effects.convolver.buffer = createReverbImpulse();
  }
}

export function setReverbSendLevel(level) {
  effects.REVERB_SEND_LEVEL = level;
  if (effects.reverbSend && effects.reverbEnabled) effects.reverbSend.gain.value = level;
}
