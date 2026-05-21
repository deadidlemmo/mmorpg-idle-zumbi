import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { normalizeClassName } from '../../characters/api/characters.api';
import '../../characters/characters.css';
import { useGatheringRealtimeState } from '../../gathering/realtime/useGatheringRealtime';
import { getCharacterOverview } from '../api/dashboard.api';
import { CharacterStatsPanel } from '../components/CharacterStatsPanel';
import { DashboardCard } from '../components/DashboardCard';
import { DashboardEquipmentBody } from '../components/DashboardEquipmentBody';
import { DashboardLayout } from '../components/DashboardLayout';
import { GatheringSkillsPanel } from '../components/GatheringSkillsPanel';
import {
  GATHERING_SKILLS_CONFIG,
  type GatheringSkillViewModel,
} from '../constants/gathering-skills-config';
import '../dashboard.css';
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
} from '../types/dashboard.types';

function toSafeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeGatheringSkillKey(value?: string | null) {
  if (!value) return '';

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-');
}

function buildCharacterViewModel(
  overview: CharacterOverviewResponse,
): DashboardCharacterViewModel {
  const character = overview.character;

  const className =
    character.class?.name ?? character.gameClass?.name ?? 'Lutador';

  const currentMapName =
    character.currentMap?.name ??
    character.map?.name ??
    overview.progression?.currentMap?.name ??
    'Sem mapa';

  return {
    ...character,

    id: character.id,
    name: character.name,

    className,
    classId: normalizeClassName(className),

    level: character.level ?? 1,

    /**
     * IMPORTANTE:
     * No backend, character.xp é XP TOTAL acumulado.
     */
    xp: character.xp ?? 0,
    totalXp: character.totalXp ?? character.levelProgress?.totalXp ?? character.xp ?? 0,

    /**
     * IMPORTANTE:
     * Estes campos já vêm corretos do backend.
     * Não podemos perder eles ao montar o ViewModel do dashboard.
     */
    currentLevelXp:
      character.currentLevelXp ??
      character.xpIntoCurrentLevel ??
      character.levelProgress?.currentLevelXp ??
      character.levelProgress?.xpIntoCurrentLevel ??
      null,

    xpToNextLevel:
      character.xpToNextLevel ??
      character.nextLevelXp ??
      character.levelProgress?.xpToNextLevel ??
      character.levelProgress?.nextLevelXp ??
      null,

    nextLevelXp:
      character.nextLevelXp ??
      character.xpToNextLevel ??
      character.levelProgress?.nextLevelXp ??
      character.levelProgress?.xpToNextLevel ??
      null,

    xpProgressPercent:
      character.xpProgressPercent ??
      character.levelProgress?.xpProgressPercent ??
      character.levelProgress?.progressPercent ??
      null,

    xpIntoCurrentLevel:
      character.xpIntoCurrentLevel ??
      character.currentLevelXp ??
      character.levelProgress?.xpIntoCurrentLevel ??
      character.levelProgress?.currentLevelXp ??
      null,

    xpNeededForNextLevel:
      character.xpNeededForNextLevel ??
      character.levelProgress?.xpNeededForNextLevel ??
      null,

    currentLevelStartXp:
      character.currentLevelStartXp ??
      character.levelProgress?.currentLevelStartXp ??
      null,

    nextLevelRequiredXp:
      character.nextLevelRequiredXp ??
      character.levelProgress?.nextLevelRequiredXp ??
      null,

    isAtLevelCap:
      character.isAtLevelCap ?? character.levelProgress?.isAtLevelCap ?? false,

    levelProgress: character.levelProgress ?? null,

    status: character.status ?? 'ACTIVE',

    currentHp: character.currentHp ?? character.maxHp ?? 1,
    maxHp: character.maxHp ?? 1,

    avatarKey: character.avatarKey ?? null,
    avatarUrl: character.avatarUrl ?? null,

    currentMapName,

    class: character.class ?? null,
    gameClass: character.gameClass ?? null,

    map: character.map ?? null,
    currentMap:
      character.currentMap ?? overview.progression?.currentMap ?? null,

    equipment: character.equipment ?? overview.equipment ?? {},
    inventory: character.inventory ?? [],

    potionConfig: character.potionConfig ?? character.autoPotionConfig ?? null,
    potionConfigs: character.potionConfigs ?? [],
    autoPotionConfig: character.autoPotionConfig ?? null,

    inventorySummary: character.inventorySummary,
    gatheringSkills: character.gatheringSkills,
    autoCombatSession: character.autoCombatSession ?? null,

    deletedAt: character.deletedAt ?? null,
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
  };
}

function readRawGatheringSkills(
  overview: CharacterOverviewResponse,
): Array<Record<string, unknown>> {
  const overviewWithSkills = overview as CharacterOverviewResponse & {
    gatheringSkills?: unknown;
    gathering?: {
      gatheringSkills?: unknown;
      skills?: unknown;
      byOrigin?: unknown;
    };
    skills?: unknown;
    character?: {
      gatheringSkills?: unknown;
      gathering?: {
        gatheringSkills?: unknown;
        skills?: unknown;
        byOrigin?: unknown;
      };
      skills?: unknown;
    };
  };

  const source =
    overviewWithSkills.gatheringSkills ??
    overviewWithSkills.gathering?.skills ??
    overviewWithSkills.gathering?.gatheringSkills ??
    overviewWithSkills.gathering?.byOrigin ??
    overviewWithSkills.skills ??
    overviewWithSkills.character?.gatheringSkills ??
    overviewWithSkills.character?.gathering?.skills ??
    overviewWithSkills.character?.gathering?.gatheringSkills ??
    overviewWithSkills.character?.gathering?.byOrigin ??
    overviewWithSkills.character?.skills ??
    [];

  if (Array.isArray(source)) {
    return source as Array<Record<string, unknown>>;
  }

  if (source && typeof source === 'object') {
    return Object.entries(source as Record<string, Record<string, unknown>>).map(
      ([key, value]) => ({
        key,
        ...(value ?? {}),
      }),
    );
  }

  return [];
}

function buildGatheringSkillsViewModel(
  overview: CharacterOverviewResponse,
): GatheringSkillViewModel[] {
  const rawSkills = readRawGatheringSkills(overview);

  return GATHERING_SKILLS_CONFIG.map((config) => {
    const matchedSkill = rawSkills.find((skill) => {
      const normalizedKey = normalizeGatheringSkillKey(
        typeof skill.origin === 'string'
          ? skill.origin
          : typeof skill.key === 'string'
          ? skill.key
          : typeof skill.name === 'string'
            ? skill.name
            : typeof skill.type === 'string'
              ? skill.type
              : typeof skill.slug === 'string'
                ? skill.slug
                : null,
      );

      return normalizedKey === config.key;
    });

    const level = Math.max(
      1,
      toSafeNumber(matchedSkill?.level ?? matchedSkill?.currentLevel ?? 1, 1),
    );

    const currentXp = Math.max(
      0,
      toSafeNumber(
        matchedSkill?.currentXp ??
          matchedSkill?.xp ??
          matchedSkill?.experience ??
          0,
        0,
      ),
    );

    const xpToNextLevel = Math.max(
      100,
      toSafeNumber(
        matchedSkill?.xpToNextLevel ??
          matchedSkill?.nextLevelXp ??
          matchedSkill?.requiredXp ??
          100,
        100,
      ),
    );

    const explicitPercent =
      matchedSkill?.xpProgressPercent ?? matchedSkill?.progressPercent;
    const calculatedPercent =
      xpToNextLevel > 0 ? Math.round((currentXp / xpToNextLevel) * 100) : 0;

    const progressPercent =
      typeof explicitPercent === 'number'
        ? Math.max(0, Math.min(100, explicitPercent))
        : Math.max(0, Math.min(100, calculatedPercent));

    return {
      ...config,
      level,
      currentXp,
      xpToNextLevel,
      progressPercent,
    };
  });
}

function applyRealtimeGatheringSkill(
  skills: GatheringSkillViewModel[],
  realtimeSkill?: {
    origin?: string | null;
    key?: string | null;
    name?: string | null;
    type?: string | null;
    slug?: string | null;
    level?: number | null;
    currentLevel?: number | null;
    xp?: number | null;
    currentXp?: number | null;
    xpToNextLevel?: number | null;
    nextLevelXp?: number | null;
    xpProgressPercent?: number | null;
    progressPercent?: number | null;
    isAtLevelCap?: boolean | null;
  } | null,
) {
  if (!realtimeSkill) {
    return skills;
  }

  const realtimeKey = normalizeGatheringSkillKey(
    realtimeSkill.origin ??
      realtimeSkill.key ??
      realtimeSkill.name ??
      realtimeSkill.type ??
      realtimeSkill.slug ??
      null,
  );

  if (!realtimeKey) {
    return skills;
  }

  const level = Math.max(
    1,
    toSafeNumber(realtimeSkill.level ?? realtimeSkill.currentLevel ?? 1, 1),
  );
  const currentXp = Math.max(
    0,
    toSafeNumber(realtimeSkill.xp ?? realtimeSkill.currentXp ?? 0, 0),
  );
  const rawXpToNext = toSafeNumber(
    realtimeSkill.xpToNextLevel ?? realtimeSkill.nextLevelXp ?? 100,
    100,
  );
  const xpToNextLevel = realtimeSkill.isAtLevelCap
    ? Math.max(1, currentXp)
    : Math.max(1, rawXpToNext);
  const calculatedPercent =
    xpToNextLevel > 0 ? (currentXp / xpToNextLevel) * 100 : 0;
  const explicitPercent =
    realtimeSkill.xpProgressPercent ?? realtimeSkill.progressPercent;
  const progressPercent = realtimeSkill.isAtLevelCap
    ? 100
    : Math.max(
        0,
        Math.min(
          100,
          toSafeNumber(explicitPercent ?? calculatedPercent, calculatedPercent),
        ),
      );

  return skills.map((skill) =>
    skill.key === realtimeKey
      ? {
          ...skill,
          level,
          currentXp,
          xpToNextLevel,
          progressPercent,
        }
      : skill,
  );
}

export function DashboardOverviewPage() {
  const { characterId } = useParams();
  const gatheringRealtimeState = useGatheringRealtimeState();

  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadOverview() {
      if (!characterId) return;

      try {
        setIsLoading(true);
        setErrorMessage('');

        const data = await getCharacterOverview(characterId);

        if (isMounted) {
          setOverview(data);
        }
      } catch {
        if (isMounted) {
          setErrorMessage(
            'Não foi possível carregar o painel deste personagem.',
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadOverview();

    return () => {
      isMounted = false;
    };
  }, [characterId]);

  const character = useMemo(() => {
    if (!overview) return null;

    return buildCharacterViewModel(overview);
  }, [overview]);

  const gatheringSkills = useMemo(() => {
    if (!overview) return [];

    return applyRealtimeGatheringSkill(
      buildGatheringSkillsViewModel(overview),
      gatheringRealtimeState.gatheringSkill,
    );
  }, [gatheringRealtimeState.gatheringSkill, overview]);

  if (!characterId) {
    return <Navigate to="/characters" replace />;
  }

  if (isLoading) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando abrigo...</span>
      </main>
    );
  }

  if (errorMessage || !overview || !character) {
    return (
      <main className="dashboard-error">
        <h1>Erro ao carregar painel</h1>
        <p>{errorMessage || 'Personagem não encontrado.'}</p>

        <Link to="/characters" className="btn btn-primary">
          Voltar para seleção
        </Link>
      </main>
    );
  }

  const stats = overview.stats;
  const equipment = overview.equipment ?? {};
  /**
   * Preparação visual temporária para moedas.
   * Não depende do backend, não altera API, não altera types e não salva nada.
   * O DashboardLayout poderá usar estes campos depois para exibir Gold/Cash no hero.
   */
  const displayGold = 0;
  const displayCash = 0;

  const characterWithVisualWallet = {
    ...character,
    gold: displayGold,
    cash: displayCash,
    wallet: {
      gold: displayGold,
      cash: displayCash,
    },
    currencies: {
      gold: displayGold,
      cash: displayCash,
    },
  };

  return (
    <DashboardLayout character={characterWithVisualWallet}>
      <div className="dashboard-section-divider">
        <span>Resumo do personagem</span>
      </div>

      <div className="dashboard-overview-grid dashboard-overview-grid--summary">
        <DashboardCard
          title="Equipamentos"
          eyebrow="Conjunto atual"
          className="dashboard-card--span-5 dashboard-card--equipment"
          action={
            <Link to={`/dashboard/${character.id}/equipment`}>
              Gerenciar conjunto
            </Link>
          }
        >
          <DashboardEquipmentBody equipment={equipment} />
        </DashboardCard>

        <DashboardCard
          title="Atributos do personagem"
          eyebrow="Status"
          className="dashboard-card--span-7"
        >
          <CharacterStatsPanel
            stats={stats}
            currentHp={character.currentHp}
            maxHp={character.maxHp}
          />
        </DashboardCard>
      </div>

      <div className="dashboard-section-divider">
        <span>Proficiências</span>
      </div>

      <div className="dashboard-overview-grid">
        <DashboardCard
          title="Níveis de gathering"
          eyebrow="Proficiências"
          className="dashboard-card--wide"
        >
          <GatheringSkillsPanel skills={gatheringSkills} />
        </DashboardCard>
      </div>
    </DashboardLayout>
  );
}
