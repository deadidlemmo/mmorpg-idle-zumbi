import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { MaterialOrigin } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StartGatheringDto } from './dto/start-gathering.dto';
import { GatheringService } from './gathering.service';

type AuthenticatedRequest = {
  user?: {
    id?: string;
    userId?: string;
    sub?: string;
  };
};

@Controller('gathering')
@UseGuards(JwtAuthGuard)
export class GatheringController {
  constructor(private readonly gatheringService: GatheringService) {}

  private getUserId(request: AuthenticatedRequest): string {
    const userId =
      request.user?.id ?? request.user?.userId ?? request.user?.sub;

    if (!userId) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }

    return userId;
  }

  @Get('materials')
  listAvailableMaterials(
    @Query('mapId') mapId: string,
    @Query('origin') origin: MaterialOrigin,
  ) {
    return this.gatheringService.listAvailableMaterials({
      mapId,
      origin,
    });
  }

  @Post('start')
  start(@Req() request: AuthenticatedRequest, @Body() dto: StartGatheringDto) {
    return this.gatheringService.start(this.getUserId(request), dto);
  }

  @Get(':characterId/status')
  getStatus(
    @Req() request: AuthenticatedRequest,
    @Param('characterId') characterId: string,
  ) {
    return this.gatheringService.getStatus(
      this.getUserId(request),
      characterId,
    );
  }

  @Post(':characterId/collect')
  collect(
    @Req() request: AuthenticatedRequest,
    @Param('characterId') characterId: string,
  ) {
    return this.gatheringService.collect(this.getUserId(request), characterId);
  }

  @Post(':characterId/stop')
  stop(
    @Req() request: AuthenticatedRequest,
    @Param('characterId') characterId: string,
  ) {
    return this.gatheringService.stop(this.getUserId(request), characterId);
  }
}
