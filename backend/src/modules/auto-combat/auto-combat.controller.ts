import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AutoCombatGateway } from './auto-combat.gateway';
import { AutoCombatService } from './auto-combat.service';
import { PreviewAutoCombatDto } from './dto/preview-auto-combat.dto';
import { StartAutoCombatBattleDto } from './dto/start-auto-combat-battle.dto';
import { StartAutoCombatDto } from './dto/start-auto-combat.dto';

@Controller('auto-combat')
@UseGuards(JwtAuthGuard)
export class AutoCombatController {
  constructor(
    private readonly autoCombatService: AutoCombatService,
    private readonly autoCombatGateway: AutoCombatGateway,
  ) {}

  @Get('online-count')
  getOnlineCount() {
    return {
      onlinePlayers: this.autoCombatGateway.getOnlinePlayersCount(),
      updatedAt: new Date().toISOString(),
    };
  }

  @Post('start')
  start(@Req() request: any, @Body() startAutoCombatDto: StartAutoCombatDto) {
    return this.autoCombatService.start(request.user.id, startAutoCombatDto);
  }

  @Post('hunt/start')
  startHunt(
    @Req() request: any,
    @Body() startAutoCombatDto: StartAutoCombatDto,
  ) {
    return this.autoCombatService.start(request.user.id, startAutoCombatDto);
  }

  @Post(':characterId/hunt/stop')
  stopHunt(@Req() request: any, @Param('characterId') characterId: string) {
    return this.autoCombatService.stopHunt(request.user.id, characterId);
  }

  @Post(':characterId/battle/start')
  startBattle(
    @Req() request: any,
    @Param('characterId') characterId: string,
    @Body() startBattleDto: StartAutoCombatBattleDto,
  ) {
    return this.autoCombatService.startBattle(
      request.user.id,
      characterId,
      startBattleDto,
    );
  }

  @Post('preview')
  preview(
    @Req() request: any,
    @Body() previewAutoCombatDto: PreviewAutoCombatDto,
  ) {
    return this.autoCombatService.preview(
      request.user.id,
      previewAutoCombatDto,
    );
  }

  @Get(':characterId/status')
  @Header(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  )
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  getStatus(@Req() request: any, @Param('characterId') characterId: string) {
    return this.autoCombatService.getStatus(request.user.id, characterId);
  }

  @Get(':characterId/recent-events')
  @Header(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  )
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  getRecentEvents(
    @Req() request: any,
    @Param('characterId') characterId: string,
    @Query('afterSequence') afterSequence?: string,
  ) {
    return this.autoCombatService.getRecentEvents(
      request.user.id,
      characterId,
      {
        afterSequence,
      },
    );
  }

  @Post(':characterId/stop')
  stop(@Req() request: any, @Param('characterId') characterId: string) {
    return this.autoCombatService.stop(request.user.id, characterId);
  }
}
