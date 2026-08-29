import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class CreateMarketListingDto {
  @IsUUID('4')
  characterId: string;

  @IsUUID('4')
  itemId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  unitPrice: number;

  @IsUUID('4')
  requestId: string;
}
