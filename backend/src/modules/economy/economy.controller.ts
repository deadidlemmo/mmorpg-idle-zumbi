import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExchangeEconomyOfferDto } from './dto/exchange-economy-offer.dto';
import { EconomyService } from './economy.service';

@Controller('economy')
@UseGuards(JwtAuthGuard)
export class EconomyController {
  constructor(private readonly economyService: EconomyService) {}

  @Get('characters/:characterId/wallet')
  getWallet(
    @Req() request: { user: { id: string } },
    @Param('characterId') characterId: string,
  ) {
    return this.economyService.getWallet(request.user.id, characterId);
  }

  @Get('characters/:characterId/exchange-offers')
  getExchangeOffers(
    @Req() request: { user: { id: string } },
    @Param('characterId') characterId: string,
    @Query('tier', ParseIntPipe) tier: number,
    @Query('currency') currency?: string,
  ) {
    return this.economyService.getExchangeOffers(
      request.user.id,
      characterId,
      tier,
      currency,
    );
  }

  @Post('characters/:characterId/exchanges')
  exchange(
    @Req() request: { user: { id: string } },
    @Param('characterId') characterId: string,
    @Body() input: ExchangeEconomyOfferDto,
  ) {
    return this.economyService.exchange(request.user.id, characterId, input);
  }
}
