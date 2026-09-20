import { debugLog } from './debug.js';

export const fullscreen = {
  supported: false,
};

export function init() {
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const expandIcon = document.getElementById('fullscreen-icon-expand');
  const collapseIcon = document.getElementById('fullscreen-icon-collapse');

  fullscreen.supported = !!(
    document.fullscreenEnabled &&
    (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)
  );
  debugLog(`fullscreen button shown: ${fullscreen.supported}`);

  if (fullscreen.supported) {
    fullscreenBtn.classList.add('supported');
  }

  fullscreenBtn.addEventListener('click', () => {
    debugLog('fullscreen button click fired');
    if (!isFullscreen()) {
      const el = document.documentElement;
      const request = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!request) {
        debugLog('no requestFullscreen function found on documentElement');
        return;
      }
      debugLog('calling requestFullscreen...');
      try {
        const result = request.call(el);
        Promise.resolve(result).then(() => {
          debugLog('requestFullscreen resolved OK');
        }).catch(err => {
          debugLog(`requestFullscreen rejected: ${err.name}: ${err.message}`);
        });
      } catch (err) {
        debugLog(`requestFullscreen threw synchronously: ${err.name}: ${err.message}`);
      }
    } else {
      debugLog('already fullscreen, calling exitFullscreen...');
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (!exit) {
        debugLog('no exitFullscreen function found');
        return;
      }
      Promise.resolve(exit.call(document)).then(() => {
        debugLog('exitFullscreen resolved OK');
      }).catch(err => {
        debugLog(`exitFullscreen rejected: ${err.name}: ${err.message}`);
      });
    }
  });

  document.addEventListener('fullscreenchange', () => {
    debugLog(`fullscreenchange event fired, isFullscreen=${isFullscreen()}`);
    updateFullscreenIcon(expandIcon, collapseIcon);
  });
  document.addEventListener('webkitfullscreenchange', () => {
    debugLog(`webkitfullscreenchange event fired, isFullscreen=${isFullscreen()}`);
    updateFullscreenIcon(expandIcon, collapseIcon);
  });
}

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function updateFullscreenIcon(expandIcon, collapseIcon) {
  const active = isFullscreen();
  expandIcon.style.display = active ? 'none' : '';
  collapseIcon.style.display = active ? '' : 'none';
}
