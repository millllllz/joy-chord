# JoyChord — Web Synth

JoyChord is an installable PWA HiChord-inspired chord synthesizer. Web Audio API, no build step, no dependencies. App logic lives in one file (`index.html`); `manifest.webmanifest` + `sw.js` + `icons/` make it installable/offline-capable.

**Live:** https://millllllz.github.io/joy-chord/
**Repo:** https://github.com/millllllz/joy-chord (public, `master` branch, deploys via GitHub Pages on push)
**Current build:** v23 (bottom-left corner of the app; bump on every deploy, see Conventions)

## Naming

- **Degree joystick** — the left stick, 7 wedges, one per diatonic **chord degree** (I, ii, iii, IV, V, vi, vii°).
- **Modifier joystick** — the right stick, 8 wedges, changes the quality/extension of whichever degree is held.
- **Stick dot** — the small knob on each joystick that tracks the raw pointer/touch position continuously, layered on top of the discrete wedge zones.

Not "Nashville numbers" — that term belongs to a different, unrelated chart notation.

## Architecture

Two side-by-side SVG joysticks, controller-style:

- **Degree joystick** (left, 7 wedges): diatonic scale degrees I–vii° in the current key, each with its own natural triad quality (major/minor/diminished). Hover/touch/keyboard (`a s d f` odd, `w e r` even, or `1`-`7`) to play. Wedge/center labels are case-sensitive on purpose (I vs ii vs vii°) — this is the one place case carries meaning, so `.degree-label`/`.degree-center-label` never get `text-transform`.
- **Modifier joystick** (right, 8 wedges): HiChord-style chord modifications (maj/min toggle, dom7, 7th, add9, sus4, add6/sus2, darken, aug) applied relative to whichever degree's natural quality is held — not always a major base. Labels are uppercase (`.joy-label`/`.joy-center-label`, by explicit user preference — an intermediate case-sensitive version was tried and reverted). Any label containing "/" (e.g. `MAJ/MIN`, `MAJ7/MIN7`) is split into two stacked `<tspan>` lines via `setWedgeLabel()`, since SVG `<text>` doesn't wrap and these are too wide for one line at wedge scale; once a chord resolves the quality-dependent wedges collapse back to one word (no slash) automatically.
- **"left" (darken) direction**: deviates from the manual on purpose — major/minor both go to diminished, and diminished (vii°) steps to minor (the only way to reach a plain minor triad on that button, since nothing else produces one there).

A `<select>` dropdown transposes all 7 degrees together (global key root, semitone offset from C). A second `<select>` picks the oscillator waveform (sine/square/sawtooth/triangle), applied to every voice via `osc.type`.

Voices are tracked per-degree by absolute pitch (`degreeKey:semitone`) and reconciled on every change (chord press, joystick move, key change) so only notes that actually enter/leave the chord get started/stopped — shared tones sustain without re-triggering their envelope.

Full multi-touch: each finger tracked by touch identifier, can hold independent chords, drag between wedges without lifting. `:hover` CSS is scoped to `@media (hover: hover)` since touch leaves a wedge "stuck" in `:hover` on most mobile browsers after a drag — touch relies solely on the JS-driven `.active` class.

**Stick dot**: a small circle on each joystick that follows the actual pointer/touch position (via `getScreenCTM()`, clamped to the wedge radius), giving the flat SVG pad a continuous analog-stick feel on top of the discrete wedge zones. Degree joystick gets one dot per active touch identifier (real multi-touch); modifier joystick gets one persistent dot (single-owner by design). `pointer-events: none`, `opacity: 0.6` so it doesn't obscure the label underneath.

**Effects**: shared delay (DelayNode + feedback gain, 280ms/32%/22% send) and algorithmic reverb (ConvolverNode with a synthesized impulse response — no external audio file) are built lazily in `ensureContext()`, one bus each shared by every voice. Two independent toggle buttons (top-left) ramp each effect's send gain 0↔normal over 50ms; both can be on, either alone, or neither.

## PWA

`manifest.webmanifest` (standalone display, icons, theme color) + `sw.js` (stale-while-revalidate cache of the app shell) make the app installable and offline-capable, as an alternative/complement to the feature-detected Fullscreen button for chrome-free mobile launch. Icons live in `icons/` (`icon.svg` source + baked PNGs at 512/192/180 for manifest + `apple-touch-icon`).

**The service worker's `CACHE_NAME` is tied to the build-version tag** — bump both together on every deploy (see below), or returning visitors can get stuck on a stale cached copy until it happens to revalidate.

## Conventions established in this project

- Every UI change gets verified in a live browser (chrome-devtools MCP tools) before considering it done — screenshot + console check minimum, often synthetic event dispatch to verify audio/state logic (oscillator start/stop counting for voice-lifecycle bugs).
- **Build version tag** (bottom-left corner, `v1`, `v2`, ...) — increment by 1 on every deploy so version is visible on-device, and keep `sw.js`'s `CACHE_NAME` in sync with it.
- **Debug panel** (bottom-right "debug" toggle) — on-page diagnostic log, added because the user can't plug their phone in for remote debugging. Kept intentionally for now; logs fullscreen API feature-detection, service worker registration, and click/promise tracing.
- Commit messages are detailed (what + why + how verified); push to `master` immediately deploys.
- Standing authorization to push directly to `master` without asking each time (see git log / CLAUDE.md).
- Fullscreen button only shown if `document.fullscreenEnabled` + `requestFullscreen` actually exist (confirmed absent on the user's Chrome mobile — don't re-add unconditionally).

## Known open items / suggested next steps

- Regression harness: a hidden test mode running oscillator start/stop assertions (triad→7th = +1 voice/0 stops, etc.) to catch future voice-lifecycle regressions without manual instrumentation.
- Envelope is currently just `ATTACK=0.01, RELEASE=0.08` constants (AR, not full ADSR), linear ramps. Discussed but not built: full ADSR + curve shape + a small UI panel for it.
- `icons/icon.svg` circles sit close to the maskable safe-zone edge (~79% of the safe radius) — fine as "any" purpose icons, but don't add a "maskable" purpose entry without pulling them in first or Android's circular mask will clip the outer dots.
