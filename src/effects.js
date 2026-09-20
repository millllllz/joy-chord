import { audio, init as initAudio, createReverbImpulse } from './audio.js';

export const effects = {
  delaySend: null,
  delayEnabled: true,
  reverbSend: null,
  reverbEnabled: true,
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

  const delayNode = audio.ctx.createDelay(1.0);
  delayNode.delayTime.value = effects.DELAY_TIME;

  const feedbackGain = audio.ctx.createGain();
  feedbackGain.gain.value = effects.DELAY_FEEDBACK;

  effects.delaySend.connect(delayNode);
  delayNode.connect(feedbackGain);
  feedbackGain.connect(delayNode);
  delayNode.connect(audio.ctx.destination);

  effects.reverbSend = audio.ctx.createGain();
  effects.reverbSend.gain.value = effects.reverbEnabled ? effects.REVERB_SEND_LEVEL : 0;

  const convolver = audio.ctx.createConvolver();
  convolver.buffer = createReverbImpulse();

  effects.reverbSend.connect(convolver);
  convolver.connect(audio.ctx.destination);
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
