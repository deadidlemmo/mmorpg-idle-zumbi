import lutador01 from '../../../assets/images/avatars/lutador-01.png';
import lutador02 from '../../../assets/images/avatars/lutador-02.png';
import lutador03 from '../../../assets/images/avatars/lutador-03.png';
import lutador04 from '../../../assets/images/avatars/lutador-04.png';
import lutador05 from '../../../assets/images/avatars/lutador-05.png';
import lutador06 from '../../../assets/images/avatars/lutador-06.png';
import lutador07 from '../../../assets/images/avatars/lutador-07.png';
import lutador08 from '../../../assets/images/avatars/lutador-08.png';

import assassino01 from '../../../assets/images/avatars/assassino-01.png';
import assassino02 from '../../../assets/images/avatars/assassino-02.png';
import assassino03 from '../../../assets/images/avatars/assassino-03.png';
import assassino04 from '../../../assets/images/avatars/assassino-04.png';
import assassino05 from '../../../assets/images/avatars/assassino-05.png';
import assassino06 from '../../../assets/images/avatars/assassino-06.png';
import assassino07 from '../../../assets/images/avatars/assassino-07.png';
import assassino08 from '../../../assets/images/avatars/assassino-08.png';

import atirador01 from '../../../assets/images/avatars/atirador-01.png';
import atirador02 from '../../../assets/images/avatars/atirador-02.png';
import atirador03 from '../../../assets/images/avatars/atirador-03.png';
import atirador04 from '../../../assets/images/avatars/atirador-04.png';
import atirador05 from '../../../assets/images/avatars/atirador-05.png';
import atirador06 from '../../../assets/images/avatars/atirador-06.png';
import atirador07 from '../../../assets/images/avatars/atirador-07.png';
import atirador08 from '../../../assets/images/avatars/atirador-08.png';

import medico01 from '../../../assets/images/avatars/medico-01.png';
import medico02 from '../../../assets/images/avatars/medico-02.png';
import medico03 from '../../../assets/images/avatars/medico-03.png';
import medico04 from '../../../assets/images/avatars/medico-04.png';
import medico05 from '../../../assets/images/avatars/medico-05.png';
import medico06 from '../../../assets/images/avatars/medico-06.png';
import medico07 from '../../../assets/images/avatars/medico-07.png';
import medico08 from '../../../assets/images/avatars/medico-08.png';

import type { CharacterClassId } from '../types/character.types';

export type CharacterAvatarKey =
  | 'lutador-01'
  | 'lutador-02'
  | 'lutador-03'
  | 'lutador-04'
  | 'lutador-05'
  | 'lutador-06'
  | 'lutador-07'
  | 'lutador-08'
  | 'assassino-01'
  | 'assassino-02'
  | 'assassino-03'
  | 'assassino-04'
  | 'assassino-05'
  | 'assassino-06'
  | 'assassino-07'
  | 'assassino-08'
  | 'atirador-01'
  | 'atirador-02'
  | 'atirador-03'
  | 'atirador-04'
  | 'atirador-05'
  | 'atirador-06'
  | 'atirador-07'
  | 'atirador-08'
  | 'medico-01'
  | 'medico-02'
  | 'medico-03'
  | 'medico-04'
  | 'medico-05'
  | 'medico-06'
  | 'medico-07'
  | 'medico-08';

export interface CharacterAvatarOption {
  key: CharacterAvatarKey;
  image: string;
  classId: CharacterClassId;
  label: string;
}

export const CHARACTER_AVATARS: Record<
  CharacterAvatarKey,
  CharacterAvatarOption
> = {
  'lutador-01': {
    key: 'lutador-01',
    image: lutador01,
    classId: 'lutador',
    label: 'Lutador 01',
  },
  'lutador-02': {
    key: 'lutador-02',
    image: lutador02,
    classId: 'lutador',
    label: 'Lutador 02',
  },
  'lutador-03': {
    key: 'lutador-03',
    image: lutador03,
    classId: 'lutador',
    label: 'Lutador 03',
  },
  'lutador-04': {
    key: 'lutador-04',
    image: lutador04,
    classId: 'lutador',
    label: 'Lutador 04',
  },
  'lutador-05': {
    key: 'lutador-05',
    image: lutador05,
    classId: 'lutador',
    label: 'Lutador 05',
  },
  'lutador-06': {
    key: 'lutador-06',
    image: lutador06,
    classId: 'lutador',
    label: 'Lutador 06',
  },
  'lutador-07': {
    key: 'lutador-07',
    image: lutador07,
    classId: 'lutador',
    label: 'Lutador 07',
  },
  'lutador-08': {
    key: 'lutador-08',
    image: lutador08,
    classId: 'lutador',
    label: 'Lutador 08',
  },

  'assassino-01': {
    key: 'assassino-01',
    image: assassino01,
    classId: 'assassino',
    label: 'Assassino 01',
  },
  'assassino-02': {
    key: 'assassino-02',
    image: assassino02,
    classId: 'assassino',
    label: 'Assassino 02',
  },
  'assassino-03': {
    key: 'assassino-03',
    image: assassino03,
    classId: 'assassino',
    label: 'Assassino 03',
  },
  'assassino-04': {
    key: 'assassino-04',
    image: assassino04,
    classId: 'assassino',
    label: 'Assassino 04',
  },
  'assassino-05': {
    key: 'assassino-05',
    image: assassino05,
    classId: 'assassino',
    label: 'Assassino 05',
  },
  'assassino-06': {
    key: 'assassino-06',
    image: assassino06,
    classId: 'assassino',
    label: 'Assassino 06',
  },
  'assassino-07': {
    key: 'assassino-07',
    image: assassino07,
    classId: 'assassino',
    label: 'Assassino 07',
  },
  'assassino-08': {
    key: 'assassino-08',
    image: assassino08,
    classId: 'assassino',
    label: 'Assassino 08',
  },

  'atirador-01': {
    key: 'atirador-01',
    image: atirador01,
    classId: 'atirador',
    label: 'Atirador 01',
  },
  'atirador-02': {
    key: 'atirador-02',
    image: atirador02,
    classId: 'atirador',
    label: 'Atirador 02',
  },
  'atirador-03': {
    key: 'atirador-03',
    image: atirador03,
    classId: 'atirador',
    label: 'Atirador 03',
  },
  'atirador-04': {
    key: 'atirador-04',
    image: atirador04,
    classId: 'atirador',
    label: 'Atirador 04',
  },
  'atirador-05': {
    key: 'atirador-05',
    image: atirador05,
    classId: 'atirador',
    label: 'Atirador 05',
  },
  'atirador-06': {
    key: 'atirador-06',
    image: atirador06,
    classId: 'atirador',
    label: 'Atirador 06',
  },
  'atirador-07': {
    key: 'atirador-07',
    image: atirador07,
    classId: 'atirador',
    label: 'Atirador 07',
  },
  'atirador-08': {
    key: 'atirador-08',
    image: atirador08,
    classId: 'atirador',
    label: 'Atirador 08',
  },

  'medico-01': {
    key: 'medico-01',
    image: medico01,
    classId: 'medico',
    label: 'Médico 01',
  },
  'medico-02': {
    key: 'medico-02',
    image: medico02,
    classId: 'medico',
    label: 'Médico 02',
  },
  'medico-03': {
    key: 'medico-03',
    image: medico03,
    classId: 'medico',
    label: 'Médico 03',
  },
  'medico-04': {
    key: 'medico-04',
    image: medico04,
    classId: 'medico',
    label: 'Médico 04',
  },
  'medico-05': {
    key: 'medico-05',
    image: medico05,
    classId: 'medico',
    label: 'Médico 05',
  },
  'medico-06': {
    key: 'medico-06',
    image: medico06,
    classId: 'medico',
    label: 'Médico 06',
  },
  'medico-07': {
    key: 'medico-07',
    image: medico07,
    classId: 'medico',
    label: 'Médico 07',
  },
  'medico-08': {
    key: 'medico-08',
    image: medico08,
    classId: 'medico',
    label: 'Médico 08',
  },
};

export function getAvatarsByClass(
  classId: CharacterClassId,
): CharacterAvatarOption[] {
  return Object.values(CHARACTER_AVATARS).filter(
    (avatar) => avatar.classId === classId,
  );
}

export function getAvatarImage(avatarKey?: string | null): string | null {
  if (!avatarKey) return null;

  return CHARACTER_AVATARS[avatarKey as CharacterAvatarKey]?.image ?? null;
}

export function isCharacterAvatarKey(
  avatarKey?: string | null,
): avatarKey is CharacterAvatarKey {
  if (!avatarKey) return false;

  return avatarKey in CHARACTER_AVATARS;
}