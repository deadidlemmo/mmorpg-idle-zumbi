import { IsString, IsUUID } from 'class-validator';

export class ClaimIncursionDto {
  @IsString()
  @IsUUID()
  characterId: string;

  @IsString()
  @IsUUID()
  sessionId: string;
}
