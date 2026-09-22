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
import { setWaveType } from './audio.js';
import { loadSettings, scheduleSave, flushSave } from './persistence.js';
import { init as initDegreeJoystick, releaseAllHeld, syncArpToHeldChord, setKeyRoot } from './degree-joystick.js';
import { init as initModifierJoystick, setJoyDirection } from './modifier-joystick.js';
import { init as initDebug, debugLog } from './debug.js';
import { chords } from './chords.js';
import { init as initFullscreen } from './fullscreen.js';
import { arpeggiator, ORDER_NAMES, setArpEnabled, setArpOrder, setArpRate } from './arpeggiator.js';

// Initialize audio system
initAudio();
initEffects();

// Restore saved settings before anything reads state to build the UI: every
// control below initialises itself from the live state rather than from the
// markup's own default, so this is what makes them come up showing what was
// saved. It has to run after initEffects(), since the setters it drives push
// values straight into audio nodes that only exist once that has run.
loadSettings();

// A plain tap/click flips the effect on/off directly; holding the button
// down for LONG_PRESS_MS instead opens its <dialog> for editing parameters.
// This lets the toolbar double as both an at-a-glance on/off panel and an
// entry point to detail, without a second control per effect.
const LONG_PRESS_MS = 450;

// Wires an effect's toggle button (tap = on/off, long-press = opens its
// <dialog>) plus the dialog's parameter sliders. `commitOn: 'change'` is for
// sliders whose onInput is expensive (regenerating a buffer) — those only
// fire once a drag settles instead of on every 'input' tick.
function wireFxDialog({ toggleBtn, dialog, isEnabled, setEnabled, sliders }) {
  // isEnabled/setEnabled are optional — the envelope dialog has no on/off
  // concept (always active, not an optional effect), so it skips this whole
  // block and toggleBtn only ever opens the dialog, with no press-duration
  // distinction and no active/inactive state to sync.
  if (isEnabled) {
    const syncToggleBtn = () => {
      toggleBtn.classList.toggle('active', isEnabled());
      toggleBtn.setAttribute('aria-pressed', String(isEnabled()));
    };

    // Pointer (not click) so we can measure hold duration; a long-press
    // opens the dialog and suppresses the toggle that would otherwise fire
    // on release. pointercancel covers the drag-off-button/interruption
    // case so a stray pointerdown can't leave the timer running.
    let pressTimer = null;
    let longPressed = false;
    toggleBtn.addEventListener('pointerdown', () => {
      longPressed = false;
      pressTimer = setTimeout(() => {
        longPressed = true;
        dialog.showModal();
      }, LONG_PRESS_MS);
    });
    const cancelPress = () => {
      clearTimeout(pressTimer);
      pressTimer = null;
    };
    toggleBtn.addEventListener('pointerup', () => {
      cancelPress();
      if (longPressed) return;
      setEnabled(!isEnabled());
      syncToggleBtn();
      scheduleSave();
    });
    toggleBtn.addEventListener('pointercancel', cancelPress);
    toggleBtn.addEventListener('pointerleave', cancelPress);

    syncToggleBtn();
  } else {
    toggleBtn.addEventListener('click', () => dialog.showModal());
  }

  // Native <dialog> has no built-in click-outside-to-close; clicking the
  // backdrop still targets the dialog element itself (its content box
  // doesn't cover the backdrop), so this is the standard light-dismiss check.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  // `value` reads the slider's position back out of live state, so state is
  // the single source of truth and the markup's `value` attribute is only a
  // fallback for a setting that was never saved. Without it a restored
  // setting would be audible but show the markup default on its slider.
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

wireFxDialog({
  toggleBtn: document.getElementById('delay-toggle'),
  dialog: document.getElementById('delay-dialog'),
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

wireFxDialog({
  toggleBtn: document.getElementById('filter-toggle'),
  dialog: document.getElementById('filter-dialog'),
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

wireFxDialog({
  toggleBtn: document.getElementById('tremolo-toggle'),
  dialog: document.getElementById('tremolo-dialog'),
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
// same checkbox+slider dialog shape via wireFxDialog for a consistent feel.
wireFxDialog({
  toggleBtn: document.getElementById('glide-toggle'),
  dialog: document.getElementById('glide-dialog'),
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

// A sub-option of glide, not covered by wireFxDialog's single-checkbox
// shape: wired directly rather than stretching that helper for one caller.
const glideEdgesCheckbox = document.getElementById('glide-edges-checkbox');
glideEdgesCheckbox.checked = audio.glideEdgesEnabled;
glideEdgesCheckbox.addEventListener('change', () => {
  setGlideEdgesEnabled(glideEdgesCheckbox.checked);
  scheduleSave();
});

wireFxDialog({
  toggleBtn: document.getElementById('reverb-toggle'),
  dialog: document.getElementById('reverb-dialog'),
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

// Hold has no adjustable parameter, so it's a direct click-toggle rather
// than a dialog like the others. Both joysticks read settings.holdEnabled
// directly in their own event handlers to decide whether a release
// actually stops the note/modifier; this button just flips that flag and,
// on the way off, force-releases anything currently latched — the only
// reset keyboard play has, since it has no "drag to center" gesture of
// its own.
const holdToggleBtn = document.getElementById('hold-toggle');
const syncHoldBtn = () => {
  holdToggleBtn.classList.toggle('active', settings.holdEnabled);
  holdToggleBtn.setAttribute('aria-pressed', String(settings.holdEnabled));
};
holdToggleBtn.addEventListener('click', () => {
  const enabled = !settings.holdEnabled;
  setHoldEnabled(enabled);
  syncHoldBtn();
  if (!enabled) {
    releaseAllHeld();
    setJoyDirection('center');
  }
  scheduleSave();
});
// Unlike the dialog-backed toggles (which wireFxDialog syncs for us), this
// one had no initial sync at all — harmless while it always started off, but
// a restored Hold would have been active with the button still looking idle.
syncHoldBtn();

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
// stretching wireFxDialog's sliders-only shape for one extra control.
wireFxDialog({
  toggleBtn: document.getElementById('arp-toggle'),
  dialog: document.getElementById('arp-dialog'),
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

// Settings writes are debounced, so a pending one needs forcing out before
// the page can go away. iOS Safari often never fires 'beforeunload' when an
// app is swiped away or backgrounded; these two do fire there.
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});

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
