import assassinoEmblem from '../../../assets/images/classes/class-assassino.png';
import atiradorEmblem from '../../../assets/images/classes/class-atirador.png';
import lutadorEmblem from '../../../assets/images/classes/class-lutador.png';
import medicoEmblem from '../../../assets/images/classes/class-medico.png';

export type CharacterClassId = 'lutador' | 'atirador' | 'assassino' | 'medico';

/**
 * Compatibilidade com arquivos antigos que ainda importam CharacterClassName.
 * O projeto hoje usa CharacterClassId como tipo principal.
 */
export type CharacterClassName = CharacterClassId;

export interface CharacterClassOption {
  id: CharacterClassId;
  label: string;
  description: string;
  accentColor: string;
  emblem: string;
}

export interface CharacterSummary {
  id: string;
  name: string;
  level: number;
  classId: CharacterClassId;
  className: string;
  hp: number;
  maxHp: number;
  location: string;

  /**
   * Avatar salvo no backend.
   * Exemplo: "lutador-01", "medico-04", "assassino-08".
   */
  avatarKey?: string | null;

  /**
   * Mantido como compatibilidade caso futuramente você use URL externa/CDN.
   * Por enquanto, o recomendado é usar avatarKey.
   */
  avatarUrl?: string | null;
}

export interface CreateCharacterPayload {
  name: string;
  className: string;

  /**
   * Opcional para manter compatibilidade com formulários antigos.
   * Se não vier, o characters.api.ts define um avatar inicial padrão pela classe.
   */
  avatarKey?: string | null;
}

export interface RawCharacterResponse {
  id: string;
  name: string;
  level?: number;
  hp?: number;
  currentHp?: number;
  maxHp?: number;
  className?: string;

  /**
   * Campo que deve vir do backend após adicionar no schema.prisma.
   */
  avatarKey?: string | null;

  avatarUrl?: string | null;
  location?: string;

  class?: {
    name?: string;
  };

  gameClass?: {
    name?: string;
  };

  map?: {
    name?: string;
  };

  currentMap?: {
    name?: string;
  };
}

export const CHARACTER_LIMIT = 2;

export const CHARACTER_CLASS_OPTIONS: Record<
  CharacterClassId,
  CharacterClassOption
> = {
  lutador: {
    id: 'lutador',
    label: 'Lutador',
    description: 'Resistente, direto e preparado para segurar a linha de frente.',
    accentColor: '#C77B31',
    emblem: lutadorEmblem,
  },
  atirador: {
    id: 'atirador',
    label: 'Atirador',
    description: 'Preciso, ofensivo e eficiente para combate tático à distância.',
    accentColor: '#D1A44A',
    emblem: atiradorEmblem,
  },
  assassino: {
    id: 'assassino',
    label: 'Assassino',
    description: 'Ágil, furtivo e focado em execução rápida.',
    accentColor: '#7F68D8',
    emblem: assassinoEmblem,
  },
  medico: {
    id: 'medico',
    label: 'Médico',
    description: 'Técnico, estável e voltado para suporte e sobrevivência.',
    accentColor: '#66B98C',
    emblem: medicoEmblem,
  },
};

export function getCharacterClass(
  classId: CharacterClassId,
): CharacterClassOption {
  return CHARACTER_CLASS_OPTIONS[classId];
}

export function getCharacterInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}