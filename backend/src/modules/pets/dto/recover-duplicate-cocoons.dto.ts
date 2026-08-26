import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class RecoverDuplicateCocoonsDto {
  @IsUUID()
  petDefinitionId!: string;

  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;

  @IsUUID()
  requestId!: string;
}
