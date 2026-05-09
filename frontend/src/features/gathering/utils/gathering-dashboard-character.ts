import { normalizeClassName } from '../../characters/api/characters.api';
import type {
    CharacterOverviewResponse,
    DashboardCharacterViewModel,
} from '../../dashboard/types/dashboard.types';

type LooseCharacterOverview = CharacterOverviewResponse & {
  character: CharacterOverviewResponse['character'] & {
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

    levelProgress?: {
      totalXp?: number | null;
      xp?: number | null;

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
    } | null;

    currentMap?: {
      id?: string | null;
      name?: string | null;
      tier?: number | null;
      minLevel?: number | null;
      maxLevel?: number | null;
      description?: string | null;
    } | null;

    map?: {
      id?: string | null;
      name?: string | null;
      tier?: number | null;
      minLevel?: number | null;
      maxLevel?: number | null;
      description?: string | null;
    } | null;

    currentMapName?: string | null;

    gameClass?: {
      id?: string | null;
      name?: string | null;
    } | null;

    class?: {
      id?: string | null;
      name?: string | null;
    } | null;

    className?: string | null;
    classId?: string | null;

    avatarKey?: string | null;
    avatarUrl?: string | null;

    potionConfig?: unknown;
    potionConfigs?: unknown[];
    autoPotionConfig?: unknown;

    inventorySummary?: unknown;
    gatheringSkills?: unknown;
    autoCombatSession?: unknown;

    deletedAt?: string | null;
  };

  equipment?: unknown;
  progression?: {
    currentMap?: {
      id?: string | null;
      name?: string | null;
      tier?: number | null;
      minLevel?: number | null;
      maxLevel?: number | null;
      description?: string | null;
    } | null;
  } | null;
};

function toSafeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function getCharacterClassName(
  character: LooseCharacterOverview['character'],
): string {
  return (
    character.class?.name ??
    character.gameClass?.name ??
    character.className ??
    'Lutador'
  );
}

function getCharacterCurrentMapName(overview: LooseCharacterOverview): string {
  const character = overview.character;

  return (
    character.currentMap?.name ??
    character.map?.name ??
    character.currentMapName ??
    overview.progression?.currentMap?.name ??
    'Sem mapa'
  );
}

export function buildGatheringDashboardCharacter(
  overview: CharacterOverviewResponse,
): DashboardCharacterViewModel {
  const safeOverview = overview as LooseCharacterOverview;
  const character = safeOverview.character;

  const className = getCharacterClassName(character);
  const currentMapName = getCharacterCurrentMapName(safeOverview);

  const currentHp = Math.max(
    0,
    Math.floor(toSafeNumber(character.currentHp, character.maxHp ?? 1)),
  );

  const maxHp = Math.max(1, Math.floor(toSafeNumber(character.maxHp, 1)));

  const totalXp =
    character.totalXp ??
    character.levelProgress?.totalXp ??
    character.levelProgress?.xp ??
    character.xp ??
    0;

  return {
    ...character,

    id: character.id,
    name: character.name,

    className,
    classId: normalizeClassName(className),

    level: Math.max(1, Math.floor(toSafeNumber(character.level, 1))),

    /**
     * No backend, character.xp tende a representar XP total acumulado.
     * Mantemos totalXp para o DashboardLayout conseguir calcular corretamente.
     */
    xp: Math.max(0, Math.floor(toSafeNumber(character.xp, 0))),
    totalXp: Math.max(0, Math.floor(toSafeNumber(totalXp, 0))),

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

    currentHp,
    maxHp,

    avatarKey: character.avatarKey ?? null,
    avatarUrl: character.avatarUrl ?? null,

    currentMapName,

    class: character.class ?? null,
    gameClass: character.gameClass ?? null,

    map: character.map ?? null,
    currentMap:
      character.currentMap ?? safeOverview.progression?.currentMap ?? null,

    equipment: character.equipment ?? safeOverview.equipment ?? {},
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
  } as DashboardCharacterViewModel;
}