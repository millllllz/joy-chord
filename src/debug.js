export const debug = {
  panel: null,
};

export function init() {
  debug.panel = document.getElementById('debug-panel');
  const debugToggle = document.getElementById('debug-toggle');

  debugToggle.addEventListener('click', () => {
    debug.panel.classList.toggle('visible');
  });

  window.addEventListener('error', (e) => {
    debugLog(`window error: ${e.message} (${e.filename}:${e.lineno})`);
  });

  logSystemInfo();
}

export function debugLog(msg) {
  const line = document.createElement('div');
  const time = new Date().toISOString().split('T')[1].replace('Z', '');
  line.textContent = `[${time}] ${msg}`;
  debug.panel.appendChild(line);
  debug.panel.scrollTop = debug.panel.scrollHeight;
}

function logSystemInfo() {
  debugLog(`ua: ${navigator.userAgent}`);
  debugLog(`fullscreenEnabled: ${document.fullscreenEnabled}`);
  debugLog(`document.documentElement.requestFullscreen: ${typeof document.documentElement.requestFullscreen}`);
  debugLog(`document.documentElement.webkitRequestFullscreen: ${typeof document.documentElement.webkitRequestFullscreen}`);
  debugLog(`isSecureContext: ${window.isSecureContext}`);
  debugLog(`in iframe: ${window.self !== window.top}`);
}
