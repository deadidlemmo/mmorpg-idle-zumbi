import assert from 'node:assert/strict';
import test from 'node:test';
import { selectVisibleCharacterProgress } from './visible-progress';
import type { RealtimeCharacterProgressState } from '../types/auto-combat-page.types';

function progress(
  xp: number,
  currentLevelXp: number,
): RealtimeCharacterProgressState {
  return {
    sessionId: 'session-1',
    level: 1,
    xp,
    currentLevelXp,
    xpToNextLevel: 200,
    xpProgressPercent: (currentLevelXp / 200) * 100,
    updatedAt: Date.now(),
  };
}

test('dashboard não usa overview/status adiantado enquanto timeline visual do provider está pendente', () => {
  const providerProgress = progress(100, 100);
  const overviewProgress = progress(150, 150);
  const statusProgress = progress(150, 150);
  const localProgress = progress(150, 150);

  const visible = selectVisibleCharacterProgress({
    hasProviderVisualTimeline: true,
    overviewCharacterProgress: overviewProgress,
    statusCharacterProgress: statusProgress,
    localCharacterProgress: localProgress,
    providerProgress,
  });

  assert.equal(visible?.xp, 100);
  assert.equal(visible?.currentLevelXp, 100);
});

test('dashboard mostra EXP confirmada após a timeline visual liberar o progresso', () => {
  const providerProgress = progress(150, 150);
  const overviewProgress = progress(150, 150);
  const statusProgress = progress(150, 150);

  const visible = selectVisibleCharacterProgress({
    hasProviderVisualTimeline: false,
    overviewCharacterProgress: overviewProgress,
    statusCharacterProgress: statusProgress,
    localCharacterProgress: null,
    providerProgress,
  });

  assert.equal(visible?.xp, 150);
  assert.equal(visible?.currentLevelXp, 150);
});
