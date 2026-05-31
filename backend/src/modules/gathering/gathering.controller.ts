import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { MaterialOrigin } from '@prisma/client';
import { StartGatheringDto } from './dto/start-gathering.dto';
import { GatheringService } from './gathering.service';

@Controller('gathering')
export class GatheringController {
  constructor(private readonly gatheringService: GatheringService) {}

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
  start(@Body() dto: StartGatheringDto) {
    return this.gatheringService.start(dto);
  }

  @Get(':characterId/status')
  getStatus(@Param('characterId') characterId: string) {
    return this.gatheringService.getStatus(characterId);
  }

  @Post(':characterId/collect')
  collect(@Param('characterId') characterId: string) {
    return this.gatheringService.collect(characterId);
  }

  @Post(':characterId/stop')
  stop(@Param('characterId') characterId: string) {
    return this.gatheringService.stop(characterId);
  }
}
