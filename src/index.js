import { init as initAudio } from './audio.js';
import {
  init as initEffects,
  effects,
  setDelayEnabled,
  setReverbEnabled,
  setFilterEnabled,
  setDelayTime,
  setDelayFeedback,
  setDelaySendLevel,
  setReverbDecay,
  setReverbSendLevel,
  setFilterCutoff,
  setFilterResonance,
} from './effects.js';
import { init as initSettings } from './settings.js';
import { init as initDegreeJoystick } from './degree-joystick.js';
import { init as initModifierJoystick } from './modifier-joystick.js';
import { init as initDebug, debugLog } from './debug.js';
import { init as initFullscreen } from './fullscreen.js';

// Initialize audio system
initAudio();
initEffects();

// Wires an effect's toggle button (opens its <dialog>) plus the dialog's
// enabled checkbox and parameter sliders. `commitOn: 'change'` is for
// sliders whose onInput is expensive (regenerating a buffer) — those only
// fire once a drag settles instead of on every 'input' tick.
function wireFxDialog({ toggleBtn, dialog, enabledCheckbox, isEnabled, setEnabled, sliders }) {
  function syncToggleBtn() {
    toggleBtn.classList.toggle('active', isEnabled());
    toggleBtn.setAttribute('aria-pressed', String(isEnabled()));
  }

  toggleBtn.addEventListener('click', () => dialog.showModal());

  // Native <dialog> has no built-in click-outside-to-close; clicking the
  // backdrop still targets the dialog element itself (its content box
  // doesn't cover the backdrop), so this is the standard light-dismiss check.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  enabledCheckbox.checked = isEnabled();
  enabledCheckbox.addEventListener('change', () => {
    setEnabled(enabledCheckbox.checked);
    syncToggleBtn();
  });

  sliders.forEach(({ slider, valueEl, format, onInput, commitOn = 'input' }) => {
    valueEl.textContent = format(Number(slider.value));
    slider.addEventListener(commitOn, () => {
      const value = Number(slider.value);
      onInput(value);
      valueEl.textContent = format(value);
    });
  });

  syncToggleBtn();
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

// Initialize UI
initDebug();
initSettings();
initDegreeJoystick();
initModifierJoystick();
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
