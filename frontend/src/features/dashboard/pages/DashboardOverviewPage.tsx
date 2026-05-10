import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { normalizeClassName } from '../../characters/api/characters.api';
import '../../characters/characters.css';
import { getCharacterOverview } from '../api/dashboard.api';
import { CharacterStatsPanel } from '../components/CharacterStatsPanel';
import { DashboardCard } from '../components/DashboardCard';
import { DashboardEquipmentBody } from '../components/DashboardEquipmentBody';
import { DashboardLayout } from '../components/DashboardLayout';
import { DashboardProgressBar } from '../components/DashboardProgressBar';
import { DashboardStatCard } from '../components/DashboardStatCard';
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

function formatSeconds(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return '—';

  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  if (minutes <= 0) return `${remainingSeconds}s`;

  return `${minutes}min ${remainingSeconds}s`;
}

function formatOrigin(origin?: string | null) {
  if (!origin) return 'Sem origem';

  const labels: Record<string, string> = {
    DESMANCHE: 'Desmanche',
    COLETA: 'Coleta',
    PATRULHA: 'Patrulha',
    ARSENAL: 'Arsenal',
    TECNOVARREDURA: 'Tecnovarredura',
    CONTENCAO: 'Contenção',
    CONTENÇÃO: 'Contenção',
    DROP_MOBS: 'Saque de monstros',
  };

  return labels[origin] ?? origin;
}

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
    skills?: unknown;
    character?: {
      gatheringSkills?: unknown;
      skills?: unknown;
    };
  };

  const source =
    overviewWithSkills.gatheringSkills ??
    overviewWithSkills.skills ??
    overviewWithSkills.character?.gatheringSkills ??
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
        typeof skill.key === 'string'
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

    const explicitPercent = matchedSkill?.progressPercent;
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

export function DashboardOverviewPage() {
  const { characterId } = useParams();

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

    return buildGatheringSkillsViewModel(overview);
  }, [overview]);

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
  const activity = overview.activity;
  const shortcuts = overview.shortcuts;
  const progression = overview.progression;

  const activeAutoCombat = activity?.activeAutoCombatSession;
  const autoCombatPreview = activeAutoCombat?.combatPreview;

  const activeGathering = activity?.activeGatheringSession;
  const gatheringPreview = activeGathering?.productionPreview;

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

  const activeGatheringSummary = {
    isActive: Boolean(activity?.hasActiveGathering),
    title: activity?.hasActiveGathering
      ? 'Expedição em andamento'
      : 'Nenhuma expedição ativa',
    description:
      gatheringPreview?.label ??
      'Envie o personagem em expedições para obter materiais de criação.',
    origin: formatOrigin(activeGathering?.origin),
    estimatedQuantity: gatheringPreview?.estimatedQuantityToCollect ?? 0,
    elapsedMinutes: gatheringPreview?.elapsedMinutes ?? 0,
    progressPercent: gatheringPreview?.nextUnitProgressPercent ?? 0,
  };

  return (
    <DashboardLayout character={characterWithVisualWallet}>
      <div className="dashboard-section-divider">
        <span>Combate</span>
      </div>

      <div className="dashboard-overview-grid">
        <DashboardCard
          title="Combate automático"
          eyebrow="Batalhas idle"
          className="dashboard-card--highlight dashboard-card--wide"
          action={
            <Link to={`/dashboard/${character.id}/auto-combat`}>
              Abrir combate
            </Link>
          }
        >
          <div className="dashboard-activity-summary">
            <strong>
              {activity?.hasActiveAutoCombat
                ? 'Combate automático em andamento'
                : 'Nenhum combate ativo'}
            </strong>

            <p>
              {autoCombatPreview?.label ??
                'Escolha um submapa para iniciar uma sessão de combate automático.'}
            </p>

            <div className="dashboard-metric-row">
              <DashboardStatCard
                label="Combates"
                value={autoCombatPreview?.totals?.combatsResolved ?? 0}
              />

              <DashboardStatCard
                label="Rodadas"
                value={autoCombatPreview?.totals?.roundsResolved ?? 0}
              />

              <DashboardStatCard
                label="XP obtida"
                value={autoCombatPreview?.totals?.xpGained ?? 0}
              />
            </div>

            <DashboardProgressBar
              label="Próxima rodada"
              value={autoCombatPreview?.progressToNextRoundPercent ?? 0}
              max={100}
              variant="xp"
            />

            <small>
              Tempo restante:{' '}
              {formatSeconds(autoCombatPreview?.remainingSeconds ?? null)}
            </small>
          </div>
        </DashboardCard>
      </div>

      <div className="dashboard-section-divider">
        <span>Expedições e criação</span>
      </div>

      <div className="dashboard-overview-grid">
        <DashboardCard
          title="Expedições"
          eyebrow="Produção idle"
          className="dashboard-card--wide"
          action={
            <Link to={`/dashboard/${character.id}/gathering`}>
              Abrir expedições
            </Link>
          }
        >
          <GatheringSkillsPanel
            skills={gatheringSkills}
            activeGathering={activeGatheringSummary}
          />
        </DashboardCard>

        <DashboardCard
          title="Criação de itens"
          eyebrow="Receitas"
          action={
            <Link to={`/dashboard/${character.id}/crafting`}>
              Abrir criação
            </Link>
          }
        >
          <div className="dashboard-status-callout">
            <strong>
              {shortcuts?.hasCraftableRecipes
                ? 'Há receitas disponíveis'
                : 'Nenhuma receita pronta'}
            </strong>

            <span>
              A criação de itens depende de materiais obtidos em expedições e
              saques do combate automático.
            </span>
          </div>
        </DashboardCard>
      </div>

      <div className="dashboard-section-divider">
        <span>Personagem e progressão</span>
      </div>

      <div className="dashboard-overview-grid dashboard-overview-grid--character">
        <DashboardCard
          title="Atributos do personagem"
          eyebrow="Status"
          className="dashboard-card--wide"
        >
          <CharacterStatsPanel
            stats={stats}
            currentHp={character.currentHp}
            maxHp={character.maxHp}
          />
        </DashboardCard>

        <DashboardCard
          title="Equipamentos"
          eyebrow="Conjunto atual"
          className="dashboard-card--span-6 dashboard-card--equipment"
          action={
            <Link to={`/dashboard/${character.id}/equipment`}>
              Gerenciar conjunto
            </Link>
          }
        >
          <DashboardEquipmentBody equipment={equipment} />
        </DashboardCard>

        <DashboardCard
          title="Mapa e progressão"
          eyebrow="Mundo"
          className="dashboard-card--span-6"
          action={<Link to={`/dashboard/${character.id}/maps`}>Ver mapas</Link>}
        >
          <div className="dashboard-map-summary">
            <div>
              <span>Mapa atual</span>

              <strong>
                {progression?.currentMap?.name ?? character.currentMapName}
              </strong>
            </div>

            <div>
              <span>Mapa recomendado</span>

              <strong>
                {progression?.recommendedMap?.name ?? 'Sem recomendação'}
              </strong>
            </div>

            <div>
              <span>Mapas disponíveis</span>

              <strong>{progression?.availableMaps?.length ?? 0}</strong>
            </div>
          </div>
        </DashboardCard>
      </div>
    </DashboardLayout>
  );
}