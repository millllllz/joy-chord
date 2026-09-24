import { vi } from 'vitest';

// Mock AudioContext
global.AudioContext = class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = { connect: vi.fn() };
  }

  createGain() {
    return new MockAudioNode();
  }

  createOscillator() {
    return new MockOscillator();
  }

  createDelay() {
    return new MockAudioNode();
  }

  createConvolver() {
    return new MockAudioNode();
  }

  createBiquadFilter() {
    return new MockAudioNode();
  }

  createStereoPanner() {
    return new MockAudioNode();
  }

  createWaveShaper() {
    return new MockAudioNode();
  }

  createMediaStreamSource() {
    return new MockAudioNode();
  }

  createBuffer(channels, length, sampleRate) {
    const channelData = [];
    for (let i = 0; i < channels; i++) {
      channelData.push(new Float32Array(length));
    }
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: (i) => channelData[i],
    };
  }

  resume() {
    return Promise.resolve();
  }
};

class MockAudioNode {
  constructor() {
    this.gain = new MockAudioParam();
    this.delayTime = new MockAudioParam();
    this.type = 'sine';
    this.frequency = new MockAudioParam();
    this.detune = new MockAudioParam();
    this.Q = new MockAudioParam();
    this.pan = new MockAudioParam();
    // Recorded so tests can assert signal routing, which is otherwise
    // invisible to them — a misrouted node still passes every state check.
    this.connections = [];
  }

  connect(dest) {
    this.connections.push(dest);
    return dest;
  }

  disconnect(dest) {
    this.connections = dest ? this.connections.filter(c => c !== dest) : [];
  }

  start() {}
  stop() {}
}

class MockOscillator extends MockAudioNode {
  constructor() {
    super();
    this.type = 'sine';
    this.frequency = new MockAudioParam();
  }
}

class MockAudioParam {
  constructor() {
    this.value = 0;
    // Recorded so tests can assert the sequence of calls (e.g. a glide's
    // starting value before its ramp), not just the final .value — which
    // method won last is otherwise indistinguishable from having only ever
    // been set once.
    this.calls = [];
  }

  setValueAtTime(value, time) {
    this.value = value;
    this.calls.push({ method: 'setValueAtTime', value, time });
  }

  linearRampToValueAtTime(value, time) {
    this.value = value;
    this.calls.push({ method: 'linearRampToValueAtTime', value, time });
  }

  cancelScheduledValues(time) {
    this.calls.push({ method: 'cancelScheduledValues', time });
  }
}

// Mock document APIs
global.document = {
  ...global.document,
  getElementById: vi.fn(() => ({
    appendChild: vi.fn(),
    addEventListener: vi.fn(),
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      toggle: vi.fn(),
    },
    setAttribute: vi.fn(),
    getAttribute: vi.fn(),
    // The centre chord-name labels get both of these written to them by
    // updateChordNameLabel, which any setKeyRoot/setDirection call reaches.
    textContent: '',
    style: {},
  })),
  querySelectorAll: vi.fn(() => []),
  querySelector: vi.fn(() => null),
  createElement: vi.fn(() => ({
    appendChild: vi.fn(),
  })),
  createElementNS: vi.fn(() => ({
    setAttribute: vi.fn(),
    getAttribute: vi.fn(),
    appendChild: vi.fn(),
    createSVGPoint: vi.fn(),
  })),
  elementFromPoint: vi.fn(() => null),
};

// Mock SVG element
global.SVGElement = class MockSVGElement {
  constructor() {
    this.dataset = {};
  }

  createSVGPoint() {
    return { x: 0, y: 0, matrixTransform: () => ({ x: 0, y: 0 }) };
  }

  getScreenCTM() {
    return { inverse: () => ({}) };
  }
};

global.window = {
  ...global.window,
  AudioContext: global.AudioContext,
  addEventListener: vi.fn(),
  navigator: { userAgent: 'test' },
};

// vocoder.js reads the bare global `navigator` (matching how browsers
// actually expose it), not window.navigator above — jsdom provides a real
// Navigator object for that already, it just has no mediaDevices, since
// jsdom doesn't implement media capture. Tests override getUserMedia's
// return value per-case; this default grants a harmless fake stream so
// tests that don't care about mic behavior aren't forced to mock it too.
global.navigator.mediaDevices = {
  // A real MediaStream's tracks are stable objects, not regenerated on every
  // getTracks() call — the closure here mirrors that, so a test can grab a
  // track's stop() spy before disabling and still see the same object the
  // implementation calls stop() on.
  getUserMedia: vi.fn(() => {
    const track = { stop: vi.fn() };
    return Promise.resolve({ getTracks: () => [track] });
  }),
};
