import {
  init as initAudio,
  audio,
  setUnisonEnabled,
  setUnisonVoices,
  setUnisonDetune,
  setUnisonSpread,
  setGlideEnabled,
  setGlideTime,
  setEnvelopeAttack,
  setEnvelopeDecay,
  setEnvelopeSustain,
  setEnvelopeRelease,
} from './audio.js';
import {
  init as initEffects,
  effects,
  setDelayEnabled,
  setReverbEnabled,
  setFilterEnabled,
  setTremoloEnabled,
  setDelayTime,
  setDelayFeedback,
  setDelaySendLevel,
  setReverbDecay,
  setReverbSendLevel,
  setFilterCutoff,
  setFilterResonance,
  setTremoloRate,
  setTremoloDepth,
  setVocoderSendLevel,
} from './effects.js';
import { setVocoderEnabled } from './vocoder.js';
import { init as initSettings, settings, setHoldEnabled, setBassEnabled } from './settings.js';
import { setWaveType } from './audio.js';
import { loadSettings, scheduleSave, flushSave } from './persistence.js';
import { init as initDegreeJoystick, syncArpToHeldChord, setKeyRoot, setModifierSet, setOctave } from './degree-joystick.js';
import { init as initModifierJoystick, renderWedgeLabels } from './modifier-joystick.js';
import { init as initKeyboardView, refreshKeyboardViewLabels } from './keyboard-view.js';
import { init as initPiano, setControlSurface, setPianoMode, releasePiano } from './piano-surface.js';
import { init as initDebug, debugLog } from './debug.js';
import { chords } from './chords.js';
import { init as initFullscreen } from './fullscreen.js';
import { arpeggiator, ORDER_NAMES, setArpEnabled, setArpOrder, setArpRate } from './arpeggiator.js';
import { initMIDI } from './midi.js';

// Initialize audio system
initAudio();
initEffects();
initMIDI().catch(() => {}); // MIDI is optional; suppress errors on unsupported browsers

// Restore saved settings before anything reads state to build the UI: every
// control below initialises itself from the live state rather than from the
// markup's own default, so this is what makes them come up showing what was
// saved. It has to run after initEffects(), since the setters it drives push
// values straight into audio nodes that only exist once that has run.
loadSettings();

// One settings dialog holds every effect and sound control, out of the way of
// the playing surface. Each effect is a collapsible section with its own on/off
// switch; `commitOn: 'change'` is for sliders whose onInput is expensive
// (regenerating a buffer), so those only fire once a drag settles.
function wireFxSection({ toggle, isEnabled, setEnabled, sliders }) {
  if (toggle) {
    toggle.checked = isEnabled();
    toggle.addEventListener('change', () => {
      // Vocoder's setEnabled is async (mic permission) and may fail, so the
      // switch re-reads the real state once it settles instead of trusting
      // the click.
      Promise.resolve(setEnabled(toggle.checked)).then(() => {
        toggle.checked = isEnabled();
        scheduleSave();
      });
    });
  }

  // `value` reads the slider's position back out of live state, so state is
  // the single source of truth and the markup's `value` attribute is only a
  // fallback for a setting that was never saved.
  sliders.forEach(({ slider, valueEl, format, value, onInput, commitOn = 'input' }) => {
    slider.value = value();
    valueEl.textContent = format(Number(slider.value));
    slider.addEventListener(commitOn, () => {
      const next = Number(slider.value);
      onInput(next);
      valueEl.textContent = format(next);
      scheduleSave();
    });
  });
}

const settingsDialog = document.getElementById('settings-dialog');
document.getElementById('settings-btn').addEventListener('click', () => settingsDialog.showModal());
// Native <dialog> has no click-outside-to-close; a backdrop click targets the
// dialog element itself, since its content box doesn't cover the backdrop.
settingsDialog.addEventListener('click', (e) => {
  if (e.target === settingsDialog) settingsDialog.close();
});

wireFxSection({
  toggle: document.getElementById('delay-toggle'),
  isEnabled: () => effects.delayEnabled,
  setEnabled: setDelayEnabled,
  sliders: [
    {
      slider: document.getElementById('delay-time-slider'),
      valueEl: document.getElementById('delay-time-value'),
      value: () => effects.DELAY_TIME,
      format: (v) => `${Math.round(v * 1000)}ms`,
      onInput: setDelayTime,
    },
    {
      slider: document.getElementById('delay-feedback-slider'),
      valueEl: document.getElementById('delay-feedback-value'),
      value: () => effects.DELAY_FEEDBACK,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: setDelayFeedback,
    },
    {
      slider: document.getElementById('delay-send-slider'),
      valueEl: document.getElementById('delay-send-value'),
      value: () => effects.DELAY_SEND_LEVEL,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: setDelaySendLevel,
    },
  ],
});

// Cutoff is perceived logarithmically, so the slider's 0-1 travel maps to
// frequency exponentially rather than linearly — otherwise most of the
// track would be spent below 1kHz.
const FILTER_CUTOFF_MIN = 150;
const FILTER_CUTOFF_MAX = 12000;
const sliderToCutoff = (t) => FILTER_CUTOFF_MIN * Math.pow(FILTER_CUTOFF_MAX / FILTER_CUTOFF_MIN, t);
// Inverse of the above: the stored setting is a frequency, but the slider's
// own position is the 0-1 travel, so restoring one needs the mapping run
// backwards.
const cutoffToSlider = (hz) => Math.log(hz / FILTER_CUTOFF_MIN) / Math.log(FILTER_CUTOFF_MAX / FILTER_CUTOFF_MIN);
const formatHz = (hz) => hz >= 1000 ? `${(hz / 1000).toFixed(1)}kHz` : `${Math.round(hz)}Hz`;

wireFxSection({
  toggle: document.getElementById('filter-toggle'),
  isEnabled: () => effects.filterEnabled,
  setEnabled: setFilterEnabled,
  sliders: [
    {
      slider: document.getElementById('filter-cutoff-slider'),
      valueEl: document.getElementById('filter-cutoff-value'),
      value: () => cutoffToSlider(effects.FILTER_CUTOFF),
      format: (t) => formatHz(sliderToCutoff(t)),
      onInput: (t) => setFilterCutoff(sliderToCutoff(t)),
    },
    {
      slider: document.getElementById('filter-resonance-slider'),
      valueEl: document.getElementById('filter-resonance-value'),
      value: () => effects.FILTER_RESONANCE,
      format: (v) => v.toFixed(1),
      onInput: setFilterResonance,
    },
  ],
});

wireFxSection({
  toggle: document.getElementById('tremolo-toggle'),
  isEnabled: () => effects.tremoloEnabled,
  setEnabled: setTremoloEnabled,
  sliders: [
    {
      slider: document.getElementById('tremolo-rate-slider'),
      valueEl: document.getElementById('tremolo-rate-value'),
      value: () => effects.TREMOLO_RATE,
      format: (v) => `${v.toFixed(1)}Hz`,
      onInput: setTremoloRate,
    },
    {
      slider: document.getElementById('tremolo-depth-slider'),
      valueEl: document.getElementById('tremolo-depth-value'),
      value: () => effects.TREMOLO_DEPTH,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: setTremoloDepth,
    },
  ],
});

// Not an audio-node insert like the other three — glide changes how note
// transitions behave, not a node in the signal graph — but it reuses the
// same switch+slider section shape for a consistent feel.
wireFxSection({
  toggle: document.getElementById('glide-toggle'),
  isEnabled: () => audio.glideEnabled,
  setEnabled: setGlideEnabled,
  sliders: [
    {
      slider: document.getElementById('glide-time-slider'),
      valueEl: document.getElementById('glide-time-value'),
      value: () => audio.GLIDE_TIME,
      format: (v) => `${Math.round(v * 1000)}ms`,
      onInput: setGlideTime,
    },
  ],
});

// Also not an effects-node insert (see the Glide comment above) — each
// voice's own oscillator count/detune/pan, set once at startVoice, not a
// node in the shared signal graph.
wireFxSection({
  toggle: document.getElementById('unison-toggle'),
  isEnabled: () => audio.unisonEnabled,
  setEnabled: setUnisonEnabled,
  sliders: [
    {
      slider: document.getElementById('unison-voices-slider'),
      valueEl: document.getElementById('unison-voices-value'),
      value: () => audio.UNISON_VOICES,
      format: (v) => `${Math.round(v)}`,
      onInput: (v) => setUnisonVoices(Math.round(v)),
    },
    {
      slider: document.getElementById('unison-detune-slider'),
      valueEl: document.getElementById('unison-detune-value'),
      value: () => audio.UNISON_DETUNE,
      format: (v) => `${Math.round(v)}c`,
      onInput: setUnisonDetune,
    },
    {
      slider: document.getElementById('unison-spread-slider'),
      valueEl: document.getElementById('unison-spread-value'),
      value: () => audio.UNISON_SPREAD,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: setUnisonSpread,
    },
  ],
});

// setEnabled here is async (mic permission) — see the Promise.resolve(...)
// wrapping in wireFxSection above, which is what makes an async setEnabled
// safe to mix in with every other (synchronous) effect on this same helper.
wireFxSection({
  toggle: document.getElementById('vocoder-toggle'),
  isEnabled: () => effects.vocoderEnabled,
  setEnabled: setVocoderEnabled,
  sliders: [
    {
      slider: document.getElementById('vocoder-mix-slider'),
      valueEl: document.getElementById('vocoder-mix-value'),
      value: () => effects.VOCODER_SEND_LEVEL,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: setVocoderSendLevel,
    },
  ],
});

wireFxSection({
  toggle: document.getElementById('reverb-toggle'),
  isEnabled: () => effects.reverbEnabled,
  setEnabled: setReverbEnabled,
  sliders: [
    {
      slider: document.getElementById('reverb-decay-slider'),
      valueEl: document.getElementById('reverb-decay-value'),
      value: () => effects.REVERB_DECAY,
      format: (v) => `${v.toFixed(1)}s`,
      onInput: setReverbDecay,
      commitOn: 'change',
    },
    {
      slider: document.getElementById('reverb-send-slider'),
      valueEl: document.getElementById('reverb-send-value'),
      value: () => effects.REVERB_SEND_LEVEL,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: setReverbSendLevel,
    },
  ],
});

// Both surfaces read settings.holdEnabled in their own release handlers to
// decide whether letting go actually stops the chord; turning it off
// force-releases anything latched, the only reset keyboard play has.
const holdToggle = document.getElementById('hold-toggle');
holdToggle.checked = settings.holdEnabled;
holdToggle.addEventListener('change', () => {
  setHoldEnabled(holdToggle.checked);
  if (!holdToggle.checked) releasePiano();
  scheduleSave();
});

// Read by voicesForDegree (degree-joystick.js) on the next chord change —
// doesn't retroactively add/remove the bass note from whatever is sounding.
const bassToggle = document.getElementById('bass-toggle');
bassToggle.checked = settings.bassEnabled;
bassToggle.addEventListener('change', () => {
  setBassEnabled(bassToggle.checked);
  scheduleSave();
});

// Basic ADSR — always active, so no on/off switch.
// Shapes every voice's gain from the moment it starts, not just an
// optional effect layered on top, so there's nothing to turn off here.
wireFxSection({
  sliders: [
    {
      slider: document.getElementById('envelope-attack-slider'),
      valueEl: document.getElementById('envelope-attack-value'),
      value: () => audio.ENVELOPE_ATTACK,
      format: (v) => `${Math.round(v * 1000)}ms`,
      onInput: setEnvelopeAttack,
    },
    {
      slider: document.getElementById('envelope-decay-slider'),
      valueEl: document.getElementById('envelope-decay-value'),
      value: () => audio.ENVELOPE_DECAY,
      format: (v) => `${Math.round(v * 1000)}ms`,
      onInput: setEnvelopeDecay,
    },
    {
      slider: document.getElementById('envelope-sustain-slider'),
      valueEl: document.getElementById('envelope-sustain-value'),
      value: () => audio.ENVELOPE_SUSTAIN,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: setEnvelopeSustain,
    },
    {
      slider: document.getElementById('envelope-release-slider'),
      valueEl: document.getElementById('envelope-release-value'),
      value: () => audio.ENVELOPE_RELEASE,
      format: (v) => `${Math.round(v * 1000)}ms`,
      onInput: setEnvelopeRelease,
    },
  ],
});

// Arp has an enabled toggle and a rate slider like the other fx dialogs, but
// also an order <select> (not a slider) — wired directly rather than
// stretching wireFxSection's sliders-only shape for one extra control.
wireFxSection({
  toggle: document.getElementById('arp-toggle'),
  isEnabled: () => arpeggiator.enabled,
  setEnabled: (enabled) => {
    setArpEnabled(enabled);
    syncArpToHeldChord();
  },
  sliders: [
    {
      slider: document.getElementById('arp-rate-slider'),
      valueEl: document.getElementById('arp-rate-value'),
      value: () => arpeggiator.RATE_HZ,
      format: (v) => `${v.toFixed(1)}Hz`,
      onInput: setArpRate,
    },
  ],
});

const ORDER_LABELS = {
  up: 'Up', down: 'Down', 'up-down': 'Up/Down', 'down-up': 'Down/Up', random: 'Random',
};
const arpOrderSelect = document.getElementById('arp-order-select');
ORDER_NAMES.forEach(name => {
  const option = document.createElement('option');
  option.value = name;
  option.textContent = ORDER_LABELS[name];
  arpOrderSelect.appendChild(option);
});
arpOrderSelect.value = arpeggiator.order;
arpOrderSelect.addEventListener('change', () => {
  setArpOrder(arpOrderSelect.value);
  scheduleSave();
});

// Initialize UI
initDebug();
initSettings();
initDegreeJoystick();
initModifierJoystick();
// After both of the above — keyboard-view.js reads their held/direction
// state on every keydown/keyup (see its own comment), so its listeners
// have to be registered, and therefore fire, after theirs.
initKeyboardView();
initPiano();

// The key and wave dropdowns: settings.js populates their options and sets
// the current value, index.js wires what they do — same split as every other
// control here. Key specifically has to be wired from this side, because the
// setKeyRoot that re-voices a held chord lives in degree-joystick.js and
// settings.js can't import it without closing a cycle. It used to call a
// local stub that only assigned the field, so changing key while holding a
// chord left that chord sounding in the old key until it was re-pressed.
const keySelectEl = document.getElementById('key-select');
keySelectEl.addEventListener('change', () => {
  setKeyRoot(Number(keySelectEl.value));
  scheduleSave();
});

const waveSelectEl = document.getElementById('wave-select');
waveSelectEl.addEventListener('change', () => {
  setWaveType(waveSelectEl.value);
  scheduleSave();
});

// Same split, same reason: the real setModifierSet lives in degree-
// joystick.js (it re-voices a held chord and repaints all 8 wedge labels).
const modifierSetSelectEl = document.getElementById('modifier-set-select');
modifierSetSelectEl.addEventListener('change', () => {
  setModifierSet(modifierSetSelectEl.value);
  // The on-screen keyboard's modifier-key labels are the one thing keyboard-
  // view.js doesn't already pick up live (see its own comment on why) — this
  // is the one place that changes them, so it's the one place that has to
  // ask it to refresh.
  refreshKeyboardViewLabels();
  scheduleSave();
});

const surfaceSelectEl = document.getElementById('surface-select');
surfaceSelectEl.value = settings.controlSurface;
surfaceSelectEl.addEventListener('change', () => {
  setControlSurface(surfaceSelectEl.value);
  scheduleSave();
});

const pianoModeSelectEl = document.getElementById('piano-mode-select');
pianoModeSelectEl.value = settings.pianoMode;
pianoModeSelectEl.addEventListener('change', () => {
  setPianoMode(pianoModeSelectEl.value);
  scheduleSave();
});

// Same split again: the real setOctave lives in degree-joystick.js (it
// re-voices a held chord).
const octaveSelectEl = document.getElementById('octave-select');
octaveSelectEl.addEventListener('change', () => {
  setOctave(Number(octaveSelectEl.value));
  scheduleSave();
});

// Settings writes are debounced, so a pending one needs forcing out before
// the page can go away. iOS Safari often never fires 'beforeunload' when an
// app is swiped away or backgrounded; these two do fire there.
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});

// body.keyboard-active is the single switch for "which input am I actually
// using right now": it reveals the wedges' own bind-key hints, and (see
// style.css) swaps each joystick SVG for keyboard-view.js's on-screen
// keyboard of the same shortcuts, laid out in real QWERTY positions. The
// first keydown matching one of the bound play/modifier keys turns it on;
// a mousedown or touchstart turns it back off, since a hybrid device (e.g.
// a touchscreen laptop, or a keyboard plugged into a touch tablet) can
// switch modality mid-session and the UI should follow whichever one was
// actually just used, not stay stuck on the first.
const BIND_KEYS = new Set([
  ...chords.DEGREES.map(d => d.bindKey),
  'j', 'i', 'k', 'o', 'l', 'p', ';', '[',
]);
window.addEventListener('keydown', (e) => {
  if (BIND_KEYS.has(e.key.toLowerCase())) document.body.classList.add('keyboard-active');
});
// A press/release while in keyboard mode calls renderWedgeLabels() with the
// modifier joystick's <svg> sitting at display: none (see style.css) —
// getBBox() returns a zero-size box for anything inside a display: none
// element, which silently corrupts the split two-line wedge labels'
// (Maj/Min, Maj7/min7, ...) getBBox()-measured positioning, and it stays
// corrupted once the svg is visible again, since nothing else re-renders
// it. Re-running it right as the svg becomes visible again — geometry is
// measurable by then — is what actually fixes it, not just the CSS swap.
function exitKeyboardMode() {
  if (!document.body.classList.contains('keyboard-active')) return;
  document.body.classList.remove('keyboard-active');
  renderWedgeLabels();
}
window.addEventListener('touchstart', exitKeyboardMode, { passive: true });
window.addEventListener('mousedown', exitKeyboardMode);
initFullscreen();

// Register PWA service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => debugLog(`service worker registered, scope: ${reg.scope}`))
      .catch(err => debugLog(`service worker registration failed: ${err.name}: ${err.message}`));
  });
} else {
  debugLog('serviceWorker not supported');
}
