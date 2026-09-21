import { stopVoice, startVoice } from './audio.js';

// Note-order strategies: each maps a chord's target Map<id, freq> (as built
// by degree-joystick's voicesForDegree, already in ascending-pitch id order
// since intervals are authored ascending) to the id sequence the arpeggiator
// steps through. Keyed by name so the dialog's <select> can list them and
// setOrder can validate against it, without either side hard-coding the set.
// 'random' is handled separately (see tick) — it re-picks a note every step
// rather than walking a fixed sequence, so it has no entry here.
const ORDERS = {
  up: (ids) => ids,
  down: (ids) => [...ids].reverse(),
  // Up then back down, without repeating the top or bottom note (the usual
  // "up-down" arp shape) — a 2-note chord has no distinct middle to omit on
  // the way back, so it'd otherwise just repeat both notes twice in a row.
  'up-down': (ids) => ids.length <= 2 ? ids : [...ids, ...[...ids].reverse().slice(1, -1)],
  'down-up': (ids) => ids.length <= 2 ? [...ids].reverse() : [...[...ids].reverse(), ...ids.slice(1, -1)],
};

export const ORDER_NAMES = [...Object.keys(ORDERS), 'random'];

export const arpeggiator = {
  enabled: false,
  order: 'up',
  RATE_HZ: 8,
  // The chord currently being arpeggiated, id -> freq, in the order given by
  // ORDERS[order] — rebuilt whenever the held chord changes (new chord,
  // direction/key change while held). Empty when nothing is held.
  sequence: [],
  stepIndex: 0,
  timerId: null,
  // id of the currently-sounding arp voice, so the next tick can stop it
  // before starting the next note — monophonic per step, not a sustain of
  // every chord tone at once (that would just be the plain chord).
  soundingId: null,
};

export function setArpEnabled(enabled) {
  if (arpeggiator.enabled === enabled) return;
  arpeggiator.enabled = enabled;
  if (!enabled) {
    stopTimer();
    if (arpeggiator.soundingId != null) {
      stopVoice(arpeggiator.soundingId);
      arpeggiator.soundingId = null;
    }
    arpeggiator.sequence = [];
    arpeggiator.stepIndex = 0;
  } else if (arpeggiator.sequence.length > 0) {
    startTimer();
  }
}

export function setArpOrder(order) {
  if (!ORDER_NAMES.includes(order)) return;
  arpeggiator.order = order;
  if (arpeggiator.sequence.length > 0) rebuildSequence(currentTarget);
}

export function setArpRate(hz) {
  arpeggiator.RATE_HZ = hz;
  if (arpeggiator.timerId != null) {
    stopTimer();
    startTimer();
  }
}

// The most recent target Map<id, freq> handed to updateArpChord, kept so
// setArpOrder can re-derive the sequence from it without the caller having
// to resupply the chord.
let currentTarget = new Map();

function rebuildSequence(target) {
  currentTarget = target;
  const ids = [...target.keys()];
  // 'random' has no fixed walk order — tick() re-picks from currentTarget's
  // ids directly every step — so its "sequence" is just the unordered id
  // list, kept only so the length/emptiness checks elsewhere stay uniform
  // across all order modes.
  arpeggiator.sequence = arpeggiator.order === 'random' ? ids : ORDERS[arpeggiator.order](ids);
  arpeggiator.stepIndex = 0;
}

// Called by degree-joystick instead of reconcileVoices whenever the arp is
// enabled: `target` is the same Map<id, freq> a plain (non-arp) press would
// have voiced directly. Swaps in the new chord's note sequence and makes
// sure the timer is running (or stops it, and cuts the currently-sounding
// step, once the chord empties — a release with nothing held to arpeggiate).
export function updateArpChord(target) {
  rebuildSequence(target);
  if (arpeggiator.sequence.length === 0) {
    stopTimer();
    if (arpeggiator.soundingId != null) {
      stopVoice(arpeggiator.soundingId);
      arpeggiator.soundingId = null;
    }
    return;
  }
  if (arpeggiator.enabled) startTimer();
}

function startTimer() {
  if (arpeggiator.timerId != null) return;
  tick();
  arpeggiator.timerId = setInterval(tick, 1000 / arpeggiator.RATE_HZ);
}

function stopTimer() {
  if (arpeggiator.timerId == null) return;
  clearInterval(arpeggiator.timerId);
  arpeggiator.timerId = null;
}

function tick() {
  if (arpeggiator.sequence.length === 0) return;
  if (arpeggiator.soundingId != null) stopVoice(arpeggiator.soundingId);

  let id;
  if (arpeggiator.order === 'random') {
    id = arpeggiator.sequence[Math.floor(Math.random() * arpeggiator.sequence.length)];
  } else {
    id = arpeggiator.sequence[arpeggiator.stepIndex % arpeggiator.sequence.length];
    arpeggiator.stepIndex = (arpeggiator.stepIndex + 1) % arpeggiator.sequence.length;
  }
  const freq = currentTarget.get(id);

  if (freq == null) {
    arpeggiator.soundingId = null;
    return;
  }
  startVoice(id, freq);
  arpeggiator.soundingId = id;
}
