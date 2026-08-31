import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateStorefrontCheckoutDto } from './dto/create-storefront-checkout.dto';
import { StorefrontService } from './storefront.service';

type AuthenticatedRequest = {
  user?: { id?: string; userId?: string; sub?: string };
};

const UUID_V4_PIPE = new ParseUUIDPipe({ version: '4' });

@Controller('storefront')
@UseGuards(JwtAuthGuard)
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Get('characters/:characterId')
  getCatalog(
    @Req() request: AuthenticatedRequest,
    @Param('characterId', UUID_V4_PIPE) characterId: string,
  ) {
    return this.storefrontService.getCatalog(
      this.getUserId(request),
      characterId,
    );
  }

  @Post('checkout')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  createCheckout(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateStorefrontCheckoutDto,
  ) {
    return this.storefrontService.createCheckout(this.getUserId(request), dto);
  }

  @Get('orders/:orderId')
  getOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId', UUID_V4_PIPE) orderId: string,
  ) {
    return this.storefrontService.getOrder(this.getUserId(request), orderId);
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
