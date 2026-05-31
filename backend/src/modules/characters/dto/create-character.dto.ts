import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const AVAILABLE_CLASSES = ['Lutador', 'Assassino', 'Atirador', 'Médico'];

const AVAILABLE_AVATAR_KEYS = [
  'lutador-01',
  'lutador-02',
  'lutador-03',
  'lutador-04',
  'lutador-05',
  'lutador-06',
  'lutador-07',
  'lutador-08',

  'assassino-01',
  'assassino-02',
  'assassino-03',
  'assassino-04',
  'assassino-05',
  'assassino-06',
  'assassino-07',
  'assassino-08',

  'atirador-01',
  'atirador-02',
  'atirador-03',
  'atirador-04',
  'atirador-05',
  'atirador-06',
  'atirador-07',
  'atirador-08',

  'medico-01',
  'medico-02',
  'medico-03',
  'medico-04',
  'medico-05',
  'medico-06',
  'medico-07',
  'medico-08',
];

export class CreateCharacterDto {
  @IsString({ message: 'O nome do personagem deve ser um texto.' })
  @IsNotEmpty({ message: 'Informe o nome do personagem.' })
  @MinLength(3, { message: 'O nome deve ter pelo menos 3 caracteres.' })
  @MaxLength(24, { message: 'O nome deve ter no máximo 24 caracteres.' })
  @Matches(/^[A-Za-zÀ-ÖØ-öø-ÿ0-9 ]+$/, {
    message:
      'O nome do personagem pode conter apenas letras, números e espaços.',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  name: string;

  @IsString({ message: 'A classe deve ser um texto.' })
  @IsNotEmpty({ message: 'Informe a classe do personagem.' })
  @IsIn(AVAILABLE_CLASSES, {
    message:
      'Classe inválida. Escolha: Lutador, Assassino, Atirador ou Médico.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  className: string;

  @IsOptional()
  @IsString({ message: 'O avatar deve ser um texto.' })
  @MaxLength(40, { message: 'O avatar deve ter no máximo 40 caracteres.' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'O avatar deve conter apenas letras minúsculas, números e hífen.',
  })
  @IsIn(AVAILABLE_AVATAR_KEYS, {
    message: 'Avatar inválido.',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  avatarKey?: string;
}
