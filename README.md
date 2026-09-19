# Chord — Web Synth

Single-file (`index.html`) HiChord-inspired chord synthesizer. Web Audio API, no build step, no dependencies.

**Live:** https://millllllz.github.io/joy-chord/
**Repo:** https://github.com/millllllz/joy-chord (public, `master` branch, deploys via GitHub Pages on push)

## Architecture

Two side-by-side SVG joysticks, controller-style:

- **Degree joystick** (left, 7 wedges): diatonic scale degrees I–vii° in the current key, each with its own natural triad quality (major/minor/diminished). Hover/touch/keyboard (`a s d f` odd, `w e r` even, or `1`-`7`) to play.
- **Modifier joystick** (right, 8 wedges): HiChord-style chord modifications (maj/min toggle, dom7, 7th, add9, sus4, add6/sus2, darken, aug) applied relative to whichever degree's natural quality is held — not always a major base.

A `<select>` dropdown transposes all 7 degrees together (global key root, semitone offset from C).

Voices are tracked per-degree by absolute pitch (`degreeKey:semitone`) and reconciled on every change (chord press, joystick move, key change) so only notes that actually enter/leave the chord get started/stopped — shared tones sustain without re-triggering their envelope.

Full multi-touch: each finger tracked by touch identifier, can hold independent chords, drag between wedges without lifting.

## Conventions established in this project

- Every UI change gets verified in a live browser (chrome-devtools MCP tools) before considering it done — screenshot + console check minimum, often synthetic event dispatch to verify audio/state logic (oscillator start/stop counting for voice-lifecycle bugs).
- **Build version tag** (bottom-left corner, `v1`, `v2`, ...) — increment by 1 on every deploy so version is visible on-device. Currently at **v4**.
- **Debug panel** (bottom-right "debug" toggle) — on-page diagnostic log, added because the user can't plug their phone in for remote debugging. Kept intentionally for now; logs fullscreen API feature-detection and click/promise tracing.
- Commit messages are detailed (what + why + how verified); push to `master` immediately deploys.
- Fullscreen button only shown if `document.fullscreenEnabled` + `requestFullscreen` actually exist (confirmed absent on the user's Chrome mobile — don't re-add unconditionally).

## Known open items / suggested next steps

- Regression harness: a hidden test mode running oscillator start/stop assertions (triad→7th = +1 voice/0 stops, etc.) to catch future voice-lifecycle regressions without manual instrumentation.
- Envelope is currently just `ATTACK=0.01, RELEASE=0.08` constants (AR, not full ADSR), linear ramps, hardcoded `sawtooth` wave. Discussed but not built: full ADSR + curve shape + a small UI panel for it.
- PWA (manifest + service worker) was raised as an alternative to the Fullscreen API for chrome-free mobile launch — not built; fullscreen button (feature-detected) was the chosen path instead.
