import {
  init as initAudio,
  audio,
  setGlideEnabled,
  setGlideTime,
  setGlideEdgesEnabled,
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
} from './effects.js';
import { init as initSettings, settings, setHoldEnabled } from './settings.js';
import { init as initDegreeJoystick, releaseAllHeld } from './degree-joystick.js';
import { init as initModifierJoystick, setJoyDirection } from './modifier-joystick.js';
import { init as initDebug, debugLog } from './debug.js';
import { chords } from './chords.js';
import { init as initFullscreen } from './fullscreen.js';

// Initialize audio system
initAudio();
initEffects();

// Wires an effect's toggle button (opens its <dialog>) plus the dialog's
// enabled checkbox and parameter sliders. `commitOn: 'change'` is for
// sliders whose onInput is expensive (regenerating a buffer) — those only
// fire once a drag settles instead of on every 'input' tick.
function wireFxDialog({ toggleBtn, dialog, enabledCheckbox, isEnabled, setEnabled, sliders }) {
  toggleBtn.addEventListener('click', () => dialog.showModal());

  // Native <dialog> has no built-in click-outside-to-close; clicking the
  // backdrop still targets the dialog element itself (its content box
  // doesn't cover the backdrop), so this is the standard light-dismiss check.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  // enabledCheckbox is optional — the envelope dialog has no on/off concept
  // (always active, not an optional effect), so it skips this whole block
  // and toggleBtn stays a plain "open the dialog" button with no
  // active/inactive state to sync.
  if (enabledCheckbox) {
    const syncToggleBtn = () => {
      toggleBtn.classList.toggle('active', isEnabled());
      toggleBtn.setAttribute('aria-pressed', String(isEnabled()));
    };
    enabledCheckbox.checked = isEnabled();
    enabledCheckbox.addEventListener('change', () => {
      setEnabled(enabledCheckbox.checked);
      syncToggleBtn();
    });
    syncToggleBtn();
  }

  sliders.forEach(({ slider, valueEl, format, onInput, commitOn = 'input' }) => {
    valueEl.textContent = format(Number(slider.value));
    slider.addEventListener(commitOn, () => {
      const value = Number(slider.value);
      onInput(value);
      valueEl.textContent = format(value);
    });
  });
}

wireFxDialog({
  toggleBtn: document.getElementById('delay-toggle'),
  dialog: document.getElementById('delay-dialog'),
  enabledCheckbox: document.getElementById('delay-enabled-checkbox'),
  isEnabled: () => effects.delayEnabled,
  setEnabled: setDelayEnabled,
  sliders: [
    {
      slider: document.getElementById('delay-time-slider'),
      valueEl: document.getElementById('delay-time-value'),
      format: (v) => `${Math.round(v * 1000)}ms`,
      onInput: setDelayTime,
    },
    {
      slider: document.getElementById('delay-feedback-slider'),
      valueEl: document.getElementById('delay-feedback-value'),
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: setDelayFeedback,
    },
    {
      slider: document.getElementById('delay-send-slider'),
      valueEl: document.getElementById('delay-send-value'),
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
const formatHz = (hz) => hz >= 1000 ? `${(hz / 1000).toFixed(1)}kHz` : `${Math.round(hz)}Hz`;

wireFxDialog({
  toggleBtn: document.getElementById('filter-toggle'),
  dialog: document.getElementById('filter-dialog'),
  enabledCheckbox: document.getElementById('filter-enabled-checkbox'),
  isEnabled: () => effects.filterEnabled,
  setEnabled: setFilterEnabled,
  sliders: [
    {
      slider: document.getElementById('filter-cutoff-slider'),
      valueEl: document.getElementById('filter-cutoff-value'),
      format: (t) => formatHz(sliderToCutoff(t)),
      onInput: (t) => setFilterCutoff(sliderToCutoff(t)),
    },
    {
      slider: document.getElementById('filter-resonance-slider'),
      valueEl: document.getElementById('filter-resonance-value'),
      format: (v) => v.toFixed(1),
      onInput: setFilterResonance,
    },
  ],
});

wireFxDialog({
  toggleBtn: document.getElementById('tremolo-toggle'),
  dialog: document.getElementById('tremolo-dialog'),
  enabledCheckbox: document.getElementById('tremolo-enabled-checkbox'),
  isEnabled: () => effects.tremoloEnabled,
  setEnabled: setTremoloEnabled,
  sliders: [
    {
      slider: document.getElementById('tremolo-rate-slider'),
      valueEl: document.getElementById('tremolo-rate-value'),
      format: (v) => `${v.toFixed(1)}Hz`,
      onInput: setTremoloRate,
    },
    {
      slider: document.getElementById('tremolo-depth-slider'),
      valueEl: document.getElementById('tremolo-depth-value'),
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: setTremoloDepth,
    },
  ],
});

// Not an audio-node insert like the other three — glide changes how note
// transitions behave, not a node in the signal graph — but it reuses the
// same checkbox+slider dialog shape via wireFxDialog for a consistent feel.
wireFxDialog({
  toggleBtn: document.getElementById('glide-toggle'),
  dialog: document.getElementById('glide-dialog'),
  enabledCheckbox: document.getElementById('glide-enabled-checkbox'),
  isEnabled: () => audio.glideEnabled,
  setEnabled: setGlideEnabled,
  sliders: [
    {
      slider: document.getElementById('glide-time-slider'),
      valueEl: document.getElementById('glide-time-value'),
      format: (v) => `${Math.round(v * 1000)}ms`,
      onInput: setGlideTime,
    },
  ],
});

// A sub-option of glide, not covered by wireFxDialog's single-checkbox
// shape: wired directly rather than stretching that helper for one caller.
const glideEdgesCheckbox = document.getElementById('glide-edges-checkbox');
glideEdgesCheckbox.checked = audio.glideEdgesEnabled;
glideEdgesCheckbox.addEventListener('change', () => {
  setGlideEdgesEnabled(glideEdgesCheckbox.checked);
});

wireFxDialog({
  toggleBtn: document.getElementById('reverb-toggle'),
  dialog: document.getElementById('reverb-dialog'),
  enabledCheckbox: document.getElementById('reverb-enabled-checkbox'),
  isEnabled: () => effects.reverbEnabled,
  setEnabled: setReverbEnabled,
  sliders: [
    {
      slider: document.getElementById('reverb-decay-slider'),
      valueEl: document.getElementById('reverb-decay-value'),
      format: (v) => `${v.toFixed(1)}s`,
      onInput: setReverbDecay,
      commitOn: 'change',
    },
    {
      slider: document.getElementById('reverb-send-slider'),
      valueEl: document.getElementById('reverb-send-value'),
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: setReverbSendLevel,
    },
  ],
});

// Hold has no adjustable parameter, so it's a direct click-toggle rather
// than a dialog like the others. Both joysticks read settings.holdEnabled
// directly in their own event handlers to decide whether a release
// actually stops the note/modifier; this button just flips that flag and,
// on the way off, force-releases anything currently latched — the only
// reset keyboard play has, since it has no "drag to center" gesture of
// its own.
const holdToggleBtn = document.getElementById('hold-toggle');
holdToggleBtn.addEventListener('click', () => {
  const enabled = !settings.holdEnabled;
  setHoldEnabled(enabled);
  holdToggleBtn.classList.toggle('active', enabled);
  holdToggleBtn.setAttribute('aria-pressed', String(enabled));
  if (!enabled) {
    releaseAllHeld();
    setJoyDirection('center');
  }
});

// Basic ADSR — always active, so no enabledCheckbox (see wireFxDialog).
// Shapes every voice's gain from the moment it starts, not just an
// optional effect layered on top, so there's nothing to turn off here.
wireFxDialog({
  toggleBtn: document.getElementById('envelope-toggle'),
  dialog: document.getElementById('envelope-dialog'),
  sliders: [
    {
      slider: document.getElementById('envelope-attack-slider'),
      valueEl: document.getElementById('envelope-attack-value'),
      format: (v) => `${Math.round(v * 1000)}ms`,
      onInput: setEnvelopeAttack,
    },
    {
      slider: document.getElementById('envelope-decay-slider'),
      valueEl: document.getElementById('envelope-decay-value'),
      format: (v) => `${Math.round(v * 1000)}ms`,
      onInput: setEnvelopeDecay,
    },
    {
      slider: document.getElementById('envelope-sustain-slider'),
      valueEl: document.getElementById('envelope-sustain-value'),
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: setEnvelopeSustain,
    },
    {
      slider: document.getElementById('envelope-release-slider'),
      valueEl: document.getElementById('envelope-release-value'),
      format: (v) => `${Math.round(v * 1000)}ms`,
      onInput: setEnvelopeRelease,
    },
  ],
});

// Initialize UI
initDebug();
initSettings();
initDegreeJoystick();
initModifierJoystick();

// Bind-key hint labels on the wedges start hidden — only a device actually
// driven by a keyboard should see them. The first keydown matching one of
// the bound play/modifier keys reveals them; a touchstart hides them again,
// since a hybrid device (e.g. a touchscreen laptop) can switch modality
// mid-session.
const BIND_KEYS = new Set([
  ...chords.DEGREES.map(d => d.bindKey),
  'j', 'i', 'k', 'o', 'l', 'p', ';', '[',
]);
window.addEventListener('keydown', (e) => {
  if (BIND_KEYS.has(e.key.toLowerCase())) document.body.classList.add('keyboard-active');
});
window.addEventListener('touchstart', () => document.body.classList.remove('keyboard-active'), { passive: true });
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
