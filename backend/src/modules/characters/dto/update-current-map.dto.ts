import { IsUUID } from 'class-validator';

export class UpdateCurrentMapDto {
  @IsUUID('4', { message: 'mapId deve ser um UUID válido.' })
  mapId: string;
}
