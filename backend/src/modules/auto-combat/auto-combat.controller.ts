import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AutoCombatGateway } from './auto-combat.gateway';
import { AutoCombatService } from './auto-combat.service';
import { PreviewAutoCombatDto } from './dto/preview-auto-combat.dto';
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
  ) {
    return this.autoCombatService.getRecentEvents(request.user.id, characterId);
  }

  @Post(':characterId/stop')
  stop(@Req() request: any, @Param('characterId') characterId: string) {
    return this.autoCombatService.stop(request.user.id, characterId);
  }
}
