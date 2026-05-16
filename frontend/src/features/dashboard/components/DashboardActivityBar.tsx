import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useAutoCombatRealtimeState } from "../../auto-combat/realtime/useAutoCombatRealtime";
import type {
  AutoCombatRealtimeEvent,
  AutoCombatStatusResponse,
} from "../../auto-combat/types/auto-combat.types";
import { getMobPortraitImage } from "../../auto-combat/utils/mobAssets";
import type { GatheringRealtimeState } from "../../gathering/realtime/GatheringRealtimeProvider";
import { useGatheringRealtimeState } from "../../gathering/realtime/useGatheringRealtime";
import type { IncursionsRealtimeState } from "../../incursions/realtime/IncursionsRealtimeProvider";
import {
  useIncursionsRealtimeActions,
  useIncursionsRealtimeState,
} from "../../incursions/realtime/useIncursionsRealtime";
import { getCharacterOverview } from "../api/dashboard.api";
import type {
  CharacterOverviewResponse,
  DashboardAutoCombatSessionViewModel,
  DashboardGatheringSessionViewModel,
  DashboardIncursionSessionViewModel,
} from "../types/dashboard.types";

interface DashboardActivityBarProps {
  characterId: string;
  refreshMs?: number;
}

type ActivityBarItem = {
  key: string;
  type: "auto-combat" | "gathering" | "incursion";
  icon: string;
  title: string;
  description: string;
  progressLabel: string;
  progressPercent: number;
  progressValueLabel?: string | null;
  primaryMetric: string;
  secondaryMetric: string;
  indicatorMetric?: string | null;
  indicatorLabel?: string | null;
  href: string;

  imageUrl?: string | null;
  imageAlt?: string | null;

  characterName?: string | null;
  characterLevelLabel?: string | null;
  characterHpLabel?: string | null;
  characterHpPercent?: number | null;
  characterXpLabel?: string | null;
  characterXpPercent?: number | null;

  monsterMetaLabel?: string | null;
  combatMetric?: string | null;
  killsMetric?: string | null;
  xpMetric?: string | null;
};

type AutoCombatTotalsSnapshot = {
  sessionId?: string | null;

  currentCombatIndex?: number | null;
  totalCombats?: number | null;
  totalRounds?: number | null;
  totalKills?: number | null;
  totalXpGained?: number | null;
  totalLoot?: number | null;
  potionsUsed?: number | null;
};

type AutoCombatStatusCurrentMobLike = {
  id?: string | null;
  name?: string | null;
  currentHp?: number | null;
  maxHp?: number | null;
  hp?: number | null;
  hpPercent?: number | null;
};

type AutoCombatSessionLike = {
  id?: string | null;
  characterId?: string | null;
  status?: string | null;

  currentMobId?: string | null;
  currentMobHp?: number | null;
  currentMobMaxHp?: number | null;
  currentMob?: AutoCombatStatusCurrentMobLike | null;
  currentRound?: number | null;
  currentCombatIndex?: number | null;

  totalCombatsResolved?: number | null;
  totalRoundsResolved?: number | null;

  totalCombats?: number | null;
  totalRounds?: number | null;
  totalKills?: number | null;
  totalXpGained?: number | null;
  totalLoot?: number | null;

  totalPotionsUsed?: number | null;
  potionsUsed?: number | null;
};

type AutoCombatRealtimeVisualLike = {
  lastMessage?: string | null;
  lastDamage?: number | null;
  lastEventType?: string | null;
  actor?: string | null;
  target?: string | null;
  isCritical?: boolean | null;
  isDodged?: boolean | null;
  updatedAt?: number | null;
};

type AutoCombatRealtimeCombatLike = {
  sessionId?: string | null;

  mobId?: string | null;
  mobName?: string | null;
  mobCurrentHp?: number | null;
  mobMaxHp?: number | null;
  mobHpPercent?: number | null;

  currentMob?: AutoCombatStatusCurrentMobLike | null;

  round?: number | null;
  combatIndex?: number | null;

  lastMessage?: string | null;
  message?: string | null;
};

type AutoCombatRealtimeCharacterLike = {
  id?: string | null;
  name?: string | null;

  level?: number | null;
  xp?: number | null;
  totalXp?: number | null;

  currentHp?: number | null;
  maxHp?: number | null;
  hp?: number | null;
  hpPercent?: number | null;

  currentLevelXp?: number | null;
  xpToNextLevel?: number | null;
  nextLevelXp?: number | null;
  xpProgressPercent?: number | null;

  xpIntoCurrentLevel?: number | null;
  xpNeededForNextLevel?: number | null;
  currentLevelStartXp?: number | null;
  nextLevelRequiredXp?: number | null;
  isAtLevelCap?: boolean | null;

  levelProgress?: {
    currentLevelXp?: number | null;
    xpToNextLevel?: number | null;
    nextLevelXp?: number | null;
    xpProgressPercent?: number | null;
    progressPercent?: number | null;
    xpIntoCurrentLevel?: number | null;
    xpNeededForNextLevel?: number | null;
    currentLevelStartXp?: number | null;
    nextLevelRequiredXp?: number | null;
    isAtLevelCap?: boolean | null;
    totalXp?: number | null;
    xp?: number | null;
  } | null;
};

type AutoCombatStatusLoose = AutoCombatStatusResponse & {
  active?: boolean | null;
  hasActiveAutoCombat?: boolean | null;
  message?: string | null;

  currentMob?: AutoCombatStatusCurrentMobLike | null;
  mob?: AutoCombatStatusCurrentMobLike | null;

  character?: AutoCombatRealtimeCharacterLike | null;

  session?: AutoCombatSessionLike | null;
  activeSession?: AutoCombatSessionLike | null;
  autoCombatSession?: AutoCombatSessionLike | null;
  lastSession?: AutoCombatSessionLike | null;

  subMap?: {
    name?: string | null;
    map?: {
      name?: string | null;
    } | null;
    mapName?: string | null;
  } | null;

  sessionSummary?: {
    hp?: {
      current?: number | null;
      max?: number | null;
    } | null;
    mobs?: {
      totalKills?: number | null;
    } | null;
    combat?: {
      totalCombats?: number | null;
      totalRounds?: number | null;
    } | null;
    progression?: {
      totalXpGained?: number | null;
    } | null;
    loot?: {
      totalQuantity?: number | null;
    } | null;
    potions?: {
      used?: number | null;
    } | null;
  };

  rewards?: {
    mobs?: Array<{ kills?: number | null }> | null;
    loots?: Array<{ quantity?: number | null }> | null;
  } | null;
};

type AutoCombatRealtimeStateLoose = {
  characterId?: string | null;

  status?: AutoCombatStatusResponse | null;
  autoCombatStatus?: AutoCombatStatusResponse | null;

  activeSession?: AutoCombatSessionLike | null;
  session?: AutoCombatSessionLike | null;

  mob?: AutoCombatStatusCurrentMobLike | null;
  character?: AutoCombatRealtimeCharacterLike | null;
  visual?: AutoCombatRealtimeVisualLike | null;

  combat?: AutoCombatRealtimeCombatLike | null;
  realtimeCombat?: AutoCombatRealtimeCombatLike | null;

  displayTotals?: AutoCombatTotalsSnapshot | null;
  sessionTotals?: AutoCombatTotalsSnapshot | null;
  totals?: AutoCombatTotalsSnapshot | null;
  realtimeSessionTotals?: AutoCombatTotalsSnapshot | null;

  activeEvent?: AutoCombatRealtimeEvent | null;
  displayedEvent?: AutoCombatRealtimeEvent | null;
  displayedAutoCombatEvent?: AutoCombatRealtimeEvent | null;
  currentEvent?: AutoCombatRealtimeEvent | null;
  lastProcessedEvent?: AutoCombatRealtimeEvent | null;
  lastEvent?: AutoCombatRealtimeEvent | null;

  eventQueue?: AutoCombatRealtimeEvent[];
  queue?: AutoCombatRealtimeEvent[];
  realtimeEventQueue?: AutoCombatRealtimeEvent[];
  battleLogEvents?: AutoCombatRealtimeEvent[];

  isActive?: boolean;
  hasActiveAutoCombat?: boolean;
  hasActiveSession?: boolean;

  isConnected?: boolean;
  isJoined?: boolean;
};

type GatheringMaterialLike = {
  id?: string | null;
  name?: string | null;
  tier?: number | null;
  materialOrigin?: string | null;
  requiredGatheringLevel?: number | null;
  gatheringXpPerUnit?: number | null;
  baseGatheringRatePerHour?: number | null;
  icon?: string | null;
  iconUrl?: string | null;
  imageUrl?: string | null;
  iconPath?: string | null;
};

type GatheringMapLike = {
  id?: string | null;
  name?: string | null;
  tier?: number | null;
};

type GatheringProductionPreviewLike = {
  label?: string | null;

  elapsedSeconds?: number | null;
  elapsedMinutes?: number | null;
  elapsedHours?: number | null;

  ratePerHour?: number | null;
  baseRatePerHour?: number | null;
  defaultRatePerHour?: number | null;

  estimatedQuantityToCollect?: number | null;
  readyQuantity?: number | null;

  currentProgressRemainder?: number | null;
  estimatedNewProgressRemainder?: number | null;
  progressRemainder?: number | null;

  nextUnitProgressPercent?: number | null;
  progressPercent?: number | null;

  material?: GatheringMaterialLike | null;
  targetMaterial?: GatheringMaterialLike | null;
  map?: GatheringMapLike | null;
};

type DashboardGatheringSessionLoose = DashboardGatheringSessionViewModel & {
  id?: string | null;
  status?: string | null;
  origin?: string | null;
  startedAt?: string | null;
  lastResolvedAt?: string | null;
  progressRemainder?: number | null;
  collectedQuantity?: number | null;
  collectedXp?: number | null;
  map?: GatheringMapLike | null;
  targetMaterial?: GatheringMaterialLike | null;
  productionPreview?: GatheringProductionPreviewLike | null;
};

function toSafeNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function getFirstValidNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function clampPercent(value: unknown) {
  const parsed = toSafeNumber(value, 0);

  return Math.max(0, Math.min(100, parsed));
}

function floorPercent(value: unknown) {
  return Math.floor(clampPercent(value));
}

function calculateHpPercent(currentHp?: number | null, maxHp?: number | null) {
  const safeMaxHp = toSafeNumber(maxHp, 0);

  if (safeMaxHp <= 0) {
    return 0;
  }

  const safeCurrentHp = Math.max(
    0,
    Math.min(toSafeNumber(currentHp, 0), safeMaxHp),
  );

  return clampPercent((safeCurrentHp / safeMaxHp) * 100);
}

function normalizeStatus(status?: string | null) {
  return String(status ?? "")
    .trim()
    .toUpperCase();
}

function isActiveStatus(status?: string | null) {
  return normalizeStatus(status) === "ACTIVE";
}

function isTerminalStatus(status?: string | null) {
  const normalizedStatus = normalizeStatus(status);

  return (
    normalizedStatus === "FINISHED" ||
    normalizedStatus === "STOPPED" ||
    normalizedStatus === "DEFEATED" ||
    normalizedStatus === "FAILED" ||
    normalizedStatus === "CLAIMED" ||
    normalizedStatus === "CANCELLED"
  );
}

function formatOrigin(origin?: string | null) {
  if (!origin) return "Expedição";

  const labels: Record<string, string> = {
    DESMANCHE: "Desmanche",
    COLETA: "Coleta",
    PATRULHA: "Patrulha",
    ARSENAL: "Arsenal",
    TECNOVARREDURA: "Tecnovarredura",
    CONTENCAO: "Contenção",
    CONTENÇÃO: "Contenção",
    DROP_MOBS: "Saque de monstros",
  };

  return labels[origin] ?? origin;
}

function getGatheringOriginSlug(origin?: string | null) {
  const normalizedOrigin = normalizeStatus(origin);

  const slugs: Record<string, string> = {
    DESMANCHE: "desmanche",
    COLETA: "coleta",
    PATRULHA: "patrulha",
    ARSENAL: "arsenal",
    TECNOVARREDURA: "tecnovarredura",
    CONTENCAO: "contencao",
    CONTENÇÃO: "contencao",
  };

  return slugs[normalizedOrigin] ?? "gathering";
}

function formatCurrentCombatLabel(value: unknown) {
  const amount = Math.max(1, Math.floor(toSafeNumber(value, 1)));

  return `Combate ${amount}`;
}

function formatKillCount(value: unknown) {
  const amount = Math.max(0, Math.floor(toSafeNumber(value, 0)));

  return `${amount} ${amount === 1 ? "monstro morto" : "monstros mortos"}`;
}

function formatXp(value: unknown) {
  const amount = Math.max(0, Math.floor(toSafeNumber(value, 0)));

  return `${amount} XP`;
}

function formatCompactNumber(value: unknown) {
  const amount = Math.max(0, Math.floor(toSafeNumber(value, 0)));

  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(amount >= 10000000 ? 0 : 1)}M`;
  }

  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`;
  }

  return String(amount);
}

function formatSessionCountIndicator(value: unknown) {
  const amount = Math.max(0, Math.floor(toSafeNumber(value, 0)));

  return amount.toLocaleString("pt-BR");
}

function formatMonsterCounter(value: unknown) {
  const amount = Math.max(0, Math.floor(toSafeNumber(value, 0)));
  const formattedAmount = amount.toLocaleString("pt-BR");

  return `${formattedAmount} ${amount === 1 ? "monstro" : "monstros"}`;
}

function formatPercentLabel(value: unknown) {
  return `${Math.round(clampPercent(value))}%`;
}

function formatGatheringCollectedQuantity(value: unknown) {
  const amount = Math.max(0, Math.floor(toSafeNumber(value, 0)));

  if (amount === 1) {
    return "1 coletado";
  }

  return `${formatCompactNumber(amount)} coletados`;
}

function formatGatheringRate(value: unknown) {
  const rate = getFirstValidNumber(value);

  if (rate === undefined || rate <= 0) {
    return "—/h";
  }

  const roundedRate = Number.isInteger(rate) ? rate : Number(rate.toFixed(1));

  return `${roundedRate}/h`;
}

function formatGatheringSecondaryMetric(params: {
  collectedQuantity: number;
  collectedXp?: number | null;
  ratePerHour?: number | null;
}) {
  const collectedLabel = formatGatheringCollectedQuantity(
    params.collectedQuantity,
  );

  const collectedXp = Math.max(
    0,
    Math.floor(toSafeNumber(params.collectedXp, 0)),
  );

  if (collectedXp > 0) {
    return `${collectedLabel} • ${formatXp(collectedXp)}`;
  }

  return `${collectedLabel} • ${formatGatheringRate(params.ratePerHour)}`;
}

function getParsedDateMs(value?: string | null) {
  if (!value) return null;

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function clampFraction(value: unknown) {
  const parsed = toSafeNumber(value, 0);

  return Math.max(0, Math.min(0.9999, parsed));
}

function getActivityMobPortraitUrl(mobName?: string | null) {
  if (!mobName || mobName === "Combate automático") {
    return null;
  }

  return getMobPortraitImage(mobName) ?? null;
}

function getGatheringMaterialIconUrl(material?: GatheringMaterialLike | null) {
  if (!material) return null;

  const possibleIcon =
    material.iconUrl ?? material.imageUrl ?? material.iconPath ?? material.icon;

  if (typeof possibleIcon !== "string") {
    return null;
  }

  const trimmedIcon = possibleIcon.trim();

  return trimmedIcon.length > 0 ? trimmedIcon : null;
}

function formatCharacterHpLabel(
  currentHp?: number | null,
  maxHp?: number | null,
) {
  const safeCurrentHp = getFirstValidNumber(currentHp);
  const safeMaxHp = getFirstValidNumber(maxHp);

  if (
    safeCurrentHp === undefined ||
    safeMaxHp === undefined ||
    safeMaxHp <= 0
  ) {
    return "HP —";
  }

  return `HP ${Math.max(0, Math.floor(safeCurrentHp))}/${Math.max(
    1,
    Math.floor(safeMaxHp),
  )}`;
}

function buildMonsterHpSnapshot(params: {
  event?: AutoCombatRealtimeEvent | null;
  realtimeCombat?: AutoCombatRealtimeCombatLike | null;
  statusMob?: AutoCombatStatusCurrentMobLike | null;
  session?: AutoCombatSessionLike | null;
}) {
  const { event, realtimeCombat, statusMob, session } = params;

  const maxHp = getFirstValidNumber(
    event?.mobMaxHp,
    realtimeCombat?.mobMaxHp,
    realtimeCombat?.currentMob?.maxHp,
    statusMob?.maxHp,
    session?.currentMobMaxHp,
    session?.currentMob?.maxHp,
    statusMob?.hp,
    session?.currentMob?.hp,
  );

  const currentHp = getFirstValidNumber(
    event?.mobCurrentHp,
    realtimeCombat?.mobCurrentHp,
    realtimeCombat?.currentMob?.currentHp,
    statusMob?.currentHp,
    session?.currentMobHp,
    session?.currentMob?.currentHp,
    maxHp,
  );

  const hpPercent =
    currentHp !== undefined && maxHp !== undefined && maxHp > 0
      ? calculateHpPercent(currentHp, maxHp)
      : clampPercent(
          getFirstValidNumber(
            event?.mobHpPercent,
            realtimeCombat?.mobHpPercent,
            realtimeCombat?.currentMob?.hpPercent,
            statusMob?.hpPercent,
            session?.currentMob?.hpPercent,
            100,
          ),
        );

  const safeMaxHp = maxHp !== undefined ? Math.max(1, Math.floor(maxHp)) : null;
  const safeCurrentHp =
    currentHp !== undefined && safeMaxHp !== null
      ? Math.max(0, Math.min(Math.floor(currentHp), safeMaxHp))
      : null;

  return {
    currentHp: safeCurrentHp,
    maxHp: safeMaxHp,
    hpPercent,
    label:
      safeCurrentHp !== null && safeMaxHp !== null
        ? `${safeCurrentHp}/${safeMaxHp} HP`
        : `${formatPercentLabel(hpPercent)} HP`,
  };
}

function getLooseStatus(status: AutoCombatStatusResponse | null) {
  return status as AutoCombatStatusLoose | null;
}

function getStatusCharacter(status: AutoCombatStatusResponse | null) {
  return getLooseStatus(status)?.character ?? null;
}

function getOverviewCharacter(overview: CharacterOverviewResponse | null) {
  return (overview?.character ??
    null) as AutoCombatRealtimeCharacterLike | null;
}

function getAutoCombatSessionFromStatus(
  status: AutoCombatStatusResponse | null,
) {
  const looseStatus = getLooseStatus(status);

  return (
    looseStatus?.session ??
    looseStatus?.activeSession ??
    looseStatus?.autoCombatSession ??
    looseStatus?.lastSession ??
    null
  );
}

function getStatusCurrentMob(status: AutoCombatStatusResponse | null) {
  const looseStatus = getLooseStatus(status);

  return looseStatus?.currentMob ?? looseStatus?.mob ?? null;
}

function getStatusLocationLabel(status: AutoCombatStatusResponse | null) {
  const subMap = getLooseStatus(status)?.subMap ?? null;
  const subMapName = subMap?.name;
  const mapName = subMap?.map?.name ?? subMap?.mapName;

  if (mapName && subMapName) {
    return `${mapName} • ${subMapName}`;
  }

  return subMapName ?? mapName ?? "Combate em andamento";
}

function isSameSessionScope(
  currentSessionId?: string | null,
  candidateSessionId?: string | null,
) {
  if (!currentSessionId) {
    return true;
  }

  return Boolean(candidateSessionId && candidateSessionId === currentSessionId);
}

function filterRealtimeEventBySession(
  event: AutoCombatRealtimeEvent | null,
  sessionId?: string | null,
) {
  if (!event) return null;

  return isSameSessionScope(sessionId, event.sessionId) ? event : null;
}

function filterRealtimeCombatBySession(
  realtimeCombat: AutoCombatRealtimeCombatLike | null,
  sessionId?: string | null,
) {
  if (!realtimeCombat) return null;

  return isSameSessionScope(sessionId, realtimeCombat.sessionId)
    ? realtimeCombat
    : null;
}

function filterTotalsBySession(
  totals: AutoCombatTotalsSnapshot | null,
  sessionId?: string | null,
) {
  if (!totals) return null;

  return isSameSessionScope(sessionId, totals.sessionId) ? totals : null;
}

function shouldUseRealtimeEvent(
  characterId: string,
  event: AutoCombatRealtimeEvent | null,
) {
  if (!event) return false;

  return !event.characterId || event.characterId === characterId;
}

function buildCharacterXpSnapshot(
  character: AutoCombatRealtimeCharacterLike | null,
) {
  if (!character) {
    return {
      label: "EXP —",
      percent: 0,
    };
  }

  const levelProgress = character.levelProgress ?? null;

  const currentLevelStartXp = getFirstValidNumber(
    character.currentLevelStartXp,
    levelProgress?.currentLevelStartXp,
  );

  const nextLevelRequiredXp = getFirstValidNumber(
    character.nextLevelRequiredXp,
    levelProgress?.nextLevelRequiredXp,
  );

  const totalXp = getFirstValidNumber(
    character.totalXp,
    levelProgress?.totalXp,
    levelProgress?.xp,
    character.xp,
  );

  const explicitCurrentXp = getFirstValidNumber(
    character.currentLevelXp,
    character.xpIntoCurrentLevel,
    levelProgress?.currentLevelXp,
    levelProgress?.xpIntoCurrentLevel,
  );

  const explicitNextXp = getFirstValidNumber(
    character.xpToNextLevel,
    character.nextLevelXp,
    levelProgress?.xpToNextLevel,
    levelProgress?.nextLevelXp,
  );

  const explicitPercent = getFirstValidNumber(
    character.xpProgressPercent,
    levelProgress?.xpProgressPercent,
    levelProgress?.progressPercent,
  );

  const isAtLevelCap = Boolean(
    character.isAtLevelCap ?? levelProgress?.isAtLevelCap,
  );

  if (isAtLevelCap) {
    return {
      label: "EXP máx.",
      percent: 100,
    };
  }

  if (
    totalXp !== undefined &&
    currentLevelStartXp !== undefined &&
    nextLevelRequiredXp !== undefined &&
    nextLevelRequiredXp > currentLevelStartXp
  ) {
    const currentXp = Math.max(0, Math.floor(totalXp - currentLevelStartXp));
    const xpToNextLevel = Math.max(
      1,
      Math.floor(nextLevelRequiredXp - currentLevelStartXp),
    );

    return {
      label: `EXP ${formatCompactNumber(currentXp)}/${formatCompactNumber(xpToNextLevel)}`,
      percent: calculateHpPercent(currentXp, xpToNextLevel),
    };
  }

  if (
    explicitCurrentXp !== undefined &&
    explicitNextXp !== undefined &&
    explicitNextXp > 0
  ) {
    return {
      label: `EXP ${formatCompactNumber(explicitCurrentXp)}/${formatCompactNumber(explicitNextXp)}`,
      percent: calculateHpPercent(explicitCurrentXp, explicitNextXp),
    };
  }

  if (explicitPercent !== undefined) {
    return {
      label:
        totalXp !== undefined ? `EXP ${formatCompactNumber(totalXp)}` : "EXP",
      percent: clampPercent(explicitPercent),
    };
  }

  if (totalXp !== undefined) {
    return {
      label: `EXP ${formatCompactNumber(totalXp)}`,
      percent: 0,
    };
  }

  return {
    label: "EXP —",
    percent: 0,
  };
}

function buildCharacterActivitySnapshot(params: {
  realtimeState: AutoCombatRealtimeStateLoose;
  status: AutoCombatStatusResponse | null;
  overview: CharacterOverviewResponse | null;
}) {
  const { realtimeState, status, overview } = params;

  const looseStatus = getLooseStatus(status);
  const realtimeCharacter = realtimeState.character ?? null;
  const statusCharacter = getStatusCharacter(status);
  const overviewCharacter = getOverviewCharacter(overview);
  const statusHp = looseStatus?.sessionSummary?.hp ?? null;

  const name =
    realtimeCharacter?.name ??
    statusCharacter?.name ??
    overviewCharacter?.name ??
    "Personagem";

  const level = getFirstValidNumber(
    realtimeCharacter?.level,
    statusCharacter?.level,
    overviewCharacter?.level,
    1,
  );

  const currentHp = getFirstValidNumber(
    realtimeCharacter?.currentHp,
    statusCharacter?.currentHp,
    statusHp?.current,
    overviewCharacter?.currentHp,
    overviewCharacter?.hp,
  );

  const maxHp = getFirstValidNumber(
    realtimeCharacter?.maxHp,
    statusCharacter?.maxHp,
    statusHp?.max,
    overviewCharacter?.maxHp,
  );

  const hpPercent =
    currentHp !== undefined && maxHp !== undefined && maxHp > 0
      ? calculateHpPercent(currentHp, maxHp)
      : clampPercent(
          getFirstValidNumber(
            realtimeCharacter?.hpPercent,
            statusCharacter?.hpPercent,
            overviewCharacter?.hpPercent,
            0,
          ),
        );

  const xpSource: AutoCombatRealtimeCharacterLike = {
    ...(overviewCharacter ?? {}),
    ...(statusCharacter ?? {}),
    ...(realtimeCharacter ?? {}),
  };

  const xpSnapshot = buildCharacterXpSnapshot(xpSource);

  return {
    name,
    levelLabel: `Nv. ${Math.max(1, Math.floor(level ?? 1))}`,
    hpLabel: formatCharacterHpLabel(currentHp, maxHp),
    hpPercent,
    hpPercentLabel: formatPercentLabel(hpPercent),
    xpLabel: xpSnapshot.label,
    xpPercent: xpSnapshot.percent,
  };
}

function resolveCurrentCombatIndex(params: {
  visualTotals?: AutoCombatTotalsSnapshot | null;
  session?: AutoCombatSessionLike | null;
  totalKills?: number | null;
}) {
  const { visualTotals, session, totalKills } = params;

  const fallbackFromKills =
    totalKills !== null && totalKills !== undefined
      ? Math.max(1, totalKills + 1)
      : undefined;

  const currentCombatIndex = getFirstValidNumber(
    visualTotals?.currentCombatIndex,
    fallbackFromKills,
    session?.currentCombatIndex,
    1,
  );

  return Math.max(1, Math.floor(currentCombatIndex ?? 1));
}

function getRealtimeStatus(state: AutoCombatRealtimeStateLoose) {
  return state.status ?? state.autoCombatStatus ?? null;
}

function getRealtimeSession(
  state: AutoCombatRealtimeStateLoose,
  status: AutoCombatStatusResponse | null,
): AutoCombatSessionLike | null {
  return (
    state.activeSession ??
    state.session ??
    getAutoCombatSessionFromStatus(status) ??
    null
  );
}

function getRealtimeCombat(
  state: AutoCombatRealtimeStateLoose,
): AutoCombatRealtimeCombatLike | null {
  if (state.combat || state.realtimeCombat) {
    return state.combat ?? state.realtimeCombat ?? null;
  }

  const mob = state.mob ?? null;
  const visual = state.visual ?? null;
  const status = getRealtimeStatus(state);
  const session = getRealtimeSession(state, status);

  if (!mob && !visual && !session) {
    return null;
  }

  return {
    sessionId: session?.id ?? null,

    mobId: mob?.id ?? null,
    mobName: mob?.name ?? null,
    mobCurrentHp:
      mob?.currentHp ??
      session?.currentMobHp ??
      session?.currentMob?.currentHp ??
      null,
    mobMaxHp:
      mob?.maxHp ??
      session?.currentMobMaxHp ??
      session?.currentMob?.maxHp ??
      mob?.hp ??
      session?.currentMob?.hp ??
      null,
    mobHpPercent: mob?.hpPercent ?? session?.currentMob?.hpPercent ?? null,

    currentMob: mob ?? session?.currentMob ?? null,

    round: session?.currentRound ?? null,
    combatIndex: session?.currentCombatIndex ?? null,

    lastMessage: visual?.lastMessage ?? null,
    message: visual?.lastMessage ?? null,
  };
}

function getRealtimeDisplayedEvent(
  state: AutoCombatRealtimeStateLoose,
  characterId: string,
  sessionId?: string | null,
) {
  const directEvents = [
    state.activeEvent,
    state.displayedEvent,
    state.displayedAutoCombatEvent,
    state.currentEvent,
    state.lastProcessedEvent,
    state.lastEvent,
  ];

  for (const event of directEvents) {
    if (
      event &&
      shouldUseRealtimeEvent(characterId, event) &&
      isSameSessionScope(sessionId, event.sessionId)
    ) {
      return event;
    }
  }

  const logEvents = state.battleLogEvents ?? [];

  for (const event of logEvents) {
    if (
      event &&
      shouldUseRealtimeEvent(characterId, event) &&
      isSameSessionScope(sessionId, event.sessionId)
    ) {
      return event;
    }
  }

  return null;
}

function buildTotalsFromStatusFallback(params: {
  status: AutoCombatStatusResponse | null;
  session: AutoCombatSessionLike | null;
}): AutoCombatTotalsSnapshot | null {
  const { status, session } = params;
  const looseStatus = getLooseStatus(status);

  if (!looseStatus && !session) {
    return null;
  }

  const rewardsKillsTotal = looseStatus?.rewards?.mobs?.reduce((total, mob) => {
    return total + toSafeNumber(mob.kills, 0);
  }, 0);

  const rewardsLootTotal = looseStatus?.rewards?.loots?.reduce(
    (total, loot) => {
      return total + toSafeNumber(loot.quantity, 0);
    },
    0,
  );

  const totalKills =
    getFirstValidNumber(
      looseStatus?.sessionSummary?.mobs?.totalKills,
      session?.totalCombatsResolved,
      session?.totalKills,
      rewardsKillsTotal,
      0,
    ) ?? 0;

  const totalCombats =
    getFirstValidNumber(
      looseStatus?.sessionSummary?.combat?.totalCombats,
      session?.totalCombatsResolved,
      session?.totalCombats,
      totalKills,
      0,
    ) ?? 0;

  const totalRounds =
    getFirstValidNumber(
      looseStatus?.sessionSummary?.combat?.totalRounds,
      session?.totalRoundsResolved,
      session?.totalRounds,
      0,
    ) ?? 0;

  const totalXpGained =
    getFirstValidNumber(
      looseStatus?.sessionSummary?.progression?.totalXpGained,
      session?.totalXpGained,
      0,
    ) ?? 0;

  const totalLoot =
    getFirstValidNumber(
      looseStatus?.sessionSummary?.loot?.totalQuantity,
      session?.totalLoot,
      rewardsLootTotal,
      0,
    ) ?? 0;

  const potionsUsed =
    getFirstValidNumber(
      looseStatus?.sessionSummary?.potions?.used,
      session?.totalPotionsUsed,
      session?.potionsUsed,
      0,
    ) ?? 0;

  const currentCombatIndex =
    getFirstValidNumber(session?.currentCombatIndex, totalKills + 1, 1) ?? 1;

  return {
    sessionId: session?.id ?? null,
    currentCombatIndex: Math.max(1, Math.floor(currentCombatIndex)),
    totalCombats: Math.max(0, Math.floor(totalCombats)),
    totalRounds: Math.max(0, Math.floor(totalRounds)),
    totalKills: Math.max(0, Math.floor(totalKills)),
    totalXpGained: Math.max(0, Math.floor(totalXpGained)),
    totalLoot: Math.max(0, Math.floor(totalLoot)),
    potionsUsed: Math.max(0, Math.floor(potionsUsed)),
  };
}

function getVisualTotalsForRealtime(params: {
  realtimeState: AutoCombatRealtimeStateLoose;
  status: AutoCombatStatusResponse | null;
  session: AutoCombatSessionLike | null;
}): AutoCombatTotalsSnapshot | null {
  const { realtimeState, status, session } = params;
  const sessionId = session?.id ?? null;

  const displayTotals = filterTotalsBySession(
    realtimeState.displayTotals ?? null,
    sessionId,
  );

  if (displayTotals) {
    return displayTotals;
  }

  const legacyVisualTotals = filterTotalsBySession(
    realtimeState.sessionTotals ?? realtimeState.realtimeSessionTotals ?? null,
    sessionId,
  );

  if (legacyVisualTotals) {
    return legacyVisualTotals;
  }

  return buildTotalsFromStatusFallback({ status, session });
}

function buildAutoCombatTotalsFromOverview(
  session: DashboardAutoCombatSessionViewModel | null | undefined,
): AutoCombatTotalsSnapshot | null {
  if (!session) {
    return null;
  }

  const looseSession = session as DashboardAutoCombatSessionViewModel &
    AutoCombatSessionLike & {
      id?: string | null;
      totalKills?: number | null;
      totalLoot?: number | null;
      mobSummaries?: Array<{ kills?: number | null }> | null;
      mobSummary?: Array<{ kills?: number | null }> | null;
      combatPreview?: {
        totals?: {
          kills?: number | null;
          totalKills?: number | null;
          combatsResolved?: number | null;
          roundsResolved?: number | null;
          xpGained?: number | null;
        } | null;
      } | null;
    };

  const overviewMobKillsTotal = (
    looseSession.mobSummaries ??
    looseSession.mobSummary ??
    []
  ).reduce((total, summary) => {
    return total + toSafeNumber(summary.kills, 0);
  }, 0);

  const totalKills =
    getFirstValidNumber(
      looseSession.totalKills,
      looseSession.combatPreview?.totals?.totalKills,
      looseSession.combatPreview?.totals?.kills,
      overviewMobKillsTotal,
      looseSession.totalCombatsResolved,
      looseSession.combatPreview?.totals?.combatsResolved,
      0,
    ) ?? 0;

  const totalCombats =
    getFirstValidNumber(
      looseSession.totalCombatsResolved,
      looseSession.totalCombats,
      looseSession.combatPreview?.totals?.combatsResolved,
      totalKills,
      0,
    ) ?? 0;

  const totalRounds =
    getFirstValidNumber(
      looseSession.totalRoundsResolved,
      looseSession.totalRounds,
      looseSession.combatPreview?.totals?.roundsResolved,
      0,
    ) ?? 0;

  const totalXpGained =
    getFirstValidNumber(
      looseSession.totalXpGained,
      looseSession.combatPreview?.totals?.xpGained,
      0,
    ) ?? 0;

  const totalLoot = getFirstValidNumber(looseSession.totalLoot, 0) ?? 0;

  const potionsUsed =
    getFirstValidNumber(
      looseSession.totalPotionsUsed,
      looseSession.potionsUsed,
      0,
    ) ?? 0;

  const totals: AutoCombatTotalsSnapshot = {
    sessionId: looseSession.id ?? null,
    totalCombats: Math.max(0, Math.floor(totalCombats)),
    totalRounds: Math.max(0, Math.floor(totalRounds)),
    totalKills: Math.max(0, Math.floor(totalKills)),
    totalXpGained: Math.max(0, Math.floor(totalXpGained)),
    totalLoot: Math.max(0, Math.floor(totalLoot)),
    potionsUsed: Math.max(0, Math.floor(potionsUsed)),
  };

  return {
    ...totals,
    currentCombatIndex: resolveCurrentCombatIndex({
      visualTotals: totals,
      session: looseSession,
      totalKills,
    }),
  };
}

function buildAutoCombatItemFromRealtime(params: {
  characterId: string;
  overview: CharacterOverviewResponse | null;
  realtimeState: AutoCombatRealtimeStateLoose;
}): ActivityBarItem | null {
  const { characterId, overview, realtimeState } = params;

  const status = getRealtimeStatus(realtimeState);
  const looseStatus = getLooseStatus(status);
  const session = getRealtimeSession(realtimeState, status);

  if (!session) {
    return null;
  }

  const sessionIsActive = isActiveStatus(session.status);
  const sessionIsTerminal = isTerminalStatus(session.status);

  const hasActiveAutoCombat =
    sessionIsActive ||
    (!sessionIsTerminal &&
      (Boolean(realtimeState.isActive) ||
        Boolean(realtimeState.hasActiveAutoCombat) ||
        Boolean(realtimeState.hasActiveSession) ||
        Boolean(looseStatus?.active) ||
        Boolean(looseStatus?.hasActiveAutoCombat)));

  if (!hasActiveAutoCombat || sessionIsTerminal) {
    return null;
  }

  const sessionId = session.id ?? null;

  const visualTotals = getVisualTotalsForRealtime({
    realtimeState,
    status,
    session,
  });

  const rawRealtimeCombat = getRealtimeCombat(realtimeState);
  const rawDisplayedEvent = getRealtimeDisplayedEvent(
    realtimeState,
    characterId,
    sessionId,
  );

  const displayedEvent = filterRealtimeEventBySession(
    rawDisplayedEvent,
    sessionId,
  );

  const realtimeCombat = filterRealtimeCombatBySession(
    rawRealtimeCombat,
    sessionId,
  );

  const statusCurrentMob =
    getStatusCurrentMob(status) ??
    realtimeCombat?.currentMob ??
    realtimeState.mob ??
    session.currentMob ??
    null;

  const locationLabel = getStatusLocationLabel(status);

  const mobName =
    displayedEvent?.mobName ??
    realtimeCombat?.mobName ??
    statusCurrentMob?.name ??
    "Combate automático";

  const monsterHp = buildMonsterHpSnapshot({
    event: displayedEvent,
    realtimeCombat,
    statusMob: statusCurrentMob,
    session,
  });

  const totalKills = visualTotals?.totalKills ?? 0;
  const totalXpGained = visualTotals?.totalXpGained ?? 0;

  const currentCombatIndex = resolveCurrentCombatIndex({
    visualTotals,
    session,
    totalKills,
  });

  const description =
    displayedEvent?.message ??
    realtimeCombat?.lastMessage ??
    realtimeCombat?.message ??
    looseStatus?.message ??
    locationLabel;

  const playerSnapshot = buildCharacterActivitySnapshot({
    realtimeState,
    status,
    overview,
  });

  return {
    key: `auto-combat-${session.id ?? "active"}`,
    type: "auto-combat",
    icon: "⚔",
    title: mobName,
    description,
    progressLabel: "HP do monstro",
    progressPercent: monsterHp.hpPercent,
    progressValueLabel: monsterHp.label,
    primaryMetric: formatCurrentCombatLabel(currentCombatIndex),
    secondaryMetric: `${formatKillCount(totalKills)} • ${formatXp(totalXpGained)}`,
    indicatorMetric: formatMonsterCounter(totalKills),
    indicatorLabel: `Monstros mortos na sessão: ${formatSessionCountIndicator(totalKills)}`,
    href: `/dashboard/${characterId}/auto-combat`,

    imageUrl: getActivityMobPortraitUrl(mobName),
    imageAlt: mobName,

    characterName: playerSnapshot.name,
    characterLevelLabel: playerSnapshot.levelLabel,
    characterHpLabel: playerSnapshot.hpLabel,
    characterHpPercent: playerSnapshot.hpPercent,
    characterXpLabel: playerSnapshot.xpLabel,
    characterXpPercent: playerSnapshot.xpPercent,

    monsterMetaLabel: locationLabel,
    combatMetric: formatCurrentCombatLabel(currentCombatIndex),
    killsMetric: formatKillCount(totalKills),
    xpMetric: formatXp(totalXpGained),
  };
}

function buildAutoCombatItemFromOverview(params: {
  characterId: string;
  overview: CharacterOverviewResponse | null;
  session: DashboardAutoCombatSessionViewModel;
}): ActivityBarItem {
  const { characterId, overview } = params;

  const session = params.session as DashboardAutoCombatSessionViewModel &
    AutoCombatSessionLike & {
      id?: string;
      status?: string | null;

      currentMob?: AutoCombatStatusCurrentMobLike | null;

      subMap?: {
        name?: string | null;
        map?: {
          name?: string | null;
        } | null;
        mapName?: string | null;
      } | null;

      combatPreview?: {
        label?: string | null;
        currentMob?: AutoCombatStatusCurrentMobLike | null;
        currentMobHp?: number | null;
        currentMobMaxHp?: number | null;
        totals?: {
          kills?: number | null;
          totalKills?: number | null;
          combatsResolved?: number | null;
          roundsResolved?: number | null;
          xpGained?: number | null;
        } | null;
      } | null;
    };

  const visualTotals = buildAutoCombatTotalsFromOverview(session);
  const previewCurrentMob = session.combatPreview?.currentMob;
  const currentMob = session.currentMob ?? previewCurrentMob ?? null;
  const monsterHp = buildMonsterHpSnapshot({
    statusMob: currentMob,
    session,
  });

  const subMapName = session.subMap?.name;
  const mapName = session.subMap?.map?.name ?? session.subMap?.mapName;

  const locationLabel =
    mapName && subMapName
      ? `${mapName} • ${subMapName}`
      : (subMapName ?? mapName ?? "Combate em andamento");

  const totalKills = visualTotals?.totalKills ?? 0;
  const totalXpGained = visualTotals?.totalXpGained ?? 0;

  const currentCombatIndex = resolveCurrentCombatIndex({
    visualTotals,
    session,
    totalKills,
  });

  const playerSnapshot = buildCharacterActivitySnapshot({
    realtimeState: {},
    status: null,
    overview,
  });

  return {
    key: `auto-combat-${session.id ?? "active"}`,
    type: "auto-combat",
    icon: "⚔",
    title: currentMob?.name ?? "Combate automático",
    description: session.combatPreview?.label ?? locationLabel,
    progressLabel: "HP do monstro",
    progressPercent: monsterHp.hpPercent,
    progressValueLabel: monsterHp.label,
    primaryMetric: formatCurrentCombatLabel(currentCombatIndex),
    secondaryMetric: `${formatKillCount(totalKills)} • ${formatXp(totalXpGained)}`,
    indicatorMetric: formatMonsterCounter(totalKills),
    indicatorLabel: `Monstros mortos na sessão: ${formatSessionCountIndicator(totalKills)}`,
    href: `/dashboard/${characterId}/auto-combat`,

    imageUrl: getActivityMobPortraitUrl(currentMob?.name),
    imageAlt: currentMob?.name ?? "Combate automático",

    characterName: playerSnapshot.name,
    characterLevelLabel: playerSnapshot.levelLabel,
    characterHpLabel: playerSnapshot.hpLabel,
    characterHpPercent: playerSnapshot.hpPercent,
    characterXpLabel: playerSnapshot.xpLabel,
    characterXpPercent: playerSnapshot.xpPercent,

    monsterMetaLabel: locationLabel,
    combatMetric: formatCurrentCombatLabel(currentCombatIndex),
    killsMetric: formatKillCount(totalKills),
    xpMetric: formatXp(totalXpGained),
  };
}

function buildGatheringProductionSnapshot(params: {
  session: DashboardGatheringSessionLoose;
  nowMs: number;
}) {
  const { session, nowMs } = params;
  const preview = session.productionPreview ?? null;
  const material =
    session.targetMaterial ??
    preview?.targetMaterial ??
    preview?.material ??
    null;

  const ratePerHour =
    getFirstValidNumber(
      preview?.ratePerHour,
      preview?.baseRatePerHour,
      preview?.defaultRatePerHour,
      material?.baseGatheringRatePerHour,
      0,
    ) ?? 0;

  const lastResolvedAtMs = getParsedDateMs(session.lastResolvedAt);

  if (lastResolvedAtMs !== null && ratePerHour > 0) {
    const baseRemainder = clampFraction(
      getFirstValidNumber(
        preview?.currentProgressRemainder,
        session.progressRemainder,
        0,
      ),
    );

    const elapsedSeconds = Math.max(0, (nowMs - lastResolvedAtMs) / 1000);
    const producedSinceLastResolve = (elapsedSeconds * ratePerHour) / 3600;
    const totalProgress = Math.max(0, baseRemainder + producedSinceLastResolve);

    const readyQuantity = Math.max(0, Math.floor(totalProgress));
    const progressRemainder = clampFraction(totalProgress - readyQuantity);

    return {
      readyQuantity,
      progressPercent: clampPercent(progressRemainder * 100),
      ratePerHour,
    };
  }

  const readyQuantity =
    getFirstValidNumber(
      preview?.estimatedQuantityToCollect,
      preview?.readyQuantity,
      0,
    ) ?? 0;

  const progressRemainder = getFirstValidNumber(
    preview?.estimatedNewProgressRemainder,
    preview?.currentProgressRemainder,
    preview?.progressRemainder,
    session.progressRemainder,
  );

  const progressPercent =
    getFirstValidNumber(
      preview?.nextUnitProgressPercent,
      preview?.progressPercent,
      progressRemainder !== undefined ? progressRemainder * 100 : undefined,
      0,
    ) ?? 0;

  return {
    readyQuantity: Math.max(0, Math.floor(readyQuantity)),
    progressPercent: clampPercent(progressPercent),
    ratePerHour,
  };
}

function buildGatheringItemFromRealtime(params: {
  characterId: string;
  gatheringState: GatheringRealtimeState;
}): ActivityBarItem | null {
  const { characterId, gatheringState } = params;

  if (!gatheringState.isActive || !gatheringState.session) {
    return null;
  }

  const session = gatheringState.session as DashboardGatheringSessionLoose;
  const preview =
    (gatheringState.productionPreview as GatheringProductionPreviewLike | null) ??
    session.productionPreview ??
    null;

  const material =
    (gatheringState.targetMaterial as GatheringMaterialLike | null) ??
    session.targetMaterial ??
    preview?.targetMaterial ??
    preview?.material ??
    null;

  const originLabel = formatOrigin(session.origin);
  const originSlug = getGatheringOriginSlug(session.origin);

  const materialName = material?.name ?? "Material em coleta";
  const mapName = session.map?.name ?? preview?.map?.name ?? "Mapa atual";

  const progressPercent = clampPercent(
    gatheringState.liveProduction.progressPercent,
  );

  const progressPercentLabel = floorPercent(progressPercent);

  const gatheringStateWithTotals = gatheringState as GatheringRealtimeState & {
    collectedQuantity?: number | null;
    collectedXp?: number | null;
  };

  const collectedQuantity = Math.max(
    0,
    Math.floor(
      getFirstValidNumber(
        gatheringStateWithTotals.collectedQuantity,
        session.collectedQuantity,
        0,
      ) ?? 0,
    ),
  );

  const collectedXp = Math.max(
    0,
    Math.floor(
      getFirstValidNumber(
        gatheringStateWithTotals.collectedXp,
        session.collectedXp,
        0,
      ) ?? 0,
    ),
  );

  const ratePerHour = gatheringState.liveProduction.ratePerHour ?? null;

  const href =
    originSlug === "gathering"
      ? `/dashboard/${characterId}/gathering`
      : `/dashboard/${characterId}/gathering/${originSlug}`;

  return {
    key: `gathering-${session.id ?? "active"}`,
    type: "gathering",
    icon: "⛏",
    title: materialName,
    description:
      preview?.label ??
      `${originLabel} em ${mapName}. Produzindo ${materialName}.`,
    progressLabel: "Próxima unidade",
    progressPercent,
    progressValueLabel: `${progressPercentLabel}%`,
    primaryMetric: `${progressPercentLabel}%`,
    secondaryMetric: formatGatheringSecondaryMetric({
      collectedQuantity,
      collectedXp,
      ratePerHour,
    }),
    indicatorMetric: formatSessionCountIndicator(collectedQuantity),
    indicatorLabel: `Coletados na sessão: ${formatSessionCountIndicator(collectedQuantity)}`,
    href,

    imageUrl: getGatheringMaterialIconUrl(material),
    imageAlt: materialName,

    monsterMetaLabel: `${originLabel} • ${mapName}`,
    combatMetric: `${progressPercentLabel}%`,
    killsMetric: formatGatheringCollectedQuantity(collectedQuantity),
    xpMetric:
      collectedXp > 0
        ? formatXp(collectedXp)
        : formatGatheringRate(ratePerHour),
  };
}

function buildGatheringItemFromOverview(params: {
  characterId: string;
  session: DashboardGatheringSessionViewModel;
  nowMs: number;
}): ActivityBarItem {
  const { characterId, nowMs } = params;
  const session = params.session as DashboardGatheringSessionLoose;

  const productionPreview = session.productionPreview ?? null;
  const material =
    session.targetMaterial ??
    productionPreview?.targetMaterial ??
    productionPreview?.material ??
    null;

  const originLabel = formatOrigin(session.origin);
  const originSlug = getGatheringOriginSlug(session.origin);

  const materialName = material?.name ?? "Material em coleta";

  const mapName =
    session.map?.name ?? productionPreview?.map?.name ?? "Mapa atual";

  const productionSnapshot = buildGatheringProductionSnapshot({
    session,
    nowMs,
  });

  const progressPercent = productionSnapshot.progressPercent;
  const progressPercentLabel = floorPercent(progressPercent);
  const collectedQuantity = Math.max(
    0,
    Math.floor(getFirstValidNumber(session.collectedQuantity, 0) ?? 0),
  );

  const collectedXp = Math.max(
    0,
    Math.floor(getFirstValidNumber(session.collectedXp, 0) ?? 0),
  );

  const ratePerHour = productionSnapshot.ratePerHour;

  const href =
    originSlug === "gathering"
      ? `/dashboard/${characterId}/gathering`
      : `/dashboard/${characterId}/gathering/${originSlug}`;

  return {
    key: `gathering-${session.id ?? "active"}`,
    type: "gathering",
    icon: "⛏",
    title: materialName,
    description:
      productionPreview?.label ??
      `${originLabel} em ${mapName}. Produzindo ${materialName}.`,
    progressLabel: "Próxima unidade",
    progressPercent,
    progressValueLabel: `${progressPercentLabel}%`,
    primaryMetric: `${progressPercentLabel}%`,
    secondaryMetric: formatGatheringSecondaryMetric({
      collectedQuantity,
      collectedXp,
      ratePerHour,
    }),
    indicatorMetric: formatSessionCountIndicator(collectedQuantity),
    indicatorLabel: `Coletados na sessão: ${formatSessionCountIndicator(collectedQuantity)}`,
    href,

    imageUrl: getGatheringMaterialIconUrl(material),
    imageAlt: materialName,

    monsterMetaLabel: `${originLabel} • ${mapName}`,
    combatMetric: `${progressPercentLabel}%`,
    killsMetric: formatGatheringCollectedQuantity(collectedQuantity),
    xpMetric:
      collectedXp > 0
        ? formatXp(collectedXp)
        : formatGatheringRate(ratePerHour),
  };
}

function formatRemainingTime(seconds: unknown) {
  const safeSeconds = Math.max(0, Math.ceil(toSafeNumber(seconds, 0)));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function buildIncursionItemFromOverview(params: {
  characterId: string;
  session: DashboardIncursionSessionViewModel;
  nowMs: number;
}): ActivityBarItem {
  const { characterId, session, nowMs } = params;
  const startedAtMs = getParsedDateMs(session.startedAt) ?? nowMs;
  const endsAtMs = getParsedDateMs(session.endsAt) ?? nowMs;
  const totalMs = Math.max(1, endsAtMs - startedAtMs);
  const elapsedMs = Math.max(0, Math.min(totalMs, nowMs - startedAtMs));
  const remainingSeconds = Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));
  const isCompleted =
    remainingSeconds <= 0 || normalizeStatus(session.status) === "COMPLETED";
  const progressPercent = Math.round((elapsedMs / totalMs) * 100);
  const incursion = session.incursion;
  const mapName = incursion?.map?.name ?? "Mapa desconhecido";
  const title = incursion?.name ?? "Incursão ativa";

  return {
    key: `incursion-${session.id}`,
    type: "incursion",
    icon: "⌬",
    title,
    description: isCompleted
      ? "Incursão concluída. Recompensas entregues automaticamente."
      : `${mapName} • termina em ${formatRemainingTime(remainingSeconds)}`,
    progressLabel: isCompleted ? "Concluída" : "Tempo restante",
    progressPercent: isCompleted ? 100 : progressPercent,
    progressValueLabel: isCompleted
      ? "Finalizada"
      : formatRemainingTime(remainingSeconds),
    primaryMetric: isCompleted
      ? "Entregue"
      : formatRemainingTime(remainingSeconds),
    secondaryMetric: `Mapa ${mapName} • Tier ${incursion?.tier ?? "—"}`,
    indicatorMetric: isCompleted
      ? "Fim"
      : `${Math.max(0, Math.floor(progressPercent))}%`,
    indicatorLabel: isCompleted
      ? "Incursão concluída"
      : "Progresso da incursão",
    href: `/dashboard/${characterId}/incursions`,
    monsterMetaLabel: `${mapName} • Tier ${incursion?.tier ?? "—"}`,
    combatMetric: isCompleted ? "Final" : "Idle",
    killsMetric: isCompleted
      ? "100%"
      : `${Math.max(0, Math.floor(progressPercent))}%`,
    xpMetric: isCompleted
      ? "Automático"
      : formatRemainingTime(remainingSeconds),
  };
}

function buildActivityItems(params: {
  characterId: string;
  overview: CharacterOverviewResponse | null;
  realtimeState: AutoCombatRealtimeStateLoose;
  gatheringState: GatheringRealtimeState;
  incursionsState: IncursionsRealtimeState;
  nowMs: number;
}) {
  const {
    characterId,
    overview,
    realtimeState,
    gatheringState,
    incursionsState,
    nowMs,
  } = params;

  const items: ActivityBarItem[] = [];

  const realtimeAutoCombatItem = buildAutoCombatItemFromRealtime({
    characterId,
    overview,
    realtimeState,
  });

  if (realtimeAutoCombatItem) {
    items.push(realtimeAutoCombatItem);
  } else if (overview?.activity) {
    const activeAutoCombat = overview.activity.activeAutoCombatSession ?? null;
    const activeAutoCombatSession = activeAutoCombat as
      | (DashboardAutoCombatSessionViewModel & AutoCombatSessionLike)
      | null;

    const activeAutoCombatIsActive = isActiveStatus(
      activeAutoCombatSession?.status,
    );
    const activeAutoCombatIsTerminal = isTerminalStatus(
      activeAutoCombatSession?.status,
    );

    const hasActiveAutoCombat =
      activeAutoCombatIsActive ||
      (Boolean(overview.activity.hasActiveAutoCombat) &&
        !activeAutoCombatIsTerminal);

    if (
      hasActiveAutoCombat &&
      activeAutoCombat &&
      !activeAutoCombatIsTerminal
    ) {
      items.push(
        buildAutoCombatItemFromOverview({
          characterId,
          overview,
          session: activeAutoCombat,
        }),
      );
    }
  }

  const realtimeGatheringItem = buildGatheringItemFromRealtime({
    characterId,
    gatheringState,
  });

  if (realtimeGatheringItem) {
    items.push(realtimeGatheringItem);
  } else if (overview?.activity) {
    const activeGathering = overview.activity.activeGatheringSession ?? null;
    const activeGatheringSession = activeGathering as
      | (DashboardGatheringSessionViewModel & { status?: string | null })
      | null;

    const activeGatheringIsTerminal = isTerminalStatus(
      activeGatheringSession?.status,
    );

    const hasActiveGathering =
      !activeGatheringIsTerminal &&
      (Boolean(overview.activity.hasActiveGathering) ||
        isActiveStatus(activeGatheringSession?.status));

    if (hasActiveGathering && activeGathering) {
      items.push(
        buildGatheringItemFromOverview({
          characterId,
          session: activeGathering,
          nowMs,
        }),
      );
    }
  }

  if (incursionsState.session) {
    items.push(
      buildIncursionItemFromOverview({
        characterId,
        session:
          incursionsState.session as unknown as DashboardIncursionSessionViewModel,
        nowMs,
      }),
    );
  } else if (overview?.activity) {
    const activeIncursion = overview.activity.activeIncursionSession ?? null;
    const activeIncursionSession =
      activeIncursion as DashboardIncursionSessionViewModel | null;
    const activeIncursionStatus = normalizeStatus(
      activeIncursionSession?.status,
    );
    const hasActiveIncursion =
      Boolean(overview.activity.hasActiveIncursion) ||
      activeIncursionStatus === "ACTIVE" ||
      activeIncursionStatus === "COMPLETED";

    if (hasActiveIncursion && activeIncursionSession) {
      items.push(
        buildIncursionItemFromOverview({
          characterId,
          session: activeIncursionSession,
          nowMs,
        }),
      );
    }
  }

  return items;
}

function getInitialMinimizedState() {
  return true;
}

export function DashboardActivityBar({
  characterId,
  refreshMs = 5000,
}: DashboardActivityBarProps) {
  const realtimeState =
    useAutoCombatRealtimeState() as AutoCombatRealtimeStateLoose;

  const gatheringState = useGatheringRealtimeState();
  const incursionsState = useIncursionsRealtimeState();
  const { cancel: cancelIncursionActivity } = useIncursionsRealtimeActions();

  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isMinimized, setIsMinimized] = useState(getInitialMinimizedState);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!characterId) return;

    let isDisposed = false;

    async function loadActivity() {
      try {
        const data = await getCharacterOverview(characterId);

        if (isDisposed) return;

        setOverview(data);
        setNowMs(Date.now());
        setHasLoadedOnce(true);
      } catch {
        if (isDisposed) return;

        setHasLoadedOnce(true);
      }
    }

    loadActivity();

    const intervalId = window.setInterval(() => {
      loadActivity();
    }, refreshMs);

    return () => {
      isDisposed = true;

      window.clearInterval(intervalId);
    };
  }, [characterId, refreshMs]);

  const activityItems = useMemo(() => {
    return buildActivityItems({
      characterId,
      overview,
      realtimeState,
      gatheringState,
      incursionsState,
      nowMs,
    });
  }, [
    characterId,
    gatheringState,
    incursionsState,
    nowMs,
    overview,
    realtimeState,
  ]);

  if (!hasLoadedOnce || activityItems.length <= 0) {
    return null;
  }

  async function handleCancelIncursionActivity() {
    await cancelIncursionActivity();
  }

  return (
    <section
      className={[
        "dashboard-activity-bar",
        isMinimized
          ? "dashboard-activity-bar--minimized"
          : "dashboard-activity-bar--expanded",
        activityItems.length > 1 ? "dashboard-activity-bar--multiple" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Atividades em andamento"
    >
      {activityItems.map((item, index) => {
        const progressPercent = clampPercent(item.progressPercent);
        const progressPercentLabel = floorPercent(progressPercent);
        const progressValueLabel =
          item.progressValueLabel ?? `${progressPercentLabel}%`;
        const progressHeaderLabel =
          item.type === "auto-combat"
            ? `${item.progressLabel} • ${progressValueLabel}`
            : item.progressLabel;
        const shouldShowProgressValue = item.type !== "auto-combat";
        const progressStyle = {
          width: `${progressPercent}%`,
        };
        const itemStyle =
          item.type === "auto-combat"
            ? ({
                "--dashboard-activity-monster-hp-percent": `${progressPercent}%`,
                "--dashboard-activity-monster-hp-scale": progressPercent / 100,
              } as CSSProperties)
            : undefined;
        const progressTrackClassName = [
          item.type === "auto-combat"
            ? "dashboard-activity-bar__track dashboard-activity-bar__track--monster-hp"
            : "dashboard-activity-bar__track",
        ].join(" ");
        const compactProgressTrackClassName = [
          item.type === "auto-combat"
            ? "dashboard-activity-bar__compact-track dashboard-activity-bar__compact-track--monster-hp"
            : "dashboard-activity-bar__compact-track",
        ].join(" ");
        const isFirstItem = index === 0;

        return (
          <article
            key={item.key}
            className={[
              "dashboard-activity-bar__item",
              `dashboard-activity-bar__item--${item.type}`,
              isFirstItem ? "dashboard-activity-bar__item--has-toggle" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={itemStyle}
          >
            {item.type === "auto-combat" ? (
              <span
                className="dashboard-activity-bar__monster-hp-backdrop"
                aria-hidden="true"
              >
                <span className="dashboard-activity-bar__monster-hp-fill" />
              </span>
            ) : null}

            {isFirstItem ? (
              <button
                type="button"
                className="dashboard-activity-bar__toggle"
                aria-pressed={isMinimized}
                onClick={() => setIsMinimized((current) => !current)}
              >
                <strong>{isMinimized ? "+" : "−"}</strong>
                <span>{isMinimized ? "Expandir" : "Minimizar"}</span>
              </button>
            ) : null}

            <Link
              to={item.href}
              title={item.description}
              className="dashboard-activity-bar__link"
            >
              <span
                className={[
                  "dashboard-activity-bar__icon",
                  item.imageUrl ? "dashboard-activity-bar__icon--portrait" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden="true"
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="dashboard-activity-bar__icon-portrait"
                    loading="lazy"
                    style={{
                      position: "relative",
                      zIndex: 1,
                      display: "block",
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      objectPosition: "center",
                      borderRadius: "inherit",
                      filter:
                        "brightness(1.08) contrast(1.06) saturate(1.04) drop-shadow(0 8px 10px rgba(0, 0, 0, 0.36))",
                    }}
                  />
                ) : (
                  <span className="dashboard-activity-bar__icon-core">
                    {item.icon}
                  </span>
                )}
              </span>

              <div className="dashboard-activity-bar__body">
                <div className="dashboard-activity-bar__top">
                  <div className="dashboard-activity-bar__title-block">
                    <span className="dashboard-activity-bar__eyebrow">
                      {item.type === "auto-combat"
                        ? "Sessão ativa"
                        : item.type === "incursion"
                          ? "Incursão ativa"
                          : "Expedição ativa"}
                    </span>

                    <strong>{item.title}</strong>

                    {item.monsterMetaLabel ? (
                      <span className="dashboard-activity-bar__monster-meta">
                        {item.monsterMetaLabel}
                      </span>
                    ) : null}
                  </div>

                  {item.indicatorMetric ? (
                    <span
                      className="dashboard-activity-bar__percent-pill dashboard-activity-bar__session-indicator"
                      aria-label={item.indicatorLabel ?? undefined}
                      title={item.indicatorLabel ?? undefined}
                    >
                      {item.indicatorMetric}
                    </span>
                  ) : null}
                </div>

                {item.type === "auto-combat" && item.characterName ? (
                  <div className="dashboard-activity-bar__character-strip">
                    <div className="dashboard-activity-bar__character-main">
                      <strong>{item.characterName}</strong>
                      <span>{item.characterLevelLabel}</span>
                    </div>

                    <div className="dashboard-activity-bar__mini-resource dashboard-activity-bar__mini-resource--hp">
                      <div className="dashboard-activity-bar__mini-resource-header">
                        <span>{item.characterHpLabel}</span>
                        <strong>
                          {formatPercentLabel(item.characterHpPercent ?? 0)}
                        </strong>
                      </div>

                      <div className="dashboard-activity-bar__mini-track">
                        <i
                          style={{
                            width: `${clampPercent(item.characterHpPercent ?? 0)}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="dashboard-activity-bar__mini-resource dashboard-activity-bar__mini-resource--xp">
                      <div className="dashboard-activity-bar__mini-resource-header">
                        <span>{item.characterXpLabel}</span>
                        <strong>
                          {formatPercentLabel(item.characterXpPercent ?? 0)}
                        </strong>
                      </div>

                      <div className="dashboard-activity-bar__mini-track">
                        <i
                          style={{
                            width: `${clampPercent(item.characterXpPercent ?? 0)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="dashboard-activity-bar__description">
                    {item.description}
                  </p>
                )}

                <div className="dashboard-activity-bar__progress-block">
                  <div className="dashboard-activity-bar__progress-header">
                    <span>{progressHeaderLabel}</span>
                    {shouldShowProgressValue ? (
                      <strong>{progressValueLabel}</strong>
                    ) : null}
                  </div>

                  <div className={progressTrackClassName}>
                    <i style={progressStyle}>
                      <em aria-hidden="true" />
                    </i>
                  </div>
                </div>
              </div>

              <div className="dashboard-activity-bar__metrics">
                {item.type === "auto-combat" ? (
                  <>
                    <span className="dashboard-activity-bar__metric dashboard-activity-bar__metric--xp">
                      <small>EXP</small>
                      <strong>{item.xpMetric ?? formatXp(0)}</strong>
                    </span>

                    <span className="dashboard-activity-bar__metric dashboard-activity-bar__metric--kills">
                      <small>Monstros</small>
                      <strong>{item.killsMetric ?? formatKillCount(0)}</strong>
                    </span>

                    <span className="dashboard-activity-bar__metric dashboard-activity-bar__metric--combat">
                      <small>Combate</small>
                      <strong>{item.combatMetric ?? item.primaryMetric}</strong>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="dashboard-activity-bar__metric dashboard-activity-bar__metric--xp">
                      <small>{item.progressLabel}</small>
                      <strong>{item.primaryMetric}</strong>
                    </span>

                    <span className="dashboard-activity-bar__metric dashboard-activity-bar__metric--combat">
                      <small>Produção</small>
                      <strong>{item.secondaryMetric}</strong>
                    </span>
                  </>
                )}
              </div>

              <div className="dashboard-activity-bar__compact">
                <div className="dashboard-activity-bar__compact-main">
                  <span>
                    {item.type === "auto-combat"
                      ? "Sessão ativa"
                      : item.type === "incursion"
                        ? "Incursão ativa"
                        : "Expedição ativa"}
                  </span>
                  <strong>{item.title}</strong>

                  {item.indicatorMetric ? (
                    <span
                      className="dashboard-activity-bar__compact-indicator"
                      aria-label={item.indicatorLabel ?? undefined}
                      title={item.indicatorLabel ?? undefined}
                    >
                      {item.indicatorMetric}
                    </span>
                  ) : null}
                </div>

                <div className="dashboard-activity-bar__compact-track-block">
                  <div className="dashboard-activity-bar__compact-track-header">
                    <span>{progressHeaderLabel}</span>
                    {shouldShowProgressValue ? (
                      <strong>{progressValueLabel}</strong>
                    ) : null}
                  </div>

                  <div className={compactProgressTrackClassName}>
                    <i style={progressStyle} />
                  </div>
                </div>

                <div className="dashboard-activity-bar__compact-stats">
                  {item.type === "auto-combat" ? (
                    <>
                      <span className="dashboard-activity-bar__compact-stat dashboard-activity-bar__compact-stat--xp">
                        <small>EXP</small>
                        <strong>{item.xpMetric ?? formatXp(0)}</strong>
                      </span>

                      <span className="dashboard-activity-bar__compact-stat dashboard-activity-bar__compact-stat--kills">
                        <small>Monstros</small>
                        <strong>
                          {item.killsMetric ?? formatKillCount(0)}
                        </strong>
                      </span>

                      <span className="dashboard-activity-bar__compact-stat dashboard-activity-bar__compact-stat--combat dashboard-activity-bar__compact-stat--optional">
                        <small>Combate</small>
                        <strong>
                          {item.combatMetric ?? item.primaryMetric}
                        </strong>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="dashboard-activity-bar__compact-stat dashboard-activity-bar__compact-stat--xp">
                        <small>{item.progressLabel}</small>
                        <strong>{item.primaryMetric}</strong>
                      </span>

                      <span className="dashboard-activity-bar__compact-stat dashboard-activity-bar__compact-stat--combat">
                        <small>Produção</small>
                        <strong>{item.secondaryMetric}</strong>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </Link>

            {item.type === "incursion" && incursionsState.isActive ? (
              <button
                type="button"
                className="dashboard-activity-bar__quick-cancel"
                disabled={incursionsState.isBusy}
                onClick={() => void handleCancelIncursionActivity()}
              >
                {incursionsState.isBusy ? "Cancelando..." : "Cancelar"}
              </button>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
