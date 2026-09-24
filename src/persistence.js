import { settings, setHoldEnabled, setBassEnabled } from './settings.js';
import {
  audio,
  setWaveType,
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
import { arpeggiator, ORDER_NAMES, setArpEnabled, setArpOrder, setArpRate } from './arpeggiator.js';
import { setKeyRoot, setModifierSet, setOctave } from './degree-joystick.js';
import { chords, MODIFIER_SET_NAMES } from './chords.js';

// Bumping the version in the key abandons every older blob outright, which
// is the whole migration story: these are all re-tweakable in seconds, so
// resetting to defaults after a shape change beats carrying upgrade code.
const STORAGE_KEY = 'joychord.settings.v1';

const SAVE_DEBOUNCE_MS = 250;

const number = (min, max) => (v) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const boolean = (v) => typeof v === 'boolean';
const oneOf = (allowed) => (v) => allowed.includes(v);

// The single place that knows which state is a user setting, where it lives,
// and what counts as a valid value for it. Everything persisted goes through
// its own `write` — the same setters the UI calls — so restoring at boot
// takes exactly the same path as changing it by hand, audio-node updates
// included, rather than assigning the fields behind their backs.
//
// The ranges mirror each control's min/max in index.html. They're checked on
// load because anything coming back out of storage is untrusted input: it
// may have been written by an older build, hand-edited, or truncated. A
// value that doesn't validate is dropped and that setting keeps its default,
// since feeding NaN or an out-of-range number into an AudioParam throws and
// would take the whole boot down with it.
const SCHEMA = {
  keyRoot: { read: () => settings.currentKeyRoot, write: setKeyRoot, valid: number(-12, 11) },
  octave: { read: () => settings.octaveOffset, write: setOctave, valid: number(-2, 2) },
  hold: { read: () => settings.holdEnabled, write: setHoldEnabled, valid: boolean },
  bass: { read: () => settings.bassEnabled, write: setBassEnabled, valid: boolean },
  modifierSet: { read: () => settings.modifierSet, write: setModifierSet, valid: oneOf(MODIFIER_SET_NAMES) },
  wave: { read: () => audio.currentWaveType, write: setWaveType, valid: oneOf(chords.WAVE_TYPES) },

  unison: { read: () => audio.unisonEnabled, write: setUnisonEnabled, valid: boolean },
  unisonVoices: { read: () => audio.UNISON_VOICES, write: setUnisonVoices, valid: number(2, 4) },
  unisonDetune: { read: () => audio.UNISON_DETUNE, write: setUnisonDetune, valid: number(0, 30) },
  unisonSpread: { read: () => audio.UNISON_SPREAD, write: setUnisonSpread, valid: number(0, 1) },

  glide: { read: () => audio.glideEnabled, write: setGlideEnabled, valid: boolean },
  glideTime: { read: () => audio.GLIDE_TIME, write: setGlideTime, valid: number(0.02, 0.4) },

  envAttack: { read: () => audio.ENVELOPE_ATTACK, write: setEnvelopeAttack, valid: number(0.001, 0.5) },
  envDecay: { read: () => audio.ENVELOPE_DECAY, write: setEnvelopeDecay, valid: number(0, 1) },
  envSustain: { read: () => audio.ENVELOPE_SUSTAIN, write: setEnvelopeSustain, valid: number(0, 1) },
  envRelease: { read: () => audio.ENVELOPE_RELEASE, write: setEnvelopeRelease, valid: number(0.01, 1) },

  delay: { read: () => effects.delayEnabled, write: setDelayEnabled, valid: boolean },
  delayTime: { read: () => effects.DELAY_TIME, write: setDelayTime, valid: number(0.02, 1) },
  delayFeedback: { read: () => effects.DELAY_FEEDBACK, write: setDelayFeedback, valid: number(0, 0.9) },
  delaySend: { read: () => effects.DELAY_SEND_LEVEL, write: setDelaySendLevel, valid: number(0, 1) },

  reverb: { read: () => effects.reverbEnabled, write: setReverbEnabled, valid: boolean },
  reverbDecay: { read: () => effects.REVERB_DECAY, write: setReverbDecay, valid: number(0.2, 5) },
  reverbSend: { read: () => effects.REVERB_SEND_LEVEL, write: setReverbSendLevel, valid: number(0, 1) },

  filter: { read: () => effects.filterEnabled, write: setFilterEnabled, valid: boolean },
  filterCutoff: { read: () => effects.FILTER_CUTOFF, write: setFilterCutoff, valid: number(150, 12000) },
  filterQ: { read: () => effects.FILTER_RESONANCE, write: setFilterResonance, valid: number(0.1, 20) },

  tremolo: { read: () => effects.tremoloEnabled, write: setTremoloEnabled, valid: boolean },
  tremoloRate: { read: () => effects.TREMOLO_RATE, write: setTremoloRate, valid: number(0.5, 12) },
  tremoloDepth: { read: () => effects.TREMOLO_DEPTH, write: setTremoloDepth, valid: number(0, 1) },

  // Deliberately no `vocoder` enabled flag here, unlike every other effect —
  // restoring it as "on" would mean silently re-requesting mic access on
  // every page load with no fresh user gesture behind it. The mix level is
  // just a number preference, no privacy implication, so that alone persists.
  vocoderMix: { read: () => effects.VOCODER_SEND_LEVEL, write: setVocoderSendLevel, valid: number(0, 1) },

  arp: { read: () => arpeggiator.enabled, write: setArpEnabled, valid: boolean },
  arpOrder: { read: () => arpeggiator.order, write: setArpOrder, valid: oneOf(ORDER_NAMES) },
  arpRate: { read: () => arpeggiator.RATE_HZ, write: setArpRate, valid: number(1, 20) },
};

export function collectSettings() {
  const out = {};
  Object.entries(SCHEMA).forEach(([key, { read }]) => { out[key] = read(); });
  return out;
}

// Returns the keys it actually applied, so a caller (and the tests) can tell
// a restored setting from one that fell back to its default.
export function applySettings(stored) {
  if (!stored || typeof stored !== 'object') return [];
  const applied = [];
  Object.entries(SCHEMA).forEach(([key, { write, valid }]) => {
    if (!(key in stored) || !valid(stored[key])) return;
    write(stored[key]);
    applied.push(key);
  });
  return applied;
}

// Every storage call is wrapped: localStorage throws rather than no-ops when
// it's unavailable (Safari private browsing, storage disabled by policy, or
// quota exhausted), and losing saved settings must never stop the instrument
// from starting.
export function loadSettings() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    return applySettings(JSON.parse(raw));
  } catch {
    return [];
  }
}

let saveTimer = null;

export function saveSettings() {
  saveTimer = null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collectSettings()));
  } catch {
    // Nothing useful to do — the session still works, it just won't persist.
  }
}

// Dragging a slider fires a change per pixel, so writes coalesce rather than
// re-serialising the whole blob on every tick.
export function scheduleSave() {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSettings, SAVE_DEBOUNCE_MS);
}

// Write a pending change out now. iOS Safari frequently never fires
// 'beforeunload' (and may not run 'unload' at all) when an app is swiped
// away or backgrounded, so the debounce window is genuinely long enough to
// lose the last tweak — 'pagehide'/'visibilitychange' are the events that do
// fire there, and they call this.
export function flushSave() {
  if (saveTimer === null) return;
  clearTimeout(saveTimer);
  saveSettings();
}
