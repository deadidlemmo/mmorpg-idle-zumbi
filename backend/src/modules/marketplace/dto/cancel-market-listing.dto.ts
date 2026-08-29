import { IsUUID } from 'class-validator';

export class CancelMarketListingDto {
  @IsUUID('4')
  characterId: string;
}
