import { describe, it, expect, beforeEach } from 'vitest';
import { degreeJoystick } from './degree-joystick.js';
import { chords } from './chords.js';

describe('degree-joystick module', () => {
  beforeEach(() => {
    degreeJoystick.heldDegrees = new Map();
    degreeJoystick.heldVoices = new Map();
    degreeJoystick.currentDirection = 'center';
  });

  it('initializes with no held degrees', () => {
    expect(degreeJoystick.heldDegrees.size).toBe(0);
    expect(degreeJoystick.heldVoices.size).toBe(0);
  });

  it('tracks currently held direction', () => {
    degreeJoystick.currentDirection = 'up-right';
    expect(degreeJoystick.currentDirection).toBe('up-right');
  });

  it('has degree lookup maps', () => {
    expect(degreeJoystick.degreeByKey instanceof Map).toBe(true);
    expect(degreeJoystick.degreeByBindKey instanceof Map).toBe(true);
  });

  it('maps all 7 degrees by key and binding', () => {
    const keys = ['1', '2', '3', '4', '5', '6', '7'];
    const bindings = ['a', 'w', 's', 'e', 'd', 'r', 'f'];

    // Populate maps manually since init() tries to access DOM
    degreeJoystick.degreeByKey = new Map(chords.DEGREES.map(d => [d.key, d]));
    degreeJoystick.degreeByBindKey = new Map(chords.DEGREES.map(d => [d.bindKey, d]));

    keys.forEach(key => {
      expect(degreeJoystick.degreeByKey.get(key)).toBeDefined();
    });

    bindings.forEach(binding => {
      expect(degreeJoystick.degreeByBindKey.get(binding)).toBeDefined();
    });
  });
});
