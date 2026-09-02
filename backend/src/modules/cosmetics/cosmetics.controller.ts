import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CosmeticsService } from './cosmetics.service';
import { PurchaseCosmeticVendorProductDto } from './dto/purchase-cosmetic-vendor-product.dto';
import { UpdateCharacterAppearanceDto } from './dto/update-character-appearance.dto';

type AuthenticatedRequest = {
  user: { id: string };
};

@Controller('cosmetics')
@UseGuards(JwtAuthGuard)
export class CosmeticsController {
  constructor(private readonly cosmeticsService: CosmeticsService) {}

  @Get('characters/:characterId')
  getCatalog(
    @Req() request: AuthenticatedRequest,
    @Param('characterId') characterId: string,
  ) {
    return this.cosmeticsService.getCatalog(request.user.id, characterId);
  }

  @Get('characters/:characterId/vendor')
  getVendorCatalog(
    @Req() request: AuthenticatedRequest,
    @Param('characterId') characterId: string,
  ) {
    return this.cosmeticsService.getVendorCatalog(request.user.id, characterId);
  }

  @Post('characters/:characterId/vendor/purchase')
  purchaseVendorProduct(
    @Req() request: AuthenticatedRequest,
    @Param('characterId') characterId: string,
    @Body() dto: PurchaseCosmeticVendorProductDto,
  ) {
    return this.cosmeticsService.purchaseVendorProduct(
      request.user.id,
      characterId,
      dto,
    );
  }

  @Patch('characters/:characterId/appearance')
  updateAppearance(
    @Req() request: AuthenticatedRequest,
    @Param('characterId') characterId: string,
    @Body() dto: UpdateCharacterAppearanceDto,
  ) {
    return this.cosmeticsService.updateAppearance(
      request.user.id,
      characterId,
      dto,
    );
  }
}
