import { apiClient } from '../../../services/api/apiClient';
import type {
  CharacterClassId,
  CharacterSummary,
  CreateCharacterPayload,
  RawCharacterResponse,
} from '../types/character.types';

interface DeleteCharacterResponse {
  message: string;
  character: {
    id: string;
    name: string;
    status: string;
    deletedAt: string | null;
  };
}

export function normalizeClassName(value?: string | null): CharacterClassId {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

  if (normalized.includes('atirador')) return 'atirador';
  if (normalized.includes('assassino')) return 'assassino';
  if (normalized.includes('medico')) return 'medico';

  return 'lutador';
}

function buildDefaultAvatarKey(className: string): string {
  const classId = normalizeClassName(className);

  return `${classId}-01`;
}

function normalizeCharacter(character: RawCharacterResponse): CharacterSummary {
  const className =
    character.className ??
    character.gameClass?.name ??
    character.class?.name ??
    'Lutador';

  const location =
    character.map?.name ??
    character.currentMap?.name ??
    character.location ??
    'Subúrbio Silencioso';

  const maxHp = character.maxHp ?? 1;
  const currentHp = character.currentHp ?? character.hp ?? maxHp;

  return {
    id: character.id,
    name: character.name,
    level: character.level ?? 1,
    classId: normalizeClassName(className),
    className,
    hp: currentHp,
    maxHp,
    location,
    avatarKey: character.avatarKey ?? null,
    avatarUrl: character.avatarUrl ?? null,
  };
}

export async function getMyCharacters(): Promise<CharacterSummary[]> {
  const response = await apiClient.get<RawCharacterResponse[]>('/characters/me');

  return response.data.map(normalizeCharacter);
}

/**
 * Compatibilidade com store antigo.
 */
export const getMyCharactersRequest = getMyCharacters;

export async function createCharacter(
  payload: CreateCharacterPayload,
): Promise<CharacterSummary> {
  const avatarKey =
    payload.avatarKey && payload.avatarKey.trim()
      ? payload.avatarKey.trim()
      : buildDefaultAvatarKey(payload.className);

  const response = await apiClient.post<RawCharacterResponse>('/characters', {
    name: payload.name,
    className: payload.className,
    avatarKey,
  });

  return normalizeCharacter(response.data);
}

/**
 * Compatibilidade com store antigo.
 */
export const createCharacterRequest = createCharacter;

export async function deleteCharacter(
  characterId: string,
): Promise<DeleteCharacterResponse> {
  const response = await apiClient.delete<DeleteCharacterResponse>(
    `/characters/${characterId}`,
  );

  return response.data;
}