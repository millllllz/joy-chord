import { audio, startVoice, stopVoice, noteFreq } from './audio.js';
import { effects } from './effects.js';
import { chords, getChordIntervals } from './chords.js';
import { settings } from './settings.js';
import { updateQualityWedgeLabels } from './modifier-joystick.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const degreeJoystick = {
  heldDegrees: new Map(),
  heldVoices: new Map(),
  currentDirection: 'center',
  degreeByKey: new Map(),
  degreeByBindKey: new Map(),
  degreeJoystickEl: null,
  degreeMouseDot: null,
  degreeTouchDots: new Map(),
  touchedDegrees: new Map(),
};

export function init() {
  degreeJoystick.degreeByKey = new Map(chords.DEGREES.map(d => [d.key, d]));
  degreeJoystick.degreeByBindKey = new Map(chords.DEGREES.map(d => [d.bindKey, d]));

  degreeJoystick.degreeJoystickEl = document.getElementById('degree-joystick');

  const STICK_CENTER = 110;

  // Render wedges and labels
  chords.DEGREES.forEach(d => {
    const wedgeEl = svgEl('path', { class: 'degree-wedge', 'data-key': d.key, d: d.wedge });
    degreeJoystick.degreeJoystickEl.appendChild(wedgeEl);
    d.wedgeEl = wedgeEl;
  });

  chords.DEGREES.forEach(d => {
    const [lx, ly] = d.labelPos;
    const labelEl = svgEl('text', { class: 'degree-label', 'data-key': d.key, x: lx, y: ly });
    labelEl.textContent = d.degree;
    degreeJoystick.degreeJoystickEl.appendChild(labelEl);
    d.labelEl = labelEl;

    const [qx, qy] = d.qualityPos;
    const qualityEl = svgEl('text', { class: 'degree-quality', 'data-key': d.key, x: qx, y: qy });
    qualityEl.textContent = d.quality === 'diminished' ? 'dim' : d.quality;
    degreeJoystick.degreeJoystickEl.appendChild(qualityEl);
    d.qualityEl = qualityEl;
  });

  const degreeCenterCircle = svgEl('circle', { class: 'joy-center', cx: 110, cy: 110, r: 40, fill: 'url(#degreeCenterGradient)' });
  degreeJoystick.degreeJoystickEl.appendChild(degreeCenterCircle);
  const degreeCenterLabel = svgEl('text', { class: 'degree-center-label', x: 110, y: 110 });
  degreeJoystick.degreeJoystickEl.appendChild(degreeCenterLabel);

  degreeJoystick.degreeMouseDot = svgEl('circle', { class: 'stick-dot', cx: 110, cy: 110, r: 14 });
  degreeJoystick.degreeJoystickEl.appendChild(degreeJoystick.degreeMouseDot);

  // Mouse interaction
  chords.DEGREES.forEach(d => {
    d.wedgeEl.addEventListener('mouseenter', () => pressDegree(d));
    d.wedgeEl.addEventListener('mouseleave', () => releaseDegree(d));
  });

  degreeJoystick.degreeJoystickEl.addEventListener('mousemove', (e) => {
    moveStickDot(degreeJoystick.degreeMouseDot, degreeJoystick.degreeJoystickEl, e.clientX, e.clientY);
  });
  degreeJoystick.degreeJoystickEl.addEventListener('mouseleave', () => resetStickDot(degreeJoystick.degreeMouseDot));

  // Touch interaction
  degreeJoystick.degreeJoystickEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    Array.from(e.changedTouches).forEach(touch => {
      const dot = svgEl('circle', { class: 'stick-dot', cx: 110, cy: 110, r: 14 });
      degreeJoystick.degreeJoystickEl.appendChild(dot);
      degreeJoystick.degreeTouchDots.set(touch.identifier, dot);
      moveStickDot(dot, degreeJoystick.degreeJoystickEl, touch.clientX, touch.clientY);

      const d = degreeAtPoint(touch.clientX, touch.clientY);
      if (!d) return;
      degreeJoystick.touchedDegrees.set(touch.identifier, d.key);
      pressDegree(d);
    });
  }, { passive: false });

  degreeJoystick.degreeJoystickEl.addEventListener('touchmove', (e) => {
    e.preventDefault();
    Array.from(e.changedTouches).forEach(touch => {
      const dot = degreeJoystick.degreeTouchDots.get(touch.identifier);
      if (dot) moveStickDot(dot, degreeJoystick.degreeJoystickEl, touch.clientX, touch.clientY);

      const currentKey = degreeJoystick.touchedDegrees.get(touch.identifier);
      const d = degreeAtPoint(touch.clientX, touch.clientY);
      const newKey = d ? d.key : null;
      if (newKey === currentKey) return;
      if (currentKey) releaseDegree(degreeJoystick.degreeByKey.get(currentKey));
      if (d) {
        pressDegree(d);
        degreeJoystick.touchedDegrees.set(touch.identifier, d.key);
      } else {
        degreeJoystick.touchedDegrees.delete(touch.identifier);
      }
    });
  }, { passive: false });

  const endDegreeTouch = (e) => {
    e.preventDefault();
    Array.from(e.changedTouches).forEach(touch => {
      const dot = degreeJoystick.degreeTouchDots.get(touch.identifier);
      if (dot) {
        degreeJoystick.degreeTouchDots.delete(touch.identifier);
        resetStickDot(dot);
        dot.classList.add('released');
        setTimeout(() => dot.remove(), 150);
      }

      const key = degreeJoystick.touchedDegrees.get(touch.identifier);
      if (!key) return;
      releaseDegree(degreeJoystick.degreeByKey.get(key));
      degreeJoystick.touchedDegrees.delete(touch.identifier);
    });
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
  dotEl.setAttribute('cx', x);
  dotEl.setAttribute('cy', y);
}

function resetStickDot(dotEl) {
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
  getChordIntervals(d.quality, direction).forEach(interval => {
    const semitone = settings.currentKeyRoot + d.semitone + interval;
    target.set(`${d.key}:${semitone}`, noteFreq(semitone));
  });
  return target;
}

function updateDegreeVoicing(d, direction) {
  const target = voicesForDegree(d, direction);
  (degreeJoystick.heldVoices.get(d.key) || new Set()).forEach(id => {
    if (!target.has(id)) stopVoice(id);
  });
  target.forEach((freq, id) => startVoice(id, freq));
  degreeJoystick.heldVoices.set(d.key, new Set(target.keys()));
}

function pressDegree(d) {
  if (degreeJoystick.heldDegrees.has(d.key)) return;
  degreeJoystick.heldDegrees.set(d.key, degreeJoystick.currentDirection);
  updateDegreeVoicing(d, degreeJoystick.currentDirection);
  d.wedgeEl.classList.add('active');
  d.labelEl.classList.add('active');
  d.qualityEl.classList.add('active');
  updateQualityWedgeLabels();
}

function releaseDegree(d) {
  if (!degreeJoystick.heldDegrees.has(d.key)) return;
  degreeJoystick.heldDegrees.delete(d.key);
  (degreeJoystick.heldVoices.get(d.key) || new Set()).forEach(id => stopVoice(id));
  degreeJoystick.heldVoices.delete(d.key);
  d.wedgeEl.classList.remove('active');
  d.labelEl.classList.remove('active');
  d.qualityEl.classList.remove('active');
  updateQualityWedgeLabels();
}

export function setDirection(direction) {
  if (direction === degreeJoystick.currentDirection) return;
  degreeJoystick.currentDirection = direction;
  degreeJoystick.heldDegrees.forEach((_, key) => {
    updateDegreeVoicing(degreeJoystick.degreeByKey.get(key), direction);
    degreeJoystick.heldDegrees.set(key, direction);
  });
}

export function setKeyRoot(root) {
  if (root === settings.currentKeyRoot) return;
  settings.currentKeyRoot = root;
  degreeJoystick.heldDegrees.forEach((_, key) => {
    updateDegreeVoicing(degreeJoystick.degreeByKey.get(key), degreeJoystick.currentDirection);
  });
}
