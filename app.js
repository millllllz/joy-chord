  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;

  // Shared delay send: every voice's gain feeds into this in parallel with
  // the dry destination connection, so one feedback delay line is reused
  // across all voices instead of building a delay chain per note. Each
  // effect is toggled independently by ramping its shared send gain
  // between 0 and its normal level, rather than connecting/disconnecting
  // every voice — one node change affects all current and future voices.
  let delaySend = null;
  let delayEnabled = true;
  const DELAY_TIME = 0.28;
  const DELAY_FEEDBACK = 0.32;
  const DELAY_SEND_LEVEL = 0.22;

  // Shared reverb send, same parallel-send pattern as the delay. The impulse
  // response is generated on the fly (decaying noise per channel) rather
  // than loaded from an audio file, matching the no-external-assets,
  // no-build-step nature of this project.
  let reverbSend = null;
  let reverbEnabled = true;
  const REVERB_DECAY = 2.2; // seconds
  const REVERB_SEND_LEVEL = 0.18;

  const FX_RAMP = 0.05; // seconds — short enough to feel instant, long enough to avoid a click

  function createReverbImpulse(ctx) {
    const length = Math.floor(ctx.sampleRate * REVERB_DECAY);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    // Multiplicative decay (one multiply/sample) instead of Math.pow per
    // sample — this runs synchronously on first touch, so it needs to stay
    // cheap enough not to add input latency on the very first note.
    const decayPerSample = Math.pow(0.001, 1 / length); // -60dB by the end
    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
      const data = impulse.getChannelData(channel);
      let envelope = 1;
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * envelope;
        envelope *= decayPerSample;
      }
    }
    return impulse;
  }

  function ensureContext() {
    if (!audioCtx) {
      audioCtx = new AudioCtx();

      delaySend = audioCtx.createGain();
      delaySend.gain.value = delayEnabled ? DELAY_SEND_LEVEL : 0;

      const delayNode = audioCtx.createDelay(1.0);
      delayNode.delayTime.value = DELAY_TIME;

      const feedbackGain = audioCtx.createGain();
      feedbackGain.gain.value = DELAY_FEEDBACK;

      delaySend.connect(delayNode);
      delayNode.connect(feedbackGain);
      feedbackGain.connect(delayNode);
      delayNode.connect(audioCtx.destination);

      reverbSend = audioCtx.createGain();
      reverbSend.gain.value = reverbEnabled ? REVERB_SEND_LEVEL : 0;

      const convolver = audioCtx.createConvolver();
      convolver.buffer = createReverbImpulse(audioCtx);

      reverbSend.connect(convolver);
      convolver.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  // --- effect toggles: delay and reverb are independent, each just ramps
  // its shared send gain between 0 and its normal level, so they can be on
  // together, either alone, or both off ---
  const delayToggleBtn = document.getElementById('delay-toggle');
  const reverbToggleBtn = document.getElementById('reverb-toggle');

  function setDelayEnabled(enabled) {
    delayEnabled = enabled;
    if (audioCtx) {
      const now = audioCtx.currentTime;
      delaySend.gain.cancelScheduledValues(now);
      delaySend.gain.setValueAtTime(delaySend.gain.value, now);
      delaySend.gain.linearRampToValueAtTime(enabled ? DELAY_SEND_LEVEL : 0, now + FX_RAMP);
    }
    delayToggleBtn.classList.toggle('active', enabled);
    delayToggleBtn.setAttribute('aria-pressed', String(enabled));
  }

  function setReverbEnabled(enabled) {
    reverbEnabled = enabled;
    if (audioCtx) {
      const now = audioCtx.currentTime;
      reverbSend.gain.cancelScheduledValues(now);
      reverbSend.gain.setValueAtTime(reverbSend.gain.value, now);
      reverbSend.gain.linearRampToValueAtTime(enabled ? REVERB_SEND_LEVEL : 0, now + FX_RAMP);
    }
    reverbToggleBtn.classList.toggle('active', enabled);
    reverbToggleBtn.setAttribute('aria-pressed', String(enabled));
  }

  delayToggleBtn.addEventListener('click', () => setDelayEnabled(!delayEnabled));
  reverbToggleBtn.addEventListener('click', () => setReverbEnabled(!reverbEnabled));

  setDelayEnabled(delayEnabled);
  setReverbEnabled(reverbEnabled);

  const ATTACK = 0.01;
  const RELEASE = 0.08;
  const GAIN = 0.15;

  // active voices, keyed by an arbitrary id (note name or 'btn')
  const voices = new Map();

  function startVoice(id, freq) {
    ensureContext();
    if (voices.has(id)) return;

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = currentWaveType;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(GAIN, audioCtx.currentTime + ATTACK);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    gainNode.connect(delaySend);
    gainNode.connect(reverbSend);
    osc.start();

    voices.set(id, { osc, gainNode });
  }

  function stopVoice(id) {
    const voice = voices.get(id);
    if (!voice) return;
    const { osc, gainNode } = voice;
    const now = audioCtx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(0, now + RELEASE);
    osc.stop(now + RELEASE + 0.02);

    voices.delete(id);
  }

  const FREQ_C4 = 261.63;

  function noteFreq(semitonesFromC4) {
    return FREQ_C4 * Math.pow(2, semitonesFromC4 / 12);
  }

  // --- 7 diatonic chord buttons (key of C major) ---
  // Each button is a scale degree with its own natural triad quality, per
  // the HiChord manual's chord system: I ii iii IV V vi vii°.
  // 'key' is a stable identifier for each degree; 'bindKey' is the physical
  // computer-keyboard key that plays it. Odd degrees map to a-s-d-f, even to w-e-r.
  // 'wedge'/'labelPos' are precomputed SVG geometry for the degree joystick:
  // 7 equal 51.43deg pie slices (donut, inner r=40 outer r=100, center 110,110),
  // starting at 12 o'clock and going clockwise, matching this array's order.
  const DEGREES = [
    { degree: 'I',    key: '1', bindKey: 'a', semitone: 0,  quality: 'major',
      wedge: 'M 92.64 73.96 L 66.61 19.90 A 100 100 0 0 1 153.39 19.90 L 127.36 73.96 A 40 40 0 0 0 92.64 73.96 Z',
      labelPos: [110.0, 28.0], qualityPos: [110.0, 40.0] },
    { degree: 'ii',   key: '2', bindKey: 'w', semitone: 2,  quality: 'minor',
      wedge: 'M 127.36 73.96 L 153.39 19.90 A 100 100 0 0 1 207.49 87.75 L 149.00 101.10 A 40 40 0 0 0 127.36 73.96 Z',
      labelPos: [171.0, 57.4], qualityPos: [171.0, 69.4] },
    { degree: 'iii',  key: '3', bindKey: 's', semitone: 4,  quality: 'minor',
      wedge: 'M 149.00 101.10 L 207.49 87.75 A 100 100 0 0 1 188.18 172.35 L 141.27 134.94 A 40 40 0 0 0 149.00 101.10 Z',
      labelPos: [186.0, 123.4], qualityPos: [186.0, 135.4] },
    { degree: 'IV',   key: '4', bindKey: 'e', semitone: 5,  quality: 'major',
      wedge: 'M 141.27 134.94 L 188.18 172.35 A 100 100 0 0 1 110.00 210.00 L 110.00 150.00 A 40 40 0 0 0 141.27 134.94 Z',
      labelPos: [143.8, 176.3], qualityPos: [143.8, 188.3] },
    { degree: 'V',    key: '5', bindKey: 'd', semitone: 7,  quality: 'major',
      wedge: 'M 110.00 150.00 L 110.00 210.00 A 100 100 0 0 1 31.82 172.35 L 78.73 134.94 A 40 40 0 0 0 110.00 150.00 Z',
      labelPos: [76.2, 176.3], qualityPos: [76.2, 188.3] },
    { degree: 'vi',   key: '6', bindKey: 'r', semitone: 9,  quality: 'minor',
      wedge: 'M 78.73 134.94 L 31.82 172.35 A 100 100 0 0 1 12.51 87.75 L 71.00 101.10 A 40 40 0 0 0 78.73 134.94 Z',
      labelPos: [34.0, 123.4], qualityPos: [34.0, 135.4] },
    { degree: 'vii°', key: '7', bindKey: 'f', semitone: 11, quality: 'diminished',
      wedge: 'M 71.00 101.10 L 12.51 87.75 A 100 100 0 0 1 66.61 19.90 L 92.64 73.96 A 40 40 0 0 0 71.00 101.10 Z',
      labelPos: [49.0, 57.4], qualityPos: [49.0, 69.4] },
  ];

  // Natural triad intervals for each base quality.
  const BASE_TRIAD = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    diminished: [0, 3, 6],
  };

  // Joystick modification, applied relative to a button's own natural triad
  // quality (not always a major base). 'third'/'fifth' are computed from the
  // held button's BASE_TRIAD so e.g. holding a minor button and pushing
  // 'right' (7th) yields a minor 7th, not a major 7th.
  function getChordIntervals(quality, direction) {
    const [root, third, fifth] = BASE_TRIAD[quality];
    switch (direction) {
      case 'center':       return [root, third, fifth];
      case 'up':            // maj/min toggle
        return quality === 'major' ? BASE_TRIAD.minor : BASE_TRIAD.major;
      case 'up-right':      // dominant 7th (flattened 7th)
        return [root, third, fifth, 10];
      case 'right':         // natural 7th (major or minor, matching quality)
        return [root, third, fifth, quality === 'major' ? 11 : 10];
      case 'down-right':    // add9
        return [root, third, fifth, 14];
      case 'down':          // sus4
        return [root, 5, fifth];
      case 'down-left':     // add6, or sus2 if the triad has no major 3rd
        return quality === 'major' ? [root, third, fifth, 9] : [root, 2, fifth];
      case 'left':          // darken: major/minor -> diminished; diminished -> minor
        // (the only way to reach a plain minor triad on a naturally-diminished
        // root like vii°, since nothing else produces it)
        return quality === 'diminished' ? BASE_TRIAD.minor : BASE_TRIAD.diminished;
      case 'up-left':       // augmented: raise the 5th
        return [root, third, fifth + 1];
      default:
        return [root, third, fifth];
    }
  }

  // Fixed labels for directions whose effect doesn't depend on the held
  // chord's quality. Directions that DO depend on quality (up, right,
  // down-left, left) are handled dynamically by QUALITY_LABELS/leftLabel below.
  const CHORD_LABELS = {
    center: null, 'up-right': 'Dom7', 'down-right': '9th', down: 'Sus4', 'up-left': 'Aug',
  };

  // Per the HiChord manual's default joystick mode, these directions change
  // what they do depending on the held chord's quality, so their displayed
  // label must track that too instead of showing a static word:
  //   up:         major -> minor / minor,diminished -> major
  //   right:      major -> Maj7  / minor -> min7
  //   down-left:  major -> 6th   / minor -> Sus2
  // 'left' is also quality-dependent but doesn't fit the major/other 2-way
  // shape above (it's a 3-way split: major/minor -> Dim, diminished -> Min —
  // the only way to reach a plain minor triad on a naturally-diminished root
  // like vii°), so it's listed here as a member but handled specially below.
  const QUALITY_LABELS = {
    up:         { major: 'min', other: 'maj' },
    right:      { major: 'Maj7', other: 'min7' },
    'down-left': { major: '6th', other: 'Sus2' },
    left:       true,
  };
  function qualityLabel(direction, quality) {
    if (direction === 'left') {
      return quality === 'diminished' ? 'Min' : 'Dim';
    }
    const labels = QUALITY_LABELS[direction];
    return quality === 'major' ? labels.major : labels.other;
  }

  let currentDirection = 'center';

  // Global key: semitone offset from C. All 7 buttons transpose together,
  // per the manual: "the relationships between buttons stay the same —
  // only the pitch changes."
  const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  let currentKeyRoot = 0;

  const WAVE_TYPES = ['sine', 'square', 'sawtooth', 'triangle'];
  let currentWaveType = 'sine';

  const degreeByKey = new Map(DEGREES.map(d => [d.key, d]));
  const degreeByBindKey = new Map(DEGREES.map(d => [d.bindKey, d]));
  const heldDegrees = new Map(); // degree key -> direction it's currently sounding under
  const heldVoices = new Map();  // degree key -> Set of voice ids currently playing for it

  // --- render the 7-wedge degree joystick ---
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  // Sets a wedge <text>'s content, splitting on "/" into two stacked lines
  // (e.g. "Maj/Min" -> "Maj" over "Min") since SVG text doesn't wrap on its
  // own and these compound labels are too wide for one line at wedge scale.
  // Single-word labels (no "/") are set as plain text, unchanged.
  function setWedgeLabel(el, text) {
    const parts = text.split('/');
    if (parts.length === 1) {
      el.textContent = text;
      return;
    }
    el.textContent = '';
    const x = el.getAttribute('x');
    parts.forEach((part, i) => {
      const tspan = svgEl('tspan', { x, dy: i === 0 ? '-0.35em' : '1em' });
      tspan.textContent = part;
      el.appendChild(tspan);
    });
  }

  // Both joysticks share the same 220x220 viewBox and center point, so the
  // stick-dot math below is hardcoded to it rather than parametrized.
  const STICK_CENTER = 110;
  const STICK_MAX_RADIUS = 88; // just inside the wedges' outer radius (100)

  // Converts a pointer/touch's page coordinates into the SVG's own user
  // space (via the screen CTM, so it's correct regardless of how the
  // joystick is currently scaled/laid out), then clamps the result to
  // STICK_MAX_RADIUS from center — a real stick can't travel past its
  // housing either.
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

  const degreeJoystickEl = document.getElementById('degree-joystick');

  DEGREES.forEach(d => {
    const wedgeEl = svgEl('path', { class: 'degree-wedge', 'data-key': d.key, d: d.wedge });
    degreeJoystickEl.appendChild(wedgeEl);
    d.wedgeEl = wedgeEl;
  });
  DEGREES.forEach(d => {
    const [lx, ly] = d.labelPos;
    const labelEl = svgEl('text', { class: 'degree-label', 'data-key': d.key, x: lx, y: ly });
    labelEl.textContent = d.degree;
    degreeJoystickEl.appendChild(labelEl);
    d.labelEl = labelEl;

    const [qx, qy] = d.qualityPos;
    const qualityEl = svgEl('text', { class: 'degree-quality', 'data-key': d.key, x: qx, y: qy });
    qualityEl.textContent = d.quality === 'diminished' ? 'dim' : d.quality;
    degreeJoystickEl.appendChild(qualityEl);
    d.qualityEl = qualityEl;
  });

  const degreeCenterCircle = svgEl('circle', { class: 'joy-center', cx: 110, cy: 110, r: 40, fill: 'url(#degreeCenterGradient)' });
  degreeJoystickEl.appendChild(degreeCenterCircle);
  const degreeCenterLabel = svgEl('text', { class: 'degree-center-label', x: 110, y: 110 });
  degreeJoystickEl.appendChild(degreeCenterLabel);

  // Stick dot for mouse (a single persistent element, since a mouse is one
  // pointer) plus a per-touch-identifier map, since this joystick supports
  // real multi-touch — each finger gets its own dot.
  const degreeMouseDot = svgEl('circle', { class: 'stick-dot', cx: 110, cy: 110, r: 14 });
  degreeJoystickEl.appendChild(degreeMouseDot);
  const degreeTouchDots = new Map(); // touch identifier -> dot element

  // --- render the key selector as a dropdown ---
  const keySelectEl = document.getElementById('key-select');
  KEY_NAMES.forEach((name, root) => {
    const option = document.createElement('option');
    option.value = root;
    option.textContent = name;
    keySelectEl.appendChild(option);
  });
  keySelectEl.value = currentKeyRoot;
  keySelectEl.addEventListener('change', () => {
    setKeyRoot(Number(keySelectEl.value));
  });

  // --- render the oscillator waveform selector as a dropdown ---
  const waveSelectEl = document.getElementById('wave-select');
  WAVE_TYPES.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type[0].toUpperCase() + type.slice(1);
    waveSelectEl.appendChild(option);
  });
  waveSelectEl.value = currentWaveType;
  waveSelectEl.addEventListener('change', () => {
    currentWaveType = waveSelectEl.value;
  });

  // The set of voices a held degree should currently be sounding, as a
  // Map of voiceId -> frequency, given a joystick direction. Voice ids are
  // keyed by note name (pitch class + octave) rather than raw interval, so a
  // note keeps a stable id across direction/key changes and duplicate pitches
  // across degrees don't collide.
  function voicesForDegree(d, direction) {
    const target = new Map();
    getChordIntervals(d.quality, direction).forEach(interval => {
      const semitone = currentKeyRoot + d.semitone + interval;
      target.set(`${d.key}:${semitone}`, noteFreq(semitone));
    });
    return target;
  }

  // Reconcile the voices currently playing for a held degree against the
  // target set: stop only departing notes, start only new ones, and leave
  // shared notes ringing untouched. This avoids re-attacking sustained notes
  // when the chord only gains/loses a tone (e.g. nudging the joystick from a
  // triad to a 7th), which otherwise produces an audible click/re-swell.
  function updateDegreeVoicing(d, direction) {
    const target = voicesForDegree(d, direction);
    // stop voices no longer wanted
    (heldVoices.get(d.key) || new Set()).forEach(id => {
      if (!target.has(id)) stopVoice(id);
    });
    // start voices newly wanted (startVoice is a no-op if already sounding)
    target.forEach((freq, id) => startVoice(id, freq));
    heldVoices.set(d.key, new Set(target.keys()));
  }

  function pressDegree(d) {
    if (heldDegrees.has(d.key)) return;
    heldDegrees.set(d.key, currentDirection);
    updateDegreeVoicing(d, currentDirection);
    d.wedgeEl.classList.add('active');
    d.labelEl.classList.add('active');
    d.qualityEl.classList.add('active');
    refreshLabels();
  }

  function releaseDegree(d) {
    if (!heldDegrees.has(d.key)) return;
    heldDegrees.delete(d.key);
    (heldVoices.get(d.key) || new Set()).forEach(id => stopVoice(id));
    heldVoices.delete(d.key);
    d.wedgeEl.classList.remove('active');
    d.labelEl.classList.remove('active');
    d.qualityEl.classList.remove('active');
    refreshLabels();
  }

  // Re-voice every held degree for the current direction/key. Used when the
  // joystick direction changes (only chords held under the OLD direction
  // follow the stick) or the key changes (all held chords transpose).
  function revoiceHeld() {
    heldDegrees.forEach((_, key) => {
      updateDegreeVoicing(degreeByKey.get(key), currentDirection);
      heldDegrees.set(key, currentDirection);
    });
  }

  function setDirection(direction) {
    if (direction === currentDirection) return;
    currentDirection = direction;
    revoiceHeld();
  }

  // Changing key while chords are held retunes them live, so switching key
  // mid-chord doesn't cut the sound.
  function setKeyRoot(root) {
    if (root === currentKeyRoot) return;
    currentKeyRoot = root;
    revoiceHeld();
  }

  // mouse interaction on the degree joystick wedges: hovering a wedge plays
  // that chord, moving off stops it
  DEGREES.forEach(d => {
    d.wedgeEl.addEventListener('mouseenter', () => pressDegree(d));
    d.wedgeEl.addEventListener('mouseleave', () => releaseDegree(d));
  });

  degreeJoystickEl.addEventListener('mousemove', (e) => {
    moveStickDot(degreeMouseDot, degreeJoystickEl, e.clientX, e.clientY);
  });
  degreeJoystickEl.addEventListener('mouseleave', () => resetStickDot(degreeMouseDot));

  // Touch interaction, supporting multiple simultaneous fingers: each active
  // touch is tracked by its identifier -> currently-held degree, so two (or
  // more) fingers can each hold a different chord at once, and a finger can
  // slide between wedges (still touching down) to switch chords without
  // lifting, matching how a real analog-stick pad would behave.
  const touchedDegrees = new Map(); // touch identifier -> degree key

  function degreeAtPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const key = el.dataset && el.dataset.key;
    return key ? degreeByKey.get(key) : null;
  }

  degreeJoystickEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    Array.from(e.changedTouches).forEach(touch => {
      const dot = svgEl('circle', { class: 'stick-dot', cx: 110, cy: 110, r: 14 });
      degreeJoystickEl.appendChild(dot);
      degreeTouchDots.set(touch.identifier, dot);
      moveStickDot(dot, degreeJoystickEl, touch.clientX, touch.clientY);

      const d = degreeAtPoint(touch.clientX, touch.clientY);
      if (!d) return;
      touchedDegrees.set(touch.identifier, d.key);
      pressDegree(d);
    });
  }, { passive: false });

  degreeJoystickEl.addEventListener('touchmove', (e) => {
    e.preventDefault();
    Array.from(e.changedTouches).forEach(touch => {
      const dot = degreeTouchDots.get(touch.identifier);
      if (dot) moveStickDot(dot, degreeJoystickEl, touch.clientX, touch.clientY);

      const currentKey = touchedDegrees.get(touch.identifier);
      const d = degreeAtPoint(touch.clientX, touch.clientY);
      const newKey = d ? d.key : null;
      if (newKey === currentKey) return;
      if (currentKey) releaseDegree(degreeByKey.get(currentKey));
      if (d) {
        pressDegree(d);
        touchedDegrees.set(touch.identifier, d.key);
      } else {
        touchedDegrees.delete(touch.identifier);
      }
    });
  }, { passive: false });

  function endDegreeTouch(e) {
    e.preventDefault();
    Array.from(e.changedTouches).forEach(touch => {
      const dot = degreeTouchDots.get(touch.identifier);
      if (dot) {
        degreeTouchDots.delete(touch.identifier);
        resetStickDot(dot);
        dot.classList.add('released');
        setTimeout(() => dot.remove(), 150);
      }

      const key = touchedDegrees.get(touch.identifier);
      if (!key) return;
      releaseDegree(degreeByKey.get(key));
      touchedDegrees.delete(touch.identifier);
    });
  }
  degreeJoystickEl.addEventListener('touchend', endDegreeTouch, { passive: false });
  degreeJoystickEl.addEventListener('touchcancel', endDegreeTouch, { passive: false });

  function updateDegreeCenterLabel() {
    const heldKeys = Array.from(heldDegrees.keys());
    if (heldKeys.length === 1) {
      degreeCenterLabel.textContent = degreeByKey.get(heldKeys[0]).degree;
    } else {
      degreeCenterLabel.textContent = '';
    }
  }

  // physical computer-keyboard interaction: odd degrees on a-s-d-f, even on
  // w-e-r, plus the number row 1-7 as an alternate binding for the same degrees
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const d = degreeByBindKey.get(e.key.toLowerCase()) || degreeByKey.get(e.key);
    if (!d) return;
    pressDegree(d);
  });

  window.addEventListener('keyup', (e) => {
    const d = degreeByBindKey.get(e.key.toLowerCase()) || degreeByKey.get(e.key);
    if (!d) return;
    releaseDegree(d);
  });

  // --- joystick: hover a wedge to modify the held chord; leaving the pad snaps back to the natural triad ---
  const joystickEl = document.getElementById('joystick');
  const joyCenterEl = document.getElementById('joy-center');
  const joyWedges = document.querySelectorAll('.joy-wedge');
  const joyLabels = document.querySelectorAll('.joy-label');

  function setJoyDirection(dir) {
    setDirection(dir);
    joyWedges.forEach(w => w.classList.toggle('active', w.dataset.dir === dir));
    joyLabels.forEach(l => l.classList.toggle('active', l.dataset.dir === dir));
    refreshLabels();
  }

  // Refresh every held-state-dependent text label at once. Called from any
  // action that changes what's held or the joystick direction.
  function refreshLabels() {
    updateJoyCenterLabel();
    updateQualityWedgeLabels();
    updateDegreeCenterLabel();
  }

  function soleHeldQuality() {
    const heldQualities = new Set(
      Array.from(heldDegrees.keys()).map(key => degreeByKey.get(key).quality)
    );
    return heldQualities.size === 1 ? [...heldQualities][0] : null;
  }

  // At center, show the natural quality of whatever's currently held (so it's
  // clear the chord "snapped back" rather than looking blank/stuck). Directions
  // in QUALITY_LABELS show their held-quality-dependent outcome instead of a
  // fixed word; every other direction shows its fixed modification name.
  function updateJoyCenterLabel() {
    if (QUALITY_LABELS[currentDirection]) {
      const quality = soleHeldQuality();
      joyCenterEl.textContent = quality ? qualityLabel(currentDirection, quality) : QUALITY_WEDGE_DEFAULTS[currentDirection];
      return;
    }
    if (currentDirection !== 'center') {
      joyCenterEl.textContent = CHORD_LABELS[currentDirection] || '';
      return;
    }
    const quality = soleHeldQuality();
    joyCenterEl.textContent = quality ? (quality === 'diminished' ? 'dim' : quality) : '';
  }

  // The up/right/down-left/left wedges each do something different depending
  // on the held chord's quality (see QUALITY_LABELS), so their displayed
  // label tracks that outcome instead of showing a static generic word —
  // makes it clear what pushing that direction will actually do right now.
  const qualityWedgeLabels = {
    up: document.getElementById('joy-label-up'),
    right: document.getElementById('joy-label-right'),
    'down-left': document.getElementById('joy-label-down-left'),
    left: document.getElementById('joy-label-left'),
  };
  const QUALITY_WEDGE_DEFAULTS = {
    up: 'Maj/Min', right: 'Maj7/min7', 'down-left': '6th/Sus2', left: 'Dim/Min',
  };
  function updateQualityWedgeLabels() {
    const quality = soleHeldQuality();
    Object.entries(qualityWedgeLabels).forEach(([direction, el]) => {
      setWedgeLabel(el, quality ? qualityLabel(direction, quality) : QUALITY_WEDGE_DEFAULTS[direction]);
    });
  }

  const joyCenterCircle = document.querySelector('.joy-center');
  const joyStickDot = document.getElementById('joy-stick-dot');

  joyWedges.forEach(wedge => {
    wedge.addEventListener('mouseenter', () => setJoyDirection(wedge.dataset.dir));
  });

  // The center circle sits flush against the inner edge of all 8 wedges, so
  // moving the pointer from a wedge straight into the circle never crosses
  // the SVG's own boundary (no 'mouseleave' on the whole joystick fires).
  // It needs its own explicit hover handler to reset to center.
  joyCenterCircle.addEventListener('mouseenter', () => setJoyDirection('center'));

  joystickEl.addEventListener('mouseleave', () => setJoyDirection('center'));

  joystickEl.addEventListener('mousemove', (e) => {
    moveStickDot(joyStickDot, joystickEl, e.clientX, e.clientY);
  });
  joystickEl.addEventListener('mouseleave', () => resetStickDot(joyStickDot));

  // Touch support for the modifier joystick: since there's only one global
  // currentDirection (this stick isn't per-finger like the degree stick),
  // the first touch to land on it "owns" the drag until it lifts, so it
  // behaves like a real analog stick under one thumb while the other thumb
  // independently holds a degree wedge on the other joystick.
  let modifierTouchId = null;

  function directionAtPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    if (el.classList.contains('joy-wedge')) return el.dataset.dir;
    if (el.classList.contains('joy-center') && el === joyCenterCircle) return 'center';
    return null;
  }

  joystickEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (modifierTouchId !== null) return;
    const touch = e.changedTouches[0];
    modifierTouchId = touch.identifier;
    moveStickDot(joyStickDot, joystickEl, touch.clientX, touch.clientY);
    const dir = directionAtPoint(touch.clientX, touch.clientY);
    if (dir) setJoyDirection(dir);
  }, { passive: false });

  joystickEl.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = Array.from(e.changedTouches).find(t => t.identifier === modifierTouchId);
    if (!touch) return;
    moveStickDot(joyStickDot, joystickEl, touch.clientX, touch.clientY);
    const dir = directionAtPoint(touch.clientX, touch.clientY);
    setJoyDirection(dir || 'center');
  }, { passive: false });

  function endModifierTouch(e) {
    const touch = Array.from(e.changedTouches).find(t => t.identifier === modifierTouchId);
    if (!touch) return;
    e.preventDefault();
    modifierTouchId = null;
    resetStickDot(joyStickDot);
    setJoyDirection('center');
  }
  joystickEl.addEventListener('touchend', endModifierTouch, { passive: false });
  joystickEl.addEventListener('touchcancel', endModifierTouch, { passive: false });

  // --- on-page debug panel: shows what actually happens on tap, readable
  // directly on a phone screen with no cable/remote-debugging needed ---
  const debugPanel = document.getElementById('debug-panel');
  const debugToggle = document.getElementById('debug-toggle');
  function debugLog(msg) {
    const line = document.createElement('div');
    const time = new Date().toISOString().split('T')[1].replace('Z', '');
    line.textContent = `[${time}] ${msg}`;
    debugPanel.appendChild(line);
    debugPanel.scrollTop = debugPanel.scrollHeight;
  }
  debugToggle.addEventListener('click', () => {
    debugPanel.classList.toggle('visible');
  });
  window.addEventListener('error', (e) => {
    debugLog(`window error: ${e.message} (${e.filename}:${e.lineno})`);
  });

  // --- fullscreen toggle: hides browser chrome via the Fullscreen API (only
  // works from a user gesture; can't be triggered automatically on load, and
  // doesn't hide OS-level UI like iOS's home-indicator swipe area) ---
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const expandIcon = document.getElementById('fullscreen-icon-expand');
  const collapseIcon = document.getElementById('fullscreen-icon-collapse');

  debugLog(`ua: ${navigator.userAgent}`);
  debugLog(`fullscreenEnabled: ${document.fullscreenEnabled}`);
  debugLog(`document.documentElement.requestFullscreen: ${typeof document.documentElement.requestFullscreen}`);
  debugLog(`document.documentElement.webkitRequestFullscreen: ${typeof document.documentElement.webkitRequestFullscreen}`);
  debugLog(`isSecureContext: ${window.isSecureContext}`);
  debugLog(`in iframe: ${window.self !== window.top}`);

  // Only show the button when the Fullscreen API is genuinely usable —
  // some mobile browsers (confirmed: at least one Chrome mobile build)
  // expose no requestFullscreen at all, where the button would be a dead
  // no-op forever. document.fullscreenEnabled covers permission-policy
  // blocks too (e.g. disallowed in an iframe), not just feature presence.
  const fullscreenSupported = !!(
    document.fullscreenEnabled &&
    (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)
  );
  debugLog(`fullscreen button shown: ${fullscreenSupported}`);
  if (fullscreenSupported) {
    document.getElementById('fullscreen-btn').classList.add('supported');
  }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function updateFullscreenIcon() {
    const active = isFullscreen();
    expandIcon.style.display = active ? 'none' : '';
    collapseIcon.style.display = active ? '' : 'none';
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
    updateFullscreenIcon();
  });
  document.addEventListener('webkitfullscreenchange', () => {
    debugLog(`webkitfullscreenchange event fired, isFullscreen=${isFullscreen()}`);
    updateFullscreenIcon();
  });

  // --- PWA: register the service worker for offline/installable support ---
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(reg => debugLog(`service worker registered, scope: ${reg.scope}`))
        .catch(err => debugLog(`service worker registration failed: ${err.name}: ${err.message}`));
    });
  } else {
    debugLog('serviceWorker not supported');
  }

  // Convert the quality-dependent wedges' static markup text into the same
  // two-line "/" split the dynamic updates use, so it's consistent from
  // first paint instead of only after the first press.
  updateQualityWedgeLabels();
