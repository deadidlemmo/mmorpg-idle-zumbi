import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { removeAuthToken } from '../../../services/api/authToken';
import { useAutoCombatRealtimeState } from '../../auto-combat/realtime/useAutoCombatRealtime';
import { normalizeClassName } from '../../characters/api/characters.api';
import { getAvatarImage } from '../../characters/constants/avatar-options';
import {
  getCharacterClass,
  getCharacterInitials,
} from '../../characters/types/character.types';
import type { DashboardCharacterViewModel } from '../types/dashboard.types';
import {
  DashboardTopBar,
  type DashboardTopBarResource,
} from './DashboardTopBar';

interface DashboardLayoutProps {
  character: DashboardCharacterViewModel;
  children: ReactNode;
  hideHero?: boolean;
}

interface DashboardLayoutContentProps {
  character: DashboardCharacterViewModel;
  children: ReactNode;
  hideHero?: boolean;
}

interface DashboardNavItem {
  label: string;
  path: string;
  icon: string;
}

type DashboardGatheringOrigin =
  | 'DESMANCHE'
  | 'COLETA'
  | 'PATRULHA'
  | 'ARSENAL'
  | 'TECNOVARREDURA'
  | 'CONTENCAO';

interface DashboardGatheringSidebarItem {
  label: string;
  slug: string;
  origin: DashboardGatheringOrigin;
  icon: string;
}

type GatheringSkillLoose = {
  id?: string | null;
  origin?: string | null;
  key?: string | null;
  slug?: string | null;
  type?: string | null;
  name?: string | null;
  level?: number | string | null;
  xp?: number | string | null;
  totalXp?: number | string | null;
};

type GatheringSkillsSummaryLoose = {
  skills?: GatheringSkillLoose[] | null;
  byOrigin?: Partial<
    Record<DashboardGatheringOrigin, GatheringSkillLoose | null>
  > | null;
};

type GatheringSkillsSource =
  | GatheringSkillLoose[]
  | GatheringSkillsSummaryLoose
  | null
  | undefined;

type DashboardCharacterWithGatheringSkills = DashboardCharacterViewModel & {
  gatheringSkills?: GatheringSkillsSource;
  gathering?: {
    skills?: GatheringSkillLoose[] | null;
    byOrigin?: Partial<
      Record<DashboardGatheringOrigin, GatheringSkillLoose | null>
    > | null;
  } | null;
  character?: {
    gatheringSkills?: GatheringSkillsSource;
  } | null;
};

type DashboardCharacterWithXpProgress = DashboardCharacterViewModel & {
  currentLevelXp?: number | null;
  xpToNextLevel?: number | null;
  nextLevelXp?: number | null;
  xpProgressPercent?: number | null;

  totalXp?: number | null;
  xpIntoCurrentLevel?: number | null;
  xpNeededForNextLevel?: number | null;
  currentLevelStartXp?: number | null;
  nextLevelRequiredXp?: number | null;
  isAtLevelCap?: boolean | null;

  gold?: number | null;
  cash?: number | null;
  wallet?: {
    gold?: number | null;
    cash?: number | null;
  } | null;
  currencies?: {
    gold?: number | null;
    cash?: number | null;
  } | null;

  levelProgress?: {
    oldLevel?: number | null;
    newLevel?: number | null;
    level?: number | null;

    xp?: number | null;
    currentXp?: number | null;
    gainedXp?: number | null;
    totalXp?: number | null;

    currentLevelXp?: number | null;
    xpToNextLevel?: number | null;
    nextLevelXp?: number | null;
    xpProgressPercent?: number | null;

    currentLevelStartXp?: number | null;
    nextLevelRequiredXp?: number | null;
    xpIntoCurrentLevel?: number | null;
    xpNeededForNextLevel?: number | null;

    progressPercent?: number | null;
    isAtLevelCap?: boolean | null;
  } | null;
};

type RealtimeProgressLoose = {
  sessionId?: string | null;

  level?: number | null;
  xp?: number | null;
  totalXp?: number | null;

  currentLevelXp?: number | null;
  xpToNextLevel?: number | null;
  nextLevelXp?: number | null;
  xpProgressPercent?: number | null;

  xpIntoCurrentLevel?: number | null;
  xpNeededForNextLevel?: number | null;
  currentLevelStartXp?: number | null;
  nextLevelRequiredXp?: number | null;
  isAtLevelCap?: boolean | null;

  levelProgress?: DashboardCharacterWithXpProgress['levelProgress'];
};

type RealtimeStateLoose = {
  characterId?: string | null;

  character?: (Partial<DashboardCharacterWithXpProgress> & {
    id?: string | null;
    sessionId?: string | null;
    currentHp?: number | null;
    maxHp?: number | null;
    hpPercent?: number | null;
  }) | null;

  characterProgress?: RealtimeProgressLoose | null;
  progress?: RealtimeProgressLoose | null;
  realtimeCharacterProgress?: RealtimeProgressLoose | null;

  eventQueue?: unknown[] | null;
  activeEvent?: unknown | null;

  combat?: {
    sessionId?: string | null;
    characterCurrentHp?: number | null;
    characterMaxHp?: number | null;
    characterHpPercent?: number | null;
  } | null;

  realtimeCombat?: {
    sessionId?: string | null;
    characterCurrentHp?: number | null;
    characterMaxHp?: number | null;
    characterHpPercent?: number | null;
  } | null;

  visual?: {
    updatedAt?: number | null;
  } | null;

  location?: {
    mapName?: string | null;
    subMapName?: string | null;
  } | null;

  status?: {
    active?: boolean | null;
    hasActiveAutoCombat?: boolean | null;

    character?: (Partial<DashboardCharacterWithXpProgress> & {
      id?: string | null;
      currentHp?: number | null;
      maxHp?: number | null;
    }) | null;

    session?: {
      id?: string | null;
      status?: string | null;
    } | null;

    activeSession?: {
      id?: string | null;
      status?: string | null;
    } | null;

    autoCombatSession?: {
      id?: string | null;
      status?: string | null;
    } | null;

    lastSession?: {
      id?: string | null;
      status?: string | null;
    } | null;

    sessionSummary?: {
      hp?: {
        current?: number | null;
        max?: number | null;
      } | null;
    } | null;

    subMap?: {
      name?: string | null;
      map?: {
        name?: string | null;
      } | null;
      mapName?: string | null;
    } | null;
  } | null;

  activeSession?: {
    id?: string | null;
    status?: string | null;
  } | null;

  session?: {
    id?: string | null;
    status?: string | null;
  } | null;

  isActive?: boolean | null;
  hasActiveSession?: boolean | null;
  hasActiveAutoCombat?: boolean | null;
};

type XpProgressResult = {
  currentXp: number;
  xpToNextLevel: number;
  progressPercent: number;
};

const GATHERING_SUBNAV_STORAGE_KEY =
  'dead-idle.dashboard.gathering-subnav-open';

const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  {
    label: 'Visão geral',
    path: '',
    icon: '⌂',
  },
  {
    label: 'Combate automático',
    path: 'auto-combat',
    icon: '⚔',
  },
  {
    label: 'Expedições',
    path: 'gathering',
    icon: '⛏',
  },
  {
    label: 'Criação',
    path: 'crafting',
    icon: '⚒',
  },
  {
    label: 'Mochila',
    path: 'inventory',
    icon: '▦',
  },
  {
    label: 'Equipamentos',
    path: 'equipment',
    icon: '◇',
  },
  {
    label: 'Consumíveis',
    path: 'consumables',
    icon: '+',
  },
  {
    label: 'Mapas',
    path: 'maps',
    icon: '◇',
  },
];

const DASHBOARD_GATHERING_ITEMS: DashboardGatheringSidebarItem[] = [
  {
    label: 'Desmanche',
    slug: 'desmanche',
    origin: 'DESMANCHE',
    icon: '⛏',
  },
  {
    label: 'Coleta',
    slug: 'coleta',
    origin: 'COLETA',
    icon: '◇',
  },
  {
    label: 'Patrulha',
    slug: 'patrulha',
    origin: 'PATRULHA',
    icon: '⌁',
  },
  {
    label: 'Arsenal',
    slug: 'arsenal',
    origin: 'ARSENAL',
    icon: '⌖',
  },
  {
    label: 'Tecnovarredura',
    slug: 'tecnovarredura',
    origin: 'TECNOVARREDURA',
    icon: '◌',
  },
  {
    label: 'Contenção',
    slug: 'contencao',
    origin: 'CONTENCAO',
    icon: '◎',
  },
];

function getInitialGatheringSubnavState() {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const storedValue = window.localStorage.getItem(
      GATHERING_SUBNAV_STORAGE_KEY,
    );

    if (storedValue === null) {
      return true;
    }

    return storedValue === 'true';
  } catch {
    return true;
  }
}

function toSafeNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function getFirstValidNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') {
      continue;
    }

    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function getFirstBoolean(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value;
    }
  }

  return undefined;
}

function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function normalizeStatus(status?: string | null) {
  return String(status ?? '').trim().toUpperCase();
}

function isTerminalStatus(status?: string | null) {
  const normalizedStatus = normalizeStatus(status);

  return (
    normalizedStatus === 'STOPPED' ||
    normalizedStatus === 'FINISHED' ||
    normalizedStatus === 'DEFEATED' ||
    normalizedStatus === 'FAILED' ||
    normalizedStatus === 'CANCELLED'
  );
}

function isActiveStatus(status?: string | null) {
  return normalizeStatus(status) === 'ACTIVE';
}

function getStatusSession(status: RealtimeStateLoose['status']) {
  if (!status) return null;

  return (
    status.session ??
    status.activeSession ??
    status.autoCombatSession ??
    status.lastSession ??
    null
  );
}

function getRealtimeSession(realtimeState: RealtimeStateLoose) {
  const statusSession = getStatusSession(realtimeState.status);

  return realtimeState.activeSession ?? realtimeState.session ?? statusSession;
}

function isRealtimeSessionActive(realtimeState: RealtimeStateLoose) {
  const session = getRealtimeSession(realtimeState);
  const sessionStatus = normalizeStatus(session?.status);

  if (isTerminalStatus(sessionStatus)) {
    return false;
  }

  if (isActiveStatus(sessionStatus)) {
    return true;
  }

  return Boolean(
    realtimeState.isActive ||
      realtimeState.hasActiveSession ||
      realtimeState.hasActiveAutoCombat ||
      realtimeState.status?.active ||
      realtimeState.status?.hasActiveAutoCombat,
  );
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

function getDashboardCharacterId(character: DashboardCharacterViewModel) {
  return typeof character.id === 'string' ? character.id : '';
}

function getProgressForCurrentSession(
  realtimeState: RealtimeStateLoose,
  sessionId?: string | null,
) {
  const candidates = [
    realtimeState.characterProgress,
    realtimeState.realtimeCharacterProgress,
    realtimeState.progress,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (isSameSessionScope(sessionId, candidate.sessionId)) {
      return candidate;
    }
  }

  return null;
}

function getCombatForCurrentSession(
  realtimeState: RealtimeStateLoose,
  sessionId?: string | null,
) {
  const candidates = [realtimeState.combat, realtimeState.realtimeCombat];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (isSameSessionScope(sessionId, candidate.sessionId)) {
      return candidate;
    }
  }

  return null;
}

function buildXpProgress(
  character: DashboardCharacterViewModel,
): XpProgressResult {
  const characterWithXp = character as DashboardCharacterWithXpProgress;
  const levelProgress = characterWithXp.levelProgress;

  const level = Math.max(1, toSafeNumber(character.level, 1));

  const totalXp = Math.max(
    0,
    toSafeNumber(
      characterWithXp.totalXp ??
        levelProgress?.totalXp ??
        levelProgress?.xp ??
        character.xp,
      0,
    ),
  );

  const explicitPercent = getFirstValidNumber(
    characterWithXp.xpProgressPercent,
    levelProgress?.xpProgressPercent,
    levelProgress?.progressPercent,
  );

  const currentLevelStartXp = getFirstValidNumber(
    characterWithXp.currentLevelStartXp,
    levelProgress?.currentLevelStartXp,
  );

  const nextLevelRequiredXp = getFirstValidNumber(
    characterWithXp.nextLevelRequiredXp,
    levelProgress?.nextLevelRequiredXp,
  );

  const xpIntoCurrentLevel = getFirstValidNumber(
    characterWithXp.xpIntoCurrentLevel,
    levelProgress?.xpIntoCurrentLevel,
    characterWithXp.currentLevelXp,
    levelProgress?.currentLevelXp,
    levelProgress?.currentXp,
  );

  const xpNeededForNextLevel = getFirstValidNumber(
    characterWithXp.xpNeededForNextLevel,
    levelProgress?.xpNeededForNextLevel,
  );

  const directXpToNextLevel = getFirstValidNumber(
    characterWithXp.xpToNextLevel,
    characterWithXp.nextLevelXp,
    levelProgress?.xpToNextLevel,
    levelProgress?.nextLevelXp,
  );

  const isAtLevelCap =
    getFirstBoolean(
      characterWithXp.isAtLevelCap,
      levelProgress?.isAtLevelCap,
    ) ?? false;

  let currentXp: number;
  let xpToNextLevel: number;

  if (
    isValidNumber(currentLevelStartXp) &&
    isValidNumber(nextLevelRequiredXp) &&
    nextLevelRequiredXp > currentLevelStartXp
  ) {
    currentXp = totalXp - currentLevelStartXp;
    xpToNextLevel = nextLevelRequiredXp - currentLevelStartXp;
  } else if (
    isValidNumber(xpIntoCurrentLevel) &&
    isValidNumber(xpNeededForNextLevel) &&
    xpNeededForNextLevel >= 0
  ) {
    currentXp = xpIntoCurrentLevel;
    xpToNextLevel = xpIntoCurrentLevel + xpNeededForNextLevel;
  } else if (
    isValidNumber(xpIntoCurrentLevel) &&
    isValidNumber(directXpToNextLevel) &&
    directXpToNextLevel > 0
  ) {
    currentXp = xpIntoCurrentLevel;
    xpToNextLevel = directXpToNextLevel;
  } else if (
    isValidNumber(explicitPercent) &&
    isValidNumber(directXpToNextLevel) &&
    directXpToNextLevel > 0
  ) {
    xpToNextLevel = directXpToNextLevel;
    currentXp = Math.round(
      (clampPercent(explicitPercent) / 100) * xpToNextLevel,
    );
  } else {
    const estimatedXpPerLevel = Math.max(100, level * 100);

    xpToNextLevel = estimatedXpPerLevel;
    currentXp = totalXp % estimatedXpPerLevel;
  }

  if (isAtLevelCap) {
    const cappedXp = Math.max(totalXp, currentXp, xpToNextLevel, 1);

    return {
      currentXp: cappedXp,
      xpToNextLevel: cappedXp,
      progressPercent: 100,
    };
  }

  const safeXpToNextLevel = Math.max(1, Math.floor(xpToNextLevel));

  const safeCurrentXp = Math.max(
    0,
    Math.min(Math.floor(currentXp), safeXpToNextLevel),
  );

  const progressPercent = clampPercent(
    (safeCurrentXp / safeXpToNextLevel) * 100,
  );

  return {
    currentXp: safeCurrentXp,
    xpToNextLevel: safeXpToNextLevel,
    progressPercent,
  };
}

function buildHpProgress(character: DashboardCharacterViewModel) {
  const maxHp = Math.max(1, toSafeNumber(character.maxHp, 1));
  const currentHp = Math.max(0, toSafeNumber(character.currentHp, 0));
  const safeCurrentHp = Math.min(currentHp, maxHp);

  return {
    currentHp: safeCurrentHp,
    maxHp,
    progressPercent: clampPercent((safeCurrentHp / maxHp) * 100),
  };
}

function buildWalletDisplay(character: DashboardCharacterViewModel) {
  const characterWithWallet = character as DashboardCharacterWithXpProgress;

  const gold = Math.max(
    0,
    Math.floor(
      toSafeNumber(
        characterWithWallet.gold ??
          characterWithWallet.wallet?.gold ??
          characterWithWallet.currencies?.gold,
        0,
      ),
    ),
  );

  const cash = Math.max(
    0,
    Math.floor(
      toSafeNumber(
        characterWithWallet.cash ??
          characterWithWallet.wallet?.cash ??
          characterWithWallet.currencies?.cash,
        0,
      ),
    ),
  );

  return {
    gold,
    cash,
  };
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR');
}

function getDashboardCharacterClassKey(character: DashboardCharacterViewModel) {
  return (
    character.classId ??
    character.className ??
    character.class?.name ??
    character.gameClass?.name ??
    'lutador'
  );
}

function getDashboardCharacterMapName(character: DashboardCharacterViewModel) {
  return (
    character.currentMapName ??
    character.currentMap?.name ??
    character.map?.name ??
    'Sem mapa'
  );
}

function normalizeGatheringOriginKey(
  value?: string | null,
): DashboardGatheringOrigin | null {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const aliases: Record<string, DashboardGatheringOrigin> = {
    DESMANCHE: 'DESMANCHE',
    COLETA: 'COLETA',
    PATRULHA: 'PATRULHA',
    ARSENAL: 'ARSENAL',
    TECNOVARREDURA: 'TECNOVARREDURA',
    TECNO_VARREDURA: 'TECNOVARREDURA',
    CONTENCAO: 'CONTENCAO',
    CONTENÇÃO: 'CONTENCAO',
  };

  return aliases[normalized] ?? null;
}

function getGatheringSkillOrigin(
  skill?: GatheringSkillLoose | null,
): DashboardGatheringOrigin | null {
  if (!skill) return null;

  return (
    normalizeGatheringOriginKey(skill.origin) ??
    normalizeGatheringOriginKey(skill.key) ??
    normalizeGatheringOriginKey(skill.slug) ??
    normalizeGatheringOriginKey(skill.type) ??
    normalizeGatheringOriginKey(skill.name)
  );
}

function extractGatheringSkillFromSource(
  source: GatheringSkillsSource,
  origin: DashboardGatheringOrigin,
): GatheringSkillLoose | null {
  if (!source) return null;

  if (Array.isArray(source)) {
    return (
      source.find((skill) => getGatheringSkillOrigin(skill) === origin) ?? null
    );
  }

  const byOriginSkill = source.byOrigin?.[origin];

  if (byOriginSkill) {
    return byOriginSkill;
  }

  return (
    source.skills?.find((skill) => getGatheringSkillOrigin(skill) === origin) ??
    null
  );
}

function getGatheringSkillForOrigin(
  character: DashboardCharacterViewModel,
  origin: DashboardGatheringOrigin,
): GatheringSkillLoose | null {
  const characterWithGathering =
    character as DashboardCharacterWithGatheringSkills;

  return (
    extractGatheringSkillFromSource(
      characterWithGathering.gatheringSkills,
      origin,
    ) ??
    extractGatheringSkillFromSource(
      characterWithGathering.gathering?.skills,
      origin,
    ) ??
    extractGatheringSkillFromSource(
      characterWithGathering.gathering?.byOrigin
        ? { byOrigin: characterWithGathering.gathering.byOrigin }
        : null,
      origin,
    ) ??
    extractGatheringSkillFromSource(
      characterWithGathering.character?.gatheringSkills,
      origin,
    ) ??
    null
  );
}

function getGatheringSkillLevelLabel(
  character: DashboardCharacterViewModel,
  origin: DashboardGatheringOrigin,
) {
  const skill = getGatheringSkillForOrigin(character, origin);
  const level = Math.max(1, Math.floor(toSafeNumber(skill?.level, 1)));

  return `Lv. ${level}`;
}

function buildHeroCharacterFromRealtimeState(params: {
  character: DashboardCharacterViewModel;
  realtimeState: RealtimeStateLoose;
}): DashboardCharacterViewModel {
  const { character, realtimeState } = params;

  const characterId = getDashboardCharacterId(character);
  const stateCharacterId =
    realtimeState.characterId ?? realtimeState.character?.id ?? null;

  if (stateCharacterId && characterId && stateCharacterId !== characterId) {
    return character;
  }

  const baseCharacter = character as DashboardCharacterWithXpProgress;
  const realtimeSession = getRealtimeSession(realtimeState);
  const realtimeSessionId = realtimeSession?.id ?? null;
  const realtimeSessionIsActive = isRealtimeSessionActive(realtimeState);

  const rawRealtimeCharacter = realtimeState.character ?? {};
  const realtimeCharacter =
    rawRealtimeCharacter.sessionId &&
    !isSameSessionScope(realtimeSessionId, rawRealtimeCharacter.sessionId)
      ? {}
      : rawRealtimeCharacter;

  const statusCharacter = realtimeState.status?.character ?? {};
  const progress = getProgressForCurrentSession(realtimeState, realtimeSessionId);
  const combat = getCombatForCurrentSession(realtimeState, realtimeSessionId);
  const statusHp = realtimeState.status?.sessionSummary?.hp ?? null;
  const hasPendingVisualEvents = Boolean(
    realtimeSessionIsActive &&
      (realtimeState.activeEvent || (realtimeState.eventQueue?.length ?? 0) > 0),
  );

  /**
   * Status/poll do backend pode chegar com a sessão já avançada antes da fila
   * visual mostrar MOB_DEFEATED. Durante activeEvent/eventQueue, a EXP do topo
   * deve seguir somente eventos já aplicados no reducer realtime para não
   * antecipar o ganho quando, por exemplo, uma poção ainda está em cena.
   */
  const statusCharacterForProgress = hasPendingVisualEvents
    ? {}
    : statusCharacter;

  const nextLevelProgress =
    progress?.levelProgress ??
    realtimeCharacter.levelProgress ??
    statusCharacterForProgress.levelProgress ??
    baseCharacter.levelProgress ??
    null;

  const nextLevel =
    getFirstValidNumber(
      progress?.level,
      realtimeCharacter.level,
      nextLevelProgress?.newLevel,
      nextLevelProgress?.level,
      statusCharacterForProgress.level,
      character.level,
    ) ?? character.level;

  const nextTotalXp =
    getFirstValidNumber(
      progress?.totalXp,
      progress?.xp,
      realtimeCharacter.totalXp,
      realtimeCharacter.xp,
      nextLevelProgress?.totalXp,
      nextLevelProgress?.xp,
      statusCharacterForProgress.totalXp,
      statusCharacterForProgress.xp,
      baseCharacter.totalXp,
      character.xp,
    ) ?? character.xp;

  const nextCurrentHp =
    getFirstValidNumber(
      realtimeSessionIsActive ? combat?.characterCurrentHp : undefined,
      realtimeSessionIsActive ? realtimeCharacter.currentHp : undefined,
      statusCharacter.currentHp,
      statusHp?.current,
      character.currentHp,
    ) ?? character.currentHp;

  const nextMaxHp =
    getFirstValidNumber(
      realtimeSessionIsActive ? combat?.characterMaxHp : undefined,
      realtimeSessionIsActive ? realtimeCharacter.maxHp : undefined,
      statusCharacter.maxHp,
      statusHp?.max,
      character.maxHp,
    ) ?? character.maxHp;

  const statusSubMap = realtimeState.status?.subMap;
  const locationMapName = realtimeState.location?.mapName ?? undefined;
  const statusMapName =
    statusSubMap?.map?.name ?? statusSubMap?.mapName ?? undefined;

  const nextCurrentMapName =
    (realtimeSessionIsActive ? statusMapName ?? locationMapName : undefined) ??
    getDashboardCharacterMapName(character);

  const next = {
    ...character,

    level: Math.max(1, Math.floor(toSafeNumber(nextLevel, character.level))),
    xp: Math.max(0, Math.floor(toSafeNumber(nextTotalXp, character.xp))),
    totalXp: Math.max(0, Math.floor(toSafeNumber(nextTotalXp, character.xp))),

    currentHp: Math.max(0, Math.floor(toSafeNumber(nextCurrentHp, 0))),
    maxHp: Math.max(1, Math.floor(toSafeNumber(nextMaxHp, 1))),

    currentMapName: nextCurrentMapName,

    currentLevelXp:
      progress?.currentLevelXp ??
      progress?.xpIntoCurrentLevel ??
      realtimeCharacter.currentLevelXp ??
      nextLevelProgress?.currentLevelXp ??
      nextLevelProgress?.xpIntoCurrentLevel ??
      statusCharacterForProgress.currentLevelXp ??
      baseCharacter.currentLevelXp,

    xpToNextLevel:
      progress?.xpToNextLevel ??
      progress?.nextLevelXp ??
      realtimeCharacter.xpToNextLevel ??
      nextLevelProgress?.xpToNextLevel ??
      nextLevelProgress?.nextLevelXp ??
      statusCharacterForProgress.xpToNextLevel ??
      baseCharacter.xpToNextLevel,

    nextLevelXp:
      progress?.nextLevelXp ??
      progress?.xpToNextLevel ??
      realtimeCharacter.nextLevelXp ??
      nextLevelProgress?.nextLevelXp ??
      nextLevelProgress?.xpToNextLevel ??
      statusCharacterForProgress.nextLevelXp ??
      baseCharacter.nextLevelXp,

    xpProgressPercent:
      progress?.xpProgressPercent ??
      realtimeCharacter.xpProgressPercent ??
      nextLevelProgress?.xpProgressPercent ??
      nextLevelProgress?.progressPercent ??
      statusCharacterForProgress.xpProgressPercent ??
      baseCharacter.xpProgressPercent,

    xpIntoCurrentLevel:
      progress?.xpIntoCurrentLevel ??
      progress?.currentLevelXp ??
      realtimeCharacter.xpIntoCurrentLevel ??
      nextLevelProgress?.xpIntoCurrentLevel ??
      nextLevelProgress?.currentLevelXp ??
      statusCharacterForProgress.xpIntoCurrentLevel ??
      baseCharacter.xpIntoCurrentLevel,

    xpNeededForNextLevel:
      progress?.xpNeededForNextLevel ??
      realtimeCharacter.xpNeededForNextLevel ??
      nextLevelProgress?.xpNeededForNextLevel ??
      statusCharacterForProgress.xpNeededForNextLevel ??
      baseCharacter.xpNeededForNextLevel,

    currentLevelStartXp:
      progress?.currentLevelStartXp ??
      realtimeCharacter.currentLevelStartXp ??
      nextLevelProgress?.currentLevelStartXp ??
      statusCharacterForProgress.currentLevelStartXp ??
      baseCharacter.currentLevelStartXp,

    nextLevelRequiredXp:
      progress?.nextLevelRequiredXp ??
      realtimeCharacter.nextLevelRequiredXp ??
      nextLevelProgress?.nextLevelRequiredXp ??
      statusCharacterForProgress.nextLevelRequiredXp ??
      baseCharacter.nextLevelRequiredXp,

    isAtLevelCap:
      progress?.isAtLevelCap ??
      realtimeCharacter.isAtLevelCap ??
      nextLevelProgress?.isAtLevelCap ??
      statusCharacterForProgress.isAtLevelCap ??
      baseCharacter.isAtLevelCap,

    levelProgress: nextLevelProgress,
  } as DashboardCharacterWithXpProgress;

  return next;
}

function DashboardLayoutContent({
  character,
  children,
  hideHero = false,
}: DashboardLayoutContentProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const realtimeState = useAutoCombatRealtimeState() as RealtimeStateLoose;

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isGatheringMenuOpen, setIsGatheringMenuOpen] = useState(
    getInitialGatheringSubnavState,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(
        GATHERING_SUBNAV_STORAGE_KEY,
        String(isGatheringMenuOpen),
      );
    } catch {
      // Mantém o estado apenas em memória se o navegador bloquear localStorage.
    }
  }, [isGatheringMenuOpen]);

  const heroCharacter = useMemo(() => {
    return buildHeroCharacterFromRealtimeState({
      character,
      realtimeState,
    });
  }, [character, realtimeState]);

  const characterId = getDashboardCharacterId(heroCharacter);
  const dashboardBasePath = `/dashboard/${characterId}`;
  const gatheringBasePath = `${dashboardBasePath}/gathering`;
  const isGatheringRoute = location.pathname.startsWith(gatheringBasePath);

  const classKey = normalizeClassName(
    getDashboardCharacterClassKey(heroCharacter),
  );
  const classData = getCharacterClass(classKey);

  const avatarImage =
    heroCharacter.avatarUrl ??
    (heroCharacter.avatarKey ? getAvatarImage(heroCharacter.avatarKey) : null);

  const characterMapName = getDashboardCharacterMapName(heroCharacter);

  const classStyle = {
    '--class-accent': classData.accentColor,
  } as CSSProperties;

  const xpProgress = useMemo(() => {
    return buildXpProgress(heroCharacter);
  }, [heroCharacter]);

  const hpProgress = useMemo(() => {
    return buildHpProgress(heroCharacter);
  }, [heroCharacter]);

  const walletDisplay = useMemo(() => {
    return buildWalletDisplay(heroCharacter);
  }, [heroCharacter]);

  const topBarResources = useMemo<DashboardTopBarResource[]>(
    () => [
      {
        key: 'gold',
        label: 'Gold',
        value: formatCurrency(walletDisplay.gold),
        icon: '●',
        tone: 'gold',
        title: 'Gold disponível',
      },
      {
        key: 'cash',
        label: 'Cash',
        value: formatCurrency(walletDisplay.cash),
        icon: '◆',
        tone: 'cash',
        title: 'Cash disponível',
      },
    ],
    [walletDisplay.cash, walletDisplay.gold],
  );

  const xpProgressStyle = {
    width: `${xpProgress.progressPercent}%`,
  } as CSSProperties;

  const hpProgressStyle = {
    width: `${hpProgress.progressPercent}%`,
  } as CSSProperties;

  function closeSidebar() {
    setIsSidebarOpen(false);
  }

  function handleLogout() {
    removeAuthToken();
    window.location.href = '/';
  }

  function handleToggleGatheringMenu() {
    if (!isGatheringRoute) {
      setIsGatheringMenuOpen(true);
      navigate(gatheringBasePath);
      return;
    }

    setIsGatheringMenuOpen((currentValue) => !currentValue);
  }

  return (
    <div className="dashboard-shell">
      <button
        type="button"
        className="dashboard-mobile-menu"
        onClick={() => setIsSidebarOpen(true)}
        aria-label="Abrir menu"
      >
        ☰
      </button>

      {isSidebarOpen ? (
        <button
          type="button"
          className="dashboard-sidebar-backdrop"
          onClick={closeSidebar}
          aria-label="Fechar menu"
        />
      ) : null}

      <aside className={`dashboard-sidebar ${isSidebarOpen ? 'is-open' : ''}`}>
        <div className="dashboard-sidebar__brand">
          <span>Dead Idle</span>
          <strong>Abrigo de Sobreviventes</strong>
        </div>

        <div className="dashboard-sidebar__character" style={classStyle}>
          <div className="dashboard-sidebar__avatar">
            {avatarImage ? (
              <img src={avatarImage} alt={heroCharacter.name} />
            ) : (
              <span>{getCharacterInitials(heroCharacter.name)}</span>
            )}
          </div>

          <div>
            <strong>{heroCharacter.name}</strong>
            <span>
              Nível {heroCharacter.level} • {classData.label}
            </span>
          </div>
        </div>

        <nav className="dashboard-sidebar__nav" aria-label="Menu do painel">
          {DASHBOARD_NAV_ITEMS.map((item) => {
            const to = item.path
              ? `${dashboardBasePath}/${item.path}`
              : dashboardBasePath;

            if (item.path === 'gathering') {
              return (
                <div
                  key={item.label}
                  className="dashboard-sidebar__nav-group dashboard-sidebar__nav-group--gathering"
                >
                  <button
                    type="button"
                    className={[
                      'dashboard-sidebar__link',
                      'dashboard-sidebar__link--toggle',
                      isGatheringRoute ? 'is-active' : '',
                      isGatheringMenuOpen ? 'is-expanded' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={handleToggleGatheringMenu}
                    aria-expanded={isGatheringMenuOpen}
                    aria-controls="dashboard-gathering-subnav"
                  >
                    <span aria-hidden="true">{item.icon}</span>
                    <strong>{item.label}</strong>
                    <em
                      className="dashboard-sidebar__link-chevron"
                      aria-hidden="true"
                    />
                  </button>

                  {isGatheringMenuOpen ? (
                    <div
                      id="dashboard-gathering-subnav"
                      className="dashboard-sidebar__subnav"
                    >
                      {DASHBOARD_GATHERING_ITEMS.map((gatheringItem) => {
                        const gatheringTo = `${gatheringBasePath}/${gatheringItem.slug}`;

                        return (
                          <NavLink
                            key={gatheringItem.origin}
                            to={gatheringTo}
                            onClick={closeSidebar}
                            className={({ isActive }) =>
                              `dashboard-sidebar__subitem ${
                                isActive ? 'is-active' : ''
                              }`
                            }
                          >
                            <span
                              className="dashboard-sidebar__subitem-icon"
                              aria-hidden="true"
                            >
                              {gatheringItem.icon}
                            </span>

                            <strong>{gatheringItem.label}</strong>

                            <span className="dashboard-sidebar__subitem-level">
                              {getGatheringSkillLevelLabel(
                                heroCharacter,
                                gatheringItem.origin,
                              )}
                            </span>
                          </NavLink>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            }

            return (
              <NavLink
                key={item.label}
                to={to}
                end={!item.path}
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `dashboard-sidebar__link ${isActive ? 'is-active' : ''}`
                }
              >
                <span aria-hidden="true">{item.icon}</span>
                <strong>{item.label}</strong>
              </NavLink>
            );
          })}
        </nav>

        <div className="dashboard-sidebar__bottom">
          <button
            type="button"
            className="dashboard-sidebar__secondary"
            onClick={() => {
              closeSidebar();
              navigate('/characters');
            }}
          >
            Trocar personagem
          </button>

          <button
            type="button"
            className="dashboard-sidebar__logout"
            onClick={handleLogout}
          >
            Sair da conta
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        <DashboardTopBar
          characterId={characterId}
          characterName={heroCharacter.name}
          characterClassName={classData.label}
          characterLevel={heroCharacter.level}
          characterCurrentHp={heroCharacter.currentHp}
          characterMaxHp={heroCharacter.maxHp}
          resources={topBarResources}
        />

        {!hideHero ? (
          <section className="dashboard-hero" style={classStyle}>
            <div className="dashboard-hero__avatar">
              {avatarImage ? (
                <img src={avatarImage} alt={heroCharacter.name} />
              ) : (
                <span>{getCharacterInitials(heroCharacter.name)}</span>
              )}
            </div>

            <div className="dashboard-hero__content">
              <span>{classData.label}</span>

              <div className="dashboard-hero__heading">
                <h2>{heroCharacter.name}</h2>

                <div
                  className="dashboard-hero__level-badge"
                  aria-label={`Nível ${heroCharacter.level}`}
                  title={`Nível ${heroCharacter.level}`}
                >
                  <strong>Nível {heroCharacter.level}</strong>
                </div>
              </div>

              <div className="dashboard-hero__meta">
                <strong>{characterMapName}</strong>
              </div>

              <div className="dashboard-hero__wallet" aria-label="Moedas">
                <div className="dashboard-hero__currency dashboard-hero__currency--gold">
                  <span>Gold</span>
                  <strong>{formatCurrency(walletDisplay.gold)}</strong>
                </div>

                <div className="dashboard-hero__currency dashboard-hero__currency--cash">
                  <span>Cash</span>
                  <strong>{formatCurrency(walletDisplay.cash)}</strong>
                </div>
              </div>

              <div className="dashboard-hero__resources">
                <div
                  className="dashboard-hero__resource dashboard-hero__resource--xp"
                  aria-label="Experiência"
                >
                  <div className="dashboard-hero__resource-header">
                    <div className="dashboard-hero__resource-title">
                      <span>Experiência</span>
                      <small>Progresso do nível</small>
                    </div>

                    <div className="dashboard-hero__resource-values">
                      <strong>
                        {xpProgress.currentXp} / {xpProgress.xpToNextLevel} XP
                      </strong>
                      <em>{Math.round(xpProgress.progressPercent)}%</em>
                    </div>
                  </div>

                  <div className="dashboard-hero__resource-track">
                    <i style={xpProgressStyle}>
                      <b aria-hidden="true" />
                    </i>
                  </div>
                </div>

                <div
                  className="dashboard-hero__resource dashboard-hero__resource--hp"
                  aria-label="Vida"
                >
                  <div className="dashboard-hero__resource-header">
                    <div className="dashboard-hero__resource-title">
                      <span>Vida</span>
                      <small>Integridade atual</small>
                    </div>

                    <div className="dashboard-hero__resource-values">
                      <strong>
                        {hpProgress.currentHp} / {hpProgress.maxHp}
                      </strong>
                      <em>{Math.round(hpProgress.progressPercent)}%</em>
                    </div>
                  </div>

                  <div className="dashboard-hero__resource-track">
                    <i style={hpProgressStyle}>
                      <b aria-hidden="true" />
                    </i>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {children}
      </main>
    </div>
  );
}

export function DashboardLayout({
  character,
  children,
  hideHero = false,
}: DashboardLayoutProps) {
  return (
    <DashboardLayoutContent character={character} hideHero={hideHero}>
      {children}
    </DashboardLayoutContent>
  );
}