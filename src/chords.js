export const chords = {
  DEGREES: [
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
