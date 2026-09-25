import { describe, it, expect } from 'vitest';
import { DEGREE_ROWS, MODIFIER_ROWS } from './keyboard-view.js';
import { chords } from './chords.js';
import { MODIFIER_KEY_TO_DIR, QUALITY_WEDGE_DEFAULTS, fixedDirectionLabel } from './modifier-joystick.js';
import { settings } from './settings.js';

// These lists are hand-maintained in keyboard-view.js rather than derived
// from chords.js/modifier-joystick.js — the tests below are the guard
// against a future degree/modifier key remap silently leaving the on-screen
// keyboard's layout out of sync with the actual shortcuts, since nothing
// else would catch that (it's not a type/range error persistence.js would
// reject, just a stale label sitting on the wrong key).
describe('keyboard-view module', () => {
  describe('DEGREE_ROWS', () => {
    it('covers exactly the 7 bindKeys chords.DEGREES defines, no more, no fewer', () => {
      const laidOut = [...DEGREE_ROWS.top, ...DEGREE_ROWS.home].sort();
      const expected = chords.DEGREES.map(d => d.bindKey).sort();
      expect(laidOut).toEqual(expected);
    });

    it('has no key in both rows', () => {
      const overlap = DEGREE_ROWS.top.filter(k => DEGREE_ROWS.home.includes(k));
      expect(overlap).toEqual([]);
    });
  });

  describe('MODIFIER_ROWS', () => {
    it('covers exactly the 8 keys MODIFIER_KEY_TO_DIR defines, no more, no fewer', () => {
      const laidOut = [...MODIFIER_ROWS.top, ...MODIFIER_ROWS.home].sort();
      const expected = Object.keys(MODIFIER_KEY_TO_DIR).sort();
      expect(laidOut).toEqual(expected);
    });

    it('has no key in both rows', () => {
      const overlap = MODIFIER_ROWS.top.filter(k => MODIFIER_ROWS.home.includes(k));
      expect(overlap).toEqual([]);
    });
  });

  describe('fixedDirectionLabel (re-exported via modifier-joystick.js, read by refreshModifierLabels)', () => {
    it('returns the split-label default text for Default mode\'s quality-dependent directions', () => {
      expect(fixedDirectionLabel('default', 'up')).toBe(QUALITY_WEDGE_DEFAULTS.up);
      expect(fixedDirectionLabel('default', 'left')).toBe(QUALITY_WEDGE_DEFAULTS.left);
    });

    it('returns a fixed chord label for Default mode\'s non-quality directions', () => {
      expect(fixedDirectionLabel('default', 'up-right')).toBe(chords.CHORD_LABELS['up-right']);
    });

    it('returns the toggle default (not a fixed chord) for Extended\'s own "up"', () => {
      expect(fixedDirectionLabel('extended', 'up')).toBe(QUALITY_WEDGE_DEFAULTS.up);
    });

    it('returns a fixed chord label for every other Extended/Chromatic direction', () => {
      expect(fixedDirectionLabel('extended', 'down')).toBe('Dom7#9');
      expect(fixedDirectionLabel('chromatic', 'up')).toBe('Min(Maj7)');
    });

    it('never returns undefined, even for center (which no set defines)', () => {
      expect(fixedDirectionLabel('default', 'center')).toBe('');
      expect(fixedDirectionLabel('extended', 'center')).toBe('');
    });
  });

  it('settings.modifierSet defaults to default, matching what a fresh keyboard view would label with', () => {
    expect(settings.modifierSet).toBe('default');
  });
});
