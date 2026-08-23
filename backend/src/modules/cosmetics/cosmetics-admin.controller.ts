import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CosmeticsService } from './cosmetics.service';
import { GrantCosmeticsDto } from './dto/grant-cosmetics.dto';
import { RevokeCosmeticEntitlementDto } from './dto/revoke-cosmetic-entitlement.dto';

type AdminRequest = {
  user: { id: string };
};

@Controller('admin/cosmetics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class CosmeticsAdminController {
  constructor(private readonly cosmeticsService: CosmeticsService) {}

  @Get('users/:userId')
  listUserEntitlements(@Param('userId') userId: string) {
    return this.cosmeticsService.listUserEntitlements(userId);
  }

  @Post('grant')
  grant(@Req() request: AdminRequest, @Body() dto: GrantCosmeticsDto) {
    return this.cosmeticsService.grantCosmetics(request.user.id, dto);
  }

  @Post('revoke')
  revoke(
    @Req() request: AdminRequest,
    @Body() dto: RevokeCosmeticEntitlementDto,
  ) {
    return this.cosmeticsService.revokeEntitlement(
      request.user.id,
      dto.entitlementId,
    );
  }
}
