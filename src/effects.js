import { audio, init as initAudio, createReverbImpulse } from './audio.js';

export const effects = {
  delaySend: null,
  delayEnabled: true,
  reverbSend: null,
  reverbEnabled: true,
  delayNode: null,
  delayFeedbackGain: null,
  convolver: null,
  DELAY_TIME: 0.28,
  DELAY_FEEDBACK: 0.32,
  DELAY_SEND_LEVEL: 0.22,
  REVERB_DECAY: 2.2,
  REVERB_SEND_LEVEL: 0.18,
  FX_RAMP: 0.05,
};

export function init() {
  initAudio();

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
