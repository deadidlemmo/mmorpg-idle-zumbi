import { IsString, IsUUID, Matches } from 'class-validator';

export class ExchangeEconomyOfferDto {
  @IsString()
  @Matches(/^(INCR|INCEM|WBEM|INC|WB):[0-9a-f-]{36}$/i, {
    message: 'A oferta de troca e invalida.',
  })
  offerId: string;

  @IsUUID()
  requestId: string;
}
