import { audio, init as initAudio, createReverbImpulse } from './audio.js';

export const effects = {
  delaySend: null,
  delayEnabled: true,
  reverbSend: null,
  reverbEnabled: true,
  filterNode: null,
  filterEnabled: true,
  delayNode: null,
  delayFeedbackGain: null,
  convolver: null,
  DELAY_TIME: 0.28,
  DELAY_FEEDBACK: 0.32,
  DELAY_SEND_LEVEL: 0.22,
  REVERB_DECAY: 2.2,
  REVERB_SEND_LEVEL: 0.18,
  FILTER_CUTOFF: 2500,
  FILTER_RESONANCE: 1,
  FX_RAMP: 0.05,
};

// Unlike delay/reverb (parallel sends with an untouched dry path underneath),
// the filter is an insert — every voice routes through it (see audio.js), so
// there's no separate dry path to fall back to when it's "off". Instead its
// frequency/Q ramp to these fully-open values, passing audio through
// effectively unfiltered while the node stays in the graph.
const FILTER_BYPASS_FREQ = 20000;
const FILTER_BYPASS_Q = 0.0001;

export function init() {
  initAudio();

  effects.filterNode = audio.ctx.createBiquadFilter();
  effects.filterNode.type = 'lowpass';
  effects.filterNode.frequency.value = effects.filterEnabled ? effects.FILTER_CUTOFF : FILTER_BYPASS_FREQ;
  effects.filterNode.Q.value = effects.filterEnabled ? effects.FILTER_RESONANCE : FILTER_BYPASS_Q;

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

  // Every voice connects only to the filter (see audio.js); it fans out to
  // the dry destination and both effect sends, so filtering lands before the
  // delay/reverb taps and the echoes/tail come out filtered too.
  effects.filterNode.connect(audio.ctx.destination);
  effects.filterNode.connect(effects.delaySend);
  effects.filterNode.connect(effects.reverbSend);
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
