import { chords, getChordIntervals, resolvedChordName, resolvePianoModifier, INTERVAL_NAMES } from './chords.js';
import { settings } from './settings.js';
import { degreeJoystick, pressDegree, releaseAllHeld, onChordChange } from './degree-joystick.js';
import { setJoyDirection, renderWedgeLabels } from './modifier-joystick.js';

// A scrolling 81-key piano (A0-F7) as an alternative to the two joysticks.
// Every scale key is a degree, playable in its own octave; while one is held,
// the keys above it are labelled with the chord adding them would make (the
// 7th above C reads "Cmaj7"), so the modifiers are learned as the notes they
// add. Plays through the same pressDegree/setJoyDirection path as the
// joysticks, so it always sounds and names chords exactly the way they do.
//
// Dragging on the keys plays them, so scrolling is done on the navigator
// strip (an overview of the whole keyboard with the visible range marked),
// or with a wheel/trackpad.

const LOWEST = -39; // A0, in semitones from C4
const KEY_COUNT = 81;
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const BLACK_KEY_WIDTH = 0.6;

const piano = {
  el: null,
  scrollEl: null,
  trackEl: null,
  navEl: null,
  navWindowEl: null,
  navRootEl: null,
  nameEl: null,
  formulaEl: null,
  keys: [],
  whiteCount: 0,
  renderedKeyRoot: null,
  // Low edge of the visible range, as a fraction of the keyboard, kept so a
  // resize or rotation doesn't lose the player's place.
  viewStart: null,
  layoutVertical: null,
  rootPointer: null,
  // pointerId -> interval above the root, for modifier keys physically held.
  modPointers: new Map(),
  // With Hold on, modifier keys toggle in and out of this set instead.
  latched: new Set(),
  lastInterval: undefined,
};

const pitchClass = (semitone) => ((semitone % 12) + 12) % 12;
const isBlack = (semitone) => BLACK_PITCH_CLASSES.has(pitchClass(semitone));
const noteName = (semitone) => chords.KEY_NAMES[pitchClass(semitone)];
const octaveNumber = (semitone) => Math.floor((semitone + 60) / 12) - 1;
const degreeFor = (semitone) => chords.DEGREES.find(d => d.semitone === pitchClass(semitone - settings.currentKeyRoot));

// Portrait turns the keyboard on its side, low notes at the bottom.
const isVertical = () => window.matchMedia('(orientation: portrait)').matches;

function positionKey(el, pos, size) {
  el.style.setProperty('--pos', `${(pos / piano.whiteCount) * 100}%`);
  el.style.setProperty('--size', `${(size / piano.whiteCount) * 100}%`);
}

function build() {
  piano.whiteCount = 0;
  for (let s = LOWEST; s < LOWEST + KEY_COUNT; s++) if (!isBlack(s)) piano.whiteCount++;
  piano.trackEl.style.setProperty('--white-count', piano.whiteCount);

  let whitesBefore = 0;
  for (let s = LOWEST; s < LOWEST + KEY_COUNT; s++) {
    const black = isBlack(s);
    const pos = black ? whitesBefore - BLACK_KEY_WIDTH / 2 : whitesBefore;
    const size = black ? BLACK_KEY_WIDTH : 1;

    const el = document.createElement('div');
    el.className = `piano-key ${black ? 'black' : 'white'}`;
    el.dataset.index = piano.keys.length;
    positionKey(el, pos, size);
    const labelEl = document.createElement('div');
    labelEl.className = 'piano-key-label';
    const mainEl = document.createElement('span');
    mainEl.className = 'piano-key-main';
    const subEl = document.createElement('span');
    subEl.className = 'piano-key-sub';
    labelEl.append(mainEl, subEl);
    el.appendChild(labelEl);
    piano.trackEl.appendChild(el);

    if (black) {
      const navKey = document.createElement('div');
      navKey.className = 'piano-nav-key';
      positionKey(navKey, pos, size);
      piano.navEl.insertBefore(navKey, piano.navWindowEl);
    } else if (pitchClass(s) === 0) {
      const navLabel = document.createElement('div');
      navLabel.className = 'piano-nav-label';
      navLabel.textContent = `C${octaveNumber(s)}`;
      positionKey(navLabel, pos, 1);
      piano.navEl.insertBefore(navLabel, piano.navWindowEl);
    }

    piano.keys.push({ semitone: s, black, pos, el, mainEl, subEl });
    if (!black) whitesBefore++;
  }
}

function currentView() {
  const el = piano.scrollEl;
  if (isVertical()) {
    const total = el.scrollHeight;
    return { start: (total - el.scrollTop - el.clientHeight) / total, size: el.clientHeight / total };
  }
  return { start: el.scrollLeft / el.scrollWidth, size: el.clientWidth / el.scrollWidth };
}

function scrollToFraction(start) {
  const el = piano.scrollEl;
  if (isVertical()) el.scrollTop = el.scrollHeight - el.clientHeight - start * el.scrollHeight;
  else el.scrollLeft = start * el.scrollWidth;
  updateNavWindow();
}

function updateNavWindow() {
  const view = currentView();
  // A rotation's clamped scroll fires before the ResizeObserver restores the
  // old place, so it mustn't be recorded as where the player scrolled to.
  if (piano.layoutVertical === isVertical()) piano.viewStart = view.start;
  piano.navWindowEl.style.setProperty('--pos', `${view.start * 100}%`);
  piano.navWindowEl.style.setProperty('--size', `${view.size * 100}%`);
}

// Brings the key's octave around middle C into view, root at the low edge.
function scrollToHome() {
  const home = piano.keys.find(k => k.semitone === settings.currentKeyRoot);
  scrollToFraction((home.pos - 0.5) / piano.whiteCount);
}

function onNavPointer(e) {
  if (e.type === 'pointerdown') piano.navEl.setPointerCapture(e.pointerId);
  else if (!piano.navEl.hasPointerCapture(e.pointerId)) return;
  e.preventDefault();
  const rect = piano.navEl.getBoundingClientRect();
  const at = isVertical() ? (rect.bottom - e.clientY) / rect.height : (e.clientX - rect.left) / rect.width;
  scrollToFraction(at - currentView().size / 2);
}

function heldRoot() {
  const [key] = degreeJoystick.heldDegrees.keys();
  if (!key) return null;
  const d = degreeJoystick.degreeByKey.get(key);
  const octave = degreeJoystick.octaveOverride ?? settings.octaveOffset;
  return { d, semitone: settings.currentKeyRoot + d.semitone + octave * 12 };
}

function currentMods() {
  return settings.holdEnabled ? new Set(piano.latched) : new Set(piano.modPointers.values());
}

const chordName = (root, dir) => resolvedChordName(settings.currentKeyRoot, root.d, dir, 'default');

function render() {
  if (!piano.el) return;
  if (piano.renderedKeyRoot !== settings.currentKeyRoot) {
    piano.renderedKeyRoot = settings.currentKeyRoot;
    if (piano.scrollEl.clientWidth) scrollToHome();
  }

  const root = heldRoot();
  const dir = degreeJoystick.currentDirection;
  const tones = root ? getChordIntervals(root.d.quality, dir) : [];
  const mods = currentMods();

  piano.keys.forEach(key => {
    let main = '';
    let sub = '';
    let state = '';
    const interval = root ? key.semitone - root.semitone : -1;
    if (!root) {
      const degree = degreeFor(key.semitone);
      if (degree) {
        main = degree.degree;
        state = 'degree';
      }
      if (degree || !key.black) sub = noteName(key.semitone) + (pitchClass(key.semitone) === 0 ? octaveNumber(key.semitone) : '');
    } else if (interval === 0) {
      main = root.d.degree;
      sub = 'R';
      state = 'root';
    } else if (interval > 0 && interval < INTERVAL_NAMES.length) {
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
    key.mainEl.textContent = main;
    key.subEl.textContent = sub;
    key.el.dataset.state = state;
    key.el.classList.toggle('long', main.length > 5);
  });

  const rootKey = root && piano.keys.find(k => k.semitone === root.semitone);
  piano.navRootEl.hidden = !rootKey;
  if (rootKey) positionKey(piano.navRootEl, rootKey.pos, rootKey.black ? BLACK_KEY_WIDTH : 1);

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

function pressRoot(pointerId, key, degree) {
  clearInput();
  piano.rootPointer = pointerId;
  setJoyDirection('center');
  pressDegree(degree, (key.semitone - settings.currentKeyRoot - degree.semitone) / 12);
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
  const degree = degreeFor(key.semitone);
  if (degree) pressRoot(e.pointerId, key, degree);
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
  piano.scrollEl = document.getElementById('piano-keys');
  piano.trackEl = document.getElementById('piano-track');
  piano.navEl = document.getElementById('piano-nav');
  piano.navWindowEl = document.getElementById('piano-nav-window');
  piano.navRootEl = document.getElementById('piano-nav-root');
  piano.nameEl = document.getElementById('piano-chord-name');
  piano.formulaEl = document.getElementById('piano-chord-formula');
  build();
  render();

  piano.scrollEl.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  piano.scrollEl.addEventListener('contextmenu', e => e.preventDefault());
  piano.scrollEl.addEventListener('scroll', updateNavWindow, { passive: true });
  ['pointerdown', 'pointermove'].forEach(type => piano.navEl.addEventListener(type, onNavPointer));

  // Covers first becoming visible (hidden surfaces measure 0) as well as
  // resizes and rotations, which change the track's length.
  new ResizeObserver(() => {
    if (!piano.scrollEl.clientWidth) return;
    piano.layoutVertical = isVertical();
    if (piano.viewStart === null) scrollToHome();
    else scrollToFraction(piano.viewStart);
  }).observe(piano.scrollEl);
  onChordChange(render);
}
