# JoyChord — Web Synth

JoyChord is an installable PWA HiChord-inspired chord synthesizer. Web Audio API, no build step, no dependencies. App logic lives in one file (`index.html`, ~1265 lines — HTML/CSS/JS inline, no bundler, no `<script src>`); `manifest.webmanifest` + `sw.js` + `icons/` make it installable/offline-capable.

**Live:** https://millllllz.github.io/joy-chord/
**Repo:** https://github.com/millllllz/joy-chord (public, `master` branch, deploys via GitHub Pages on push)
**Current build:** v35 (bottom-left corner of the app; bump on every deploy, see Conventions)

## Orientation for a new agent

- There is no build step and no test runner. "Testing" means opening `index.html` (locally or via the live URL) in a browser and interacting with it — see Conventions below for the verification bar expected before calling a UI change done.
- The whole app is one file. Search `index.html` for the section you need rather than expecting a module boundary — CSS, SVG markup, and JS are all inline in `<style>`/`<body>`/`<script>` blocks in that one file.
- `master` is production and deploys on push (GitHub Pages). There is standing authorization to push directly to `master` without asking first — see Conventions.
- `todo.md` exists in the working directory but is gitignored — it's the user's personal scratch list, not project documentation. Open items from it are folded into "Known open items" below when they're still relevant; don't treat `todo.md` itself as authoritative if it and this README disagree.

## Naming

- **Degree joystick** — the left stick, 7 wedges, one per diatonic **chord degree** (I, ii, iii, IV, V, vi, vii°).
- **Modifier joystick** — the right stick, 8 wedges, changes the quality/extension of whichever degree is held.
- **Stick dot** — the small knob on each joystick that tracks the raw pointer/touch position continuously, layered on top of the discrete wedge zones.

Not "Nashville numbers" — that term belongs to a different, unrelated chart notation.

## Architecture

Two side-by-side SVG joysticks, controller-style:

- **Degree joystick** (left, 7 wedges): diatonic scale degrees I–vii° in the current key, each with its own natural triad quality (major/minor/diminished). Hover/touch/keyboard (`a s d f` odd, `w e r` even, or `1`-`7`) to play. Wedge/center labels are case-sensitive on purpose (I vs ii vs vii°) — this is the one place case carries meaning, so `.degree-label`/`.degree-center-label` never get `text-transform`.
- **Modifier joystick** (right, 8 wedges): HiChord-style chord modifications (maj/min toggle, dom7, 7th, add9, sus4, add6/sus2, darken, aug) applied relative to whichever degree's natural quality is held — not always a major base. Labels are uppercase (`.joy-label`/`.joy-center-label`, by explicit user preference — an intermediate case-sensitive version was tried and reverted). The 4 quality-dependent wedges (`MAJ/MIN`, `MAJ7/MIN7`, `6TH/SUS2`, `DIM/MIN`) are always split into two stacked `<tspan>` lines via `renderJoyLabel()` in `src/modifier-joystick.js`, since SVG `<text>` doesn't wrap and these are too wide for one line at wedge scale; once a chord resolves, the option that doesn't apply is dimmed (`.joy-label tspan.dimmed`, opacity 0.35) rather than removed, so the wedge always shows both options and doesn't jump between one-line and two-line layouts as chords change.
- **"left" (darken) direction**: deviates from the manual on purpose — major/minor both go to diminished, and diminished (vii°) steps to minor (the only way to reach a plain minor triad on that button, since nothing else produces one there).

A `<select>` dropdown transposes all 7 degrees together (global key root, semitone offset from C). A second `<select>` picks the oscillator waveform (sine/square/sawtooth/triangle), applied to every voice via `osc.type` — `setWaveType()` in `src/audio.js` also walks `audio.voices` so a change is audible on a chord that's already held, not just the next note. `audio.currentWaveType` is the single source of truth here; `src/settings.js` only wires the dropdown to it (it previously kept its own `settings.currentWaveType`, which nothing read — the dropdown silently did nothing).

**Layout**: `.joysticks` is a CSS grid in both orientations, and every control (`.fx-toggles`, both `<select>`s) is a real grid child of it. Portrait stacks the two joysticks in rows 1–2 with all three controls sharing row 3; landscape puts the joysticks in columns 1 and 3 with the controls stacked down column 2. Nothing is absolutely positioned over the grid — an earlier version floated `.fx-toggles` on top with `z-index: 1000` and it swallowed taps meant for the dropdowns in landscape.

Voices are tracked per-degree by absolute pitch (`degreeKey:semitone`) and reconciled on every change (chord press, joystick move, key change) so only notes that actually enter/leave the chord get started/stopped — shared tones sustain without re-triggering their envelope.

**One degree sounds at a time.** `pressDegree()` releases whatever was held before starting the new one, so no input can stack two chords — the degree stick takes a single owning touch (`degreeTouchId`) and ignores further fingers until it lifts, and on the keyboard a second degree key steals from the first rather than adding to it. Note this makes the *degree* monophonic, not the synth: a degree is still a full chord of simultaneous voices, and the modifier stick is independently held on top of it. Lifting an ignored second finger deliberately doesn't end the owning touch.

**Glide** (off by default; toggle + a 20-400ms time slider, default 120ms, in the "Glide" dialog): when on, `audio.reconcileVoices()` — the same function that already diffs an old chord's voice ids against a new chord's and leaves ids common to both untouched — pairs off the *leftover* ids (present in only one side) nearest-pitch-to-nearest-pitch and slides each pair with `glideVoice()` (same oscillator/gain node throughout, no retriggered attack, just `osc.frequency.linearRampToValueAtTime()`) instead of hard `stopVoice()`/`startVoice()`-ing them. Any surplus when the chord grows or shrinks (a triad gaining a 7th, say) still hard starts/stops since it has no pairing partner. `pressDegree()`'s monophonic steal now hands its outgoing voices to this same reconciliation instead of always releasing them outright, so a chord-to-chord change can glide too, not just a same-degree modifier change. This only reaches degree changes made via a *rolling* transition — a keyboard press while the previous key is still down, or a touch dragged straight from one wedge onto another (the `touchmove` handler presses the new wedge without releasing the old one first, so `pressDegree()`'s steal logic sees it still held) — a lift-then-press, or a mouse drag across the gap between wedges, is a genuine note-off with nothing to glide into, so it hard-stops as before.

The modifier joystick is likewise single-owner. Each still tracks its touch by identifier, and both can be held at once (one finger per stick), so dragging between wedges without lifting works on either. `:hover` CSS is scoped to `@media (hover: hover)` since touch leaves a wedge "stuck" in `:hover` on most mobile browsers after a drag — touch relies solely on the JS-driven `.active` class.

**Stick dot**: a small circle on each joystick that follows the actual pointer/touch position (via `getScreenCTM()`, clamped to the wedge radius), giving the flat SVG pad a continuous analog-stick feel on top of the discrete wedge zones. Both joysticks get exactly one dot, shared between mouse and touch, and it stays visible at all times — resting at dead centre when nothing is driving it, which reads as the stick's neutral position. (The degree stick briefly had a dot per touch identifier plus a separate mouse-only dot; on a touch device the mouse one never received a `mousemove`, so it sat parked at centre looking like a second stuck touch point.)

**Effects**: a shared lowpass filter (BiquadFilterNode, default 2.5kHz cutoff/Q 1), tremolo (sine LFO amplitude-modulating a gain stage, default 5Hz/50% depth, off by default since it's a much more overt effect than the others), delay (DelayNode + feedback gain, defaults 280ms/32%/22% send), and algorithmic reverb (ConvolverNode with a synthesized impulse response — no external audio file, defaults 2.2s decay/18% send) are built lazily in `init()` (`src/effects.js`), one node/bus each shared by every voice. The "Filter"/"Tremolo"/"Delay"/"Reverb" buttons (in the center control column, alongside the key and waveform dropdowns) each open a `<dialog>` with a checkbox and a range slider per parameter — filter gets cutoff/resonance, tremolo gets rate/depth, delay gets time/feedback/send, reverb gets decay/send. Every slider updates live on `input` except reverb decay, which only commits on `change` since it regenerates the impulse response buffer. The filter's cutoff slider maps its 0-1 travel to frequency exponentially (`sliderToCutoff()` in `src/index.js`), not linearly, since pitch is perceived logarithmically. All four effects can be on, off, or any combination, independent of each other and of their own parameter values.

**Signal flow**: each voice's gain connects only to the shared filter (`effects.filterNode`), not straight to `destination`. The filter feeds the tremolo gain stage (`effects.tremoloGain`), which fans out to `destination` plus a parallel tap into each effect send — so filter then tremolo both land before the delay/reverb taps, and the echoes/tail come out filtered and pulsing too. The delay's output additionally feeds the reverb send as well as `destination` — so the echoes are reverberated rather than dry. That last edge matters more than it looks: without it the repeats are completely dry, which passes unnoticed at short delay times (they land while the original note's reverb tail is still ringing) but makes the space audibly drop out at long ones, since by then the tail is ~27dB down. Nothing downstream of the reverb returns to the delay, so there's no runaway path. `src/test-setup.js`'s mock node records its `connect()` calls so routing like this is assertable — state-only tests can't see a misrouted graph.

**Filter/tremolo on/off is a ramp, not a bypass**: delay and reverb are parallel sends with an always-live dry path underneath, so "off" just ramps their send gain to 0. The filter and tremolo are inserts — every voice routes through both — so neither has a separate dry path to fall back to; instead "off" ramps their parameters to values that pass audio through effectively unaffected (filter: `frequency`/`Q` to 20kHz/Q≈0; tremolo: LFO depth to 0 while its gain stage's baseline ramps to 1) over the same 50ms `FX_RAMP` window used elsewhere, leaving both nodes in the graph. Re-enabling ramps back to the configured values, not a fresh default. Tremolo's LFO (`effects.tremoloLFO`, a continuously-running `OscillatorNode`) feeds a depth-scaling gain node into the tremolo gain stage's own `gain` AudioParam — the classic tremolo circuit: the LFO swings ±depth/2 around a baseline of `1 - depth/2`, so output amplitude swings between `1 - depth` and `1` rather than modulating around silence.

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

From the user's working todo list, still open as of this writing:

- **Compartmentalize code** — `index.html` is a single ~1265-line file with no internal module boundary; consider whether/how to split CSS/JS out without breaking the "no build step" constraint (e.g. separate `<script>`/`<style>` files loaded via plain tags, still no bundler).
- **Light mode** — currently one (dark) theme only; no light-mode styles exist yet.
- **Left-hand keyboard support** — current keyboard bindings (`a s d f` / `w e r` / `1`-`7`) are one-handed on the right/number row; a left-hand-friendly binding scheme hasn't been designed.
- **More effects** — filter, tremolo, delay, and reverb are now built (see Architecture); open-ended: chorus/flanger (modulated delay), distortion (WaveShaperNode), stereo panning (StereoPannerNode), and compression (DynamicsCompressorNode) are all native-node options that haven't been built. A bitcrusher would need an AudioWorkletNode instead — no stock node does sample-rate reduction.
- **Envelope editor** — see below, already tracked here before the todo list existed.
- Background/joystick-label polish items from the todo list ("fix background", "joy lables") were addressed this session (labels: uppercase + two-line split, see Architecture) — re-check `todo.md` directly if picking this up, since it's gitignored and may have moved on since this README was last updated.

Longer-standing items:

- Regression harness: a hidden test mode running oscillator start/stop assertions (triad→7th = +1 voice/0 stops, etc.) to catch future voice-lifecycle regressions without manual instrumentation.
- Envelope is currently just `ATTACK=0.01, RELEASE=0.08` constants (AR, not full ADSR), linear ramps. Discussed but not built: full ADSR + curve shape + a small UI panel for it.
- `icons/icon.svg` circles sit close to the maskable safe-zone edge (~79% of the safe radius) — fine as "any" purpose icons, but don't add a "maskable" purpose entry without pulling them in first or Android's circular mask will clip the outer dots.
