import { chords, MODIFIER_SET_NAMES, MODIFIER_SET_LABELS } from './chords.js';
import { audio } from './audio.js';

export const OCTAVE_RANGE = [-2, -1, 0, 1, 2];

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
  // Which of the modifier stick's 8-direction chord sets is active — see
  // MODIFIER_SET_NAMES/getModifierChord in chords.js.
  modifierSet: 'default',
  // Whole octaves (in semitones: octaveOffset * 12), added to every held
  // chord tone and the Bass mode note alike — see voicesForDegree in
  // degree-joystick.js. -2..2, matching the range most keyboards/synths
  // offer for an octave-shift control.
  octaveOffset: 0,
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

  const modifierSetSelectEl = document.getElementById('modifier-set-select');
  MODIFIER_SET_NAMES.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = MODIFIER_SET_LABELS[name];
    modifierSetSelectEl.appendChild(option);
  });
  // Same split again: the real setModifierSet lives in degree-joystick.js
  // (it re-voices a held chord and re-renders the wedge labels), so — like
  // setKeyRoot — it's wired from index.js rather than here, to avoid the
  // same import cycle.
  modifierSetSelectEl.value = settings.modifierSet;

  const octaveSelectEl = document.getElementById('octave-select');
  OCTAVE_RANGE.forEach(offset => {
    const option = document.createElement('option');
    option.value = offset;
    option.textContent = offset > 0 ? `+${offset}` : String(offset);
    octaveSelectEl.appendChild(option);
  });
  // Same split again: the real setOctave lives in degree-joystick.js (it
  // re-voices a held chord), wired from index.js.
  octaveSelectEl.value = settings.octaveOffset;
}

export function setHoldEnabled(enabled) {
  settings.holdEnabled = enabled;
}

export function setBassEnabled(enabled) {
  settings.bassEnabled = enabled;
}
