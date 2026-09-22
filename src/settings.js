import { chords } from './chords.js';
import { audio } from './audio.js';

export const settings = {
  currentKeyRoot: 0,
  KEY_NAMES: chords.KEY_NAMES,
  WAVE_TYPES: chords.WAVE_TYPES,
  // When on, both joysticks latch on release instead of stopping — see
  // degree-joystick.js/modifier-joystick.js for where this is read.
  holdEnabled: false,
  // When on, voicesForDegree (degree-joystick.js) adds the chord root two
  // octaves down alongside the regular chord tones.
  bassEnabled: false,
};

export function init() {
  const keySelectEl = document.getElementById('key-select');
  // KEY_NAMES is indexed by semitone-from-C4 (C=0 first), which is also
  // each option's value — that mapping can't change without shifting what
  // every existing currentKeyRoot number means. Only the *display* order
  // is rotated to start at A (the conventional listing order), independent
  // of which value ends up selected by default (still C, i.e. root 0).
  // A/A#/B (indices 9-11) sit right before C in that rotated list, so their
  // raw semitone-from-C4 values (9-11) would put them an octave *above*
  // C-G#, breaking the visually-implied ascending run — drop them an
  // octave so pitch rises smoothly across the whole dropdown.
  const startAt = settings.KEY_NAMES.indexOf('A');
  const displayOrder = [...settings.KEY_NAMES.slice(startAt), ...settings.KEY_NAMES.slice(0, startAt)];
  displayOrder.forEach(name => {
    const option = document.createElement('option');
    const semitone = settings.KEY_NAMES.indexOf(name);
    option.value = semitone >= startAt ? semitone - 12 : semitone;
    option.textContent = name;
    keySelectEl.appendChild(option);
  });
  // Value only — the change handler is wired in index.js, alongside every
  // other control. It has to be: the real setKeyRoot lives in
  // degree-joystick.js (it re-voices whatever is currently held), and
  // importing that from here would close an import cycle, since
  // degree-joystick.js already reads this module. Reading the value from
  // state rather than hard-coding a default is also what lets a restored
  // key show up in the dropdown (see persistence.js).
  keySelectEl.value = settings.currentKeyRoot;

  const waveSelectEl = document.getElementById('wave-select');
  settings.WAVE_TYPES.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type[0].toUpperCase() + type.slice(1);
    waveSelectEl.appendChild(option);
  });
  // Same split as the key dropdown above: contents here, behaviour in
  // index.js.
  waveSelectEl.value = audio.currentWaveType;
}

export function setHoldEnabled(enabled) {
  settings.holdEnabled = enabled;
}

export function setBassEnabled(enabled) {
  settings.bassEnabled = enabled;
}
