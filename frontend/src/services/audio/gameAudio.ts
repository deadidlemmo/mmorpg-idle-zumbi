export type GameSound = "xp" | "foraging";

const STORAGE_KEY = "dead_idle_sound_enabled";
const SOUND_CONFIG: Record<GameSound, { url: string; volume: number; cooldownMs: number }> = {
  xp: { url: "/audio/xp-gain.mp3", volume: 0.42, cooldownMs: 550 },
  foraging: { url: "/audio/foraging-search.mp3", volume: 0.28, cooldownMs: 10_000 },
};

function readEnabled() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

let enabled = readEnabled();
const listeners = new Set<() => void>();
const players = new Map<GameSound, HTMLAudioElement>();
const primed = new Set<GameSound>();
const priming = new Set<GameSound>();
const lastPlayedAt = new Map<GameSound, number>();

function getPlayer(sound: GameSound) {
  if (typeof Audio === "undefined") return null;
  let player = players.get(sound);
  if (!player) {
    player = new Audio(SOUND_CONFIG[sound].url);
    player.preload = "auto";
    player.volume = SOUND_CONFIG[sound].volume;
    players.set(sound, player);
  }
  return player;
}

export function isGameSoundEnabled() {
  return enabled;
}

export function subscribeGameSound(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setGameSoundEnabled(next: boolean) {
  if (enabled === next) return;
  enabled = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // Audio remains usable when storage is unavailable.
  }
  if (!next) {
    for (const player of players.values()) player.pause();
  } else {
    primeGameSounds();
  }
  for (const listener of listeners) listener();
}

export function primeGameSounds() {
  if (!enabled) return;
  for (const sound of ["xp", "foraging"] as const) {
    if (primed.has(sound) || priming.has(sound)) continue;
    const player = getPlayer(sound);
    if (!player) continue;
    priming.add(sound);
    player.muted = true;
    let playback: Promise<void> | undefined;
    try {
      playback = player.play();
    } catch {
      player.muted = false;
      priming.delete(sound);
      continue;
    }
    if (!playback) {
      player.pause();
      player.currentTime = 0;
      player.muted = false;
      primed.add(sound);
      priming.delete(sound);
      continue;
    }
    void playback.then(() => {
      if (player.muted) {
        player.pause();
        player.currentTime = 0;
        player.muted = false;
      }
      primed.add(sound);
      priming.delete(sound);
    }).catch(() => {
      player.muted = false;
      priming.delete(sound);
    });
  }
}

export function playGameSound(sound: GameSound) {
  if (!enabled || typeof document === "undefined" || document.hidden) return false;
  const now = Date.now();
  const previous = lastPlayedAt.get(sound) ?? -Infinity;
  if (now - previous < SOUND_CONFIG[sound].cooldownMs) return false;
  const player = getPlayer(sound);
  if (!player) return false;
  player.pause();
  player.currentTime = 0;
  player.muted = false;
  player.volume = SOUND_CONFIG[sound].volume;
  lastPlayedAt.set(sound, now);
  const playback = player.play();
  if (playback) {
    void playback.catch(() => {
      if (lastPlayedAt.get(sound) === now) lastPlayedAt.delete(sound);
    });
  }
  return true;
}
