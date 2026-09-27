import { wedgePath } from './wedge-geometry.js';

// 7 equal 51.43deg pie slices (donut, inner r=40 outer r=100, center 110,110),
// starting at 12 o'clock and going clockwise. The degree label sits at a fixed
// radius along each wedge's center angle; the quality label is stacked
// directly beneath it (flat +12 in y, not radial) and the bind-key label
// beneath that (flat +26 in y, not radial) so "I" / "MAJOR" / "a" always
// read as a vertical stack regardless of the wedge's angle.
const DEGREE_ANGLE_STEP = 360 / 7;
const CENTER = 110;
const LABEL_RADIUS = 70;
const QUALITY_Y_OFFSET = 12;
const BINDKEY_Y_OFFSET = 26;

function polar(radius, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return [
    Number((CENTER + radius * Math.sin(a)).toFixed(1)),
    Number((CENTER - radius * Math.cos(a)).toFixed(1)),
  ];
}

function degreeWedge(index) {
  const start = -DEGREE_ANGLE_STEP / 2 + index * DEGREE_ANGLE_STEP;
  const end = start + DEGREE_ANGLE_STEP;
  const center = (start + end) / 2;
  const labelPos = polar(LABEL_RADIUS, center);
  return {
    wedge: wedgePath(start, end),
    labelPos,
    qualityPos: [labelPos[0], Number((labelPos[1] + QUALITY_Y_OFFSET).toFixed(1))],
    bindKeyPos: [labelPos[0], Number((labelPos[1] + BINDKEY_Y_OFFSET).toFixed(1))],
  };
}

export const chords = {
  DEGREES: [
    { degree: 'I',    key: '1', bindKey: 'a', semitone: 0,  quality: 'major',    ...degreeWedge(0) },
    { degree: 'ii',   key: '2', bindKey: 'w', semitone: 2,  quality: 'minor',    ...degreeWedge(1) },
    { degree: 'iii',  key: '3', bindKey: 's', semitone: 4,  quality: 'minor',    ...degreeWedge(2) },
    { degree: 'IV',   key: '4', bindKey: 'e', semitone: 5,  quality: 'major',    ...degreeWedge(3) },
    { degree: 'V',    key: '5', bindKey: 'd', semitone: 7,  quality: 'major',    ...degreeWedge(4) },
    { degree: 'vi',   key: '6', bindKey: 'r', semitone: 9,  quality: 'minor',    ...degreeWedge(5) },
    { degree: 'vii°', key: '7', bindKey: 'f', semitone: 11, quality: 'diminished', ...degreeWedge(6) },
  ],

  BASE_TRIAD: {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    diminished: [0, 3, 6],
  },

  CHORD_LABELS: {
    center: null, 'up-right': 'Dom7', 'down-right': '9th', down: 'Sus4', 'up-left': 'Aug',
  },

  QUALITY_LABELS: {
    up:         { major: 'min', other: 'maj' },
    right:      { major: 'Maj7', other: 'min7' },
    'down-left': { major: '6th', other: 'Sus2' },
    left:       true,
  },

  KEY_NAMES: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],

  WAVE_TYPES: ['sine', 'square', 'sawtooth', 'triangle'],
};

export function getChordIntervals(quality, direction) {
  const [root, third, fifth] = chords.BASE_TRIAD[quality];
  switch (direction) {
    case 'center':       return [root, third, fifth];
    case 'up':            // maj/min toggle
      return quality === 'major' ? chords.BASE_TRIAD.minor : chords.BASE_TRIAD.major;
    case 'up-right':      // dominant 7th: major 3rd + perfect 5th + flat 7,
                           // always — that's literally what "dominant"
                           // means, independent of the held triad's own
                           // quality (a minor or diminished degree's third
                           // and fifth get overridden, not layered on)
      return [root, 4, 7, 10];
    case 'right':         // natural 7th (major or minor, matching quality)
      return [root, third, fifth, quality === 'major' ? 11 : 10];
    case 'down-right':    // add9
      return [root, third, fifth, 14];
    case 'down':          // sus4
      return [root, 5, fifth];
    case 'down-left':     // add6, or sus2 if the triad has no major 3rd
      return quality === 'major' ? [root, third, fifth, 9] : [root, 2, fifth];
    case 'left':          // darken: major/minor -> diminished; diminished -> minor
      return quality === 'diminished' ? chords.BASE_TRIAD.minor : chords.BASE_TRIAD.diminished;
    case 'up-left':       // augmented: major 3rd + raised 5th, always — same
                           // reasoning as dominant 7th above, an augmented
                           // triad is a fixed shape, not the held triad's
                           // own 3rd with its 5th nudged up
      return [root, 4, 8];
    default:
      return [root, third, fifth];
  }
}

export function qualityLabel(direction, quality) {
  if (direction === 'left') {
    return quality === 'diminished' ? 'Min' : 'Dim';
  }
  const labels = chords.QUALITY_LABELS[direction];
  return quality === 'major' ? labels.major : labels.other;
}

// Chord-symbol suffix for every (quality, direction) pair getChordIntervals
// can produce. Kept as an explicit table rather than derived from the
// interval numbers themselves, since a few combinations (minor + add9,
// diminished + add9, ...) land on non-standard chords with no single
// obvious canonical symbol to compute toward. up-right (dominant 7th) and
// up-left (augmented) are '7'/'aug' in every row, not just major's — both
// force a major 3rd regardless of the held triad's own quality (see
// getChordIntervals), so e.g. a minor degree's Dom7 is a true dominant 7th
// ("D7"), not a minor 7th ("Dm7").
const CHORD_SUFFIXES = {
  major: {
    center: '', up: 'm', 'up-right': '7', right: 'maj7', 'down-right': 'add9',
    down: 'sus4', 'down-left': '6', left: 'dim', 'up-left': 'aug',
  },
  minor: {
    center: 'm', up: '', 'up-right': '7', right: 'm7', 'down-right': 'madd9',
    down: 'sus4', 'down-left': 'sus2', left: 'dim', 'up-left': 'aug',
  },
  diminished: {
    center: 'dim', up: '', 'up-right': '7', right: 'm7b5', 'down-right': 'dim9',
    down: 'sus4b5', 'down-left': 'sus2b5', left: 'm', 'up-left': 'aug',
  },
};

// The chord name a degree actually sounds right now: its root note name
// (transposed by the current key) plus the symbol for whatever the held
// direction does to its triad. modifierSet defaults to 'default' so every
// existing 3-argument call site keeps behaving exactly as before.
export function resolvedChordName(keyRoot, degree, direction, modifierSet = 'default') {
  // keyRoot can be negative (the key dropdown assigns A/A#/B values of
  // -3/-2/-1 so the rotated list still reads as ascending pitch — see
  // settings.js). Plain `%` returns a negative result for a negative
  // operand in JS rather than wrapping into 0..11, which indexed before
  // the start of KEY_NAMES and produced "undefined" for e.g. key A's
  // degree I (-3 + 0 = -3).
  const rootName = chords.KEY_NAMES[((keyRoot + degree.semitone) % 12 + 12) % 12];
  if (modifierSet === 'extended' && direction === 'up') {
    // Same real-time major/minor toggle as Default's own 'up' — see
    // getModifierChord below for why this is the one direction Extended
    // can't give a fixed suffix for.
    return `${rootName}${CHORD_SUFFIXES[degree.quality].up}`;
  }
  if (modifierSet === 'diatonic') {
    return `${rootName}${DIATONIC_SUFFIXES[diatonicIntervals(degree, direction).join(',')]}`;
  }
  const entry = MODIFIER_CHORD_SETS[modifierSet]?.[direction];
  const suffix = entry ? entry.suffix : CHORD_SUFFIXES[degree.quality][direction];
  return `${rootName}${suffix}`;
}

// Extended and Chromatic joystick modes, from the HiChord manual (manual.
// hichord.shop): two alternate 8-direction chord sets you switch the whole
// modifier stick to, selected via #modifier-set-select. Unlike Default's
// getChordIntervals — where every direction is defined *relative to* the
// held degree's own major/minor/diminished quality — every chord here is a
// fixed, fully-specified shape built on the degree's root alone: you can't
// have a "half-diminished 7th" built on a major triad, since the name
// already states its own quality in full, so none of these fifteen chords
// vary with what the held degree's natural quality happens to be. Also,
// unlike Default (whose CHORD_SUFFIXES/CHORD_LABELS are split across two
// separate tables keyed differently), each entry here bundles its label,
// its resolvedChordName() suffix, and its interval list together, since
// all three are 1:1 with the (set, direction) pair rather than varying by
// quality the way Default's do.
//
// Interval sets follow standard jazz chord-symbol voicings; where the
// manual's prose ("stacks 5 notes", "altered 5th and altered 9th") allows
// more than one valid reading, the choice made is noted per chord below.
const EXTENDED_CHORDS = {
  // 'up' is deliberately absent — Extended's own manual entry for it
  // ("flips the 3rd up or down a half step") is the same real-time
  // major/minor toggle Default's 'up' already is, not a fixed chord, so it
  // has no interval list or suffix of its own; getModifierChord/
  // resolvedChordName special-case it back to the shared toggle logic.
  down:         { label: 'Dom7#9',    suffix: '7#9',    intervals: [0, 4, 7, 10, 15] }, // "Hendrix chord": b7 + #9 (m3 up an octave)
  left:         { label: 'Sus4+7',    suffix: '7sus4',  intervals: [0, 5, 7, 10] },      // sus4 triad + flat 7
  right:        { label: 'Add11',     suffix: 'add11',  intervals: [0, 4, 7, 17] },      // major triad + natural 11 (4th up an octave), no 7th
  'up-left':    { label: 'Half-dim7', suffix: 'm7b5',   intervals: [0, 3, 6, 10] },      // diminished triad + flat 7
  'up-right':   { label: 'Dom9',      suffix: '9',      intervals: [0, 4, 7, 10, 14] },  // dominant 7th + 9
  'down-left':  { label: 'Add9',      suffix: 'add9',   intervals: [0, 4, 7, 14] },      // major triad + 9, no 7th
  // "Stacks 5 notes for a wide, open sound" — 5 distinct pitches; the 5th
  // is the one degree a jazz voicing conventionally drops first, so this
  // omits it rather than the 9th or 11th.
  'down-right': { label: 'Min11',     suffix: 'm11',    intervals: [0, 3, 10, 14, 17] }, // root, m3, b7, 9, 11 (5th omitted)
};

const CHROMATIC_CHORDS = {
  up:           { label: 'Min(Maj7)', suffix: 'm(maj7)', intervals: [0, 3, 7, 11] },        // minor triad + natural 7th ("James Bond" chord)
  down:         { label: 'Maj13',     suffix: 'maj13',   intervals: [0, 4, 7, 11, 14, 21] }, // major triad + natural 7 + 9 + 13 (6th up an octave)
  left:         { label: 'Half-dim7', suffix: 'm7b5',    intervals: [0, 3, 6, 10] },         // diminished triad + flat 7 (same shape as Extended's up-left; different wedge, different mode)
  right:        { label: '6/9',       suffix: '6/9',     intervals: [0, 4, 7, 9, 14] },      // major triad + 6 + 9, no 7th
  'up-left':    { label: 'Maj7#11',   suffix: 'maj7#11', intervals: [0, 4, 7, 11, 18] },     // major 7th + raised 11 (Lydian color)
  'up-right':   { label: 'Dom13',     suffix: '13',      intervals: [0, 4, 7, 10, 14, 21] }, // dominant 7th + 9 + 13
  'down-left':  { label: 'Dom7b9',    suffix: '7b9',     intervals: [0, 4, 7, 10, 13] },     // dominant 7th + flatted 9
  // "Flat 7th + altered 5th + altered 9th": one alteration of each, read as
  // #5 (rather than b5, which would collide with Half-dim7's own shape)
  // and b9 — a standard, commonly-voiced reading of "altered dominant".
  'down-right': { label: 'Dom7alt',   suffix: '7alt',    intervals: [0, 4, 8, 10, 13] },     // root, 3, #5, b7, b9
};

export const MODIFIER_CHORD_SETS = { extended: EXTENDED_CHORDS, chromatic: CHROMATIC_CHORDS };
export const MODIFIER_SET_NAMES = ['default', 'extended', 'chromatic', 'diatonic'];
export const MODIFIER_SET_LABELS = { default: 'Default', extended: 'Extended', chromatic: 'Chromatic', diatonic: 'Diatonic' };

// Diatonic: not from the HiChord manual. Every chord is stacked from the
// current key's major scale, so each direction has one meaning ("add the
// 7th") and the key decides its flavour — maj7 on I and IV, dominant 7 on V,
// m7b5 on vii. Steps are scale steps above the degree's root (0 root, 2 3rd,
// 4 5th, 6 7th, 8 9th, 10 11th, 12 13th), so no note ever leaves the key.
// The 13th omits the 11th, as 13th chords conventionally do.
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

const DIATONIC_CHORDS = {
  center:       { label: '',     steps: [0, 2, 4] },
  up:           { label: '7th',  steps: [0, 2, 4, 6] },
  'up-right':   { label: '9th',  steps: [0, 2, 4, 6, 8] },
  right:        { label: 'Add9', steps: [0, 2, 4, 8] },
  'down-right': { label: '11th', steps: [0, 2, 4, 6, 8, 10] },
  down:         { label: 'Sus4', steps: [0, 3, 4] },
  'down-left':  { label: 'Sus2', steps: [0, 1, 4] },
  left:         { label: '6th',  steps: [0, 2, 4, 5] },
  'up-left':    { label: '13th', steps: [0, 2, 4, 6, 8, 12] },
};

export const DIATONIC_LABELS = Object.fromEntries(
  Object.entries(DIATONIC_CHORDS).map(([dir, { label }]) => [dir, label]),
);

// Every shape the table above produces on the 7 degrees, keyed by interval
// list. Stacking strictly within the key gives some chords a pop-chart
// version would "fix" by leaving the key (IV sus4 is F-B-C, not F-Bb-C), so
// those are named for what they are.
const DIATONIC_SUFFIXES = {
  '0,4,7': '', '0,4,7,11': 'maj7', '0,4,7,11,14': 'maj9', '0,4,7,14': 'add9',
  '0,4,7,11,14,17': 'maj11', '0,4,7,11,14,18': 'maj9#11', '0,4,7,11,14,21': 'maj13',
  '0,4,7,9': '6', '0,4,7,10': '7', '0,4,7,10,14': '9', '0,4,7,10,14,17': '11',
  '0,4,7,10,14,21': '13',
  '0,5,7': 'sus4', '0,6,7': 'sus#4', '0,2,7': 'sus2', '0,1,7': 'susb2',
  '0,3,7': 'm', '0,3,7,10': 'm7', '0,3,7,10,14': 'm9', '0,3,7,14': 'madd9',
  '0,3,7,10,14,17': 'm11', '0,3,7,10,14,21': 'm13', '0,3,7,10,14,20': 'm9b13',
  '0,3,7,9': 'm6', '0,3,7,8': 'm(b6)', '0,3,7,10,13': 'm7b9', '0,3,7,13': 'm(addb9)',
  '0,3,7,10,13,17': 'm11b9', '0,3,7,10,13,20': 'm7b9b13',
  '0,3,6': 'dim', '0,3,6,10': 'm7b5', '0,3,6,10,13': 'm7b5b9', '0,3,6,13': 'dim(addb9)',
  '0,3,6,10,13,17': 'm11b5b9', '0,3,6,10,13,20': 'm7b5b9b13', '0,3,6,8': 'dim(b6)',
  '0,5,6': 'sus4b5', '0,1,6': 'susb2b5',
};

export function diatonicIntervals(degree, direction) {
  const root = MAJOR_SCALE.indexOf(degree.semitone);
  const scaleNote = (step) => MAJOR_SCALE[step % 7] + 12 * Math.floor(step / 7);
  return (DIATONIC_CHORDS[direction] ?? DIATONIC_CHORDS.center).steps
    .map(step => scaleNote(root + step) - MAJOR_SCALE[root]);
}

// What a direction actually sounds under the given modifier set: Default
// always defers to getChordIntervals unchanged (MODIFIER_CHORD_SETS has no
// 'default' entry, so the lookup below simply misses and falls through) —
// zero behavior change for anyone who never touches the new dropdown.
// Extended's 'up' toggle and every mode's 'center' (a plain triad, not one
// of the 7 real wedges) fall through the same way, for the same reason:
// neither set defines an entry for them.
// `degree` is only needed by Diatonic, whose chords depend on where in the
// scale the degree sits, not just its quality (I and IV are both major but
// take different 11ths).
export function getModifierChord(modifierSet, quality, direction, degree) {
  if (modifierSet === 'diatonic') return diatonicIntervals(degree, direction);
  if (modifierSet === 'extended' && direction === 'up') {
    return getChordIntervals(quality, direction);
  }
  const entry = MODIFIER_CHORD_SETS[modifierSet]?.[direction];
  return entry ? entry.intervals : getChordIntervals(quality, direction);
}

// Interval (semitones above the chord root) -> the scale-step name a piano key
// at that distance plays, across the two octaves the piano surface spans.
export const INTERVAL_NAMES = [
  'R', 'b2', '2', 'b3', '3', '4', 'b5', '5', '#5', '6', 'b7', '7',
  'R', 'b9', '9', '#9', '3', '11', '#11', '5', 'b13', '13', 'b7', '7',
  'R', 'b9',
];

// The same semitone count is spelled differently depending on what else is
// in the chord: 8 is a #5 in an augmented triad but a b6 next to a perfect
// (or flat) 5th, and 6 is a b5 in a diminished triad but a #4 beside a 5th.
export function intervalName(interval, chord) {
  const hasFifth = chord.includes(7);
  if (interval === 6 && hasFifth) return '#4';
  if (interval === 8 && (hasFifth || chord.includes(6))) return 'b6';
  return INTERVAL_NAMES[interval];
}

const DEFAULT_DIRECTIONS = ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'];

// The piano surface's view of a modifier set: for a held degree, each
// direction's `signature` is the notes it sounds that the plain triad doesn't,
// and `primary` is the one key that selects it on its own. Single-note
// signatures claim their note first; multi-note ones take their first
// unclaimed note, or get none (Default's Dom7 on a minor triad, Diatonic's
// 9th) and are only reachable by holding every note of their signature.
export function pianoModifiers(degree, modifierSet = 'default') {
  const chordFor = (dir) => getModifierChord(modifierSet, degree.quality, dir, degree);
  const base = chordFor('center');
  const mods = DEFAULT_DIRECTIONS.map(dir => ({
    dir,
    signature: chordFor(dir).filter(i => !base.includes(i)),
    primary: null,
  }));
  const claimed = new Set();
  mods.filter(m => m.signature.length === 1).forEach(m => {
    m.primary = m.signature[0];
    claimed.add(m.primary);
  });
  mods.filter(m => m.signature.length > 1).forEach(m => {
    const free = m.signature.find(i => !claimed.has(i));
    if (free === undefined) return;
    m.primary = free;
    claimed.add(free);
  });
  return mods;
}

// Which direction a set of held modifier keys (intervals above the root)
// selects: an exact signature match wins, so holding every note of a chord
// always gives that chord; otherwise the most recently pressed key's primary.
export function resolvePianoModifier(degree, heldIntervals, lastInterval, modifierSet = 'default') {
  const mods = pianoModifiers(degree, modifierSet);
  const held = new Set(heldIntervals);
  const exact = mods.find(m => m.signature.length === held.size && m.signature.every(i => held.has(i)));
  if (exact) return exact.dir;
  const byLast = mods.find(m => m.primary === lastInterval);
  return byLast ? byLast.dir : 'center';
}
