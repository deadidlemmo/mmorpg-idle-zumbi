import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BuyMarketListingDto } from './dto/buy-market-listing.dto';
import { CancelMarketListingDto } from './dto/cancel-market-listing.dto';
import { CreateMarketListingDto } from './dto/create-market-listing.dto';
import { MarketListingsQueryDto } from './dto/market-listings-query.dto';
import { MarketplaceService } from './marketplace.service';

type AuthenticatedRequest = {
  user?: {
    id?: string;
    userId?: string;
    sub?: string;
  };
};

const UUID_V4_PIPE = new ParseUUIDPipe({
  version: '4',
  errorHttpStatusCode: 400,
});

@Controller('market')
@UseGuards(JwtAuthGuard)
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get('characters/:characterId/listings')
  @Throttle({ default: { limit: 90, ttl: 60_000 } })
  getListings(
    @Req() request: AuthenticatedRequest,
    @Param('characterId', UUID_V4_PIPE) characterId: string,
    @Query() query: MarketListingsQueryDto,
  ) {
    return this.marketplaceService.getListings(
      this.getUserId(request),
      characterId,
      query,
    );
  }

  @Get('characters/:characterId/sellable-items')
  @Throttle({ default: { limit: 90, ttl: 60_000 } })
  getSellableItems(
    @Req() request: AuthenticatedRequest,
    @Param('characterId', UUID_V4_PIPE) characterId: string,
  ) {
    return this.marketplaceService.getSellableItems(
      this.getUserId(request),
      characterId,
    );
  }

  @Get('characters/:characterId/my-listings')
  @Throttle({ default: { limit: 90, ttl: 60_000 } })
  getMyListings(
    @Req() request: AuthenticatedRequest,
    @Param('characterId', UUID_V4_PIPE) characterId: string,
    @Query() query: MarketListingsQueryDto,
  ) {
    return this.marketplaceService.getMyListings(
      this.getUserId(request),
      characterId,
      query,
    );
  }

  @Post('listings')
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createListing(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateMarketListingDto,
  ) {
    return this.marketplaceService.createListing(this.getUserId(request), dto);
  }

  @Post('listings/:listingId/buy')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  buyListing(
    @Req() request: AuthenticatedRequest,
    @Param('listingId', UUID_V4_PIPE) listingId: string,
    @Body() dto: BuyMarketListingDto,
  ) {
    return this.marketplaceService.buyListing(
      this.getUserId(request),
      listingId,
      dto,
    );
  }

  @Post('listings/:listingId/cancel')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  cancelListing(
    @Req() request: AuthenticatedRequest,
    @Param('listingId', UUID_V4_PIPE) listingId: string,
    @Body() dto: CancelMarketListingDto,
  ) {
    return this.marketplaceService.cancelListing(
      this.getUserId(request),
      listingId,
      dto,
    );
  }

  private getUserId(request: AuthenticatedRequest) {
    const userId =
      request.user?.id ?? request.user?.userId ?? request.user?.sub;

    if (!userId) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }

    return userId;
  }
}
