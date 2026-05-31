import {
  EXPECTED_COMBATS_PER_DAY,
  FUTURE_LEVEL_CAP,
  LAUNCH_LEVEL_CAP,
  LEVELS_PER_TIER,
  LEVEL_XP_WEIGHT_BY_POSITION,
  TIER_AVERAGE_XP_PER_COMBAT,
  TIER_TARGET_DAYS,
} from '../config/progression.config';

export type LevelProgressResult = {
  oldLevel: number;
  newLevel: number;

  /**
   * XP total antes do ganho.
   */
  currentXp: number;

  /**
   * XP recebido agora.
   */
  gainedXp: number;

  /**
   * XP total acumulado depois do cálculo.
   */
  totalXp: number;

  leveledUp: boolean;
  levelsGained: number;

  levelCap: number;
  isAtLevelCap: boolean;

  /**
   * XP total necessário para começar o nível atual.
   * Exemplo:
   * level 1 => 0
   * level 2 => XP total necessário para ter chegado no level 2
   */
  currentLevelStartXp: number;

  /**
   * XP total necessário para alcançar o próximo nível.
   * Null quando estiver no level cap.
   */
  nextLevelRequiredXp: number | null;

  /**
   * XP dentro do nível atual.
   * Esse é o número da esquerda da barra.
   */
  xpIntoCurrentLevel: number;

  /**
   * XP restante para o próximo nível.
   */
  xpNeededForNextLevel: number | null;

  /**
   * XP total necessário dentro do nível atual.
   * Esse é o número da direita da barra.
   */
  xpToNextLevel: number;

  /**
   * Aliases para compatibilidade com o frontend.
   */
  currentLevelXp: number;
  nextLevelXp: number;
  xpProgressPercent: number;

  progressPercent: number;
};

function normalizeLevel(level: number, levelCap = LAUNCH_LEVEL_CAP) {
  const parsedLevel = Math.floor(Number(level));

  if (!Number.isFinite(parsedLevel)) {
    return 1;
  }

  return Math.max(1, Math.min(parsedLevel, levelCap));
}

function normalizeXp(xp: number) {
  const parsedXp = Math.floor(Number(xp));

  if (!Number.isFinite(parsedXp)) {
    return 0;
  }

  return Math.max(0, parsedXp);
}

function normalizeGainedXp(gainedXp: number) {
  const parsedGainedXp = Math.floor(Number(gainedXp));

  if (!Number.isFinite(parsedGainedXp)) {
    return 0;
  }

  return Math.max(0, parsedGainedXp);
}

export function getTierByLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));

  return Math.max(1, Math.ceil(safeLevel / LEVELS_PER_TIER));
}

export function getLevelWithinTier(level: number): number {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const position = safeLevel % LEVELS_PER_TIER;

  if (position === 0) {
    return LEVELS_PER_TIER;
  }

  return position;
}

/**
 * Retorna quanto de XP é necessário para sair do nível atual
 * e chegar ao próximo nível.
 *
 * Exemplo:
 * currentLevel = 1 => XP necessário de 1 para 2.
 */
export function getXpRequiredForNextLevel(currentLevel: number): number {
  const safeLevel = normalizeLevel(currentLevel, FUTURE_LEVEL_CAP);

  if (safeLevel >= FUTURE_LEVEL_CAP) {
    return 0;
  }

  const tier = getTierByLevel(safeLevel);
  const levelWithinTier = getLevelWithinTier(safeLevel);

  const targetDays = TIER_TARGET_DAYS[tier] ?? TIER_TARGET_DAYS[10];
  const averageXpPerCombat =
    TIER_AVERAGE_XP_PER_COMBAT[tier] ?? TIER_AVERAGE_XP_PER_COMBAT[10];

  const expectedXpInTier =
    targetDays * EXPECTED_COMBATS_PER_DAY * averageXpPerCombat;

  /**
   * Pesos por posicao dentro do tier.
   * O inicio do tier sobe mais rapido; o fim segura a progressao idle.
   */
  const totalTierWeight = Object.values(LEVEL_XP_WEIGHT_BY_POSITION).reduce(
    (total, weight) => total + weight,
    0,
  );
  const levelWeight =
    LEVEL_XP_WEIGHT_BY_POSITION[levelWithinTier] ?? levelWithinTier;

  const requiredXp = Math.round(
    (expectedXpInTier * levelWeight) / totalTierWeight,
  );

  return Math.max(1, requiredXp);
}

/**
 * Retorna o XP total acumulado necessário para estar em determinado nível.
 *
 * Exemplo:
 * level 1 => 0
 * level 2 => custo do nível 1 para 2
 * level 3 => custo 1->2 + custo 2->3
 */
export function getTotalXpRequiredForLevel(level: number): number {
  const safeLevel = normalizeLevel(level, FUTURE_LEVEL_CAP);

  if (safeLevel <= 1) {
    return 0;
  }

  let totalXp = 0;

  for (let currentLevel = 1; currentLevel < safeLevel; currentLevel++) {
    totalXp += getXpRequiredForNextLevel(currentLevel);
  }

  return totalXp;
}

/**
 * Calcula qual nível o personagem teria considerando APENAS o XP total.
 *
 * Importante:
 * Esta função é útil para descobrir se o personagem subiu de nível.
 * Porém, no jogo, normalmente o nível salvo no banco não deve descer
 * caso o XP seja alterado manualmente para baixo.
 */
export function calculateLevelFromTotalXp(
  totalXp: number,
  levelCap = LAUNCH_LEVEL_CAP,
): number {
  const safeTotalXp = normalizeXp(totalXp);
  const safeLevelCap = normalizeLevel(levelCap, FUTURE_LEVEL_CAP);

  let level = 1;

  while (
    level < safeLevelCap &&
    safeTotalXp >= getTotalXpRequiredForLevel(level + 1)
  ) {
    level++;
  }

  return level;
}

function calculateProgressPercent(params: {
  totalXp: number;
  currentLevelStartXp: number;
  nextLevelRequiredXp: number | null;
}) {
  const { totalXp, currentLevelStartXp, nextLevelRequiredXp } = params;

  if (nextLevelRequiredXp === null) {
    return 100;
  }

  const xpRequiredInsideLevel = nextLevelRequiredXp - currentLevelStartXp;

  if (xpRequiredInsideLevel <= 0) {
    return 100;
  }

  const xpInsideLevel = totalXp - currentLevelStartXp;
  const percent = (xpInsideLevel / xpRequiredInsideLevel) * 100;

  return Number(Math.max(0, Math.min(100, percent)).toFixed(2));
}

function buildLevelProgressResult(params: {
  oldLevel: number;
  currentXp: number;
  gainedXp: number;
  totalXp: number;
  levelCap: number;
}): LevelProgressResult {
  const oldLevel = normalizeLevel(params.oldLevel, params.levelCap);
  const rawCurrentXp = normalizeXp(params.currentXp);
  const gainedXp = normalizeGainedXp(params.gainedXp);
  const rawTotalXp = normalizeXp(params.totalXp);
  const levelCap = normalizeLevel(params.levelCap, FUTURE_LEVEL_CAP);
  const oldLevelStartXp = getTotalXpRequiredForLevel(oldLevel);

  // Quando a curva de XP muda, personagens existentes podem ficar com
  // level salvo maior do que o XP total novo justificaria. Nao rebaixamos
  // o personagem; tratamos o XP minimo do level salvo como piso efetivo
  // para a barra voltar a progredir imediatamente.
  const currentXp = Math.max(rawCurrentXp, oldLevelStartXp);
  const totalXp = Math.max(rawTotalXp, oldLevelStartXp + gainedXp);

  /**
   * O nível calculado pelo XP pode subir.
   * Mas não deve rebaixar o personagem caso o banco esteja com level maior.
   */
  const levelByXp = calculateLevelFromTotalXp(totalXp, levelCap);
  const newLevel = Math.max(oldLevel, levelByXp);

  const currentLevelStartXp = getTotalXpRequiredForLevel(newLevel);
  const isAtLevelCap = newLevel >= levelCap;

  const nextLevelRequiredXp = isAtLevelCap
    ? null
    : getTotalXpRequiredForLevel(newLevel + 1);

  const xpIntoCurrentLevel = Math.max(0, totalXp - currentLevelStartXp);

  const xpToNextLevel =
    nextLevelRequiredXp === null
      ? Math.max(1, xpIntoCurrentLevel)
      : Math.max(1, nextLevelRequiredXp - currentLevelStartXp);

  const safeXpIntoCurrentLevel = Math.min(xpIntoCurrentLevel, xpToNextLevel);

  const xpNeededForNextLevel =
    nextLevelRequiredXp === null
      ? null
      : Math.max(0, nextLevelRequiredXp - totalXp);

  const progressPercent = calculateProgressPercent({
    totalXp,
    currentLevelStartXp,
    nextLevelRequiredXp,
  });

  const levelsGained = Math.max(0, newLevel - oldLevel);

  return {
    oldLevel,
    newLevel,

    currentXp,
    gainedXp,
    totalXp,

    leveledUp: levelsGained > 0,
    levelsGained,

    levelCap,
    isAtLevelCap,

    currentLevelStartXp,
    nextLevelRequiredXp,

    xpIntoCurrentLevel: safeXpIntoCurrentLevel,
    xpNeededForNextLevel,

    xpToNextLevel,

    currentLevelXp: safeXpIntoCurrentLevel,
    nextLevelXp: xpToNextLevel,
    xpProgressPercent: progressPercent,

    progressPercent,
  };
}

/**
 * Use quando você quer apenas montar a barra de progresso do personagem
 * com base no nível e XP atuais salvos no banco.
 *
 * Exemplo:
 * getLevelProgress(character.level, character.xp)
 */
export function getLevelProgress(
  currentLevel: number,
  currentXp: number,
  levelCap = LAUNCH_LEVEL_CAP,
): LevelProgressResult {
  const safeCurrentLevel = normalizeLevel(currentLevel, levelCap);
  const safeCurrentXp = normalizeXp(currentXp);

  return buildLevelProgressResult({
    oldLevel: safeCurrentLevel,
    currentXp: safeCurrentXp,
    gainedXp: 0,
    totalXp: safeCurrentXp,
    levelCap,
  });
}

/**
 * Use quando o personagem ganhou XP.
 *
 * Exemplo:
 * calculateLevelProgress(character.level, character.xp, finalXpReward)
 */
export function calculateLevelProgress(
  currentLevel: number,
  currentXp: number,
  gainedXp: number,
  levelCap = LAUNCH_LEVEL_CAP,
): LevelProgressResult {
  const safeCurrentLevel = normalizeLevel(currentLevel, levelCap);
  const safeCurrentXp = normalizeXp(currentXp);
  const safeGainedXp = normalizeGainedXp(gainedXp);
  const totalXp = safeCurrentXp + safeGainedXp;

  return buildLevelProgressResult({
    oldLevel: safeCurrentLevel,
    currentXp: safeCurrentXp,
    gainedXp: safeGainedXp,
    totalXp,
    levelCap,
  });
}

/**
 * Helper para montar resposta padronizada para controllers/services.
 * Use isso no CharactersService e AutoCombatService para não repetir regra.
 */
export function buildLevelProgressViewModel(
  currentLevel: number,
  currentXp: number,
  levelCap = LAUNCH_LEVEL_CAP,
) {
  const progress = getLevelProgress(currentLevel, currentXp, levelCap);

  return {
    level: progress.newLevel,

    xp: progress.totalXp,
    totalXp: progress.totalXp,
    currentXp: progress.currentLevelXp,

    currentLevelXp: progress.currentLevelXp,
    xpToNextLevel: progress.xpToNextLevel,
    nextLevelXp: progress.nextLevelXp,

    currentLevelStartXp: progress.currentLevelStartXp,
    nextLevelRequiredXp: progress.nextLevelRequiredXp,

    xpIntoCurrentLevel: progress.xpIntoCurrentLevel,
    xpNeededForNextLevel: progress.xpNeededForNextLevel,

    progressPercent: progress.progressPercent,
    xpProgressPercent: progress.xpProgressPercent,

    levelCap: progress.levelCap,
    isAtLevelCap: progress.isAtLevelCap,
  };
}
