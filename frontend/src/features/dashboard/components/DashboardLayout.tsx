import type { CSSProperties, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { removeAuthToken } from '../../../services/api/authToken';
import { useAutoCombatRealtimeState } from '../../auto-combat/realtime/useAutoCombatRealtime';
import { normalizeClassName } from '../../characters/api/characters.api';
import { getAvatarImage } from '../../characters/constants/avatar-options';
import {
  getCharacterClass,
  getCharacterInitials,
} from '../../characters/types/character.types';
import type { DashboardCharacterViewModel } from '../types/dashboard.types';
import { DashboardActivityBar } from './DashboardActivityBar';

interface DashboardLayoutProps {
  character: DashboardCharacterViewModel;
  children: ReactNode;
}

interface DashboardLayoutContentProps {
  character: DashboardCharacterViewModel;
  children: ReactNode;
}

interface DashboardNavItem {
  label: string;
  path: string;
  icon: string;
}

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
    icon: '◈',
  },
  {
    label: 'Consumíveis',
    path: 'consumables',
    icon: '✚',
  },
  {
    label: 'Mapas',
    path: 'maps',
    icon: '◇',
  },
];

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

  const nextLevelProgress =
    progress?.levelProgress ??
    statusCharacter.levelProgress ??
    realtimeCharacter.levelProgress ??
    baseCharacter.levelProgress ??
    null;

  const nextLevel =
    getFirstValidNumber(
      statusCharacter.level,
      progress?.level,
      realtimeCharacter.level,
      nextLevelProgress?.newLevel,
      nextLevelProgress?.level,
      character.level,
    ) ?? character.level;

  const nextTotalXp =
    getFirstValidNumber(
      statusCharacter.totalXp,
      statusCharacter.xp,
      progress?.totalXp,
      progress?.xp,
      realtimeCharacter.totalXp,
      realtimeCharacter.xp,
      nextLevelProgress?.totalXp,
      nextLevelProgress?.xp,
      baseCharacter.totalXp,
      character.xp,
    ) ?? character.xp;

  const nextCurrentHp =
    getFirstValidNumber(
      realtimeSessionIsActive ? combat?.characterCurrentHp : undefined,
      statusCharacter.currentHp,
      realtimeSessionIsActive ? realtimeCharacter.currentHp : undefined,
      statusHp?.current,
      character.currentHp,
    ) ?? character.currentHp;

  const nextMaxHp =
    getFirstValidNumber(
      realtimeSessionIsActive ? combat?.characterMaxHp : undefined,
      statusCharacter.maxHp,
      realtimeSessionIsActive ? realtimeCharacter.maxHp : undefined,
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
      statusCharacter.currentLevelXp ??
      progress?.currentLevelXp ??
      progress?.xpIntoCurrentLevel ??
      realtimeCharacter.currentLevelXp ??
      baseCharacter.currentLevelXp ??
      nextLevelProgress?.currentLevelXp ??
      nextLevelProgress?.xpIntoCurrentLevel,

    xpToNextLevel:
      statusCharacter.xpToNextLevel ??
      progress?.xpToNextLevel ??
      progress?.nextLevelXp ??
      realtimeCharacter.xpToNextLevel ??
      baseCharacter.xpToNextLevel ??
      nextLevelProgress?.xpToNextLevel ??
      nextLevelProgress?.nextLevelXp,

    nextLevelXp:
      statusCharacter.nextLevelXp ??
      progress?.nextLevelXp ??
      progress?.xpToNextLevel ??
      realtimeCharacter.nextLevelXp ??
      baseCharacter.nextLevelXp ??
      nextLevelProgress?.nextLevelXp ??
      nextLevelProgress?.xpToNextLevel,

    xpProgressPercent:
      statusCharacter.xpProgressPercent ??
      progress?.xpProgressPercent ??
      realtimeCharacter.xpProgressPercent ??
      baseCharacter.xpProgressPercent ??
      nextLevelProgress?.xpProgressPercent ??
      nextLevelProgress?.progressPercent,

    xpIntoCurrentLevel:
      statusCharacter.xpIntoCurrentLevel ??
      progress?.xpIntoCurrentLevel ??
      progress?.currentLevelXp ??
      realtimeCharacter.xpIntoCurrentLevel ??
      baseCharacter.xpIntoCurrentLevel ??
      nextLevelProgress?.xpIntoCurrentLevel ??
      nextLevelProgress?.currentLevelXp,

    xpNeededForNextLevel:
      statusCharacter.xpNeededForNextLevel ??
      progress?.xpNeededForNextLevel ??
      realtimeCharacter.xpNeededForNextLevel ??
      baseCharacter.xpNeededForNextLevel ??
      nextLevelProgress?.xpNeededForNextLevel,

    currentLevelStartXp:
      statusCharacter.currentLevelStartXp ??
      progress?.currentLevelStartXp ??
      realtimeCharacter.currentLevelStartXp ??
      baseCharacter.currentLevelStartXp ??
      nextLevelProgress?.currentLevelStartXp,

    nextLevelRequiredXp:
      statusCharacter.nextLevelRequiredXp ??
      progress?.nextLevelRequiredXp ??
      realtimeCharacter.nextLevelRequiredXp ??
      baseCharacter.nextLevelRequiredXp ??
      nextLevelProgress?.nextLevelRequiredXp,

    isAtLevelCap:
      statusCharacter.isAtLevelCap ??
      progress?.isAtLevelCap ??
      realtimeCharacter.isAtLevelCap ??
      baseCharacter.isAtLevelCap ??
      nextLevelProgress?.isAtLevelCap,

    levelProgress: nextLevelProgress,
  } as DashboardCharacterWithXpProgress;

  return next;
}

function DashboardLayoutContent({
  character,
  children,
}: DashboardLayoutContentProps) {
  const navigate = useNavigate();
  const realtimeState = useAutoCombatRealtimeState() as RealtimeStateLoose;

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const heroCharacter = useMemo(() => {
    return buildHeroCharacterFromRealtimeState({
      character,
      realtimeState,
    });
  }, [character, realtimeState]);

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
              ? `/dashboard/${heroCharacter.id}/${item.path}`
              : `/dashboard/${heroCharacter.id}`;

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
                <span>{item.icon}</span>
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
        <header className="dashboard-topbar dashboard-topbar--clean">
          <div>
            <span className="dashboard-topbar__eyebrow">
              MMORPG Idle Zumbi
            </span>
            <h1>Painel do abrigo</h1>
          </div>
        </header>

        <div className="dashboard-activity-bar-zone">
          <DashboardActivityBar characterId={heroCharacter.id} />
        </div>

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

            <div className="dashboard-hero__resources">
              <div
                className="dashboard-hero__resource dashboard-hero__resource--xp"
                aria-label="Experiência"
              >
                <div className="dashboard-hero__resource-header">
                  <span>Experiência</span>
                  <strong>
                    {xpProgress.currentXp} / {xpProgress.xpToNextLevel} XP
                  </strong>
                </div>

                <div className="dashboard-hero__resource-track">
                  <i style={xpProgressStyle} />
                </div>
              </div>

              <div
                className="dashboard-hero__resource dashboard-hero__resource--hp"
                aria-label="Vida"
              >
                <div className="dashboard-hero__resource-header">
                  <span>Vida</span>
                  <strong>
                    {hpProgress.currentHp} / {hpProgress.maxHp}
                  </strong>
                </div>

                <div className="dashboard-hero__resource-track">
                  <i style={hpProgressStyle} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {children}
      </main>
    </div>
  );
}

export function DashboardLayout({ character, children }: DashboardLayoutProps) {
  return (
    <DashboardLayoutContent character={character}>
      {children}
    </DashboardLayoutContent>
  );
}