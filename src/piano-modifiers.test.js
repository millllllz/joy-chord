import { describe, it, expect } from 'vitest';
import { chords, getChordIntervals, pianoModifiers, resolvePianoModifier, INTERVAL_NAMES } from './chords.js';

const QUALITIES = ['major', 'minor', 'diminished'];
// One degree of each quality: I (major), ii (minor), vii° (diminished).
const DEGREE_OF = { major: chords.DEGREES[0], minor: chords.DEGREES[1], diminished: chords.DEGREES[6] };

describe('pianoModifiers', () => {
  it.each(QUALITIES)('gives every %s modifier a distinct signature and primary key', (quality) => {
    const mods = pianoModifiers(DEGREE_OF[quality]);
    expect(mods).toHaveLength(8);
    const sigs = mods.map(m => m.signature.join('+'));
    expect(new Set(sigs).size).toBe(8);
    const primaries = mods.map(m => m.primary).filter(p => p !== null);
    expect(new Set(primaries).size).toBe(primaries.length);
  });

  it('puts the major modifiers on the keys a player would expect', () => {
    const byDir = Object.fromEntries(pianoModifiers(DEGREE_OF.major).map(m => [m.dir, m.primary]));
    expect(byDir).toEqual({
      up: 3, 'up-right': 10, right: 11, 'down-right': 14,
      down: 5, 'down-left': 9, left: 6, 'up-left': 8,
    });
  });

  it('leaves Dom7 on a minor triad reachable only as a two-key combo', () => {
    const dom7 = pianoModifiers(DEGREE_OF.minor).find(m => m.dir === 'up-right');
    expect(dom7.primary).toBeNull();
    expect(dom7.signature).toEqual([4, 10]);
  });
});

describe('resolvePianoModifier', () => {
  it('returns center with nothing held', () => {
    expect(resolvePianoModifier(DEGREE_OF.major, [], undefined)).toBe('center');
  });

  it('selects a modifier from its primary key alone', () => {
    expect(resolvePianoModifier(DEGREE_OF.major, [11], 11)).toBe('right');
    expect(resolvePianoModifier(DEGREE_OF.major, [6], 6)).toBe('left');
  });

  it('selects a combo modifier when its whole signature is held', () => {
    expect(resolvePianoModifier(DEGREE_OF.minor, [4, 10], 10)).toBe('up-right');
    expect(resolvePianoModifier(DEGREE_OF.diminished, [4, 7, 10], 7)).toBe('up-right');
  });

  it('falls back to the last-pressed key when the held set matches nothing', () => {
    expect(resolvePianoModifier(DEGREE_OF.minor, [4, 5], 5)).toBe('down');
  });

  it('ignores keys that are not modifiers', () => {
    expect(resolvePianoModifier(DEGREE_OF.major, [7], 7)).toBe('center');
  });

  it.each(QUALITIES)('round-trips every %s modifier through its signature', (quality) => {
    pianoModifiers(DEGREE_OF[quality]).forEach(m => {
      const dir = resolvePianoModifier(DEGREE_OF[quality], m.signature, m.signature.at(-1));
      expect(getChordIntervals(quality, dir)).toEqual(getChordIntervals(quality, m.dir));
    });
  });
});

describe('INTERVAL_NAMES', () => {
  it('covers the two octaves plus a semitone the piano spans', () => {
    expect(INTERVAL_NAMES).toHaveLength(26);
    expect(INTERVAL_NAMES[11]).toBe('7');
    expect(INTERVAL_NAMES[14]).toBe('9');
  });

  it('knows every chord tone Default can produce', () => {
    QUALITIES.forEach(q => ['center', ...pianoModifiers(DEGREE_OF[q]).map(m => m.dir)].forEach(dir => {
      getChordIntervals(q, dir).forEach(i => expect(INTERVAL_NAMES[i]).toBeDefined());
    }));
    expect(chords.DEGREES).toHaveLength(7);
  });
});

describe('piano modifiers for other sets', () => {
  const SETS = ['extended', 'chromatic', 'diatonic'];

  it.each(SETS)('%s gives every degree 8 distinct signatures and distinct primaries', (set) => {
    chords.DEGREES.forEach(d => {
      const mods = pianoModifiers(d, set);
      expect(new Set(mods.map(m => m.signature.join('+'))).size).toBe(8);
      const primaries = mods.map(m => m.primary).filter(p => p !== null);
      expect(new Set(primaries).size).toBe(primaries.length);
    });
  });

  it('puts diatonic extensions an octave above the sus/6th keys', () => {
    const byDir = Object.fromEntries(pianoModifiers(chords.DEGREES[0], 'diatonic').map(m => [m.dir, m.primary]));
    expect(byDir).toEqual({
      up: 11, 'up-right': null, right: 14, 'down-right': 17,
      down: 5, 'down-left': 2, left: 9, 'up-left': 21,
    });
  });

  it('reaches the diatonic 9th by holding the 7th and 9th together', () => {
    expect(resolvePianoModifier(chords.DEGREES[4], [10, 14], 14, 'diatonic')).toBe('up-right');
    expect(resolvePianoModifier(chords.DEGREES[4], [14], 14, 'diatonic')).toBe('right');
  });
});
