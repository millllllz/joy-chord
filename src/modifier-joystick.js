import { degreeJoystick, setDirection } from './degree-joystick.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const modifierJoystick = {
  currentDirection: 'center',
  heldModifierKeys: new Set(),
  modifierTouchId: null,
  joystickEl: null,
  joyStickDot: null,
};

export function init() {
  modifierJoystick.joystickEl = document.getElementById('joystick');
  modifierJoystick.joyStickDot = document.getElementById('joy-stick-dot');
  const joyCenterCircle = document.querySelector('.joy-center');
  const joyWedges = document.querySelectorAll('.joy-wedge');

  const modifierKeyToDir = {
    // Interleaved clockwise from top: odds (jkl;) home row, evens (iop[) top row
    j: 'up',         i: 'up-right',   k: 'right',      o: 'down-right',
    l: 'down',       p: 'down-left',  ';': 'left',     '[': 'up-left',
  };

  // Mouse interaction
  joyWedges.forEach(wedge => {
    wedge.addEventListener('mouseenter', () => setJoyDirection(wedge.dataset.dir));
  });

  joyCenterCircle.addEventListener('mouseenter', () => setJoyDirection('center'));
  modifierJoystick.joystickEl.addEventListener('mouseleave', () => setJoyDirection('center'));

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
    if (modifierJoystick.heldModifierKeys.size === 0) {
      setJoyDirection('center');
    } else {
      const remaining = [...modifierJoystick.heldModifierKeys][0];
      setJoyDirection(modifierKeyToDir[remaining]);
    }
  });

  // Touch interaction
  modifierJoystick.joystickEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (modifierJoystick.modifierTouchId !== null) return;
    const touch = e.changedTouches[0];
    modifierJoystick.modifierTouchId = touch.identifier;
    moveStickDot(modifierJoystick.joyStickDot, modifierJoystick.joystickEl, touch.clientX, touch.clientY);
    const dir = directionAtPoint(touch.clientX, touch.clientY);
    if (dir) setJoyDirection(dir);
  }, { passive: false });

  modifierJoystick.joystickEl.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = Array.from(e.changedTouches).find(t => t.identifier === modifierJoystick.modifierTouchId);
    if (!touch) return;
    moveStickDot(modifierJoystick.joyStickDot, modifierJoystick.joystickEl, touch.clientX, touch.clientY);
    const dir = directionAtPoint(touch.clientX, touch.clientY);
    setJoyDirection(dir || 'center');
  }, { passive: false });

  const endModifierTouch = (e) => {
    const touch = Array.from(e.changedTouches).find(t => t.identifier === modifierJoystick.modifierTouchId);
    if (!touch) return;
    e.preventDefault();
    modifierJoystick.modifierTouchId = null;
    resetStickDot(modifierJoystick.joyStickDot);
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
  dotEl.setAttribute('cx', x);
  dotEl.setAttribute('cy', y);
}

function resetStickDot(dotEl) {
  dotEl.setAttribute('cx', STICK_CENTER);
  dotEl.setAttribute('cy', STICK_CENTER);
}

function directionAtPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  if (el.classList.contains('joy-wedge')) return el.dataset.dir;
  if (el.classList.contains('joy-center') && el === document.querySelector('.joy-center')) return 'center';
  return null;
}

export function setJoyDirection(dir) {
  setDirection(dir);
  modifierJoystick.currentDirection = dir;
  const joyWedges = document.querySelectorAll('.joy-wedge');
  const joyLabels = document.querySelectorAll('.joy-label');
  joyWedges.forEach(w => w.classList.toggle('active', w.dataset.dir === dir));
  joyLabels.forEach(l => l.classList.toggle('active', l.dataset.dir === dir));
}
