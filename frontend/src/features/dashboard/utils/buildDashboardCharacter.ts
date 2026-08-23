import { normalizeClassName } from "../../characters/api/characters.api";
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
} from "../types/dashboard.types";

export function buildDashboardCharacter(
  overview: CharacterOverviewResponse,
): DashboardCharacterViewModel {
  const character = overview.character;
  const className =
    character.class?.name ?? character.gameClass?.name ?? "Lutador";
  const maxHp = character.maxHp ?? overview.stats?.maxHp ?? 1;

  return {
    ...character,
    id: character.id,
    name: character.name,
    className,
    classId: normalizeClassName(className),
    level: character.level ?? 1,
    xp: character.xp ?? 0,
    currentHp: character.currentHp ?? maxHp,
    maxHp,
    status: character.status ?? "ACTIVE",
    currentMap:
      character.currentMap ?? overview.progression?.currentMap ?? null,
    currentMapName:
      character.currentMap?.name ??
      character.map?.name ??
      overview.progression?.currentMap?.name ??
      "Sem mapa",
    equipment: character.equipment ?? overview.equipment ?? {},
    appearance: character.appearance ?? null,
  };
}
