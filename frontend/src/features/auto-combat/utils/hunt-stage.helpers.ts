export function shouldShowAutoCombatSessionStage(params: {
  isStartingHunt: boolean;
  shouldDelayActiveSessionUntilStartSnapshot: boolean;
  isBackendCombatPhase: boolean;
  hasPendingRealtimeVisual: boolean;
}) {
  return (
    !params.isStartingHunt &&
    !params.shouldDelayActiveSessionUntilStartSnapshot &&
    (params.isBackendCombatPhase || params.hasPendingRealtimeVisual)
  );
}

export function getHuntEmptyStageCopy(params: {
  isStartingHunt: boolean;
  isActionLoading: boolean;
  hasPreservedTrackedEnemies: boolean;
  preservedTrackedEnemiesCount: number;
  characterHasHp: boolean;
}) {
  const {
    isStartingHunt,
    isActionLoading,
    hasPreservedTrackedEnemies,
    preservedTrackedEnemiesCount,
    characterHasHp,
  } = params;
  const preservedCount = Math.max(
    0,
    Math.floor(Number(preservedTrackedEnemiesCount) || 0),
  );
  const preservedTitle = `${preservedCount} ameaça${preservedCount === 1 ? '' : 's'} aguardando`;

  if (hasPreservedTrackedEnemies) {
    return {
      eyebrow: 'Ameaças preservadas',
      title: preservedTitle,
      description: characterHasHp
        ? 'Você já está recuperado. Os infectados que ainda não foram abatidos continuam rastreados neste mapa.'
        : 'Você foi derrotado, mas os infectados que ainda não foram abatidos continuam rastreados neste mapa.',
      actionLabel:
        isStartingHunt || isActionLoading
          ? 'Retomando...'
          : 'Continuar ameaças',
    };
  }

  if (isStartingHunt) {
    return {
      eyebrow: 'Rastreamento da área',
      title: 'Retomando caçada',
      description: 'Preparando o próximo ciclo de rastreio neste mapa.',
      actionLabel: 'Retomando...',
    };
  }

  return {
    eyebrow: 'Rastreamento da área',
    title: 'Nenhuma ameaça rastreada',
    description:
      'Rota selecionada. Inicie uma caçada para localizar infectados neste mapa.',
    actionLabel: isActionLoading ? 'Iniciando...' : 'Iniciar Caçada',
  };
}
