import { stopVoice, noteFreq, reconcileVoices } from './audio.js';
import { effects } from './effects.js';
import { chords, getModifierChord, resolvedChordName } from './chords.js';
import { settings } from './settings.js';
import { renderWedgeLabels } from './modifier-joystick.js';
import { arpeggiator, updateArpChord } from './arpeggiator.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const degreeJoystick = {
  heldDegrees: new Map(),
  heldVoices: new Map(),
  currentDirection: 'center',
  degreeByKey: new Map(),
  degreeByBindKey: new Map(),
  degreeJoystickEl: null,
  degreeStickDot: null,
  // One finger owns the stick at a time; further touches are ignored rather
  // than stacking a second chord on top.
  degreeTouchId: null,
  touchedDegreeKey: null,
  // Whether the in-progress touch's touchstart landed on the center circle —
  // with Hold on, only a tap (start AND end on center) releases; a drag that
  // merely ends up over center doesn't count.
  touchStartedOnCenter: false,
};

export function init() {
  degreeJoystick.degreeByKey = new Map(chords.DEGREES.map(d => [d.key, d]));
  degreeJoystick.degreeByBindKey = new Map(chords.DEGREES.map(d => [d.bindKey, d]));

  degreeJoystick.degreeJoystickEl = document.getElementById('degree-joystick');

  // The center circle, its label, and the stick-dot are pre-authored in
  // markup, drawn last so they layer above the wedges — the wedges/labels
  // below must be inserted before them, not appended, or they'd paint on
  // top and shadow the stick-dot's travel across the pad.
  const degreeCenterCircle = document.getElementById('degree-center');

  // Render wedges and labels
  chords.DEGREES.forEach(d => {
    const wedgeEl = svgEl('path', { class: 'wedge degree-wedge', 'data-key': d.key, d: d.wedge });
    degreeJoystick.degreeJoystickEl.insertBefore(wedgeEl, degreeCenterCircle);
    d.wedgeEl = wedgeEl;
  });

  chords.DEGREES.forEach(d => {
    const [lx, ly] = d.labelPos;
    const labelEl = svgEl('text', { class: 'degree-label', 'data-key': d.key, x: lx, y: ly });
    labelEl.textContent = d.degree;
    degreeJoystick.degreeJoystickEl.insertBefore(labelEl, degreeCenterCircle);
    d.labelEl = labelEl;

    const [qx, qy] = d.qualityPos;
    const qualityEl = svgEl('text', { class: 'degree-quality', 'data-key': d.key, x: qx, y: qy });
    qualityEl.textContent = d.quality === 'diminished' ? 'dim' : d.quality;
    degreeJoystick.degreeJoystickEl.insertBefore(qualityEl, degreeCenterCircle);
    d.qualityEl = qualityEl;

    const [bx, by] = d.bindKeyPos;
    const bindKeyGroup = svgEl('g', { class: 'bindkey', 'data-key': d.key });
    const bindKeyRect = svgEl('rect', {
      class: 'bindkey-key', x: bx - 5.5, y: by - 5.5, width: 11, height: 11, rx: 3,
    });
    const bindKeyEl = svgEl('text', { class: 'bindkey-label', x: bx, y: by });
    bindKeyEl.textContent = d.bindKey.toLowerCase();
    bindKeyGroup.appendChild(bindKeyRect);
    bindKeyGroup.appendChild(bindKeyEl);
    degreeJoystick.degreeJoystickEl.insertBefore(bindKeyGroup, degreeCenterCircle);
    d.bindKeyEl = bindKeyEl;
  });

  // A click on the center circle is the release gesture. With Hold off this
  // is a harmless no-op — the per-wedge mouseleave below has already
  // released everything by the time a click could land here. With Hold on,
  // it's the deliberate reset: mere hover no longer releases a latched
  // chord, since the pointer can pass over center on its way to a wedge.
  degreeCenterCircle.addEventListener('click', () => releaseAllHeld());

  // One dot, shared by mouse and touch, resting visibly at centre when
  // nothing is driving it — the stick's neutral position.
  degreeJoystick.degreeStickDot = document.getElementById('degree-stick-dot');

  // Mouse interaction
  chords.DEGREES.forEach(d => {
    d.wedgeEl.addEventListener('mouseenter', () => pressDegree(d));
    d.wedgeEl.addEventListener('mouseleave', () => {
      // Latches while Hold is on — only entering the center circle (above)
      // or the joystick going out of use for keyboard/touch resets it.
      if (settings.holdEnabled) return;
      releaseDegree(d);
    });
  });

  degreeJoystick.degreeJoystickEl.addEventListener('mousemove', (e) => {
    moveStickDot(degreeJoystick.degreeStickDot, degreeJoystick.degreeJoystickEl, e.clientX, e.clientY);
  });
  degreeJoystick.degreeJoystickEl.addEventListener('mouseleave', () => resetStickDot(degreeJoystick.degreeStickDot));

  // Touch interaction
  degreeJoystick.degreeJoystickEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (degreeJoystick.degreeTouchId !== null) return;
    const touch = e.changedTouches[0];
    degreeJoystick.degreeTouchId = touch.identifier;
    moveStickDot(degreeJoystick.degreeStickDot, degreeJoystick.degreeJoystickEl, touch.clientX, touch.clientY);

    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    degreeJoystick.touchStartedOnCenter = !!(el && el.classList && el.classList.contains('joy-center'));

    const d = degreeAtPoint(touch.clientX, touch.clientY);
    if (!d) return;
    degreeJoystick.touchedDegreeKey = d.key;
    pressDegree(d);
  }, { passive: false });

  degreeJoystick.degreeJoystickEl.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = Array.from(e.changedTouches).find(t => t.identifier === degreeJoystick.degreeTouchId);
    if (!touch) return;
    moveStickDot(degreeJoystick.degreeStickDot, degreeJoystick.degreeJoystickEl, touch.clientX, touch.clientY);

    const currentKey = degreeJoystick.touchedDegreeKey;
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const key = el && el.dataset && el.dataset.key;
    const d = key ? degreeJoystick.degreeByKey.get(key) : null;
    if ((d ? d.key : null) === currentKey) return;

    // Sliding straight onto a new wedge goes through pressDegree alone —
    // its own monophonic steal logic releases currentKey, and (with glide
    // on) captures its voices for reconcileVoices before that release
    // clears them. Releasing here first, as a separate step, would empty
    // heldDegrees before pressDegree ever saw it, making glide unreachable
    // by touch-dragging.
    if (d) {
      pressDegree(d);
      degreeJoystick.touchedDegreeKey = d.key;
      return;
    }

    // No wedge under the finger: a hit on the dead-center circle, or truly
    // off the stick, means "stop" as before — but the narrow gap between
    // two adjacent wedges (widened since the wedge-gap change) hits
    // neither a wedge nor the center circle, and must be ignored rather
    // than treated the same as "stop": releasing there hard-cuts the note
    // before a drag straight across a gap ever reaches its target wedge,
    // defeating glide for the exact gesture ("slide across wedges") it
    // matters most for.
    const isDeadCenter = el && el.classList && el.classList.contains('joy-center');
    const isOffPad = !el || !el.closest || !el.closest('#degree-joystick');
    if (!currentKey || !(isDeadCenter || isOffPad)) return;
    // With Hold on, only an explicit lift *at* the center circle resets
    // (handled in endDegreeTouch below) — merely dragging through center
    // or off the pad mid-move keeps the note latched, per the same
    // reasoning as the gap: it's not the deliberate reset gesture.
    if (settings.holdEnabled) return;
    releaseDegree(degreeJoystick.degreeByKey.get(currentKey));
    degreeJoystick.touchedDegreeKey = null;
  }, { passive: false });

  const endDegreeTouch = (e) => {
    e.preventDefault();
    const touch = Array.from(e.changedTouches).find(t => t.identifier === degreeJoystick.degreeTouchId);
    if (!touch) return;
    degreeJoystick.degreeTouchId = null;
    resetStickDot(degreeJoystick.degreeStickDot);

    const key = degreeJoystick.touchedDegreeKey;
    if (!key) return;
    // With Hold on, lifting only resets on a tap — touchstart AND touchend
    // both on the center circle. A drag that merely ends up over center
    // (without starting there) leaves the note latched; releasing takes a
    // deliberate tap on the circle instead.
    if (settings.holdEnabled) {
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const isDeadCenter = el && el.classList && el.classList.contains('joy-center');
      if (!(degreeJoystick.touchStartedOnCenter && isDeadCenter)) return;
    }
    releaseDegree(degreeJoystick.degreeByKey.get(key));
    degreeJoystick.touchedDegreeKey = null;
  };
  degreeJoystick.degreeJoystickEl.addEventListener('touchend', endDegreeTouch, { passive: false });
  degreeJoystick.degreeJoystickEl.addEventListener('touchcancel', endDegreeTouch, { passive: false });

  // Keyboard interaction
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const d = degreeJoystick.degreeByBindKey.get(e.key.toLowerCase()) || degreeJoystick.degreeByKey.get(e.key);
    if (!d) return;
    pressDegree(d);
  });

  window.addEventListener('keyup', (e) => {
    const d = degreeJoystick.degreeByBindKey.get(e.key.toLowerCase()) || degreeJoystick.degreeByKey.get(e.key);
    if (!d) return;
    // Keyboard has no "drag to center" gesture, so with Hold on it just
    // latches — turning Hold off (see index.js) is what resets it.
    if (settings.holdEnabled) return;
    releaseDegree(d);
  });
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

const STICK_CENTER = 110;
const STICK_MAX_RADIUS = 88;

function clientToStickPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: STICK_CENTER, y: STICK_CENTER };
  const local = pt.matrixTransform(ctm.inverse());
  const dx = local.x - STICK_CENTER;
  const dy = local.y - STICK_CENTER;
  const dist = Math.hypot(dx, dy);
  if (dist <= STICK_MAX_RADIUS || dist === 0) return { x: local.x, y: local.y };
  const scale = STICK_MAX_RADIUS / dist;
  return { x: STICK_CENTER + dx * scale, y: STICK_CENTER + dy * scale };
}

function moveStickDot(dotEl, svg, clientX, clientY) {
  const { x, y } = clientToStickPoint(svg, clientX, clientY);
  // Tracking is unanimated: see .stick-dot.returning in style.css.
  dotEl.classList.remove('returning');
  dotEl.setAttribute('cx', x);
  dotEl.setAttribute('cy', y);
}

function resetStickDot(dotEl) {
  // Nothing is driving the dot any more, so this one move eases rather
  // than snapping.
  dotEl.classList.add('returning');
  dotEl.setAttribute('cx', STICK_CENTER);
  dotEl.setAttribute('cy', STICK_CENTER);
}

function degreeAtPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const key = el.dataset && el.dataset.key;
  return key ? degreeJoystick.degreeByKey.get(key) : null;
}

function voicesForDegree(d, direction) {
  const target = new Map();
  // Set before the chord tones (not after) so it sits first in insertion
  // order — ORDERS in arpeggiator.js assumes ascending-pitch id order, and
  // the bass note is always the lowest-pitched voice.
  if (settings.bassEnabled) {
    const bassSemitone = settings.currentKeyRoot + d.semitone - 24;
    target.set(`${d.key}:bass:${bassSemitone}`, noteFreq(bassSemitone));
  }
  getModifierChord(settings.modifierSet, d.quality, direction).forEach(interval => {
    const semitone = settings.currentKeyRoot + d.semitone + interval;
    target.set(`${d.key}:${semitone}`, noteFreq(semitone));
  });
  return target;
}

// Ids are `${degreeKey}:${semitone}` (or `${degreeKey}:bass:${semitone}`
// for the optional bass note), so the frequency is recoverable from the id
// alone without a live audio-node lookup — used to build the "old" side of
// a reconcileVoices() call from bookkeeping (heldVoices) rather than from
// the nodes themselves. The semitone is always the last segment.
function noteFreqFromId(id) {
  const parts = id.split(':');
  return noteFreq(Number(parts[parts.length - 1]));
}

// Mirrors the resolved chord name into both joysticks' center circles — the
// degree stick's own wedges only show a bare scale degree ("V"), and the
// modifier stick's only show what a direction *does* to a triad ("Dom7"),
// so neither one on its own says what's actually sounding. Monophonic by
// degree (see pressDegree), so at most one entry is ever held.
function updateChordNameLabel() {
  const [heldKey] = degreeJoystick.heldDegrees.keys();
  const name = heldKey
    ? resolvedChordName(settings.currentKeyRoot, degreeJoystick.degreeByKey.get(heldKey), degreeJoystick.currentDirection, settings.modifierSet)
    : '';
  // Most names (root + maj7/m7/dim/aug/sus4/...) fit the circle at the
  // default 12px; a handful of rare quality+direction combos (e.g. a
  // sharped root with sus2b5/sus4b5) run long enough to need shrinking.
  const fontSize = name.length > 7 ? '9px' : name.length > 5 ? '10.5px' : '';
  [document.getElementById('degree-center-label'), document.getElementById('joy-center')].forEach(el => {
    el.textContent = name;
    el.style.fontSize = fontSize;
  });
}

// Routes a chord-change to either the plain voice reconciler or the
// arpeggiator, depending on whether the arp is switched on. The arp owns
// voice playback entirely while enabled (stepping through `target`'s notes
// on its own timer) rather than layering on top of reconcileVoices' held-
// chord playback, so the two are mutually exclusive per call, not combined.
function applyVoicing(oldTarget, target) {
  if (arpeggiator.enabled) {
    updateArpChord(target);
  } else {
    reconcileVoices(oldTarget, target);
  }
}

function updateDegreeVoicing(d, direction) {
  const oldTarget = new Map();
  (degreeJoystick.heldVoices.get(d.key) || new Set()).forEach(id => {
    oldTarget.set(id, noteFreqFromId(id));
  });
  const target = voicesForDegree(d, direction);
  applyVoicing(oldTarget, target);
  degreeJoystick.heldVoices.set(d.key, new Set(target.keys()));
}

// Clears one degree's held/visual state without touching its voices —
// pressDegree uses this for the degree(s) it's stealing from, so the voice
// stop/start/glide decision is left to reconcileVoices instead of being
// forced here.
function clearDegreeState(d) {
  degreeJoystick.heldDegrees.delete(d.key);
  degreeJoystick.heldVoices.delete(d.key);
  d.wedgeEl.classList.remove('active');
  d.labelEl.classList.remove('active');
  d.qualityEl.classList.remove('active');
}

function pressDegree(d) {
  if (degreeJoystick.heldDegrees.has(d.key)) return;
  // Monophonic by degree: a new one takes over from whatever was sounding,
  // so keyboard and mouse can't stack chords either. Collect the outgoing
  // voices before clearing bookkeeping, so reconcileVoices can glide the
  // ones that carry over into the new chord (with glide on) rather than
  // always hard-stopping them.
  const oldTarget = new Map();
  [...degreeJoystick.heldDegrees.keys()].forEach(key => {
    const heldD = degreeJoystick.degreeByKey.get(key);
    (degreeJoystick.heldVoices.get(key) || new Set()).forEach(id => oldTarget.set(id, noteFreqFromId(id)));
    clearDegreeState(heldD);
  });

  degreeJoystick.heldDegrees.set(d.key, degreeJoystick.currentDirection);
  const target = voicesForDegree(d, degreeJoystick.currentDirection);
  applyVoicing(oldTarget, target);
  degreeJoystick.heldVoices.set(d.key, new Set(target.keys()));

  d.wedgeEl.classList.add('active');
  d.labelEl.classList.add('active');
  d.qualityEl.classList.add('active');
  renderWedgeLabels();
  updateChordNameLabel();
}

function releaseDegree(d) {
  if (!degreeJoystick.heldDegrees.has(d.key)) return;
  if (arpeggiator.enabled) {
    // Same "nothing to hand off to" reasoning as the hard-stop below, but
    // routed through the arp so it also cancels its timer and cuts whatever
    // step is currently sounding, instead of leaving it stuck mid-sequence.
    updateArpChord(new Map());
  } else {
    // A genuine note-off (finger/key lifted with nothing taking over) always
    // hard-stops — there's no successor chord for reconcileVoices to glide
    // these voices into.
    (degreeJoystick.heldVoices.get(d.key) || new Set()).forEach(id => stopVoice(id));
  }
  clearDegreeState(d);
  renderWedgeLabels();
  updateChordNameLabel();
}

// Unconditionally releases whatever's currently held, bypassing Hold —
// used both by the mouse's center-circle gesture (see init()) and by
// index.js when Hold itself is switched off, which is the only reset
// gesture keyboard play has while latched.
export function releaseAllHeld() {
  [...degreeJoystick.heldDegrees.keys()].forEach(key => {
    releaseDegree(degreeJoystick.degreeByKey.get(key));
  });
}

// Called by index.js right after flipping the arp's own enabled flag, so a
// chord already held at the moment of the toggle switches modes cleanly
// instead of waiting for the next press/release to notice. Both directions
// need every one of the chord's voices hard-stopped first rather than
// reconciled: switching on, the plain sustained voices reconcileVoices
// started are all still playing and would otherwise keep ringing underneath
// the arp's own stepped voice; switching off, only one of the chord's ids
// is actually a live voice (the arp's current step) even though heldVoices
// lists all of them, so reconcileVoices would wrongly treat the silent ones
// as "already correct" and never start them.
export function syncArpToHeldChord() {
  const [heldKey] = degreeJoystick.heldDegrees.keys();
  if (!heldKey) return;
  const d = degreeJoystick.degreeByKey.get(heldKey);
  (degreeJoystick.heldVoices.get(heldKey) || new Set()).forEach(id => stopVoice(id));
  const target = voicesForDegree(d, degreeJoystick.heldDegrees.get(heldKey));
  applyVoicing(new Map(), target);
  degreeJoystick.heldVoices.set(heldKey, new Set(target.keys()));
}

export function setDirection(direction) {
  if (direction === degreeJoystick.currentDirection) return;
  degreeJoystick.currentDirection = direction;
  degreeJoystick.heldDegrees.forEach((_, key) => {
    updateDegreeVoicing(degreeJoystick.degreeByKey.get(key), direction);
    degreeJoystick.heldDegrees.set(key, direction);
  });
  updateChordNameLabel();
}

export function setKeyRoot(root) {
  if (root === settings.currentKeyRoot) return;
  settings.currentKeyRoot = root;
  degreeJoystick.heldDegrees.forEach((_, key) => {
    updateDegreeVoicing(degreeJoystick.degreeByKey.get(key), degreeJoystick.currentDirection);
  });
  // Same as setDirection above: the held chord just changed pitch, so the
  // centre readout naming it has to be rebuilt too, or it keeps showing the
  // old key's chord while the new one sounds.
  updateChordNameLabel();
}

// Wired to #modifier-set-select in index.js, same reasoning as setKeyRoot
// above (real logic here, not in settings.js, to avoid an import cycle).
// Switching sets changes both what a held direction sounds — Extended/
// Chromatic replace Default's per-quality tables with fixed absolute
// chords, see getModifierChord in chords.js — and what every wedge is
// labelled, so a held chord needs re-voicing exactly like a key change,
// and every wedge (not just the 4 quality-dependent ones) needs repainting.
export function setModifierSet(set) {
  if (set === settings.modifierSet) return;
  settings.modifierSet = set;
  degreeJoystick.heldDegrees.forEach((_, key) => {
    updateDegreeVoicing(degreeJoystick.degreeByKey.get(key), degreeJoystick.currentDirection);
  });
  renderWedgeLabels();
  updateChordNameLabel();
}
