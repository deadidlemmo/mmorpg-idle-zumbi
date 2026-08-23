import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CosmeticsService } from './cosmetics.service';
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
