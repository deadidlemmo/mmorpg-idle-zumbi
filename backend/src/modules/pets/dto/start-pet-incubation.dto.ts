import { IsUUID } from 'class-validator';

export class StartPetIncubationDto {
  @IsUUID()
  petDefinitionId!: string;

  @IsUUID()
  requestId!: string;
}
