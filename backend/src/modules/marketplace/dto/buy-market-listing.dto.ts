import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class BuyMarketListingDto {
  @IsUUID('4')
  characterId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity: number;

  @IsUUID('4')
  requestId: string;
}
