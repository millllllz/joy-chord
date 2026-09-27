import { chords, getChordIntervals, resolvedChordName, resolvePianoModifier, INTERVAL_NAMES } from './chords.js';
import { settings } from './settings.js';
import { degreeJoystick, pressDegree, releaseAllHeld, onChordChange } from './degree-joystick.js';
import { setJoyDirection, renderWedgeLabels } from './modifier-joystick.js';

// A piano keyboard as an alternative to the two joysticks. The first octave's
// scale keys are the degrees; while one is held, every other key is labelled
// with the chord adding it would make (the 7th above C reads "Cmaj7"), so the
// modifiers are learned as the actual notes they add. Plays through the same
// pressDegree/setJoyDirection path as the joysticks, so it always sounds and
// names chords exactly the way they do.

// The root octave, plus room above its highest degree (vii) for the 9th.
const SPAN = 26;
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const BLACK_KEY_WIDTH = 0.6;

const piano = {
  el: null,
  keysEl: null,
  nameEl: null,
  formulaEl: null,
  keys: [],
  builtForKeyRoot: null,
  rootPointer: null,
  // pointerId -> interval above the root, for modifier keys physically held.
  modPointers: new Map(),
  // With Hold on, modifier keys toggle in and out of this set instead.
  latched: new Set(),
  lastInterval: undefined,
};

const pitchClass = (semitone) => ((semitone % 12) + 12) % 12;
const isBlack = (semitone) => BLACK_PITCH_CLASSES.has(pitchClass(semitone));

function build() {
  const keyRoot = settings.currentKeyRoot;
  // Never start or end the keyboard on a black key.
  const start = isBlack(keyRoot) ? keyRoot - 1 : keyRoot;
  const last = keyRoot + SPAN - 1;
  const end = isBlack(last) ? last + 1 : last;

  let whiteCount = 0;
  for (let s = start; s <= end; s++) if (!isBlack(s)) whiteCount++;

  piano.keysEl.textContent = '';
  piano.keys = [];
  let whitesBefore = 0;
  for (let s = start; s <= end; s++) {
    const black = isBlack(s);
    const offset = s - keyRoot;
    const degree = offset >= 0 && offset < 12 ? chords.DEGREES.find(d => d.semitone === offset) : undefined;

    const el = document.createElement('div');
    el.className = `piano-key ${black ? 'black' : 'white'}`;
    el.dataset.index = piano.keys.length;
    const pos = black ? whitesBefore - BLACK_KEY_WIDTH / 2 : whitesBefore;
    el.style.setProperty('--pos', `${(pos / whiteCount) * 100}%`);
    el.style.setProperty('--size', `${((black ? BLACK_KEY_WIDTH : 1) / whiteCount) * 100}%`);

    const labelEl = document.createElement('div');
    labelEl.className = 'piano-key-label';
    const mainEl = document.createElement('span');
    mainEl.className = 'piano-key-main';
    const subEl = document.createElement('span');
    subEl.className = 'piano-key-sub';
    labelEl.append(mainEl, subEl);
    el.appendChild(labelEl);
    piano.keysEl.appendChild(el);

    piano.keys.push({ semitone: s, black, degree, el, mainEl, subEl });
    if (!black) whitesBefore++;
  }
  piano.builtForKeyRoot = keyRoot;
}

function heldRoot() {
  const [key] = degreeJoystick.heldDegrees.keys();
  if (!key) return null;
  const d = degreeJoystick.degreeByKey.get(key);
  return { d, semitone: settings.currentKeyRoot + d.semitone };
}

function currentMods() {
  return settings.holdEnabled ? new Set(piano.latched) : new Set(piano.modPointers.values());
}

const chordName = (root, dir) => resolvedChordName(settings.currentKeyRoot, root.d, dir, 'default');

function render() {
  if (!piano.el) return;
  if (piano.builtForKeyRoot !== settings.currentKeyRoot) build();

  const root = heldRoot();
  const dir = degreeJoystick.currentDirection;
  const tones = root ? getChordIntervals(root.d.quality, dir) : [];
  const mods = currentMods();

  piano.keys.forEach(key => {
    let main = '';
    let sub = '';
    let state = '';
    if (!root) {
      if (key.degree) {
        main = key.degree.degree;
        sub = chords.KEY_NAMES[pitchClass(key.semitone)];
        state = 'degree';
      } else if (!key.black) {
        sub = chords.KEY_NAMES[pitchClass(key.semitone)];
      }
    } else {
      const interval = key.semitone - root.semitone;
      if (interval === 0) {
        main = root.d.degree;
        sub = 'R';
        state = 'root';
      } else if (interval > 0) {
        const held = mods.has(interval);
        const next = resolvePianoModifier(root.d.quality, held ? [...mods] : [...mods, interval], interval);
        if (held) {
          main = chordName(root, dir);
          state = 'mod';
        } else if (next !== 'center' && next !== dir) {
          main = chordName(root, next);
          state = 'option';
        } else if (tones.includes(interval)) {
          state = 'tone';
        }
        if (state) sub = INTERVAL_NAMES[interval];
      }
    }
    key.mainEl.textContent = main;
    key.subEl.textContent = sub;
    key.el.dataset.state = state;
    key.el.classList.toggle('long', main.length > 5);
  });

  piano.nameEl.textContent = root ? chordName(root, dir) : '';
  piano.formulaEl.textContent = root
    ? tones.map(i => INTERVAL_NAMES[i]).join(' · ')
    : 'Hold a degree, then add a lit key';
}

function applyMods(root) {
  const dir = resolvePianoModifier(root.d.quality, [...currentMods()], piano.lastInterval);
  setJoyDirection(dir);
  render();
}

function clearInput() {
  piano.rootPointer = null;
  piano.modPointers.clear();
  piano.latched.clear();
  piano.lastInterval = undefined;
}

// Stops whatever is sounding and forgets the piano's own held-key state.
export function releasePiano() {
  clearInput();
  releaseAllHeld();
  setJoyDirection('center');
  render();
}

function pressRoot(pointerId, key) {
  clearInput();
  piano.rootPointer = pointerId;
  setJoyDirection('center');
  pressDegree(key.degree);
  render();
}

function onPointerDown(e) {
  const keyEl = e.target.closest('.piano-key');
  if (!keyEl) return;
  e.preventDefault();
  const key = piano.keys[Number(keyEl.dataset.index)];
  const root = heldRoot();

  if (root) {
    const interval = key.semitone - root.semitone;
    // Hold latches the chord, so tapping its root again is how it stops.
    if (interval === 0) {
      if (settings.holdEnabled) releasePiano();
      return;
    }
    if (interval > 0) {
      const mods = currentMods();
      if (settings.holdEnabled && mods.has(interval)) {
        piano.latched.delete(interval);
        piano.lastInterval = [...piano.latched].at(-1);
        applyMods(root);
        return;
      }
      if (resolvePianoModifier(root.d.quality, [...mods, interval], interval) !== 'center') {
        if (settings.holdEnabled) piano.latched.add(interval);
        else piano.modPointers.set(e.pointerId, interval);
        piano.lastInterval = interval;
        applyMods(root);
        return;
      }
    }
  }
  // A key that isn't a modifier for the held chord starts a new one.
  if (key.degree) pressRoot(e.pointerId, key);
}

function onPointerUp(e) {
  if (e.pointerId === piano.rootPointer) {
    piano.rootPointer = null;
    if (!settings.holdEnabled) releasePiano();
    return;
  }
  if (!piano.modPointers.has(e.pointerId)) return;
  piano.modPointers.delete(e.pointerId);
  const root = heldRoot();
  if (!root) return;
  piano.lastInterval = [...piano.modPointers.values()].at(-1);
  applyMods(root);
}

export function setControlSurface(surface) {
  const changed = surface !== settings.controlSurface;
  settings.controlSurface = surface;
  document.body.classList.toggle('surface-piano', surface === 'piano');
  if (!changed) return;
  releasePiano();
  // Wedge labels are measured with getBBox, which reads zero while the
  // joysticks are hidden, so they have to be redrawn once visible again.
  if (surface === 'joysticks') renderWedgeLabels();
}

export function init() {
  piano.el = document.getElementById('piano-surface');
  piano.keysEl = document.getElementById('piano-keys');
  piano.nameEl = document.getElementById('piano-chord-name');
  piano.formulaEl = document.getElementById('piano-chord-formula');
  build();
  render();

  piano.keysEl.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  piano.keysEl.addEventListener('contextmenu', e => e.preventDefault());
  onChordChange(render);
}
