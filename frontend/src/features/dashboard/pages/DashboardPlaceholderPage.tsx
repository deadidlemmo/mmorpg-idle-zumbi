import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { normalizeClassName } from '../../characters/api/characters.api';
import { getCharacterOverview } from '../api/dashboard.api';
import { DashboardCard } from '../components/DashboardCard';
import { DashboardLayout } from '../components/DashboardLayout';
import '../dashboard.css';
import type {
    CharacterOverviewResponse,
    DashboardCharacterViewModel,
} from '../types/dashboard.types';

interface DashboardPlaceholderPageProps {
  title: string;
  description: string;
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

    xp: character.xp ?? 0,
    totalXp: character.totalXp ?? character.levelProgress?.totalXp ?? character.xp ?? 0,

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
      character.isAtLevelCap ??
      character.levelProgress?.isAtLevelCap ??
      false,

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

export function DashboardPlaceholderPage({
  title,
  description,
}: DashboardPlaceholderPageProps) {
  const { characterId } = useParams();
  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!characterId) return;

      try {
        setIsLoading(true);
        const data = await getCharacterOverview(characterId);

        if (isMounted) {
          setOverview(data);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [characterId]);

  const character = useMemo(() => {
    if (!overview) return null;

    return buildCharacterViewModel(overview);
  }, [overview]);

  if (!characterId) {
    return <Navigate to="/characters" replace />;
  }

  if (isLoading) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando área...</span>
      </main>
    );
  }

  if (!character) {
    return <Navigate to="/characters" replace />;
  }

  return (
    <DashboardLayout character={character}>
      <DashboardCard title={title} eyebrow="Área em preparação">
        <div className="dashboard-placeholder">
          <strong>{title}</strong>
          <p>{description}</p>
          <span>
            Esta rota já está preparada para crescer sem refatorar o dashboard.
          </span>
        </div>
      </DashboardCard>
    </DashboardLayout>
  );
}