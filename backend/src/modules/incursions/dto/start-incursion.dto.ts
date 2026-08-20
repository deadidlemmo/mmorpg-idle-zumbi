import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  INCURSION_APPROACHES,
  type IncursionApproach,
} from '../incursion-risk.util';

export class StartIncursionDto {
  @IsString()
  @IsUUID()
  characterId: string;

  @IsString()
  @IsUUID()
  incursionId: string;

  @IsOptional()
  @IsIn(INCURSION_APPROACHES)
  approach?: IncursionApproach;
}
