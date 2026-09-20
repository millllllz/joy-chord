import { chords } from './chords.js';
import { audio, setWaveType } from './audio.js';

export const settings = {
  currentKeyRoot: 0,
  KEY_NAMES: chords.KEY_NAMES,
  WAVE_TYPES: chords.WAVE_TYPES,
  // When on, both joysticks latch on release instead of stopping — see
  // degree-joystick.js/modifier-joystick.js for where this is read.
  holdEnabled: false,
};

export function init() {
  const keySelectEl = document.getElementById('key-select');
  settings.KEY_NAMES.forEach((name, root) => {
    const option = document.createElement('option');
    option.value = root;
    option.textContent = name;
    keySelectEl.appendChild(option);
  });
  keySelectEl.value = settings.currentKeyRoot;
  keySelectEl.addEventListener('change', () => {
    setKeyRoot(Number(keySelectEl.value));
  });

  const waveSelectEl = document.getElementById('wave-select');
  settings.WAVE_TYPES.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type[0].toUpperCase() + type.slice(1);
    waveSelectEl.appendChild(option);
  });
  waveSelectEl.value = audio.currentWaveType;
  waveSelectEl.addEventListener('change', () => {
    setWaveType(waveSelectEl.value);
  });
}

export function setKeyRoot(root) {
  if (root === settings.currentKeyRoot) return;
  settings.currentKeyRoot = root;
  // Re-voicing handled by caller
}

export function setHoldEnabled(enabled) {
  settings.holdEnabled = enabled;
}
