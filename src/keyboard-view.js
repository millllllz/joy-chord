import { chords } from './chords.js';
import { settings } from './settings.js';
import { degreeJoystick } from './degree-joystick.js';
import { modifierJoystick, MODIFIER_KEY_TO_DIR, fixedDirectionLabel } from './modifier-joystick.js';

// A live on-screen mirror of the physical keyboard shortcuts, laid out in
// their actual QWERTY positions rather than a plain list — shown in place
// of the two joysticks once keyboard input is detected (see index.js's
// keyboard-active handling), since a mouse/touch-shaped SVG pad isn't how
// someone playing by keyboard is actually interacting with this.
//
// Deliberately a pure *visualization*, not a second clickable input surface
// — keycaps have pointer-events: none (see style.css). Highlighting is
// driven by reading degreeJoystick/modifierJoystick's own state after their
// keydown/keyup handlers have already run (see syncActiveStates below), so
// it reflects what's actually sounding — including Hold mode's latching —
// rather than raw key-down state, without this module reaching into their
// internals or creating an import cycle back into either of them.

// Both clusters share the same physical stagger: the home row's first used
// key sits one column left of the top row's first used key (true for a/w
// and j/i alike — see README for the derivation from real keyboard
// spacing), so one pair of offsets, in key-width units, covers both.
const ROW_OFFSET_TOP = 1;
const ROW_OFFSET_HOME = 0.25;

// Exported so a test can check these stay in sync with chords.DEGREES'
// bindKeys / MODIFIER_KEY_TO_DIR's keys, rather than only ever finding a
// drift here by eye in a screenshot.
export const DEGREE_ROWS = {
  top: ['w', 'e', 'r'],
  home: ['a', 's', 'd', 'f'],
};
export const MODIFIER_ROWS = {
  top: ['i', 'o', 'p', '['],
  home: ['j', 'k', 'l', ';'],
};

// key -> { root, labelEl }, for both clusters together (their key sets
// don't overlap, so one flat map is fine).
const keyEls = {};

function buildRow(container, keys, offsetUnits) {
  const row = document.createElement('div');
  row.className = 'keyboard-row';
  row.style.marginLeft = `calc(${offsetUnits} * (var(--key-size) + var(--key-gap)))`;
  keys.forEach(key => {
    const keyEl = document.createElement('div');
    keyEl.className = 'key-cap';
    keyEl.dataset.key = key;

    const letterEl = document.createElement('div');
    letterEl.className = 'key-letter';
    letterEl.textContent = key;

    const labelEl = document.createElement('div');
    labelEl.className = 'key-label';

    keyEl.appendChild(letterEl);
    keyEl.appendChild(labelEl);
    row.appendChild(keyEl);
    keyEls[key] = { root: keyEl, labelEl };
  });
  container.appendChild(row);
}

// Same length-based shrink idiom used for the centre chord-name readout
// (degree-joystick.js) and the joystick's own wedge labels (modifier-
// joystick.js) — Extended/Chromatic names run long enough to need it here
// too, in an even smaller box.
function setLabelText(labelEl, text) {
  labelEl.textContent = text;
  labelEl.style.fontSize = text.length > 7 ? '6px' : text.length > 5 ? '7px' : '';
}

// Modifier-key labels are the flat default text for the current modifier
// set (see fixedDirectionLabel) — not live-resolved against whatever
// quality is currently held, unlike the joystick wedges' own two-line
// split labels. That live dimming needs two stacked tspans to show both
// options at once; these keycaps are too small for it, and re-deriving it
// here would mean either duplicating modifier-joystick.js's dimming logic
// or importing back into it, which would close an import cycle (it already
// imports this module's degree/modifier state — see the top-of-file note).
function refreshModifierLabels() {
  Object.entries(MODIFIER_KEY_TO_DIR).forEach(([key, dir]) => {
    if (keyEls[key]) setLabelText(keyEls[key].labelEl, fixedDirectionLabel(settings.modifierSet, dir));
  });
}

function syncActiveStates() {
  Object.values(keyEls).forEach(({ root }) => root.classList.remove('active'));
  degreeJoystick.heldDegrees.forEach((_, degKey) => {
    const d = degreeJoystick.degreeByKey.get(degKey);
    if (d && keyEls[d.bindKey]) keyEls[d.bindKey].root.classList.add('active');
  });
  const activeKey = Object.keys(MODIFIER_KEY_TO_DIR)
    .find(key => MODIFIER_KEY_TO_DIR[key] === modifierJoystick.currentDirection);
  if (activeKey && keyEls[activeKey]) keyEls[activeKey].root.classList.add('active');
}

export function init() {
  const degreeContainer = document.getElementById('degree-keyboard-view');
  const modifierContainer = document.getElementById('modifier-keyboard-view');

  buildRow(degreeContainer, DEGREE_ROWS.top, ROW_OFFSET_TOP);
  buildRow(degreeContainer, DEGREE_ROWS.home, ROW_OFFSET_HOME);
  buildRow(modifierContainer, MODIFIER_ROWS.top, ROW_OFFSET_TOP);
  buildRow(modifierContainer, MODIFIER_ROWS.home, ROW_OFFSET_HOME);

  chords.DEGREES.forEach(d => {
    if (keyEls[d.bindKey]) setLabelText(keyEls[d.bindKey].labelEl, d.degree);
  });
  refreshModifierLabels();

  // Registered after initDegreeJoystick()/initModifierJoystick() (see
  // index.js), so on the same keydown/keyup dispatch, their own listeners —
  // the ones that actually update heldDegrees/currentDirection — have
  // already run by the time these fire (same-event listeners run in
  // registration order), and this reads the settled result rather than a
  // stale value from just before the press/release was applied.
  window.addEventListener('keydown', syncActiveStates);
  window.addEventListener('keyup', syncActiveStates);
}

// Called from index.js's modifier-set <select> handler, alongside
// setModifierSet — the one thing about these labels that can change after
// init without a page reload.
export function refreshKeyboardViewLabels() {
  refreshModifierLabels();
}
