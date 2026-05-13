import { Lock, MapPinned, Route, ShieldCheck, Skull } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getAutoCombatMaps } from '../../auto-combat/api/auto-combat.api';
import {
  buildMapVisualStyle,
  getMapImageByName,
} from '../../auto-combat/assets/auto-combat-map-assets';
import type { AutoCombatMapViewModel } from '../../auto-combat/types/auto-combat.types';
import {
  getGameMapMaxLevel,
  getGameMapMinLevel,
  getVisibleCombatMaps,
} from '../../auto-combat/utils/auto-combat-page.helpers';
import { normalizeClassName } from '../../characters/api/characters.api';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardCard } from '../../dashboard/components/DashboardCard';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import '../../dashboard/dashboard.css';
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
} from '../../dashboard/types/dashboard.types';
import '../styles/maps-selection.css';

function buildCharacterViewModel(
  overview: CharacterOverviewResponse,
): DashboardCharacterViewModel {
  const character = overview.character;
  const className = character.class?.name ?? character.gameClass?.name ?? 'Lutador';
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
    classId: character.classId ?? normalizeClassName(className),
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
      character.currentLevelStartXp ?? character.levelProgress?.currentLevelStartXp ?? null,
    nextLevelRequiredXp:
      character.nextLevelRequiredXp ?? character.levelProgress?.nextLevelRequiredXp ?? null,
    isAtLevelCap: character.isAtLevelCap ?? character.levelProgress?.isAtLevelCap ?? false,
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
    currentMap: character.currentMap ?? overview.progression?.currentMap ?? null,
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

function getProgressionLabel(map: AutoCombatMapViewModel) {
  const tier = map.tier ?? 1;

  if (tier <= 1) return 'Inicial';
  if (tier <= 3) return 'Intermediário';

  return 'Avançado';
}

function getMapDescription(map: AutoCombatMapViewModel) {
  return (
    map.description ??
    'Zona infestada com ameaças graduais, recursos de sobrevivência e confrontos automáticos compatíveis com a progressão do personagem.'
  );
}

export function MapsSelectionPage() {
  const { characterId } = useParams();
  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(null);
  const [maps, setMaps] = useState<AutoCombatMapViewModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPageData() {
      if (!characterId) return;

      try {
        setIsLoading(true);
        setErrorMessage(null);

        const [overviewData, mapsData] = await Promise.all([
          getCharacterOverview(characterId),
          getAutoCombatMaps(),
        ]);

        if (isMounted) {
          setOverview(overviewData);
          setMaps(mapsData);
        }
      } catch {
        if (isMounted) {
          setErrorMessage('Não foi possível carregar os mapas agora. Tente novamente em instantes.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadPageData();

    return () => {
      isMounted = false;
    };
  }, [characterId]);

  const character = useMemo(() => {
    if (!overview) return null;

    return buildCharacterViewModel(overview);
  }, [overview]);

  const sortedMaps = useMemo(() => getVisibleCombatMaps(maps), [maps]);
  const characterLevel = character?.level ?? 1;
  const unlockedMapsCount = sortedMaps.filter(
    (map) => characterLevel >= getGameMapMinLevel(map),
  ).length;
  const nextLockedMap = sortedMaps.find(
    (map) => characterLevel < getGameMapMinLevel(map),
  );

  if (!characterId) {
    return <Navigate to="/characters" replace />;
  }

  if (isLoading) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando mapas...</span>
      </main>
    );
  }

  if (!character) {
    return <Navigate to="/characters" replace />;
  }

  return (
    <DashboardLayout character={character} hideHero>
      <div className="maps-selection-page">
        <DashboardCard className="dashboard-card--wide maps-selection-hero">
          <div className="maps-selection-hero__content">
            <span className="maps-selection-kicker">Seleção de mapas</span>
            <h1>Escolha a próxima zona de contenção</h1>
            <p>
              Compare tiers, faixas de nível e status de desbloqueio antes de entrar em combate. Mapas acima do seu nível ficam bloqueados até a progressão necessária.
            </p>
          </div>

          <div className="maps-selection-hero__stats" aria-label="Resumo de progressão">
            <div>
              <span>Nível atual</span>
              <strong>{characterLevel}</strong>
            </div>
            <div>
              <span>Mapas liberados</span>
              <strong>{unlockedMapsCount}/{sortedMaps.length}</strong>
            </div>
            <div>
              <span>Próximo bloqueio</span>
              <strong>
                {nextLockedMap
                  ? `Nv. ${getGameMapMinLevel(nextLockedMap)}`
                  : 'Tudo liberado'}
              </strong>
            </div>
          </div>
        </DashboardCard>

        {errorMessage ? (
          <DashboardCard title="Mapas indisponíveis" eyebrow="Erro">
            <div className="maps-selection-empty">{errorMessage}</div>
          </DashboardCard>
        ) : null}

        <DashboardCard
          title="Rotas disponíveis"
          eyebrow="Progressão por tier"
          className="dashboard-card--wide"
        >
          <div className="maps-selection-grid">
            {sortedMaps.map((map) => {
              const minLevel = getGameMapMinLevel(map);
              const maxLevel = getGameMapMaxLevel(map);
              const isUnlocked = characterLevel >= minLevel;
              const mapImage = map.imageUrl ?? getMapImageByName(map.name);
              const progressionLabel = getProgressionLabel(map);

              return (
                <article
                  key={map.id}
                  className={`maps-selection-card ${isUnlocked ? 'is-unlocked' : 'is-locked'}`}
                >
                  <div
                    className="maps-selection-card__media"
                    style={buildMapVisualStyle(mapImage)}
                  >
                    {!mapImage ? <MapPinned aria-hidden="true" /> : null}
                    <span className="maps-selection-card__tier">Tier {map.tier}</span>
                    <span className="maps-selection-card__stage">{progressionLabel}</span>
                    {!isUnlocked ? (
                      <div className="maps-selection-card__lock" aria-label={`Bloqueado — requer nível ${minLevel}`}>
                        <Lock size={22} aria-hidden="true" />
                      </div>
                    ) : null}
                  </div>

                  <div className="maps-selection-card__body">
                    <div className="maps-selection-card__title-row">
                      <div>
                        <span>{progressionLabel}</span>
                        <h3>{map.name}</h3>
                      </div>
                      {isUnlocked ? (
                        <ShieldCheck className="maps-selection-card__status-icon" aria-hidden="true" />
                      ) : (
                        <Skull className="maps-selection-card__status-icon" aria-hidden="true" />
                      )}
                    </div>

                    <p>{getMapDescription(map)}</p>

                    <dl className="maps-selection-card__details">
                      <div>
                        <dt>Faixa recomendada</dt>
                        <dd>Nível {minLevel}-{maxLevel}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{isUnlocked ? 'Desbloqueado' : `Bloqueado — requer nível ${minLevel}`}</dd>
                      </div>
                    </dl>

                    <div className="maps-selection-card__footer">
                      {isUnlocked ? (
                        <Link
                          to={`/dashboard/${characterId}/auto-combat?mapId=${encodeURIComponent(map.id)}`}
                          className="maps-selection-card__action"
                        >
                          <Route size={16} aria-hidden="true" />
                          Entrar no mapa
                        </Link>
                      ) : (
                        <button className="maps-selection-card__action" type="button" disabled>
                          <Lock size={16} aria-hidden="true" />
                          Disponível no nível {minLevel}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </DashboardCard>
      </div>
    </DashboardLayout>
  );
}
