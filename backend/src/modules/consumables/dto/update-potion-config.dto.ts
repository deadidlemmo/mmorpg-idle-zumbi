import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

function toOptionalBoolean(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (value === true || value === 'true' || value === '1' || value === 1) {
    return true;
  }

  if (value === false || value === 'false' || value === '0' || value === 0) {
    return false;
  }

  return value;
}

function toOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return Number(value);
}

function toNullableUuid(value: unknown) {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    value === 'null'
  ) {
    return null;
  }

  return value;
}

export class UpdatePotionConfigDto {
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean({
    message: 'O campo enabled precisa ser verdadeiro ou falso.',
  })
  enabled?: boolean;

  @Transform(({ value }) => toNullableUuid(value))
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsUUID('4', {
    message: 'O potionItemId precisa ser um UUID válido.',
  })
  potionItemId?: string | null;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsInt({
    message: 'A porcentagem de HP precisa ser um número inteiro.',
  })
  @Min(1, {
    message: 'A porcentagem mínima é 1%.',
  })
  @Max(100, {
    message: 'A porcentagem máxima é 100%.',
  })
  hpThresholdPercent?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean({
    message: 'O campo useInManualCombat precisa ser verdadeiro ou falso.',
  })
  useInManualCombat?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean({
    message: 'O campo useInAutoCombat precisa ser verdadeiro ou falso.',
  })
  useInAutoCombat?: boolean;
}
