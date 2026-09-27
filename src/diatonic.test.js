import { describe, it, expect } from 'vitest';
import { chords, getModifierChord, resolvedChordName, diatonicIntervals, DIATONIC_LABELS, intervalName } from './chords.js';

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const DIRECTIONS = ['center', 'up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'];
const deg = (numeral) => chords.DEGREES.find(d => d.degree === numeral);
const nameInC = (numeral, dir) => resolvedChordName(0, deg(numeral), dir, 'diatonic');

describe('diatonic modifier set', () => {
  it('never leaves the key', () => {
    chords.DEGREES.forEach(d => DIRECTIONS.forEach(dir => {
      diatonicIntervals(d, dir).forEach(i => expect(MAJOR_SCALE).toContain((d.semitone + i) % 12));
    }));
  });

  it('names every chord it can produce', () => {
    chords.DEGREES.forEach(d => DIRECTIONS.forEach(dir => {
      expect(nameInC(d.degree, dir)).not.toMatch(/undefined/);
    }));
  });

  it('center is each degree\'s own triad', () => {
    chords.DEGREES.forEach(d => {
      expect(diatonicIntervals(d, 'center')).toEqual(chords.BASE_TRIAD[d.quality]);
    });
  });

  it('gives each degree its own diatonic 7th', () => {
    expect(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'].map(n => nameInC(n, 'up')))
      .toEqual(['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5']);
  });

  it('stacks 9ths, 11ths and 13ths from the scale', () => {
    expect(nameInC('V', 'up-right')).toBe('G9');
    expect(nameInC('iii', 'up-right')).toBe('Em7b9');
    expect(nameInC('IV', 'down-right')).toBe('Fmaj9#11');
    expect(nameInC('ii', 'up-left')).toBe('Dm13');
    expect(diatonicIntervals(deg('I'), 'up-left')).toEqual([0, 4, 7, 11, 14, 21]);
  });

  it('suspends with the scale\'s own 2nd and 4th', () => {
    expect(nameInC('I', 'down')).toBe('Csus4');
    expect(nameInC('IV', 'down')).toBe('Fsus#4');
    expect(nameInC('iii', 'down-left')).toBe('Esusb2');
  });

  it('is what getModifierChord returns for the diatonic set', () => {
    expect(getModifierChord('diatonic', 'major', 'up', deg('V'))).toEqual([0, 4, 7, 10]);
  });

  it('labels each direction by what it adds', () => {
    expect(DIATONIC_LABELS.up).toBe('7th');
    expect(DIATONIC_LABELS['up-left']).toBe('13th');
  });
});

describe('intervalName', () => {
  it('spells 8 as #5 in an augmented triad and b6 beside a 5th', () => {
    expect(intervalName(8, [0, 4, 8])).toBe('#5');
    expect(intervalName(8, [0, 3, 7, 8])).toBe('b6');
  });

  it('spells 6 as b5 in a diminished triad and #4 beside a 5th', () => {
    expect(intervalName(6, [0, 3, 6])).toBe('b5');
    expect(intervalName(6, [0, 6, 7])).toBe('#4');
  });
});
