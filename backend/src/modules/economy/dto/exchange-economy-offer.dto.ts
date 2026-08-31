import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class ExchangeEconomyOfferDto {
  @IsString()
  @Matches(/^(INCR|INCEM|WBEM|INC|WB):[0-9a-f-]{36}$/i, {
    message: 'A oferta de troca e invalida.',
  })
  offerId: string;

  @IsUUID()
  requestId: string;

  @IsUUID()
  sourceItemId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  exchangeCount?: number;
}
