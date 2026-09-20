# Modularized Architecture

## File Organization

The application is now organized into feature-based modules under `src/`, each with a single responsibility:

### Core Audio (`src/`)

**audio.js** — Voice and frequency management
- Manages the AudioContext lifecycle and voice playback
- Exports: `audio`, `init()`, `startVoice()`, `stopVoice()`, `noteFreq()`, `createReverbImpulse()`, `setWaveType()`
- State: `audio.ctx`, `audio.voices`, `audio.currentWaveType`

**effects.js** — Reverb and delay processing
- Creates and manages shared send chains (one delay line, one reverb impulse)
- Effect toggling uses gain ramping to avoid clicks
- Exports: `effects`, `init()`, `setDelayEnabled()`, `setReverbEnabled()`
- State: `effects.delaySend`, `effects.reverbSend`, `effects.delayEnabled`, `effects.reverbEnabled`

### Chords & Music Theory (`src/`)

**chords.js** — Scale degrees, triads, and chord transformations
- Defines the 7 diatonic degrees with their SVG wedge geometry and keyboard bindings
- Maps joystick directions to chord interval transformations (maj→min toggle, 7ths, sus, etc.)
- Exports: `chords`, `getChordIntervals()`, `qualityLabel()`
- Data: `DEGREES`, `BASE_TRIAD`, `CHORD_LABELS`, `QUALITY_LABELS`, `KEY_NAMES`, `WAVE_TYPES`

### User Interface & Input

**settings.js** — Key and waveform selectors
- Populates dropdowns and tracks current selection
- Exports: `settings`, `init()`, `setKeyRoot()`, `setWaveType()`
- State: `settings.currentKeyRoot`, `settings.currentWaveType`

**degree-joystick.js** — Degree chord selection (left joystick)
- Renders 7-wedge degree selector with mouse/touch/keyboard support
- Multi-touch capable: each finger can hold a different chord
- Handles live voicing updates when key or direction changes
- Exports: `degreeJoystick`, `init()`, `setDirection()`, `setKeyRoot()`
- State: `degreeJoystick.heldDegrees`, `degreeJoystick.heldVoices`, `degreeJoystick.currentDirection`

**modifier-joystick.js** — Chord modifier (right joystick)
- 8-direction modifier pad (up, up-right, right, etc.)
- Keyboard control: hjkl for odd directions, uiop for even
- Delegates direction changes to degree-joystick via `setDirection()`
- Exports: `modifierJoystick`, `init()`, `setJoyDirection()`
- State: `modifierJoystick.currentDirection`, `modifierJoystick.heldModifierKeys`

### Utilities

**debug.js** — On-page debug panel
- Logs system info and user actions
- Toggleable visibility for mobile debugging without cable/remote tools
- Exports: `debug`, `init()`, `debugLog()`

**fullscreen.js** — Fullscreen API wrapper
- Detects fullscreen support and manages state
- Safe handling of permission-denied and feature-unavailable cases
- Exports: `fullscreen`, `init()`

**index.js** — Application entry point
- Initializes all modules in dependency order
- Wires up effect toggle buttons
- Registers PWA service worker
- Imports: all modules

## Testing

**src/*.test.js** — Unit tests (Vitest + jsdom)
- 5 test files, 42 passing tests
- Tests cover logic, state transitions, and function correctness
- DOM interaction tested via mocks; integration tests rely on the app
- Run `npm test` to execute

## Build & Deployment

- **No build step** — the app uses ES6 modules natively (type="module" in index.html)
- **Old app.js removed** — functionality distributed across src/ modules
- **Production deployment** — index.html loads src/index.js directly

## Data Flow

1. User presses a key or touches the degree joystick
2. degree-joystick.js calls `pressDegree()`, which:
   - Looks up the degree's natural triad from chords.js
   - Calls `getChordIntervals()` to transform based on currentDirection
   - Calls `startVoice()` for each note in the resulting chord
3. Voices ring until user releases; audio.js manages gain ramping (attack/release)
4. Voices automatically route to both dry destination and effect sends (delay + reverb)
5. Changing the modifier joystick direction or key calls `setDirection()`/`setKeyRoot()`, which:
   - Re-voices all held degrees under the new state
   - Keeps sustained notes ringing (no re-attack)

## Key Design Decisions

- **Singleton state objects** — each module exports a state object that other modules import and mutate directly (no callbacks/subscriptions)
- **init() functions** — each module has an `init()` that sets up DOM listeners and connects to audio graph
- **No classes** — kept lightweight with functions + data objects
- **Shared audio effects** — one global delay line and reverb impulse reused across all voices via gain send buses
- **Live voicing** — voices only updated when their set of notes changes, avoiding re-attacks on direction/key changes
