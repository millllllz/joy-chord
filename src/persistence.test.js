import { describe, it, expect, beforeEach, vi } from 'vitest';
import { collectSettings, applySettings, loadSettings, saveSettings, scheduleSave, flushSave } from './persistence.js';
import { settings } from './settings.js';
import { audio } from './audio.js';
import { effects } from './effects.js';
import { arpeggiator } from './arpeggiator.js';

const STORAGE_KEY = 'joychord.settings.v1';

describe('persistence module', () => {
  beforeEach(() => {
    localStorage.clear();
    settings.currentKeyRoot = 0;
    settings.holdEnabled = false;
    audio.currentWaveType = 'sine';
    audio.GLIDE_TIME = 0.12;
    audio.ENVELOPE_SUSTAIN = 0.7;
    effects.FILTER_CUTOFF = 2500;
    effects.tremoloEnabled = false;
    arpeggiator.order = 'up';
    arpeggiator.RATE_HZ = 8;
  });

  describe('collectSettings', () => {
    it('reads the live value of every setting', () => {
      settings.currentKeyRoot = 5;
      audio.currentWaveType = 'square';
      const snapshot = collectSettings();
      expect(snapshot.keyRoot).toBe(5);
      expect(snapshot.wave).toBe('square');
    });

    it('captures no transient audio-node or sequencer state', () => {
      const keys = Object.keys(collectSettings());
      ['ctx', 'voices', 'sequence', 'timerId', 'soundingId', 'filterNode'].forEach(k => {
        expect(keys).not.toContain(k);
      });
    });
  });

  describe('applySettings', () => {
    it('applies valid values through the real setters', () => {
      applySettings({ keyRoot: 7, wave: 'sawtooth', tremolo: true });
      expect(settings.currentKeyRoot).toBe(7);
      expect(audio.currentWaveType).toBe('sawtooth');
      expect(effects.tremoloEnabled).toBe(true);
    });

    it('reports which keys it applied', () => {
      const applied = applySettings({ keyRoot: 7, arpRate: 12 });
      expect(applied).toContain('keyRoot');
      expect(applied).toContain('arpRate');
      expect(applied).toHaveLength(2);
    });

    // Only the mix level persists for Vocoder, never an enabled flag — see
    // the comment on the vocoderMix schema entry (restoring "on" would mean
    // silently re-requesting mic access with no fresh user gesture).
    it('restores the vocoder mix level but has no enabled flag to restore', () => {
      const applied = applySettings({ vocoderMix: 0.6 });
      expect(effects.VOCODER_SEND_LEVEL).toBe(0.6);
      expect(applied).toEqual(['vocoderMix']);
      expect(Object.keys(collectSettings())).not.toContain('vocoder');
    });

    it('ignores keys that are absent', () => {
      applySettings({ keyRoot: 4 });
      expect(audio.currentWaveType).toBe('sine');
    });

    // Anything out of storage is untrusted: an older build, a hand edit, or a
    // truncated write. A bad value must leave the default alone rather than
    // reach an AudioParam, which throws on NaN/out-of-range.
    it('rejects out-of-range numbers and keeps the default', () => {
      applySettings({ glideTime: 99, arpRate: -5, envSustain: 2 });
      expect(audio.GLIDE_TIME).toBe(0.12);
      expect(arpeggiator.RATE_HZ).toBe(8);
      expect(audio.ENVELOPE_SUSTAIN).toBe(0.7);
    });

    it('rejects wrong types', () => {
      applySettings({ glideTime: '0.3', hold: 'yes', keyRoot: null, filterCutoff: NaN });
      expect(audio.GLIDE_TIME).toBe(0.12);
      expect(settings.holdEnabled).toBe(false);
      expect(settings.currentKeyRoot).toBe(0);
      expect(effects.FILTER_CUTOFF).toBe(2500);
    });

    it('rejects values outside an enum', () => {
      applySettings({ wave: 'ocarina', arpOrder: 'sideways' });
      expect(audio.currentWaveType).toBe('sine');
      expect(arpeggiator.order).toBe('up');
    });

    it('applies the good keys in a blob that also has bad ones', () => {
      applySettings({ keyRoot: 2, glideTime: 999 });
      expect(settings.currentKeyRoot).toBe(2);
      expect(audio.GLIDE_TIME).toBe(0.12);
    });

    it('survives a non-object', () => {
      expect(applySettings(null)).toEqual([]);
      expect(applySettings('nope')).toEqual([]);
      expect(applySettings(undefined)).toEqual([]);
    });
  });

  describe('round trip', () => {
    it('restores a saved snapshot', () => {
      settings.currentKeyRoot = -3;
      audio.currentWaveType = 'triangle';
      effects.FILTER_CUTOFF = 800;
      arpeggiator.order = 'down';
      saveSettings();

      settings.currentKeyRoot = 0;
      audio.currentWaveType = 'sine';
      effects.FILTER_CUTOFF = 2500;
      arpeggiator.order = 'up';

      loadSettings();
      expect(settings.currentKeyRoot).toBe(-3);
      expect(audio.currentWaveType).toBe('triangle');
      expect(effects.FILTER_CUTOFF).toBe(800);
      expect(arpeggiator.order).toBe('down');
    });
  });

  describe('loadSettings', () => {
    it('is a no-op when nothing is stored', () => {
      expect(loadSettings()).toEqual([]);
      expect(settings.currentKeyRoot).toBe(0);
    });

    it('survives malformed JSON', () => {
      localStorage.setItem(STORAGE_KEY, '{not json');
      expect(loadSettings()).toEqual([]);
      expect(settings.currentKeyRoot).toBe(0);
    });

    it('ignores a blob written under an older key version', () => {
      localStorage.setItem('joychord.settings.v0', JSON.stringify({ keyRoot: 9 }));
      expect(loadSettings()).toEqual([]);
      expect(settings.currentKeyRoot).toBe(0);
    });

    it('survives localStorage throwing', () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      expect(loadSettings()).toEqual([]);
      expect(settings.currentKeyRoot).toBe(0);
      spy.mockRestore();
    });
  });

  describe('saveSettings', () => {
    it('survives localStorage throwing (quota, private mode)', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => saveSettings()).not.toThrow();
      spy.mockRestore();
    });
  });

  describe('scheduleSave / flushSave', () => {
    beforeEach(() => vi.useFakeTimers());

    it('coalesces a burst of changes into one write', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem');
      scheduleSave();
      scheduleSave();
      scheduleSave();
      expect(spy).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
      vi.useRealTimers();
    });

    it('flushSave writes a pending change immediately', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem');
      scheduleSave();
      flushSave();
      expect(spy).toHaveBeenCalledTimes(1);
      // and the flushed timer doesn't fire a second write afterwards
      vi.runAllTimers();
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
      vi.useRealTimers();
    });

    it('flushSave is a no-op with nothing pending', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem');
      flushSave();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
      vi.useRealTimers();
    });
  });
});
