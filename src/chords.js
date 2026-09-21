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
      return quality === 'diminished' ? chords.BASE_TRIAD.minor : chords.BASE_TRIAD.diminished;
    case 'up-left':       // augmented: raise the 5th
      return [root, third, fifth + 1];
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
// interval numbers themselves, since a few combinations (minor + augmented,
// diminished + add9, ...) land on non-standard chords with no single
// obvious canonical symbol to compute toward.
const CHORD_SUFFIXES = {
  major: {
    center: '', up: 'm', 'up-right': '7', right: 'maj7', 'down-right': 'add9',
    down: 'sus4', 'down-left': '6', left: 'dim', 'up-left': 'aug',
  },
  minor: {
    center: 'm', up: '', 'up-right': 'm7', right: 'm7', 'down-right': 'madd9',
    down: 'sus4', 'down-left': 'sus2', left: 'dim', 'up-left': 'm#5',
  },
  diminished: {
    center: 'dim', up: '', 'up-right': 'm7b5', right: 'm7b5', 'down-right': 'dim9',
    down: 'sus4b5', 'down-left': 'sus2b5', left: 'm', 'up-left': 'm',
  },
};

// The chord name a degree actually sounds right now: its root note name
// (transposed by the current key) plus the symbol for whatever the held
// direction does to its triad.
export function resolvedChordName(keyRoot, degree, direction) {
  const rootName = chords.KEY_NAMES[(keyRoot + degree.semitone) % 12];
  return `${rootName}${CHORD_SUFFIXES[degree.quality][direction]}`;
}
