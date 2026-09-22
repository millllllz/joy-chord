import { degreeJoystick, setDirection } from './degree-joystick.js';
import { wedgePath } from './wedge-geometry.js';
import { chords, qualityLabel } from './chords.js';
import { settings } from './settings.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const modifierJoystick = {
  currentDirection: 'center',
  heldModifierKeys: new Set(),
  modifierTouchId: null,
  // Whether the in-progress touch's touchstart landed on the center circle —
  // with Hold on, only a tap (start AND end on center) releases; a drag that
  // merely ends up over center doesn't count.
  touchStartedOnCenter: false,
  joystickEl: null,
  joyStickDot: null,
};

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

// 8 equal 45deg pie slices, starting at 12 o'clock and going clockwise,
// matching this array's order.
const MODIFIER_DIRECTIONS = ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'];
const MODIFIER_ANGLE_STEP = 360 / MODIFIER_DIRECTIONS.length;

// The up/right/down-left/left wedges each do something different depending on
// the held chord's quality (see chords.QUALITY_LABELS), so their label tracks
// that outcome: a single word (e.g. "min") when a sole quality is held, or the
// default two-line "A/B" form (e.g. "Maj" over "Min") when nothing/mixed is held.
const QUALITY_WEDGE_DEFAULTS = {
  up: 'Maj/Min', right: 'Maj7/min7', 'down-left': '6th/Sus2', left: 'Dim/Min',
};
const qualityWedgeLabels = {}; // direction -> label <text> element

// Clear space between a split label's two lines, in SVG user units, with
// the divider rule centred in it. Matches what the previous em-based
// spacing happened to produce in desktop Chrome, but as a fixed gap every
// engine reproduces — see renderJoyLabel.
const SPLIT_LABEL_GAP = 1.5;

// The quality shared by every currently-held degree, or null if none are held
// or they disagree (a two-line default label is shown in that case).
function soleHeldQuality() {
  const qualities = new Set(
    Array.from(degreeJoystick.heldDegrees.keys())
      .map(key => degreeJoystick.degreeByKey.get(key).quality)
  );
  return qualities.size === 1 ? [...qualities][0] : null;
}

// Render `text` (always the "A/B" default) into a modifier label as two
// stacked lines separated by a thin horizontal rule. When `resolved` names
// which of the two currently applies (the held chord's quality determines
// it), the other one is dimmed rather than removed — both options stay
// visible so the wedge doesn't visually jump around as chords change.
function renderJoyLabel(labelEl, text, resolved) {
  const dir = labelEl.getAttribute('data-dir');
  const x = Number(labelEl.getAttribute('x'));
  const y = Number(labelEl.getAttribute('y'));

  // Clear any previous content and divider rule.
  labelEl.textContent = '';
  const prevRule = labelEl.parentNode.querySelector(`.joy-label-rule[data-dir="${dir}"]`);
  if (prevRule) prevRule.remove();

  const [top, bottom] = text.split('/');
  // Provisional symmetric placement; the real positions come from the
  // measurement below, and these are what's left if it can't run.
  const provisionalTopY = y - SPLIT_LABEL_GAP / 2;
  const topSpan = svgEl('tspan', { x, y: provisionalTopY });
  topSpan.textContent = top;
  const bottomSpan = svgEl('tspan', { x, y: y + SPLIT_LABEL_GAP / 2 });
  bottomSpan.textContent = bottom;
  if (resolved) {
    topSpan.classList.toggle('dimmed', top.toLowerCase() !== resolved.toLowerCase());
    bottomSpan.classList.toggle('dimmed', bottom.toLowerCase() !== resolved.toLowerCase());
  }
  labelEl.appendChild(topSpan);
  labelEl.appendChild(bottomSpan);

  // Place the two lines by measuring the font rather than by trusting an
  // em offset to land somewhere specific. A line's box isn't centred on its
  // own anchor — it runs from ascent above to descent below — so anchors
  // placed symmetrically about y still leave the *gap* between the lines
  // off-centre, by half the difference between those two extents. That's
  // what the divider rule sits in, and the rule is at a fixed y, so the two
  // drift apart by however much the font disagrees with whatever the offset
  // was tuned against. It was tuned against desktop Chrome's fallback font;
  // iOS resolves -apple-system to SF Pro, with its own ascent/descent, and
  // the rule stopped looking centred there.
  //
  // Both lines are the same font, size, weight and all-caps, so one
  // measurement gives the extents for both: place each line's near edge
  // exactly SPLIT_LABEL_GAP/2 from y and the rule lands dead centre between
  // them on any engine, with the gap always the same size.
  const box = topSpan.getBBox();
  if (box.height) {
    const above = provisionalTopY - box.y;
    const below = box.height - above;
    topSpan.setAttribute('y', y - SPLIT_LABEL_GAP / 2 - below);
    bottomSpan.setAttribute('y', y + SPLIT_LABEL_GAP / 2 + above);
  }

  const rule = svgEl('line', {
    class: `joy-label-rule${labelEl.classList.contains('active') ? ' active' : ''}`,
    'data-dir': dir, x1: x - 12, x2: x + 12, y1: y, y2: y,
  });
  labelEl.parentNode.insertBefore(rule, labelEl.nextSibling);
}

export function updateQualityWedgeLabels() {
  const quality = soleHeldQuality();
  Object.entries(qualityWedgeLabels).forEach(([direction, el]) => {
    renderJoyLabel(el, QUALITY_WEDGE_DEFAULTS[direction], quality ? qualityLabel(direction, quality) : null);
  });
}

export function init() {
  modifierJoystick.joystickEl = document.getElementById('joystick');
  modifierJoystick.joyStickDot = document.getElementById('joy-stick-dot');
  const joyCenterCircle = modifierJoystick.joystickEl.querySelector('.joy-center');

  const labelsAnchor = modifierJoystick.joystickEl.querySelector('.joy-label');
  MODIFIER_DIRECTIONS.forEach((dir, i) => {
    const start = -MODIFIER_ANGLE_STEP / 2 + i * MODIFIER_ANGLE_STEP;
    const end = start + MODIFIER_ANGLE_STEP;
    const wedgeEl = svgEl('path', { class: 'wedge joy-wedge', 'data-dir': dir, d: wedgePath(start, end) });
    modifierJoystick.joystickEl.insertBefore(wedgeEl, labelsAnchor);
  });
  const joyWedges = modifierJoystick.joystickEl.querySelectorAll('.joy-wedge');

  // Wire up the quality-dependent wedge labels and render their initial
  // (nothing-held) two-line default form.
  Object.keys(QUALITY_WEDGE_DEFAULTS).forEach(dir => {
    qualityWedgeLabels[dir] = modifierJoystick.joystickEl.querySelector(`.joy-label[data-dir="${dir}"]`);
  });
  updateQualityWedgeLabels();

  const modifierKeyToDir = {
    // Interleaved clockwise from top: odds (jkl;) home row, evens (iop[) top row
    j: 'up',         i: 'up-right',   k: 'right',      o: 'down-right',
    l: 'down',       p: 'down-left',  ';': 'left',     '[': 'up-left',
  };

  // Mouse interaction
  joyWedges.forEach(wedge => {
    wedge.addEventListener('mouseenter', () => setJoyDirection(wedge.dataset.dir));
  });

  // With Hold off, merely entering the center circle is the reset gesture
  // (mouse has no discrete "release" event, so hover stands in for it). With
  // Hold on, a latched note must not drop just because the pointer passed
  // over center on its way elsewhere — releasing it takes a deliberate
  // click on the circle instead.
  joyCenterCircle.addEventListener('mouseenter', () => {
    if (settings.holdEnabled) return;
    setJoyDirection('center');
  });
  joyCenterCircle.addEventListener('click', () => {
    if (!settings.holdEnabled) return;
    setJoyDirection('center');
  });
  modifierJoystick.joystickEl.addEventListener('mouseleave', () => {
    if (settings.holdEnabled) return;
    setJoyDirection('center');
  });

  modifierJoystick.joystickEl.addEventListener('mousemove', (e) => {
    moveStickDot(modifierJoystick.joyStickDot, modifierJoystick.joystickEl, e.clientX, e.clientY);
  });
  modifierJoystick.joystickEl.addEventListener('mouseleave', () => resetStickDot(modifierJoystick.joyStickDot));

  // Keyboard interaction
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const dir = modifierKeyToDir[e.key.toLowerCase()];
    if (!dir) return;
    modifierJoystick.heldModifierKeys.add(e.key.toLowerCase());
    setJoyDirection(dir);
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (!(key in modifierKeyToDir)) return;
    modifierJoystick.heldModifierKeys.delete(key);
    if (modifierJoystick.heldModifierKeys.size > 0) {
      // A second modifier key is still down — always switch to it, hold or
      // not; this is a selection, not a release to nothing.
      const remaining = [...modifierJoystick.heldModifierKeys][0];
      setJoyDirection(modifierKeyToDir[remaining]);
      return;
    }
    // No modifier key left down. Keyboard has no "drag to center" gesture,
    // so with Hold on the last direction just latches — turning Hold off
    // (see index.js) resets it.
    if (settings.holdEnabled) return;
    setJoyDirection('center');
  });

  // Touch interaction
  modifierJoystick.joystickEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (modifierJoystick.modifierTouchId !== null) return;
    const touch = e.changedTouches[0];
    modifierJoystick.modifierTouchId = touch.identifier;
    moveStickDot(modifierJoystick.joyStickDot, modifierJoystick.joystickEl, touch.clientX, touch.clientY);
    const dir = directionAtPoint(touch.clientX, touch.clientY);
    modifierJoystick.touchStartedOnCenter = dir === 'center';
    if (!dir) return;
    // Landing on center at touchdown doesn't reset while Hold is on — only
    // a tap (lift also at center, see endModifierTouch below) does.
    if (dir === 'center' && settings.holdEnabled) return;
    setJoyDirection(dir);
  }, { passive: false });

  modifierJoystick.joystickEl.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = Array.from(e.changedTouches).find(t => t.identifier === modifierJoystick.modifierTouchId);
    if (!touch) return;
    moveStickDot(modifierJoystick.joyStickDot, modifierJoystick.joystickEl, touch.clientX, touch.clientY);
    const dir = directionAtPoint(touch.clientX, touch.clientY);
    // Only act on a definite wedge or the actual center circle — falling
    // back to 'center' here (as this used to) meant a finger dragged
    // through the gap *between* two wedges (widened since the wedge-gap
    // change) briefly landed on neither, bouncing the chord back to the
    // bare triad mid-drag before it reached the target wedge. Harmless
    // without glide (an extra near-instant stop/start), but with glide on
    // it corrupted a single clean slide into two — reconcile back toward
    // center, then immediately back out — which reads as glide not working.
    if (!dir) return;
    // With Hold on, merely dragging onto/through center doesn't reset
    // either — only a lift while there does (endModifierTouch below).
    if (dir === 'center' && settings.holdEnabled) return;
    setJoyDirection(dir);
  }, { passive: false });

  const endModifierTouch = (e) => {
    const touch = Array.from(e.changedTouches).find(t => t.identifier === modifierJoystick.modifierTouchId);
    if (!touch) return;
    e.preventDefault();
    modifierJoystick.modifierTouchId = null;
    resetStickDot(modifierJoystick.joyStickDot);
    // With Hold on, only reset on a tap — touchstart AND touchend both on
    // the center circle. A drag that merely ends up over center (without
    // starting there) leaves the note latched; releasing takes a
    // deliberate tap on the circle instead.
    if (settings.holdEnabled &&
        !(modifierJoystick.touchStartedOnCenter && directionAtPoint(touch.clientX, touch.clientY) === 'center')) return;
    setJoyDirection('center');
  };
  modifierJoystick.joystickEl.addEventListener('touchend', endModifierTouch, { passive: false });
  modifierJoystick.joystickEl.addEventListener('touchcancel', endModifierTouch, { passive: false });
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

function directionAtPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  if (el.classList.contains('joy-wedge')) return el.dataset.dir;
  // The degree stick has a same-classed .joy-center circle too, so confirm
  // el is specifically this stick's own before treating it as a center hit.
  if (el.classList.contains('joy-center') && el === modifierJoystick.joystickEl.querySelector('.joy-center')) return 'center';
  return null;
}

export function setJoyDirection(dir) {
  setDirection(dir);
  modifierJoystick.currentDirection = dir;
  const joyWedges = document.querySelectorAll('.joy-wedge');
  const joyLabels = document.querySelectorAll('.joy-label');
  const joyRules = document.querySelectorAll('.joy-label-rule');
  joyWedges.forEach(w => w.classList.toggle('active', w.dataset.dir === dir));
  joyLabels.forEach(l => l.classList.toggle('active', l.dataset.dir === dir));
  joyRules.forEach(r => r.classList.toggle('active', r.dataset.dir === dir));
}
