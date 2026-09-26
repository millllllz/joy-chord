import { startVoice, stopVoice, noteFreq } from './audio.js';

export const midi = {
  access: null,
  inputPorts: new Map(),
  activeNotes: new Map(), // Map<midiNote, voiceId>
  heldVoices: new Map(), // Map<voiceId, semitone> for reconciliation
};

export async function initMIDI() {
  try {
    midi.access = await navigator.requestMIDIAccess();
    console.log('MIDI access granted');

    // Attach listeners to currently connected inputs
    midi.access.inputs.forEach((input) => {
      attachMIDIInputListener(input);
    });

    // Listen for future device connections/disconnections
    midi.access.addEventListener('statechange', (event) => {
      if (event.port.type === 'input') {
        if (event.port.state === 'connected') {
          attachMIDIInputListener(event.port);
        } else if (event.port.state === 'disconnected') {
          midi.inputPorts.delete(event.port.id);
        }
      }
    });

    return true;
  } catch (err) {
    console.warn('MIDI not available:', err);
    return false;
  }
}

function attachMIDIInputListener(input) {
  midi.inputPorts.set(input.id, input);
  input.addEventListener('midimessage', handleMIDIMessage);
}

function handleMIDIMessage(event) {
  const [status, data1, data2] = event.data;
  const command = status & 0xf0;

  if (command === 0x90) { // Note on
    const midiNote = data1;
    const velocity = data2;
    if (velocity > 0) {
      playMIDINote(midiNote, velocity);
    } else {
      releaseMIDINote(midiNote);
    }
  } else if (command === 0x80) { // Note off
    const midiNote = data1;
    releaseMIDINote(midiNote);
  }
}

function playMIDINote(midiNote, velocity) {
  // Don't retrigger if already held
  if (midi.activeNotes.has(midiNote)) return;

  const voiceId = `midi:${midiNote}`;
  const semitone = midiNote - 60; // Middle C (60) = 0 semitones

  // Start the voice
  const freq = noteFreq(semitone);
  startVoice(voiceId, freq);

  // Track it
  midi.activeNotes.set(midiNote, voiceId);
  midi.heldVoices.set(voiceId, semitone);
}

function releaseMIDINote(midiNote) {
  const voiceId = midi.activeNotes.get(midiNote);
  if (!voiceId) return;

  stopVoice(voiceId);
  midi.activeNotes.delete(midiNote);
  midi.heldVoices.delete(voiceId);
}

export function releaseMIDIAll() {
  const midiNotes = Array.from(midi.activeNotes.keys());
  midiNotes.forEach(note => releaseMIDINote(note));
}
