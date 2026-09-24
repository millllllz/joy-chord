import { audio, init as initAudio } from './audio.js';
import { effects, setVocoderSendEnabled } from './effects.js';
import { debugLog } from './debug.js';

// A classic filter-bank vocoder, built entirely from stock Web Audio nodes
// (no AudioWorklet/ScriptProcessor needed): the mic (modulator) and the
// chord's own tone (carrier, tapped from effects.vocoderCarrierBus) are each
// split into the same log-spaced frequency bands; each mic band is rectified
// and smoothed into an envelope, which then drives the matching carrier
// band's gain. Summing all bands back together reconstructs the chord's
// timbre shaped by the voice's formants — the "talking synth" effect.
export const vocoder = {
  micStream: null,
  micSource: null,
  // Built once, on the first successful mic grant, and reused across every
  // later enable/disable — only the mic connection into them comes and goes
  // (see connectMic/disconnectMic). Rebuilding the whole bank on every
  // toggle would be wasted work for nodes whose shape never changes. Each
  // entry only keeps the two node refs anything outside buildBands actually
  // needs again: modFilter (to (dis)connect the mic) and bandGain (so tests
  // can confirm the graph without duplicating buildBands' own wiring logic).
  bands: [],
};

const BAND_COUNT = 10;
const BAND_MIN_HZ = 180;
const BAND_MAX_HZ = 6000;
const BAND_Q = 4;
// Lowpass cutoff for each band's envelope follower. Too low and the vocoder
// can't track fast syllables (mushy); too high and the rectified waveform's
// own ripple (at the mic's fundamental pitch) leaks through as audible buzz
// instead of a smooth envelope. 20Hz is a standard middle ground.
const ENVELOPE_HZ = 20;

// Log-spaced, not linear — matches how both pitch and the vocal formants a
// vocoder needs to resolve are actually distributed.
function bandFrequencies() {
  const freqs = [];
  for (let i = 0; i < BAND_COUNT; i++) {
    const t = BAND_COUNT === 1 ? 0 : i / (BAND_COUNT - 1);
    freqs.push(BAND_MIN_HZ * Math.pow(BAND_MAX_HZ / BAND_MIN_HZ, t));
  }
  return freqs;
}

// WaveShaperNode's curve is a lookup table over its input range (-1..1 by
// default); a curve of abs(x) turns it into a full-wave rectifier, the first
// half of a cheap envelope follower (rectify, then lowpass below).
function rectifierCurve() {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.abs(x);
  }
  return curve;
}

function buildBands() {
  const curve = rectifierCurve();
  bandFrequencies().forEach(freq => {
    const modFilter = audio.ctx.createBiquadFilter();
    modFilter.type = 'bandpass';
    modFilter.frequency.value = freq;
    modFilter.Q.value = BAND_Q;

    const rectifier = audio.ctx.createWaveShaper();
    rectifier.curve = curve;
    modFilter.connect(rectifier);

    const envelope = audio.ctx.createBiquadFilter();
    envelope.type = 'lowpass';
    envelope.frequency.value = ENVELOPE_HZ;
    rectifier.connect(envelope);

    const carrierFilter = audio.ctx.createBiquadFilter();
    carrierFilter.type = 'bandpass';
    carrierFilter.frequency.value = freq;
    carrierFilter.Q.value = BAND_Q;
    effects.vocoderCarrierBus.connect(carrierFilter);

    // Baseline 0, with the envelope connected straight into the gain
    // AudioParam: an audio-rate connection into a param *adds* to its value
    // rather than replacing it, so with nothing else setting this gain, the
    // envelope's own signal becomes the gain outright — a standard trick for
    // getting sidechain-style amplitude control without a ScriptProcessor.
    const bandGain = audio.ctx.createGain();
    bandGain.gain.value = 0;
    carrierFilter.connect(bandGain);
    envelope.connect(bandGain.gain);
    bandGain.connect(effects.vocoderOutputBus);

    vocoder.bands.push({ modFilter, bandGain });
  });
}

function connectMic(source) {
  vocoder.bands.forEach(({ modFilter }) => source.connect(modFilter));
}

function disconnectMic(source) {
  vocoder.bands.forEach(({ modFilter }) => {
    try {
      source.disconnect(modFilter);
    } catch {
      // Already disconnected (e.g. the track ended on its own) — fine, that
      // was the goal anyway.
    }
  });
}

function releaseMic() {
  if (vocoder.micSource) disconnectMic(vocoder.micSource);
  if (vocoder.micStream) vocoder.micStream.getTracks().forEach(track => track.stop());
  vocoder.micStream = null;
  vocoder.micSource = null;
}

// Async, unlike every other effect's enable setter — turning the mic on is
// a permission request, not just an audio-param write. Callers (index.js's
// wireFxDialog) await/`.then()` this to know when the toggle's visual state
// should actually catch up, since it can't assume success.
//
// Deliberately never called automatically on page load / settings restore
// (see persistence.js — only VOCODER_SEND_LEVEL is persisted, not this):
// silently reopening the mic on every visit, with no fresh gesture, is worse
// UX than just asking again, and some browsers would block/prompt weirdly
// for it anyway.
export async function setVocoderEnabled(enabled) {
  if (enabled === effects.vocoderEnabled) return;

  if (!enabled) {
    setVocoderSendEnabled(false);
    releaseMic();
    return;
  }

  initAudio();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    debugLog('vocoder: getUserMedia not supported on this browser');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (vocoder.bands.length === 0) buildBands();
    vocoder.micStream = stream;
    vocoder.micSource = audio.ctx.createMediaStreamSource(stream);
    connectMic(vocoder.micSource);
    setVocoderSendEnabled(true);
  } catch (err) {
    // Permission denied, no mic present, blocked by browser policy, etc. —
    // none of these should take the app down; just stay off and say why in
    // the debug panel, the same place every other startup diagnostic goes.
    debugLog(`vocoder mic access failed: ${err.name}: ${err.message}`);
  }
}
