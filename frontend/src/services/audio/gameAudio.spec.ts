import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isGameSoundEnabled,
  playGameSound,
  primeGameSounds,
  setGameSoundEnabled,
  subscribeGameSound,
} from './gameAudio';

test('sons respeitam preferencia, visibilidade e limite de repeticao', async () => {
  const previousAudio = globalThis.Audio;
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const saved = new Map<string, string>();
  const created: FakeAudio[] = [];
  let hidden = false;
  let updates = 0;

  class FakeAudio {
    currentTime = 0;
    muted = false;
    preload = '';
    volume = 1;
    playing = false;
    playCount = 0;

    constructor(readonly src: string) {
      created.push(this);
    }

    play() {
      this.playing = true;
      this.playCount += 1;
      return Promise.resolve();
    }

    pause() {
      this.playing = false;
    }
  }

  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: FakeAudio });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { get hidden() { return hidden; } },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: { setItem: (key: string, value: string) => saved.set(key, value) } },
  });
  const unsubscribe = subscribeGameSound(() => { updates += 1; });

  try {
    setGameSoundEnabled(true);
    primeGameSounds();
    await Promise.resolve();
    assert.equal(created.length, 2);
    assert.ok(created.every((player) => !player.playing));

    assert.equal(playGameSound('xp'), true);
    assert.equal(playGameSound('xp'), false);
    const xp = created.find((player) => player.src.endsWith('xp-gain.mp3'));
    assert.equal(xp?.playCount, 2);

    hidden = true;
    assert.equal(playGameSound('foraging'), false);
    hidden = false;
    assert.equal(playGameSound('foraging'), true);

    setGameSoundEnabled(false);
    assert.equal(isGameSoundEnabled(), false);
    assert.equal(saved.get('dead_idle_sound_enabled'), 'false');
    assert.equal(playGameSound('xp'), false);
    assert.ok(created.every((player) => !player.playing));
    assert.ok(updates >= 1);
  } finally {
    unsubscribe();
    Object.defineProperty(globalThis, 'Audio', { configurable: true, value: previousAudio });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
    setGameSoundEnabled(true);
  }
});
