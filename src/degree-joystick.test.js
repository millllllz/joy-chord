import { describe, it, expect, beforeEach, vi } from 'vitest';
import { degreeJoystick, init as initDegreeJoystick } from './degree-joystick.js';
import { init as initAudio } from './audio.js';

describe('degree-joystick module', () => {
  beforeEach(() => {
    initAudio();
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

  it('creates degree maps for quick lookup', () => {
    expect(degreeJoystick.degreeByKey).not.toBeUndefined();
    expect(degreeJoystick.degreeByBindKey).not.toBeUndefined();
  });

  it('can identify a degree by its key', () => {
    const d = degreeJoystick.degreeByKey.get('1');
    expect(d).not.toBeUndefined();
    expect(d.degree).toBe('I');
  });

  it('can identify a degree by its keyboard binding', () => {
    const d = degreeJoystick.degreeByBindKey.get('a');
    expect(d).not.toBeUndefined();
    expect(d.degree).toBe('I');
  });

  it('has SVG elements after init', () => {
    initDegreeJoystick();
    expect(degreeJoystick.degreeJoystickEl).not.toBeUndefined();
  });
});
