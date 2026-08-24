import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getHuntEmptyStageCopy,
  shouldShowAutoCombatSessionStage,
} from './hunt-stage.helpers';
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

test('retomada da caça bloqueia o card antigo mesmo com snapshot de combate pendente', () => {
  const visible = shouldShowAutoCombatSessionStage({
    isStartingHunt: true,
    shouldDelayActiveSessionUntilStartSnapshot: false,
    isBackendCombatPhase: true,
    hasPendingRealtimeVisual: true,
  });

  assert.equal(visible, false);
});

test('ameaças preservadas não mantêm mensagem de derrota após a cura', () => {
  const copy = getHuntEmptyStageCopy({
    isStartingHunt: false,
    isActionLoading: false,
    hasPreservedTrackedEnemies: true,
    preservedTrackedEnemiesCount: 763,
    characterHasHp: true,
  });

  assert.equal(copy.title, '763 ameaças aguardando');
  assert.match(copy.description, /recuperado/i);
  assert.doesNotMatch(copy.description, /derrotado/i);
});

test('ameaças preservadas explicam a derrota enquanto o personagem está sem HP', () => {
  const copy = getHuntEmptyStageCopy({
    isStartingHunt: false,
    isActionLoading: false,
    hasPreservedTrackedEnemies: true,
    preservedTrackedEnemiesCount: 1,
    characterHasHp: false,
  });

  assert.equal(copy.title, '1 ameaça aguardando');
  assert.match(copy.description, /derrotado/i);
});

test('transição de retomada não exibe estado vazio de rastreamento', () => {
  const copy = getHuntEmptyStageCopy({
    isStartingHunt: true,
    isActionLoading: true,
    hasPreservedTrackedEnemies: false,
    preservedTrackedEnemiesCount: 0,
    characterHasHp: true,
  });

  assert.equal(copy.title, 'Retomando caçada');
  assert.notEqual(copy.title, 'Nenhuma ameaça rastreada');
});
