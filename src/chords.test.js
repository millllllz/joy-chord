import { describe, it, expect } from 'vitest';
import { chords, getChordIntervals, qualityLabel, resolvedChordName } from './chords.js';

describe('chords module', () => {
  describe('DEGREES', () => {
    it('has 7 diatonic degrees', () => {
      expect(chords.DEGREES).toHaveLength(7);
    });

    it('includes natural triad qualities', () => {
      const qualities = chords.DEGREES.map(d => d.quality);
      expect(qualities).toContain('major');
      expect(qualities).toContain('minor');
      expect(qualities).toContain('diminished');
    });

    it('has unique semitone offsets', () => {
      const semitones = chords.DEGREES.map(d => d.semitone);
      expect(new Set(semitones).size).toBe(7);
    });

    it('has SVG wedge paths', () => {
      chords.DEGREES.forEach(d => {
        expect(d.wedge).toMatch(/^M /);
      });
    });

    it('has label positions', () => {
      chords.DEGREES.forEach(d => {
        expect(d.labelPos).toHaveLength(2);
        expect(d.qualityPos).toHaveLength(2);
      });
    });
  });

  describe('BASE_TRIAD', () => {
    it('defines intervals for major triad', () => {
      expect(chords.BASE_TRIAD.major).toEqual([0, 4, 7]);
    });

    it('defines intervals for minor triad', () => {
      expect(chords.BASE_TRIAD.minor).toEqual([0, 3, 7]);
    });

    it('defines intervals for diminished triad', () => {
      expect(chords.BASE_TRIAD.diminished).toEqual([0, 3, 6]);
    });
  });

  describe('getChordIntervals', () => {
    it('returns natural triad at center', () => {
      expect(getChordIntervals('major', 'center')).toEqual([0, 4, 7]);
      expect(getChordIntervals('minor', 'center')).toEqual([0, 3, 7]);
      expect(getChordIntervals('diminished', 'center')).toEqual([0, 3, 6]);
    });

    it('toggles major/minor on up direction', () => {
      expect(getChordIntervals('major', 'up')).toEqual([0, 3, 7]);
      expect(getChordIntervals('minor', 'up')).toEqual([0, 4, 7]);
    });

    it('adds dominant 7th on up-right', () => {
      expect(getChordIntervals('major', 'up-right')).toEqual([0, 4, 7, 10]);
      expect(getChordIntervals('minor', 'up-right')).toEqual([0, 3, 7, 10]);
    });

    it('adds major or minor 7th on right', () => {
      expect(getChordIntervals('major', 'right')).toEqual([0, 4, 7, 11]);
      expect(getChordIntervals('minor', 'right')).toEqual([0, 3, 7, 10]);
    });

    it('adds 9th on down-right', () => {
      expect(getChordIntervals('major', 'down-right')).toEqual([0, 4, 7, 14]);
      expect(getChordIntervals('minor', 'down-right')).toEqual([0, 3, 7, 14]);
    });

    it('adds sus4 on down', () => {
      expect(getChordIntervals('major', 'down')).toEqual([0, 5, 7]);
      expect(getChordIntervals('minor', 'down')).toEqual([0, 5, 7]);
    });

    it('adds 6th or sus2 on down-left', () => {
      expect(getChordIntervals('major', 'down-left')).toEqual([0, 4, 7, 9]);
      expect(getChordIntervals('minor', 'down-left')).toEqual([0, 2, 7]);
    });

    it('darkens on left direction', () => {
      expect(getChordIntervals('major', 'left')).toEqual([0, 3, 6]);
      expect(getChordIntervals('minor', 'left')).toEqual([0, 3, 6]);
      expect(getChordIntervals('diminished', 'left')).toEqual([0, 3, 7]);
    });

    it('augments on up-left', () => {
      expect(getChordIntervals('major', 'up-left')).toEqual([0, 4, 8]);
      expect(getChordIntervals('minor', 'up-left')).toEqual([0, 3, 8]);
    });
  });

  describe('qualityLabel', () => {
    it('returns "Dim" for major quality on left', () => {
      expect(qualityLabel('left', 'major')).toBe('Dim');
    });

    it('returns "Min" for diminished quality on left', () => {
      expect(qualityLabel('left', 'diminished')).toBe('Min');
    });

    it('toggles Maj/min on up direction', () => {
      expect(qualityLabel('up', 'major')).toBe('min');
      expect(qualityLabel('up', 'minor')).toBe('maj');
    });

    it('returns Maj7/min7 on right direction', () => {
      expect(qualityLabel('right', 'major')).toBe('Maj7');
      expect(qualityLabel('right', 'minor')).toBe('min7');
    });

    it('returns 6th/Sus2 on down-left direction', () => {
      expect(qualityLabel('down-left', 'major')).toBe('6th');
      expect(qualityLabel('down-left', 'minor')).toBe('Sus2');
    });
  });

  describe('CHORD_LABELS', () => {
    it('defines fixed labels for quality-independent directions', () => {
      expect(chords.CHORD_LABELS.center).toBeNull();
      expect(chords.CHORD_LABELS['up-right']).toBe('Dom7');
      expect(chords.CHORD_LABELS['down-right']).toBe('9th');
      expect(chords.CHORD_LABELS.down).toBe('Sus4');
      expect(chords.CHORD_LABELS['up-left']).toBe('Aug');
    });
  });

  describe('KEY_NAMES', () => {
    it('has 12 chromatic pitches', () => {
      expect(chords.KEY_NAMES).toHaveLength(12);
    });

    it('starts at C', () => {
      expect(chords.KEY_NAMES[0]).toBe('C');
    });
  });

  describe('resolvedChordName', () => {
    const I = chords.DEGREES[0];   // major, semitone 0
    const ii = chords.DEGREES[1];  // minor, semitone 2
    const vii = chords.DEGREES[6]; // diminished, semitone 11

    it('names a bare major triad after its root alone', () => {
      expect(resolvedChordName(0, I, 'center')).toBe('C');
    });

    it('names a bare minor triad with a lowercase m', () => {
      expect(resolvedChordName(0, ii, 'center')).toBe('Dm');
    });

    it('names a bare diminished triad', () => {
      expect(resolvedChordName(0, vii, 'center')).toBe('Bdim');
    });

    it('transposes the root by the current key', () => {
      expect(resolvedChordName(2, I, 'center')).toBe('D');
      expect(resolvedChordName(2, ii, 'center')).toBe('Em');
    });

    it('names dominant and major 7ths', () => {
      expect(resolvedChordName(0, I, 'up-right')).toBe('C7');
      expect(resolvedChordName(0, I, 'right')).toBe('Cmaj7');
      expect(resolvedChordName(0, ii, 'right')).toBe('Dm7');
    });

    it('names sus, add, augmented and half-diminished chords', () => {
      expect(resolvedChordName(0, I, 'down')).toBe('Csus4');
      expect(resolvedChordName(0, I, 'down-right')).toBe('Cadd9');
      expect(resolvedChordName(0, I, 'up-left')).toBe('Caug');
      expect(resolvedChordName(0, vii, 'up-right')).toBe('Bm7b5');
    });
  });

  describe('WAVE_TYPES', () => {
    it('exports standard oscillator waveforms', () => {
      expect(chords.WAVE_TYPES).toContain('sine');
      expect(chords.WAVE_TYPES).toContain('square');
      expect(chords.WAVE_TYPES).toContain('sawtooth');
      expect(chords.WAVE_TYPES).toContain('triangle');
    });
  });
});
