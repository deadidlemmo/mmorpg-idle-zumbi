import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VendorBuyDto, VendorSellDto } from './dto/vendor-transaction.dto';
import { VendorService } from './vendor.service';

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

@Controller('vendor')
@UseGuards(JwtAuthGuard)
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}

  private getUserId(request: AuthenticatedRequest): string {
    const userId =
      request.user?.id ?? request.user?.userId ?? request.user?.sub;

    if (!userId) {
      throw new UnauthorizedException('Usuario nao autenticado.');
    }

    return userId;
  }

  @Get(':characterId/shop')
  getShop(
    @Req() request: AuthenticatedRequest,
    @Param('characterId', UUID_V4_PIPE) characterId: string,
  ) {
    return this.vendorService.getShop(this.getUserId(request), characterId);
  }

  @Get(':characterId/sellable')
  getSellable(
    @Req() request: AuthenticatedRequest,
    @Param('characterId', UUID_V4_PIPE) characterId: string,
  ) {
    return this.vendorService.getSellable(this.getUserId(request), characterId);
  }

  @Post(':characterId/buy')
  @HttpCode(200)
  buy(
    @Req() request: AuthenticatedRequest,
    @Param('characterId', UUID_V4_PIPE) characterId: string,
    @Body() vendorBuyDto: VendorBuyDto,
  ) {
    return this.vendorService.buy(
      this.getUserId(request),
      characterId,
      vendorBuyDto,
    );
  }

  @Post(':characterId/sell')
  @HttpCode(200)
  sell(
    @Req() request: AuthenticatedRequest,
    @Param('characterId', UUID_V4_PIPE) characterId: string,
    @Body() vendorSellDto: VendorSellDto,
  ) {
    return this.vendorService.sell(
      this.getUserId(request),
      characterId,
      vendorSellDto,
    );
  }
}
