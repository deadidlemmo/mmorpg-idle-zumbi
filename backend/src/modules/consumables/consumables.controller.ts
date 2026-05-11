import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConsumablesService } from './consumables.service';
import { UpdatePotionConfigDto } from './dto/update-potion-config.dto';
import { UseConsumableDto } from './dto/use-consumable.dto';

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

@Controller('consumables')
@UseGuards(JwtAuthGuard)
export class ConsumablesController {
  constructor(private readonly consumablesService: ConsumablesService) {}

  private getUserId(request: AuthenticatedRequest): string {
    const userId = request.user?.id ?? request.user?.userId ?? request.user?.sub;

    if (!userId) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }

    return userId;
  }

  @Post('use')
  @HttpCode(200)
  use(
    @Req() request: AuthenticatedRequest,
    @Body() useConsumableDto: UseConsumableDto,
  ) {
    return this.consumablesService.use(
      this.getUserId(request),
      useConsumableDto,
    );
  }

  @Get(':characterId/config')
  getPotionConfig(
    @Req() request: AuthenticatedRequest,
    @Param('characterId', UUID_V4_PIPE) characterId: string,
  ) {
    return this.consumablesService.getPotionConfig(
      this.getUserId(request),
      characterId,
    );
  }

  @Patch(':characterId/config')
  @HttpCode(200)
  updatePotionConfig(
    @Req() request: AuthenticatedRequest,
    @Param('characterId', UUID_V4_PIPE) characterId: string,
    @Body() updatePotionConfigDto: UpdatePotionConfigDto,
  ) {
    return this.consumablesService.updatePotionConfig(
      this.getUserId(request),
      characterId,
      updatePotionConfigDto,
    );
  }
}