import {
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class GrantCharacterCashDto {
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  amount!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(180)
  reason!: string;

  @IsUUID()
  requestId!: string;
}
