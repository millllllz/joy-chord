import { init as initAudio } from './audio.js';
import { init as initEffects, setDelayEnabled, setReverbEnabled, effects } from './effects.js';
import { init as initSettings } from './settings.js';
import { init as initDegreeJoystick } from './degree-joystick.js';
import { init as initModifierJoystick } from './modifier-joystick.js';
import { init as initDebug, debugLog } from './debug.js';
import { init as initFullscreen } from './fullscreen.js';

// Initialize audio system
initAudio();
initEffects();

// Wire up effect toggles
const delayToggleBtn = document.getElementById('delay-toggle');
const reverbToggleBtn = document.getElementById('reverb-toggle');

delayToggleBtn.addEventListener('click', () => {
  setDelayEnabled(!effects.delayEnabled);
  delayToggleBtn.classList.toggle('active', effects.delayEnabled);
  delayToggleBtn.setAttribute('aria-pressed', String(effects.delayEnabled));
});

reverbToggleBtn.addEventListener('click', () => {
  setReverbEnabled(!effects.reverbEnabled);
  reverbToggleBtn.classList.toggle('active', effects.reverbEnabled);
  reverbToggleBtn.setAttribute('aria-pressed', String(effects.reverbEnabled));
});

// Initialize UI
initDebug();
initSettings();
initDegreeJoystick();
initModifierJoystick();
initFullscreen();

// Register PWA service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => debugLog(`service worker registered, scope: ${reg.scope}`))
      .catch(err => debugLog(`service worker registration failed: ${err.name}: ${err.message}`));
  });
} else {
  debugLog('serviceWorker not supported');
}
